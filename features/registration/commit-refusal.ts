/**
 * As razoes com que `commit_registration` recusa a gravacao.
 *
 * A lista e a do COMMENT da funcao
 * (supabase/migrations/20260819050000_commit_respects_sabbath.sql): not_found,
 * sabbath, not_open, already_registered, reservation_expired.
 */
export type CommitRefusalReason =
  | "not_found"
  | "sabbath"
  | "not_open"
  | "already_registered"
  | "reservation_expired";

/**
 * O que a tela mostra quando o envio e recusado.
 *
 * `alreadyRegistered` nao e enfeite da mensagem: e ele que leva o jogador a tela
 * de desfecho de "voce ja esta inscrito", em vez de um toast sobre um formulario
 * que ele nao tem mais o que fazer com.
 */
export type CommitRefusal = { error: string; alreadyRegistered?: true };

/**
 * A frase de cada recusa, numa tabela em vez de uma escada de `if`.
 *
 * A escada tinha a forma que a T9 existe para matar: o ramo do sabado podia ser
 * apagado, ou o literal podia virar `"sabath"`, e os tres portoes passavam
 * verdes — a comparacao e entre `string` e literal, entao o `tsc` nao tem o que
 * reclamar, e nenhum teste chegava aqui. Nos dois casos quem acabou de tocar em
 * "Enviar", possivelmente com o PIX ja pago, cai no generico "as inscricoes nao
 * estao abertas", que nao diz a unica coisa que importa naquele segundo: que
 * NADA foi gravado.
 *
 * Com o `Record<CommitRefusalReason, CommitRefusal>` os dois somem no `tsc`
 * antes de qualquer teste: chave a menos e propriedade faltando, chave a mais
 * nao existe na uniao. O mesmo guarda de `RPC_REASONS`, pelo mesmo motivo.
 *
 * A frase do sabado nao diz "tente novamente em instantes", que e o que as
 * outras recusas dizem: a pausa vai ate o por do sol de sabado, e convidar a
 * insistir por 24h e pior do que nao dizer nada. Ela diz que nada foi gravado e
 * manda recarregar — quem sabe o horario da volta e a tela de repouso, do outro
 * lado do recarregamento.
 */
const MESSAGES: Record<CommitRefusalReason, CommitRefusal> = {
  sabbath: {
    error:
      "As inscrições entraram em repouso para o sábado e sua inscrição não foi gravada. Recarregue a página para ver o horário da volta.",
  },
  already_registered: {
    error: "Você já está inscrito neste campeonato.",
    alreadyRegistered: true,
  },
  reservation_expired: {
    error: "Sua vaga expirou e as inscrições lotaram. Fale com a organização.",
  },
  not_open: { error: "As inscrições não estão abertas para este campeonato." },
  // Campeonato que sumiu do ar (apagado, ou slug trocado) durante o
  // preenchimento. Nao ha frase melhor a dizer, e a diferenca nao muda nada do
  // que o jogador pode fazer: e a mesma de `not_open`, de proposito.
  not_found: { error: "As inscrições não estão abertas para este campeonato." },
};

function isCommitReason(value: unknown): value is CommitRefusalReason {
  // `Object.hasOwn`, e nao `value in MESSAGES`: `in` aceita `toString`,
  // `constructor`, `valueOf`, `hasOwnProperty` e `__proto__`, que vem do
  // prototipo.
  //
  // O que a tabela devolveria nao e `undefined` — isto foi MEDIDO, e a diferenca
  // importa para quem for conferir. `MESSAGES["toString"]` e a FUNCAO
  // `Object.prototype.toString`; `MESSAGES["__proto__"]` e o proprio
  // `Object.prototype`. A recusa chega sem frase do mesmo jeito, e por um
  // caminho mais calado: nem funcao nem `Object.prototype` tem propriedade
  // propria enumeravel, entao a copia logo abaixo espalha o nada e sai `{}` —
  // sem `error`, sem lancar e sem rastro.
  //
  // O vizinho `isKnownReason`, em slot.ts, tem o mesmo `Object.hasOwn` por motivo
  // parecido mas mecanismo diferente: la quem devolve `undefined` de verdade e o
  // `switch` de `noticeFor`, que nao tem `case` para esses nomes. As duas prosas
  // ja foram uma so, e foi a copia entre mecanismos diferentes que apodreceu.
  return typeof value === "string" && Object.hasOwn(MESSAGES, value);
}

/**
 * A recusa do envio, traduzida da razao da RPC.
 *
 * Vive em `features/`, e nao dentro de `submitRegistration`, para poder ser
 * chamada por um teste: `vitest.config.ts` inclui `lib/**`, `features/**` e
 * `scripts/**`, e o servico importa `server-only`, que nem esta no
 * `node_modules`. Escrita la, a tabela era invisivel nos dois sentidos.
 *
 * Razao que nao conhecemos cai no generico, que e o comportamento de hoje: a RPC
 * devolve uma razao so, das cinco declaradas, e qualquer outra coisa e resposta
 * malformada.
 *
 * Devolve uma COPIA, e nao a linha da tabela. Hoje o unico chamador espalha o
 * retorno e a diferenca nao aparece, mas `MESSAGES` e modulo — vive enquanto o
 * processo viver. Um chamador que anexe contexto ao objeto que recebeu
 * (`recusa.error += ` (pedido ${id})`, um `Sentry.setContext` que decora) estaria
 * escrevendo na tabela, e a frase envenenada sairia para todo mundo dali em
 * diante. Uma copia rasa fecha isso sem custo: `CommitRefusal` e plano.
 */
export function commitRefusal(reason: unknown): CommitRefusal {
  return { ...(isCommitReason(reason) ? MESSAGES[reason] : MESSAGES.not_open) };
}
