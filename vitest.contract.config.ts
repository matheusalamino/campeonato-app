import { defineConfig } from "vitest/config";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * O QUINTO PORTAO: o contrato do store contra o Postgres local.
 *
 * Roda a mao, e so a mao:
 *
 *     npx vitest run --config vitest.contract.config.ts
 *
 * ── POR QUE UMA SEGUNDA CONFIG, E NAO MAIS UMA LINHA NO `include` DA PRIMEIRA ──
 *
 * Porque a suite principal NAO PODE precisar de banco. Ela roda em qualquer
 * maquina, sem stack local, e o docblock de `features/email/outbox.ts` se apoia
 * nisso para afirmar que nenhum teste daquele conjunto toca a rede -- e por isso
 * que ele pode envenenar o `fetch` global e continuar verde. Um arquivo que abre
 * conexao com o Postgres dentro dos 830 quebraria o portao principal em toda
 * maquina sem `supabase start`, e o vermelho apontaria para o lugar errado.
 *
 * Entao sao duas suites com dois contratos diferentes de ambiente:
 *
 *   - `vitest.config.ts`      -- nao precisa de nada. E o portao de todo dia.
 *   - `vitest.contract.config.ts` -- precisa do stack local de pe. E o portao
 *      que so o dono da maquina roda, e o unico lugar deste repo onde o codigo
 *      de `services/**` e de fato EXERCITADO.
 *
 * ── O `include` DOS DOIS NAO PODE SE CRUZAR, E E POR ISSO QUE O ARQUIVO DO
 *    CONTRATO NAO SE CHAMA `.test.ts` ──
 *
 * O `include` da principal e `lib/**`, `features/**` e `scripts/**`, sempre
 * `*.test.ts`. Um arquivo chamado `services/email-outbox.contract.test.ts` fica
 * de fora HOJE -- mas `*.test.ts` e o sufixo que qualquer um acrescenta sem
 * pensar no dia em que quiser rodar teste de servico, e nesse dia a suite
 * principal engoliria o contrato de banco em silencio.
 *
 * `*.contract.ts` nao tem esse risco: nenhum glob de `*.test.ts` o alcanca, por
 * mais pastas que a principal passe a varrer.
 */

/**
 * `server-only` resolvido para um modulo VAZIO.
 *
 * `services/email-outbox.ts` e `lib/supabase/admin.ts` comecam com
 * `import "server-only"`, que existe para o build do Next recusar aquele arquivo
 * num componente de cliente. Fora do Next o pacote nao resolve -- ele nem esta
 * instalado: quem o fornece e o proprio Next, por alias interno do bundler.
 *
 * ── POR QUE PLUGIN, E NAO ALIAS PARA O ARQUIVO DO NEXT ──
 *
 * O caminho obvio seria apontar para `next/dist/compiled/server-only/empty.js`,
 * que de fato existe e tem 0 bytes. MEDIDO: ele NAO existe dentro do
 * `node_modules` desta worktree -- aqui essa pasta tem so o cache do vite, e o
 * pacote de verdade mora no `node_modules` do repositorio PAI, encontrado pela
 * subida do resolvedor do node. Um alias montado com `path.resolve(__dirname,
 * "node_modules/...")` apontaria para o vazio nesta worktree e funcionaria no
 * repo principal -- o pior dos dois mundos, porque quebra so em quem trabalha
 * em worktree.
 *
 * O modulo virtual abaixo nao depende de onde o `node_modules` esta, nem das
 * entranhas do Next, que sao caminho interno e podem mudar de versao.
 */
function serverOnlyVazio(): Plugin {
  const VIRTUAL = "\0server-only-vazio";
  return {
    name: "server-only-vazio",
    resolveId(id) {
      return id === "server-only" ? VIRTUAL : null;
    },
    load(id) {
      return id === VIRTUAL ? "export {};" : null;
    },
  };
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  plugins: [serverOnlyVazio()],
  test: {
    include: ["services/**/*.contract.ts"],
    environment: "node",
    // Mesmo TZ da suite principal: o contrato compara instantes, e um fuso
    // diferente entre os dois portoes seria diferenca que so aparece na
    // maquina de outra pessoa.
    env: { TZ: "UTC" },
    // Um arquivo por vez. O contrato escreve em `email_outbox`, que e uma
    // tabela so: dois arquivos em paralelo disputariam as mesmas linhas e o
    // vermelho nao diria de quem era a culpa.
    fileParallelism: false,
    // O contrato fala com o Postgres por rede local; 5s (o padrao) e apertado
    // para a primeira chamada, que ainda paga o `supabase status`.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
