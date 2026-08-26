import type { PublicPlayer } from "@/lib/public/types";
import { normalizePreferredPosition } from "@/features/players/position";

/**
 * Linha crua da view `public_players` -> `PublicPlayer`.
 *
 * Mora AQUI, e nao dentro do hook que a usa, por um motivo de prova: o hook
 * monta o cliente do Supabase no topo do modulo, e nenhum teste consegue
 * importa-lo sem dublar o banco (a razao inteira esta escrita no
 * `vitest.config.ts`, no comentario do `include`). Fora do hook a funcao e
 * pura, e a fronteira passa a ter teste de verdade em vez de leitura de texto.
 *
 * Aqui `r` chega como `any` do Supabase, e a posicao vira `CanonicalPosition`.
 *
 * ⚠️ Esta NAO e a unica fronteira do app que faz essa conversao -- uma versao
 * anterior deste comentario dizia que era. MEDIDO em 2026-08-26, chamadores de
 * `normalizePreferredPosition` em producao: este mapeador, `lib/public/types.ts`
 * (o rotulo), `EditPlayerForm.tsx`, o `RegistrationWizard.tsx` (em dois pontos)
 * e `app/api/import-players/route.ts` (em dois pontos) -- e a importacao de CSV
 * e a que recebe o dado MENOS tipado de todos, porque `row["Posicao"]` e celula
 * arbitraria de planilha.
 *
 * O que vale para todas, e e a razao de existir esta linha: Por isso a posicao passa por
 * `normalizePreferredPosition` em vez de ser copiada: e o que troca PROMESSA ao
 * compilador por GARANTIA de runtime.
 *
 * E nao e precaucao teorica. A CHECK que restringe a coluna a GOL/ZAG/MEI/ATA
 * (ou NULL -- e o NULL e load-bearing: `scripts/test-registration-slots.sh`
 * insere jogador so com cpf e nome) vive na migration 20260821010000, que ainda
 * nao chegou a staging nem a producao. La a coluna ainda guarda `Goleiro`, e a
 * palavra crua nao quebra so a exibicao: o filtro de posicao das telas publicas
 * compara com as chaves de `POSITION_LABELS`, que sao CODIGOS, entao a palavra
 * nao casaria com jogador nenhum.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function mapPlayer(r: any): PublicPlayer {
  return {
    registrationId: r.registration_id,
    championshipId: r.championship_id,
    playerName: r.player_name,
    officialName: r.official_name,
    position: normalizePreferredPosition(r.position).position,
    photoUrl: r.photo_url,
    finalOverall: r.final_overall === null ? null : Number(r.final_overall),
    championshipTeamId: r.championship_team_id,
    teamName: r.team_name,
    teamLogoUrl: r.team_logo_url,
  };
}
