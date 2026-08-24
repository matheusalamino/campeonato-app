import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    // Tres pastas, e `services/**` NAO esta entre elas. Quem for mexer la
    // precisa saber por que, porque o motivo obvio esta errado — nao e o
    // `import "server-only"`. MEDIDO: com ele resolvido para um modulo vazio e
    // `services/**` nesta linha, um teste escrito la roda.
    //
    // O que segura e o resto: QUASE toda funcao exportada do servico monta o
    // cliente do Supabase la dentro (`createAdminClient()`, `createClient()`),
    // entao a primeira assertiva de verdade comecaria dublando o banco.
    // "Quase", e nao "toda": esta frase dizia "toda" ate a T5b e ENGANAVA, e o
    // contraexemplo e justamente a porta que o contrato de banco usa —
    // `createSupabaseOutboxStore(supabase)` RECEBE o cliente por argumento.
    //
    // A obra grande — destravar `services/**` inteiro — continua adiada de
    // proposito, e o desvio desta feature e este: regra vai para `features/**`,
    // onde tem teste de verdade, e a FIACAO que sobra no servico e lida como
    // texto em features/registration/service-wiring.test.ts.
    //
    // E EXISTE UMA SEGUNDA SUITE. `vitest.contract.config.ts` exercita
    // `services/email-outbox.ts` contra o Postgres local, pelo contraexemplo
    // acima e sem dublar nada. Ela e separada porque ESTA suite nao pode
    // precisar de banco — e disso que o docblock de `features/email/outbox.ts`
    // se apoia para afirmar que nenhum teste daqui toca a rede. O `include`
    // dela e `services/**/*.contract.ts`, que nao cruza com o desta linha por
    // construcao: nenhum glob de `*.test.ts` alcanca `*.contract.ts`. Rode-a a
    // mao, com o stack local de pe:
    //
    //     npx vitest run --config vitest.contract.config.ts
    include: ["lib/**/*.test.ts", "features/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    // TZ fixo em UTC, que espelha o servidor: sem isso, o teste que garante
    // que lib/datetime-br.ts usa o fuso do campeonato (e nao o fuso local) so
    // pega alguem trocando por `undefined` em maquinas que NAO rodam em
    // America/Sao_Paulo. Nao ha job de teste no CI (.github/workflows so tem
    // migrate.yml) para servir de rede — a suite local e a unica garantia.
    env: { TZ: "UTC" },
  },
});
