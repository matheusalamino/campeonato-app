import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  test: {
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
