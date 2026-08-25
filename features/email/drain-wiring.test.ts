import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { semComentario } from "@/features/testing/sem-comentario";
import { sabbathWindows } from "@/scripts/generate-sabbath-windows.mjs";
import { DRAIN_ENDPOINT } from "./post-action-drain";

/**
 * A fiacao do dreno pos-acao e do cron, lida como TEXTO -- porque nao ha outro
 * jeito de le-la.
 *
 * `app/**` e `services/**` nao estao no `include` de `vitest.config.ts` (que so
 * alcanca `lib/**`, `features/**` e `scripts/**`), nenhum glob deste repo
 * alcanca `.test.tsx`, e nao ha job de teste no CI. Os TRES sitios que este
 * arquivo cobre vivem exatamente nesse vazio:
 *
 *   app/api/email/drain/route.ts                          -- a rota
 *   services/public-registration.ts                       -- o dreno pos-submit
 *   app/(protected)/championship/players/PlayersSection.tsx -- o dreno pos-pagamento
 *
 * As NEGATIVAS carregam o peso, e e deliberado. Uma positiva ("`drainAccess`
 * aparece") e satisfeita por um homonimo local; uma negativa ("`timingSafeEqual`
 * NAO aparece aqui") so e satisfeita por quem de fato nao escreveu a decisao no
 * lugar sem rede.
 *
 * O `vercel.json` entra junto porque ele e a quarta ponta da mesma fiacao: o
 * caminho que ele agenda e o caminho que a pasta serve, e nada no TypeScript
 * liga os dois.
 */

const RAIZ = process.cwd();

/**
 * O caminho do arquivo da rota, DERIVADO da constante.
 *
 * Assim a ponte entre `DRAIN_ENDPOINT` e a pasta que o Next serve e assertiva:
 * mudar a constante sem mover a pasta faz o `readFileSync` abaixo estourar.
 */
const CAMINHO_ROTA = join(
  RAIZ,
  "app",
  ...DRAIN_ENDPOINT.split("/").filter(Boolean),
  "route.ts",
);
const CAMINHO_VERCEL = join(RAIZ, "vercel.json");
const CAMINHO_SERVICO = join(RAIZ, "services/public-registration.ts");
const CAMINHO_TELA = join(
  RAIZ,
  "app/(protected)/championship/players/PlayersSection.tsx",
);

const rota = semComentario(readFileSync(CAMINHO_ROTA, "utf8"));
const servico = semComentario(readFileSync(CAMINHO_SERVICO, "utf8"));
const tela = semComentario(readFileSync(CAMINHO_TELA, "utf8"));

type CronVercel = { path: string; schedule: string };
const vercel = JSON.parse(readFileSync(CAMINHO_VERCEL, "utf8")) as {
  crons?: CronVercel[];
};

// ─────────────────────────────────────────────────────────────────────────────
// vercel.json
// ─────────────────────────────────────────────────────────────────────────────

/** Minuto e hora do unico cron, em UTC -- que e o fuso em que a Vercel agenda. */
function horarioDoCron(): { minuto: number; hora: number } {
  const campos = (vercel.crons?.[0]?.schedule ?? "").trim().split(/\s+/);
  expect(
    campos,
    "o `schedule` do cron nao tem os cinco campos do cron. Sem eles, tudo " +
      "abaixo estaria conferindo `NaN` contra `NaN`.",
  ).toHaveLength(5);
  const minuto = Number(campos[0]);
  const hora = Number(campos[1]);
  expect(Number.isInteger(minuto)).toBe(true);
  expect(Number.isInteger(hora)).toBe(true);
  return { minuto, hora };
}

