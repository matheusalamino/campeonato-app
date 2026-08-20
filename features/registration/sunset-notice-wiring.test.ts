import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A FIACAO do aviso do por do sol no wizard, lida como texto.
 *
 * Fiacao, e so isso. As regras foram para funcoes puras e sao testadas de
 * verdade: `sunsetAlert`, `sunsetHasPassed`, `clockSkewMs` e `sunsetTimeLabel`
 * em sabbath.test.ts, `paymentGate` em slot.test.ts, e as duas faixas
 * renderizadas em registration-notices.test.ts. Foi o caminho que
 * `announceableEndsAt` abriu na T9, e ele vale mais que empilhar regex: a
 * primeira versao deste arquivo guardava a expressao do pagamento com
 * `toContain` em pedacos, e `(...) || true` passava.
 *
 * O que sobrou aqui e o que so existe como texto: ligacoes que somem sem quebrar
 * o `tsc`, o eslint nem nenhum outro teste.
 *
 *   o wizard nao le `nextSunset`     ->  a faixa nunca aparece e o pagamento
 *                                        nunca fecha. Ate a T9 a prop chegava e
 *                                        morria na assinatura.
 *   `alert={sunset}` -> outra coisa  ->  a faixa fica presa no estado inicial.
 *   `paymentGate` reescrito a mao    ->  a regra volta a ser expressao solta, e
 *                                        volta a nao ter teste.
 *   o `skew` some do tick            ->  o formulario volta a comparar o por do
 *                                        sol com o relogio do APARELHO: com
 *                                        alguns minutos de erro, a faixa nunca
 *                                        aparece e o QR nunca some — ou a pagina
 *                                        entra em loop de refresh.
 *   `router.refresh()` sai da guarda ->  quem estava com o formulario aberto na
 *                                        virada fica num wizard que aceita
 *                                        digitacao e sera recusado no envio.
 *   o `tick()` imediato some         ->  quem abre a pagina JA dentro do corte ve
 *                                        o QR do PIX por ate meio minuto.
 *   `SUNSET_TICK_MS` vira literal    ->  o numero perde a relacao com o corte que
 *                                        sabbath.test.ts assegura.
 *
 * Os nomes locais sao LIDOS do arquivo, e nao escritos aqui: renomear um estado
 * pelo atalho da IDE e no-op, e teste que morre em no-op ensina a nao refatorar.
 *
 * Le como texto pelo mesmo motivo de wizard-steps.test.ts e
 * sabbath-page-wiring.test.ts: o wizard arrasta server actions, upload, PIX e o
 * heartbeat da reserva. Os componentes que NAO arrastam nada sao renderizados de
 * verdade em registration-notices.test.ts.
 */
const WIZARD = join(process.cwd(), "app/(public)/inscrever/[slug]/RegistrationWizard.tsx");

/**
 * O arquivo sem comentarios, como em rest-overlay-source.test.ts.
 *
 * Nao e capricho: os comentarios deste arquivo CITAM as expressoes que os testes
 * procuram. Sem isto, o preco de comentar bem seria um teste que passa medindo o
 * comentario em vez do codigo.
 *
 * O `(?<!:)` guarda o `https://` de virar comentario de linha.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/[^\n]*/g, "");
}

const wizard = semComentarios(readFileSync(WIZARD, "utf8"));

/** O valor de `prop={...}` na abertura de tag, como em sabbath-page-wiring. */
function prop(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`${nome}=\\{([^}]*)\\}`));
  return m ? m[1].trim() : null;
}

/** Uma unica ocorrencia de `padrao`, com o grupo 1 devolvido. Falha se nao houver. */
function unico(fonte: string, padrao: RegExp): string {
  const achados = [...fonte.matchAll(new RegExp(padrao, `${padrao.flags.replace("g", "")}g`))];
  expect(achados).toHaveLength(1);
  return achados[0][1];
}

/** O nome do estado declarado com `useState<Tipo>`. */
const nomeDo = (tipo: string) =>
  unico(wizard, new RegExp(`const \\[(\\w+), \\w+\\] = useState<${tipo}>\\(`));

