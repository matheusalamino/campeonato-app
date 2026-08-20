import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
    // Tres pastas, e `services/**` NAO esta entre elas: nenhum teste roda dentro
    // do servico. Quem for mexer la precisa saber por que, porque o motivo obvio
    // esta errado — nao e o `import "server-only"`. MEDIDO: com um alias dele
    // para `next/dist/compiled/server-only/empty.js` e `services/**` nesta
    // linha, um teste escrito la roda. O que segura e o resto: toda funcao
    // exportada do servico monta o cliente do Supabase la dentro
    // (`createAdminClient()`, `createClient()`), entao a primeira assertiva de
    // verdade comeca dublando o banco. A obra e grande e esta adiada de
    // proposito, e o desvio desta feature e este: regra vai para `features/**`,
    // onde tem teste de verdade, e a FIACAO que sobra no servico e lida como
    // texto em features/registration/service-wiring.test.ts.
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
