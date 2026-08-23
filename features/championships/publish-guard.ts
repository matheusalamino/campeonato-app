/**
 * A guarda que falta entre o menu de status e a inscricao publica.
 *
 * O A6 pos a exigencia do formato em `championshipFormSchema` e a derivacao de
 * `max_players` em `toRow`. So que o FORMULARIO nao e o unico caminho para
 * publicar: `changeChampionshipStatus` valida `statusChangeSchema` (id / de /
 * para) e grava `{status}` — nao passa por nenhum dos dois. O menu de status
 * oferece TODOS os status (`CHAMPIONSHIP_STATUS.filter(s => s !== status)` em
 * `StatusActionMenu`), entao qualquer linha chega a `subscribing` com a
 * capacidade que tiver.
 *
 * O que a linha precisa ter e derivado do que as duas RPCs LEEM, e nao da regra
 * do formulario. `reserve_registration_slot` (20260819040000) e
 * `commit_registration` (20260819050000) abrem com o mesmo SELECT:
 *
 *   status, max_players, max_waitlist_players,
 *   registration_start_date, registration_end_date
 *
 * Cinco colunas, e so estas. Nada de `teams_count`, `players_per_team`,
 * `gala_night_date` ou `tournament_start_date`.
 *
 * MEDIDO no banco local em 2026-08-23, o campeonato do seed movido a
 * `subscribing` dentro de um BEGIN … ROLLBACK:
 *
 *   max_players = 0, max_waitlist_players = 0
 *       {"success": false, "reason": "full"} — e o jogador le "As vagas para
 *       este campeonato se esgotaram" (SlotNotice), que e mentira: nunca houve
 *       vaga. Falha silenciosa, e do lado de quem se inscreve.
 *
 *   max_players = 0, max_waitlist_players = 5
 *       {"success": true, "is_waitlist": true} — o campeonato INTEIRO vira
 *       fila de espera, ate a quinta pessoa. A sexta ouve `all_reserved`
 *       enquanto as cinco forem RESERVAS vivas, e `full` so depois que elas
 *       viram inscricao confirmada. Os dois desfechos medidos.
 *
 *   max_players = NULL
 *       {"success": true, "is_waitlist": false} — ilimitado. E o estado que o
 *       A6 existe para matar: com ele `shouldCloseForCapacity` devolve `false`
 *       sempre e a lotacao nunca fecha sozinha.
 *
 *   max_players = 80  (controle)
 *       {"success": true, "is_waitlist": false} — reserva normal.
 */

/**
 * De todos os status, o unico em que uma inscricao NASCE.
 *
 * A fronteira e a da RESERVA, e nao a do commit — e a diferenca e medida, nao
 * teorica. `reserve_registration_slot` recusa com `not_open` sempre que
 * `v_status <> 'subscribing'`, sem excecao. `commit_registration` NAO: ela so
 * consulta o status dentro do `IF NOT v_had_reservation`, porque "a reserva e a
 * autorizacao, nao o status" (o proprio comentario da funcao) — um campeonato
 * que fecha por lotacao enquanto o jogador preenche nao pode recusa-lo no fim.
 *
 * MEDIDO em 2026-08-23, num BEGIN … ROLLBACK: reserva concedida sob
 * `subscribing`, status virado para `rest`, commit chamado — a funcao devolveu
 * {"success": true, "registration_id": …} e a inscricao FICOU GRAVADA. Sem a
 * reserva viva, o mesmo commit sob `rest` devolveu `not_open`. Ou seja, sob
 * `rest` quem fecha a porta e o SERVICO (`services/public-registration.ts`
 * recusa fora de `subscribing` antes de chamar a RPC), e nao o banco.
 *
 * Isso nao afrouxa a fronteira desta guarda, aperta o argumento dela: como a
 * reserva so e concedida sob `subscribing`, e so ela autoriza o commit, esse
 * status e o unico ponto por onde uma inscricao pode entrar. Guardar a entrada
 * cobre o que vem depois.
 *
 * `registrationGate` concorda do lado da tela: `view: "wizard"` so nesse status.
 * `rest` e `subscribed` aparecem publicamente — `getOpenRegistrationChampionship`
 * lista `rest`, e a pagina tem tela para os dois —, mas nenhum dos dois concede
 * reserva.
 *
 * Recebe `string`, e nao `ChampionshipStatus`, porque a coluna e `text` e o que
 * chega aqui vem de `.select()`, sem passar por Zod. Tipar mais estreito
 * esconderia a unica entrada que interessa: um valor fora da lista.
 */
