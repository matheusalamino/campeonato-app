import { brasiliaParts } from "@/lib/datetime-br";

/** `dow` de `brasiliaParts`, onde 0 e domingo. */
const SATURDAY = 6;

/**
 * O fim da pausa em que da para confiar a ponto de ANUNCIAR o dia da semana.
 *
 * Devolve o proprio `endsAt` quando ele cai num sabado de Brasilia, e `null`
 * quando nao da para afirmar nada.
 *
 * O dia da semana nao e decoracao na tela de repouso: o sabado vai do por do
 * sol de sexta ao de sabado, entao a inscricao volta sempre num SABADO. Uma
 * tela dizendo "voltam quinta-feira" contradiz, com toda a confianca, a propria
 * razao de a pausa existir — e quem le conclui que ou o site esta quebrado ou a
 * observancia e negociavel.
 *
 * Nos dois caminhos reais o dia bate: as 178 linhas de `sabbath_windows`
 * terminam no por do sol de um sabado, e a regra conservadora termina no sabado
 * as 20h30. Nao cair num sabado significa dado corrompido — e a resposta certa
 * para dado corrompido nao e um dia errado com ar de certeza, e sim a copia
 * honesta que a tela ja tem para quando ninguem sabe a hora.
 *
 * MORA AQUI, e nao dentro do RestOverlay, por um motivo pratico: importar o
 * componente num teste arrasta `RegistrationWizard` -> `actions.ts` ->
 * `services/public-registration.ts` -> `import "server-only"`, que nao resolve
 * no vitest (environment "node"). Exportar a funcao de la nao a tornaria
 * testavel; mudar o vitest.config para stubar `server-only` seria mexer em
 * infra compartilhada por causa de uma funcao pura de quatro linhas.
 *
 * Le o dia por `brasiliaParts`, e nao por `getUTCDay()`. MEDIDO: hoje os dois
 * concordam em 100% dos casos. As 178 janelas reais terminam entre 20h30 e
 * 22h01 UTC de sabado, e a regra conservadora as 23h30 UTC de sabado — nenhuma
 * cruza a meia-noite, entao `getUTCDay()` aceitaria exatamente as mesmas. Isto
 * e risco latente evitado, nao bug evitado, e o argumento e mais forte assim.
 *
 * Vale mesmo assim porque a margem e de trinta minutos: `SABBATH_FALLBACK_END`
 * ja foi movido uma vez (de 19h para 20h30, ver `sabbath.ts`), e o docblock de
 * la raciocina abertamente sobre move-lo de novo. Empurrado para 21h, o fim da
 * regra conservadora vira meia-noite UTC de domingo e `getUTCDay()` passaria a
 * recusar justamente o dado BOM, calado. Ler o dia em Brasilia e o que torna
 * essa mexida inofensiva.
 *
 * `Date` invalido devolve `null` junto — e nao lanca. `brasiliaParts` LANCA
 * nesse caso, e derrubar a pagina de repouso por causa de uma string podre
 * seria trocar um texto errado por tela nenhuma.
 */
export function announceableEndsAt(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const instant = new Date(endsAt);
  if (Number.isNaN(instant.getTime())) return null;
  return brasiliaParts(instant).dow === SATURDAY ? endsAt : null;
}