describe("vercel.json", () => {
  it("agenda UM cron, e ele aponta para a rota do dreno", () => {
    expect(vercel.crons).toHaveLength(1);
    expect(vercel.crons?.[0].path).toBe(DRAIN_ENDPOINT);
  });

  it("e DIARIO, porque o plano Hobby recusa mais frequente que isso", () => {
    // Nao e escolha de desenho: a Vercel RECUSA NO DEPLOY um cron mais
    // frequente que diario no plano Hobby. Esta assertiva existe para que quem
    // apertar o intervalo -- `*/30 * * * *` parece obvio para uma fila --
    // descubra aqui, e nao num deploy vermelho.
    const campos = (vercel.crons?.[0].schedule ?? "").trim().split(/\s+/);
    const [minuto, hora, diaDoMes, mes, diaDaSemana] = campos;
    expect(diaDoMes, "dia do mes tem de ser `*`: diario.").toBe("*");
    expect(mes, "mes tem de ser `*`: diario.").toBe("*");
    expect(diaDaSemana, "dia da semana tem de ser `*`: diario.").toBe("*");
    // Um valor so em cada, e nao lista (`0,30`) nem passo (`*/2`), que sao as
    // duas formas de escrever "mais de uma vez por dia" sem parecer.
    expect(minuto, "minuto tem de ser um valor unico.").toMatch(/^\d{1,2}$/);
    expect(hora, "hora tem de ser um valor unico.").toMatch(/^\d{1,2}$/);
  });

  it("dispara DEPOIS do fim de toda pausa de sabado, no mesmo dia", () => {
    // ── O QUE ESTE HORARIO COMPRA ──
    //
    // Um disparo diario e a pausa de sabado duram ~24h cada, entao o disparo de
    // sabado ou cai DENTRO da pausa (e adia tudo de novo) ou cai depois dela. Se
    // cair depois, ele e o primeiro disparo apos o fim da pausa, e a fila
    // represada desde sexta a noite sai na mesma noite de sabado.
    //
    // O `<= 3h` prende o outro lado: uma hora cedo demais no dia SEGUINTE
    // tambem "vem depois do fim", e adiaria a fila em mais um dia inteiro.
    const { minuto, hora } = horarioDoCron();
    const janelas = sabbathWindows("2026-01-01", "2029-12-31") as Array<{
      startsAt: Date;
      endsAt: Date;
    }>;
    expect(janelas.length).toBeGreaterThan(150);

    for (const janela of janelas) {
      const fim = janela.endsAt;
      const disparo = new Date(
        Date.UTC(
          fim.getUTCFullYear(),
          fim.getUTCMonth(),
          fim.getUTCDate(),
          hora,
          minuto,
          0,
        ),
      );
      expect(
        disparo.getTime(),
        `a pausa que termina em ${fim.toISOString()} acaba DEPOIS do disparo ` +
          `de ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")} UTC ` +
          "daquele dia. Esse disparo cai dentro da pausa, e a fila represada " +
          "desde sexta espera mais um dia inteiro.",
      ).toBeGreaterThan(fim.getTime());
      expect(
        disparo.getTime() - fim.getTime(),
        `o disparo do dia ${fim.toISOString().slice(0, 10)} acontece mais de ` +
          "3h depois do fim da pausa. Ha horario melhor: quanto mais perto do " +
          "fim, mais cedo a fila represada sai.",
      ).toBeLessThanOrEqual(3 * 60 * 60 * 1000);
    }
  });

  it("nao existe horario diario que escape de TODA pausa -- e isso e conhecido", () => {
    // A task pedia "um horario que nao caia na pausa". Ele nao existe: a pausa
    // dura ~24h e o disparo diario acontece a cada 24h, entao ha sempre um
    // disparo por semana dentro dela. O que se escolhe e QUAL -- e a escolha
    // acima e a sexta a noite, porque o disparo de sabado (fora da pausa) ja
    // recupera tudo algumas horas depois.
    //
    // Esta assertiva existe para que a proxima pessoa nao gaste tempo cacando o
    // horario perfeito.
    const janelas = sabbathWindows("2026-01-01", "2026-12-31") as Array<{
      startsAt: Date;
      endsAt: Date;
    }>;
    for (let hora = 0; hora < 24; hora += 1) {
      const dentro = janelas.some((janela) => {
        // Os dois disparos que podem cair na janela: o do dia em que ela comeca
        // e o do dia em que ela termina.
        for (const dia of [janela.startsAt, janela.endsAt]) {
          const disparo = Date.UTC(
            dia.getUTCFullYear(),
            dia.getUTCMonth(),
            dia.getUTCDate(),
            hora,
            0,
            0,
          );
          if (disparo >= janela.startsAt.getTime() && disparo <= janela.endsAt.getTime()) {
            return true;
          }
        }
        return false;
      });
      expect(
        dentro,
        `a hora ${hora}:00 UTC escaparia de toda pausa de 2026. Se isto for ` +
          "verdade, a premissa desta secao mudou e o horario do cron merece " +
          "ser revisto.",
      ).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// app/api/email/drain/route.ts
// ─────────────────────────────────────────────────────────────────────────────

describe("a rota do dreno", () => {
  it("le a rota, e ela ainda e a rota", () => {
    // Sentinela: os padroes abaixo casariam vazio num arquivo vazio, e falsa
    // cobertura e pior que lacuna conhecida.
    expect(rota.length).toBeGreaterThan(0);
    expect(rota).toMatch(/export\s+async\s+function\s+GET\s*\(/);
    expect(rota).toMatch(/export\s+async\s+function\s+POST\s*\(/);
  });

  it("delega a autorizacao a features/", () => {
    expect(rota).toMatch(/drainAccess\(/);
    expect(rota).toMatch(/cronSecret:\s*process\.env\.CRON_SECRET/);
  });

  it("nao compara segredo nenhum aqui", () => {
    // ── A NEGATIVA QUE FECHA A MUTACAO PRINCIPAL ──
    //
    // A comparacao em tempo constante tem uma armadilha (`timingSafeEqual`
    // levanta com tamanhos diferentes) e uma correcao errada obvia (conferir o
    // tamanho antes, que vaza o tamanho). Reescrita aqui, ela nasce sem teste:
    // `app/**` nao e varrido por include nenhum deste repo.
    for (const literal of [
      "timingSafeEqual",
      "createHash",
      "sha256",
      "node:crypto",
      "bearerToken",
      "secretMatches",
    ]) {
      expect(
        rota,
        `route.ts voltou a escrever \`${literal}\`. A comparacao do segredo mora ` +
          "em features/email/drain-auth.ts, onde ha teste -- inclusive para o " +
          "segredo de tamanho diferente, que faz `timingSafeEqual` LEVANTAR.",
      ).not.toContain(literal);
    }
  });

  it("nao decide sozinha que a ausencia de segredo libera", () => {
    // A forma exata do defeito: `if (!process.env.CRON_SECRET) return ok`.
    // `drainAccess` recusa nesse caso, e ha assertiva sobre isso; um atalho
    // escrito aqui a contornaria sem acender nada.
    expect(rota).not.toMatch(/if\s*\(\s*!\s*process\.env\.CRON_SECRET/);
    expect(rota).not.toMatch(/process\.env\.CRON_SECRET\s*={2,3}/);
  });

  it("devolve o RELATORIO, e nao um `ok` mudo", () => {
    // Este e o unico lugar de onde se enxerga o que a fila fez. Um `{ ok: true }`
    // esconderia `{ deferred: 12, reasons: { no_site_url: 12 } }`, que e
    // exatamente o sintoma de `NEXT_PUBLIC_SITE_URL` errada -- a variavel mais
    // perigosa deste bloco, porque errada ela adia TUDO sem erro visivel.
    const [, relatorio] = /const\s+(\w+)\s*=\s*await\s+runOutboxDrain\(/.exec(rota) ?? [];
    expect(
      relatorio,
      "nao achei `const <nome> = await runOutboxDrain(` na rota.",
    ).toBeTruthy();
    expect(rota).toMatch(new RegExp(`NextResponse\\.json\\(\\s*\\{[^}]*\\.\\.\\.${relatorio}`));
    expect(rota).not.toMatch(/NextResponse\.json\(\s*\{\s*ok:\s*true\s*\}\s*\)/);
  });

  it("nunca e servida de cache, e roda no Node", () => {
    expect(rota).toMatch(/export\s+const\s+dynamic\s*=\s*"force-dynamic"/);
    // Edge nao tem `node:crypto` completo nem serve para carregar a chave de
    // service role.
    expect(rota).toMatch(/export\s+const\s+runtime\s*=\s*"nodejs"/);
  });

  it("o dreno que levanta vira 500, e nao 200 calado", () => {
    // `runOutboxDrain` levanta com BREVO_API_KEY, EMAIL_FROM ou EMAIL_FROM_NAME
    // faltando. Engolir isso num 200 faria o cron da Vercel marcar sucesso
    // todo dia com zero e-mail saindo.
    expect(rota).toMatch(/status:\s*500/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// services/public-registration.ts -- o dreno pos-submit
// ─────────────────────────────────────────────────────────────────────────────

describe("o dreno depois do submit", () => {
  it("passa pelo teto de tempo, e pelo teto CERTO", () => {
    // A costura inteira numa expressao so: `drainWithinBudget`, o dreno de
    // verdade la dentro, e o teto do SERVIDOR. Sem o nome da constante, trocar
    // 4s pelo teto da tela (1,5s) -- ou por um numero cru -- seria invisivel.
    expect(servico).toMatch(
      /drainWithinBudget\(\s*\(\)\s*=>\s*runOutboxDrain\(([\s\S]*?)\),\s*SUBMIT_DRAIN_BUDGET_MS,?\s*\)/,
    );
  });

  it("NAO chama o dreno cru", () => {
    // ── A NEGATIVA QUE PROTEGE A INSCRICAO ──
    //
    // `await runOutboxDrain(...)` sem o teto reintroduz as duas falhas de uma
    // vez: uma chamada pendurada ao provedor segura a inscricao de quem esta
    // esperando, e uma excecao do dreno derruba a resposta de uma inscricao que
    // JA foi gravada -- a pessoa le "nao foi possivel concluir" e tenta de novo.
    expect(
      servico,
      "services/public-registration.ts chama `runOutboxDrain` sem passar por " +
        "`drainWithinBudget`. O teto e o `try/catch` moram la, com teste; aqui " +
        "nao ha portao nenhum.",
    ).not.toMatch(/await\s+runOutboxDrain\(/);
  });

  it("drena ANTES de devolver sucesso, e so no caminho de sucesso", () => {
    // Depois de um `return` a chamada seria codigo morto; antes das guardas ela
    // drenaria em recusa, quando nao ha nada novo na fila.
    const posDreno = servico.indexOf("drainWithinBudget(");
    const posSucesso = servico.indexOf("return { ok: true");
    expect(posDreno).toBeGreaterThan(-1);
    expect(posSucesso).toBeGreaterThan(-1);
    expect(
      posDreno,
      "o dreno ficou DEPOIS do `return { ok: true`. Ali ele e codigo morto, e " +
        "nenhum portao deste repo enxerga isso.",
    ).toBeLessThan(posSucesso);
  });

  it("usa o lote pos-acao, e nao o do cron", () => {
    expect(servico).toContain("POST_ACTION_DRAIN_BATCH_SIZE");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PlayersSection.tsx -- o dreno depois do pagamento conferido
// ─────────────────────────────────────────────────────────────────────────────

describe("o dreno depois do pagamento conferido", () => {
  it("le a tela, e ela ainda marca pagamento", () => {
    expect(tela.length).toBeGreaterThan(0);
    expect(tela).toContain("markPaymentVerifiedPatch()");
  });

  it("chama o dreno pela funcao de features/", () => {
    expect(tela).toMatch(/requestDrain\(/);
  });

  it("nao monta a requisicao a mao", () => {
    // O caminho e o verbo moram em `post-action-drain.ts`, onde estao o teto, o
    // `try/catch` e a razao de a segunda porta ser so POST. Um `fetch` escrito
    // aqui nasce sem os tres.
    for (const literal of [DRAIN_ENDPOINT, "/api/email/drain"]) {
      expect(
        tela,
        `PlayersSection.tsx escreveu \`${literal}\` a mao. O caminho e o verbo ` +
          "vem de features/email/post-action-drain.ts.",
      ).not.toContain(literal);
    }
    // Sem assertiva sobre `method:` aqui: a tela ja POSTa em
    // `/api/import-players`, e uma negativa sobre o verbo acenderia contra
    // codigo que nao tem nada a ver com o dreno. O verbo esta preso onde ele
    // decide algo -- em `requestDrain` (post-action-drain.test.ts) e na porta de
    // admin (drain-auth.test.ts, "a sessao de admin NAO entra por GET").
  });

  it("drena DEPOIS de marcar, e depois da guarda de erro", () => {
    // Antes do `.update()` nao haveria linha nova na fila; antes da guarda de
    // erro, drenaria mesmo quando a marcacao falhou -- e falha de marcacao quer
    // dizer que o gatilho nao enfileirou nada, porque ele roda na mesma
    // transacao.
    const posUpdate = tela.indexOf("markPaymentVerifiedPatch()");
    const posDreno = tela.indexOf("requestDrain(");
    expect(posDreno).toBeGreaterThan(posUpdate);
  });

  it("o dreno nao pode ficar entre a marcacao e o toast de sucesso... e nao fica", () => {
    // Marcar pagamento tem de continuar funcionando com o dreno fora do ar.
    // `requestDrain` nunca levanta (ha teste), mas a POSICAO tambem importa: o
    // toast de sucesso vem do UPDATE, nao do e-mail.
    const posToast = tela.indexOf('toast.success("Pagamento marcado como conferido")');
    const posDreno = tela.indexOf("requestDrain(");
    expect(posToast).toBeGreaterThan(-1);
    expect(
      posDreno,
      "o dreno ficou ANTES do toast de sucesso. Quem marcou pagamento fica " +
        "olhando a ampulheta ate o teto do dreno estourar, para saber de uma " +
        "marcacao que ja terminou.",
    ).toBeGreaterThan(posToast);
  });
});