describe("a fiacao do aviso do por do sol", () => {
  // Sentinelas: um `indexOf` que devolve -1 ou um regex que casa zero linhas
  // passariam vazio, e falsa cobertura e pior que lacuna conhecida. `unico` e
  // `prop` falham quando nao acham, e cada `it` confere o que encontrou.

  const alerta = nomeDo("SunsetAlert");
  const reserva = nomeDo("SlotReservation \\| null");

  /** O efeito do por do sol: o trecho em volta da correcao do relogio. */
  const efeito = (() => {
    const correcao = wizard.indexOf("clockSkewMs(");
    expect(correcao).toBeGreaterThan(0);
    return wizard.slice(wizard.lastIndexOf("useEffect", correcao), wizard.indexOf("clearInterval", correcao));
  })();

  it("o wizard le o por do sol que a pagina mandou, em vez de calcular o seu", () => {
    const assinatura = unico(wizard, /export default function RegistrationWizard\(\{([^}]*)\}/);
    // Compara o CONJUNTO de props: reordenar a desestruturacao e no-op e nao
    // pode matar teste nenhum.
    expect(assinatura.split(",").map((p) => p.trim()).filter(Boolean)).toContain("nextSunset");
    expect(wizard).toContain('from "@/features/registration/sabbath"');
  });

  it("a faixa recebe o alerta vivo, e nao uma constante", () => {
    const tags = [...wizard.matchAll(/<SunsetNotice\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(1);
    expect(prop(tags[0], "alert")).toBe(alerta);
  });

  it("o bloco de pagamento PERGUNTA a regra, em vez de reescreve-la", () => {
    const argumentos = unico(wizard, /paymentGate\(([^)]*)\)/);
    // A reserva e o alerta, nesta ordem: e a ordem que decide qual das duas
    // razoes o jogador le quando as duas valem.
    expect(argumentos.split(",").map((a) => a.trim())).toEqual([reserva, alerta]);

    // A regra inteira mora em `paymentGate`. Uma copia dela aqui — mesmo
    // identica hoje — e a que vai divergir depois, e ela nao tem teste.
    expect(wizard).not.toContain("cutoff");
  });

  it("o veredito do pagamento manda nos DOIS lados: o QR e a explicacao", () => {
    const veredito = unico(wizard, /const (\w+) = paymentGate\(/);

    const abre = wizard.indexOf(`{${veredito}.open ? (`);
    const fecha = wizard.indexOf(") : (", abre);
    expect(abre).toBeGreaterThan(0);
    expect(fecha).toBeGreaterThan(abre);

    // O QR e o envio do comprovante ficam do lado aberto. O comprovante junto de
    // proposito: anexar comprovante sem poder pagar e tao inutil quanto pagar
    // sem vaga, e um upload aceito faz o pagamento parecer valido.
    const aberto = wizard.slice(abre, fecha);
    expect(aberto).toContain("<PixPayment");
    expect(aberto).toContain("payment_receipt_link");

    // E a razao chega ao aviso vinda do mesmo veredito, em vez de ser deduzida
    // de novo la dentro — duas deducoes discordariam um dia.
    const tags = [...wizard.matchAll(/<PaymentClosedNotice\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(1);
    expect(prop(tags[0], "reason")).toBe(`${veredito}.reason`);
  });

  it("o tick le o relogio do SERVIDOR, e os dois consumidores leem o mesmo instante", () => {
    // Os dois campos de `NextSunset` viram duas `string` aqui dentro, e a
    // uniao ja nao protege: `clockSkewMs(sunsetAt, ...)` compila e passa em
    // todo o resto — e transforma "quanto falta para o por do sol" em desvio de
    // relogio, o que poe a pagina em loop de refresh. Por isso os dois nomes
    // sao rastreados ate a origem.
    const doPorDoSol = unico(wizard, /const (\w+) = nextSunset\?\.at \?\? null;/);
    const doServidor = unico(wizard, /const (\w+) = nextSunset\?\.serverNow \?\? null;/);

    const desvio = unico(efeito, new RegExp(`const (\\w+) = clockSkewMs\\(${doServidor}, Date\\.now\\(\\)\\)`));
    const corrigido = [...efeito.matchAll(/const (\w+) = new Date\(Date\.now\(\) \+ (\w+)\)/g)];
    expect(corrigido).toHaveLength(1);

    const [, agora, somado] = corrigido[0];
    // O que corrige o relogio e a medida contra o carimbo do servidor.
    expect(somado).toBe(desvio);
    // E o instante corrigido e UM so: a pergunta que recarrega e o calculo que
    // pinta a faixa nao podem ler relogios diferentes. Os dois comparam com o
    // por do sol, e nao com o carimbo.
    expect(efeito).toContain(`sunsetHasPassed(${agora}.getTime(), ${doPorDoSol})`);
    expect(efeito).toContain(`sunsetAlert(${agora}, ${doPorDoSol})`);
  });

  it("na virada quem decide e o servidor: recarrega em vez de se trancar sozinho", () => {
    // A REGRA e o predicado, e ele esta em `sunsetHasPassed` — testado na borda
    // exata. O que se le aqui e so que o refresh esta preso a ele: solto, ou
    // negado, o wizard ou nunca recarrega ou recarrega sempre.
    expect(efeito).toMatch(/if \(sunsetHasPassed\(.*\)\) \{\s*router\.refresh\(\);\s*return;\s*\}/);
  });

  it("o tick roda na montagem, e depois no intervalo com nome", () => {
    const agendamento = [...efeito.matchAll(/setInterval\((\w+), (\w+)\)/g)];
    expect(agendamento).toHaveLength(1);
    const [, nome, intervalo] = agendamento[0];

    // Literal aqui perderia a relacao com os dez minutos do corte, que
    // sabbath.test.ts assegura — e uma hora no lugar de meio minuto passa no
    // `tsc` e no eslint.
    expect(intervalo).toBe("SUNSET_TICK_MS");
    // A chamada imediata, sozinha numa linha: sem ela, quem abre a pagina ja
    // dentro do corte ve o QR do PIX ate a primeira batida.
    expect(efeito).toMatch(new RegExp(`\\n\\s*${nome}\\(\\);`));
  });
});