export function opensRegistration(status: string | null | undefined): boolean {
  return status === "subscribing";
}

/** Os motivos pelos quais uma linha nao pode abrir inscricao. */
export type PublishBlockReason = "missing_capacity" | "zero_capacity";

export type PublishBlock = { reason: PublishBlockReason; message: string };

/**
 * A linha do campeonato como a guarda a le — e como o Postgres a devolve.
 *
 * `max_players` e `int NULL`, entao o tipo e nulavel. Nao reusa
 * `ChampionshipFormValues`: aquilo e o payload do FORMULARIO, ja passado por
 * `z.coerce` e com `undefined` no lugar de `null`. Aqui o valor vem cru do
 * `.select()`, e as duas formas nao coincidem.
 */
export type PublishableChampionship = { max_players?: number | null };

/**
 * A frase de cada motivo, em tabela e nao em escada de `if` — mesmo motivo de
 * `commitRefusal`: com `Record<PublishBlockReason, ...>` uma chave a menos e
 * erro de `tsc` antes de qualquer teste.
 *
 * As duas dizem a MESMA providencia porque a providencia e mesmo uma so: os
 * dois campos do formato. Elas diferem no que o admin acabaria causando, que e
 * o que ele nao tem como adivinhar da tela — a de cima abre inscricao sem teto
 * nenhum, a de baixo recusa todo mundo dizendo que esgotou.
 */
const BLOCKS: Record<PublishBlockReason, PublishBlock> = {
  missing_capacity: {
    reason: "missing_capacity",
    message:
      "Este campeonato está sem capacidade definida e as inscrições ficariam sem limite. Preencha times e jogadores por time antes de abrir.",
  },
  zero_capacity: {
    reason: "zero_capacity",
    message:
      "Este campeonato está com 0 vagas e recusaria toda inscrição dizendo que esgotou. Preencha times e jogadores por time antes de abrir.",
  },
};

/**
 * O que impede esta linha de abrir inscricao, ou `null` quando nada impede.
 *
 * Le `max_players`, e nao o formato, de proposito — e a diferenca nao e
 * estetica, ela decide quais campeonatos continuam funcionando:
 *
 *   `max_players` e a coluna que a RPC LE. Uma linha com formato configurado e
 *   `max_players` desatualizado engana quem olha o formato; a RPC nao se
 *   importa com o formato.
 *
 *   E o inverso e o caso REAL. Medido em 2026-08-23: em staging a migration
 *   `20260820010000` ainda nao rodou, entao as cinco colunas do formato NAO
 *   EXISTEM la — e o unico campeonato em `subscribing` tem `max_players = 80` e
 *   funciona. Uma guarda que exigisse `teams_count` nao FECHARIA aquela
 *   inscricao (esta guarda so roda em `changeChampionshipStatus`, e nao mexe em
 *   quem ja esta aberto), mas impediria a REENTRADA em `subscribing` — e a
 *   reentrada e rotina, nao borda: e o caminho de volta de quem pausou com
 *   `rest` no sabado.
 *
 * As quatro DATAS ficam de fora, embora `refineChampionship` as exija para todo
 * status fora de `draft`. Elas nao quebram nada aqui: as duas RPCs tratam data
 * nula como borda inexistente, de proposito e por escrito
 * ("Data nula nao e borda", 20260819010000), e `registrationGate` faz igual.
 * Exigi-las nesta guarda seria copiar a regra do formulario em vez de derivar a
 * do banco — e cobraria um preco medido: o campeonato do seed esta em `active`
 * com as QUATRO datas nulas, entao todo ambiente local perderia a unica
 * transicao para `subscribing` que tem.
 */
export function publishBlock(row: PublishableChampionship): PublishBlock | null {
  const max = row.max_players;
  if (max === null || max === undefined) return BLOCKS.missing_capacity;
  // `!(max > 0)` e nao `max <= 0`: a forma negada tambem recusa NaN, que a
  // comparacao direta deixaria passar. A prova e da EXPRESSAO — trocar por
  // `max <= 0` nao muda nenhum caso vindo do Postgres, onde a coluna e `int`.
  if (!(max > 0)) return BLOCKS.zero_capacity;
  return null;
}
