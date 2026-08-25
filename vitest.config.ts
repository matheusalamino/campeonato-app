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
    // O que segura e o resto: quase nenhuma funcao exportada do servico aceita
    // um cliente de fora, entao a primeira assertiva de verdade comecaria
    // dublando o banco. CONTADO em `services/*.ts`, 15 funcoes exportadas:
    //
    //   9  montam o cliente DENTRO da funcao (`createAdminClient()`,
    //      `createClient()`) — public-registration (7), championship-capacity,
    //      runOutboxDrain;
    //   5  usam um cliente de NIVEL DE MODULO, montado no import — pior para
    //      teste, porque nem chamar a funcao e preciso (match-events, players,
    //      registrations);
    //   1  RECEBE o cliente por argumento: `createSupabaseOutboxStore(supabase)`.
    //
    // Essa ultima e a porta por onde o contrato de banco entra. Esta frase ja
    // disse "toda" (falso, ha o contraexemplo) e depois "QUASE toda" (tambem
    // falso: 9 de 15 nao e "quase toda"). O numero esta acima para nao precisar
    // de adverbio.
    //
    // A obra grande — destravar `services/**` inteiro — continua adiada de
    // proposito, e o desvio desta feature e este: regra vai para `features/**`,
    // onde tem teste de verdade, e a FIACAO que sobra no servico e lida como
    // texto. Cada feature tem o seu leitor, e eles leem servicos DIFERENTES:
    // `features/email/service-wiring.test.ts` le `services/email-outbox.ts`, e
    // `features/registration/service-wiring.test.ts` le
    // `services/public-registration.ts`. Esta linha nomeava so o segundo,
    // inclusive no paragrafo sobre a feature de e-mail.
    //
    // E EXISTE UMA SEGUNDA SUITE. `vitest.contract.config.ts` exercita
    // `services/email-outbox.ts` contra o Postgres local, pelo contraexemplo
    // acima e sem dublar nada. Ela e separada porque ESTA suite nao pode
    // precisar de banco. (`features/email/outbox.ts` afirma que a suite DAQUELE
    // ARQUIVO nao toca a rede, e o veneno do `fetch` de la e escopo de arquivo:
    // ele nao promete nada sobre a suite inteira, e nao se apoia neste
    // `include`. Esta linha ja generalizou a frase dele.) O `include`
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
