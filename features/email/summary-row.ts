import type { RegistrationSummary } from "./outbox";

/**
 * A LINHA do banco virando RESUMO -- a traducao coluna -> campo.
 *
 * ── POR QUE ISTO NAO MORA MAIS NO SERVICO ──
 *
 * Porque la nao ha rede nenhuma: `vitest.config.ts` nao coleta `services/**`,
 * e a T5 blindou a STRING do `select` com duas assertivas e parou uma linha
 * antes -- quem le a linha e monta o objeto ficou sem prova.
 *
 * Isso nao e teoria. MEDIDO nesta branch, com o mapeamento ainda no servico,
 * duas mutacoes passaram pelos QUATRO portoes inteiros (806 testes, `tsc` em
 * zero, os dois scripts de banco):
 *
 *  - `isWaitlist: !linha.is_waitlist` -- manda "Inscrição confirmada" para
 *    todo mundo da lista de espera, e "lista de espera" para quem tem vaga;
 *  - `contactEmail` <-> `playerEmail` trocados -- faz o `players.email` VELHO
 *    vencer o endereco digitado no formulario, que e exatamente o que o
 *    docblock de `recipientFor` chama de load-bearing: quem trocou de e-mail e
 *    justamente quem digita o novo na inscricao.
 *
 * A regra do repo ja dizia o que fazer com isso: regra vai para `features/**`,
 * onde tem teste de verdade, e no servico fica so a FIACAO. Esta funcao e a
 * regra; o `select` e a fiacao.
 */

/**
 * O formato que se ESPERA da resposta do PostgREST. Ele nao guarda nada: o
 * `as unknown as` do servico o impoe sem conferir, e por isso todo campo aqui
 * e tratado como possivelmente ausente na traducao abaixo.
 *
 * Os dois objetos aninhados podem voltar nulos de verdade:
 * `championship_registrations.championship_id` e `player_id` sao NULLABLE
 * (medido em `\d championship_registrations`).
 */
export type RegistrationSummaryRow = {
  id: string;
  is_waitlist: boolean;
  contact_email: string | null;
  championships: { name: string | null } | null;
  players: { email: string | null; name: string | null; preferred_position: string | null } | null;
};

/**
 * ── A ORDEM DOS DOIS ENDERECOS E O CAMPO MAIS FACIL DE TROCAR AQUI ──
 *
 * `contact_email` vira `contactEmail` e `players.email` vira `playerEmail`, e
 * quem escolhe entre os dois e `recipientFor` -- que prefere o primeiro. Trocar
 * os dois NESTA funcao inverte aquela preferencia sem tocar em `recipientFor`,
 * e sem nenhuma assertiva de la perceber: os dois campos sao `string | null` e
 * o `tsc` fica limpo.
 */
export function summaryFromRow(linha: RegistrationSummaryRow): RegistrationSummary {
  return {
    contactEmail: linha.contact_email ?? null,
    playerEmail: linha.players?.email ?? null,
    playerName: linha.players?.name ?? null,
    championshipName: linha.championships?.name ?? null,
    // `?? false` aqui, e SO aqui: a coluna e NOT NULL DEFAULT false, e o que
    // este `??` cobre e a coluna nao ter vindo no `select`. Tratar isso como
    // "nao e espera" e o menos errado dos dois -- vaga garantida e o que a
    // maioria esmagadora das linhas de fato e. O que NAO deixa a coluna sumir
    // em silencio sao as duas redes do docblock de `loadSummaries`.
    isWaitlist: linha.is_waitlist ?? false,
    preferredPosition: linha.players?.preferred_position ?? null,
  };
}
