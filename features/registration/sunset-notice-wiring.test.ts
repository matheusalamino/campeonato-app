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
 * Pelo mesmo motivo os padroes toleram FORMATACAO — quebra de linha, virgula
 * final, espaco a mais. O repo nao roda prettier hoje, mas o proximo dev pode
 * rodar, e vermelho num teste chamado "o tick le o relogio do SERVIDOR" o manda
 * cacar bug de fuso horario onde so houve uma linha quebrada em duas.
 *
 * O que estes testes NAO toleram, de proposito, e o efeito mudar de forma: sao
 * ligacoes lidas como texto, e essa e a conta que se paga por cobrir o unico
 * arquivo desta feature que nenhum teste consegue renderizar.
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

/** O nome do SETTER do estado declarado com `useState<Tipo>`. */
const setterDo = (tipo: string) =>
  unico(wizard, new RegExp(`const \\[\\w+, (\\w+)\\] = useState<${tipo}>\\(`));

describe("a fiacao do aviso do por do sol", () => {
  // Sentinelas: um `indexOf` que devolve -1 ou um regex que casa zero linhas
  // passariam vazio, e falsa cobertura e pior que lacuna conhecida. `unico` e
  // `prop` falham quando nao acham, e cada `it` confere o que encontrou.

  const alerta = nomeDo("SunsetAlert");
  const setaAlerta = setterDo("SunsetAlert");
  const reserva = nomeDo("SlotReservation \\| null");

  /**
   * O efeito do por do sol: o trecho em volta da correcao do relogio.
   *
   * As DUAS pontas sao assertadas, e nao so a do meio. Uma janela derivada de
   * `indexOf` que devolve -1 nao fica vazia: `slice(inicio, -1)` recorta ate o
   * penultimo caractere do ARQUIVO INTEIRO, e ai todo `toContain` deste describe
   * continua achando o que procura — em outro efeito, em outro componente, em
   * qualquer lugar. Foi exatamente o que apagar `return () => clearInterval(id)`
   * fazia: a janela ia de 465 para 17.104 caracteres e a suite inteira passava,
   * com um tick de meio minuto vazando a cada entrada e saida da pagina.
   *
   * E FUNCAO, e nao constante de `describe`, para as pontas falharem DENTRO do
   * `it` que as usa. No topo, a mesma assercao derruba a coleta do arquivo
   * inteiro — nenhum teste roda, e o unico vermelho vira "expected -1 to be
   * greater than 11622". Assim o "todo intervalo do wizard tem limpeza" la
   * embaixo continua rodando e diz, em portugues, o que acabou de sumir.
   */
  function efeito(): string {
    const correcao = wizard.indexOf("clockSkewMs(");
    expect(correcao).toBeGreaterThan(0);
    const inicio = wizard.lastIndexOf("useEffect", correcao);
    const fim = wizard.indexOf("clearInterval", correcao);
    expect(inicio).toBeGreaterThan(0);
    expect(fim).toBeGreaterThan(inicio);
    return wizard.slice(inicio, fim);
  }

  it("o wizard le o por do sol que a pagina mandou, em vez de calcular o seu", () => {
    const assinatura = unico(wizard, /export default function RegistrationWizard\(\{([^}]*)\}/);
    // Compara o CONJUNTO de props: reordenar a desestruturacao e no-op e nao
    // pode matar teste nenhum.
    expect(assinatura.split(",").map((p) => p.trim()).filter(Boolean)).toContain("nextSunset");
    expect(wizard).toContain('from "@/features/registration/sabbath"');
  });

  it("comeca sem nada a dizer, e nao com a faixa ja na tela", () => {
    const inicial = unico(wizard, /useState<SunsetAlert>\(([^)]*)\)/);
    // `{ level: "notice" }` aqui poe a faixa do por do sol em TODO carregamento,
    // a semana inteira, e o texto so sumiria no primeiro tick — meio minuto
    // depois, ja lido. Nao ha `tsc` nem eslint para reclamar: e valor legitimo
    // da uniao. O estado inicial e carga, e carga sem teste some.
    // Tira a virgula final do objeto TAMBEM, e nao so a do argumento: quebrar
    // `{ level: "none" }` em linhas com virgula final e reformatacao pura, e
    // matar teste em reformatacao e o imposto que este arquivo condena.
    expect(inicial.replace(/,(?=\s*\})/g, "").replace(/\s/g, "").replace(/,$/, "")).toBe(
      '{level:"none"}',
    );
  });

  it("a faixa recebe o alerta vivo, e nao uma constante", () => {
    const tags = [...wizard.matchAll(/<SunsetNotice\b[^>]*>/g)].map((m) => m[0]);
    expect(tags).toHaveLength(1);
    expect(prop(tags[0], "alert")).toBe(alerta);
  });

  it("o bloco de pagamento PERGUNTA a regra, em vez de reescreve-la", () => {
    const argumentos = unico(wizard, /paymentGate\(([^)]*)\)/);
    // A reserva e o alerta, nesta ordem: e a ordem que decide qual das duas
    // razoes o jogador le quando as duas valem. O `filter` e por causa da
    // virgula final que qualquer formatador poe ao quebrar a chamada em linhas.
    expect(argumentos.split(",").map((a) => a.trim()).filter(Boolean)).toEqual([reserva, alerta]);

    // A regra inteira mora em `paymentGate`. Uma copia dela aqui — mesmo
    // identica hoje — e a que vai divergir depois, e ela nao tem teste.
    //
    // Varre o ARQUIVO INTEIRO, e nao so o bloco do pagamento, porque a copia
    // nao nasce onde a original esta: ela nasce num `if` tres passos acima, ou
    // numa classe condicional. O preco esta assumido: isto proibe a palavra
    // inglesa "cutoff" em oitocentas linhas de wizard, e um dia alguem vai
    // escrever `data-cutoff` num atributo e levar vermelho sem entender. Se
    // isso acontecer, a resposta certa e estreitar a varredura — nao afrouxa-la.
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
    // Os dois campos sao lidos NO PONTO DE USO, direto do objeto. Abertos em
    // duas `string | null` no topo do componente — o que este efeito fez por um
    // lote — eles voltam a ser dois ISOs intercambiaveis a oitocentas linhas de
    // distancia um do outro: `clockSkewMs(sunsetAt, ...)` compila, passa em todo
    // o resto, e transforma "quanto falta para o por do sol" em desvio de
    // relogio — o que poe a pagina em loop de refresh. Lidos do objeto, a troca
    // ainda compila, mas ela deixa de ser invisivel: o nome do campo esta na
    // propria linha em que a chamada acontece.
    const desvio = unico(efeito(), /const (\w+) = clockSkewMs\(\s*nextSunset\.serverNow,\s*Date\.now\(\),?\s*\)/);
    const corrigido = [...efeito().matchAll(/const (\w+) = new Date\(\s*Date\.now\(\)\s*\+\s*(\w+),?\s*\)/g)];
    expect(corrigido).toHaveLength(1);

    const [, agora, somado] = corrigido[0];
    // O que corrige o relogio e a medida contra o carimbo do servidor.
    expect(somado).toBe(desvio);
    // E o instante corrigido e UM so: a pergunta que recarrega e o calculo que
    // pinta a faixa nao podem ler relogios diferentes. Os dois comparam com o
    // por do sol, e nao com o carimbo.
    expect(efeito()).toMatch(new RegExp(`sunsetHasPassed\\(\\s*${agora}\\.getTime\\(\\),\\s*nextSunset\\.at,?\\s*\\)`));
    expect(efeito()).toMatch(new RegExp(`[^\\w]sunsetAlert\\(\\s*${agora},\\s*nextSunset\\.at,?\\s*\\)`));
  });

  it("o tick so troca o estado quando o alerta MUDA", () => {
    // `sunsetAlert` devolve um `{ level: "none" }` NOVO a cada chamada, e
    // `sabbathStatus` devolve por do sol nao-nulo em todo instante FORA da
    // pausa. Entregar esse objeto direto ao setter reconcilia o wizard inteiro —
    // sete `StepShell`, tres `UploadCard`, o radar, as estrelas e o payload do
    // PIX com o CRC16 recalculado — a cada meio minuto, do sabado ao entardecer ate a
    // sexta as 17h. Enquanto o alerta era `string`, o React fazia bail-out por
    // `Object.is` e isso nao existia; com objeto, quem faz o bail-out e a
    // comparacao. Sem ela, `sunset` nas deps deste efeito vira loop de render.
    // A DECISAO nao mora aqui: `nextSunsetAlert` devolve o alerta a usar, e tem
    // teste por identidade em sabbath.test.ts. Devolver o valor em vez de um
    // booleano foi de proposito — um predicado obrigaria o ternario aqui, e ai a
    // diferenca entre o certo e o desastre seria a posicao de um `!`, guardada
    // por regex, no arquivo que nenhum teste consegue renderizar. Sem forma que
    // possa ser invertida, o que sobra para prender e a LIGACAO.
    expect(efeito()).toContain("nextSunsetAlert(");
    // O setter recebe uma FUNCAO — `(anterior) => ...` —, e nao o alerta cru:
    // entregar `sunsetAlert(...)` direto e o que reconcilia o wizard inteiro a
    // cada meio minuto.
    expect(efeito()).toMatch(new RegExp(`${setaAlerta}\\(\\s*\\(?\\s*\\w+\\s*\\)?\\s*=>`));
    expect(efeito()).not.toMatch(new RegExp(`${setaAlerta}\\(\\s*sunsetAlert\\(`));
  });

  it("na virada quem decide e o servidor: recarrega em vez de se trancar sozinho", () => {
    // A REGRA e o predicado, e ele esta em `sunsetHasPassed` — testado na borda
    // exata. O que se le aqui e so que o refresh esta preso a ele: solto, ou
    // negado, o wizard ou nunca recarrega ou recarrega sempre.
    // O predicado pode nascer quebrado em linhas, mas a guarda tem que ser ELE,
    // e nada alem dele. `[^{]*` tolerava quebra de linha e, junto, deixou de
    // exigir que a condicao terminasse ali: `=== false` (nunca recarrega, o QR
    // fica na tela depois do por do sol) e `|| skewMs > 0` (recarrega sempre)
    // passavam a casar, e os dois morriam no padrao anterior. Um nivel de
    // parenteses balanceado tolera a quebra sem abrir a condicao.
    const chamada = String.raw`sunsetHasPassed\((?:[^()]|\([^()]*\))*\)`;
    expect(efeito()).toMatch(
      new RegExp(`if\\s*\\(\\s*${chamada}\\s*\\)\\s*\\{\\s*router\\.refresh\\(\\);\\s*return;\\s*\\}`),
    );
  });

  it("o tick roda na montagem, e depois no intervalo com nome", () => {
    const agendamento = [...efeito().matchAll(/setInterval\(\s*(\w+),\s*(\w+),?\s*\)/g)];
    expect(agendamento).toHaveLength(1);
    // E este e o UNICO intervalo do efeito. O padrao acima so enxerga callback
    // com NOME, entao um `setInterval(() => ..., 1000)` inline — o estilo do
    // vizinho `SlotNotice` — poderia entrar ao lado dele sem ser contado.
    expect([...efeito().matchAll(/setInterval\(/g)]).toHaveLength(1);
    const [, nome, intervalo] = agendamento[0];

    // Literal aqui perderia a relacao com os dez minutos do corte, que
    // sabbath.test.ts assegura — e uma hora no lugar de meio minuto passa no
    // `tsc` e no eslint.
    expect(intervalo).toBe("SUNSET_TICK_MS");
    // A chamada imediata, sozinha numa linha: sem ela, quem abre a pagina ja
    // dentro do corte ve o QR do PIX ate a primeira batida.
    expect(efeito()).toMatch(new RegExp(`\\n\\s*${nome}\\(\\);`));
  });

  it("todo intervalo do wizard tem limpeza", () => {
    // Um `setInterval` sem `clearInterval` nao quebra nada na hora: ele deixa um
    // tick vivo por entrada e saida CLIENT-SIDE da pagina, e cada um continua
    // chamando `setSunset` e `router.refresh()` em componente ja desmontado. O
    // sintoma em producao e "a pagina fica recarregando sozinha depois de um
    // tempo", e ele aparece longe de onde a linha foi apagada.
    //
    // Conta os dois lados no arquivo inteiro, e nao so no efeito do por do sol:
    // o wizard ja tem outro intervalo (o heartbeat da reserva), e o proximo pode
    // nascer em qualquer efeito. Fecha tambem, por fora, a ponta do `efeito`
    // logo acima: apagar a limpeza deste efeito da vermelho aqui em portugues
    // claro, alem de derrubar a sentinela da janela.
    const abertos = [...wizard.matchAll(/setInterval\(/g)];
    const limpos = [...wizard.matchAll(/clearInterval\(/g)];
    expect(abertos.length).toBeGreaterThan(0);
    expect(limpos).toHaveLength(abertos.length);
  });
});
