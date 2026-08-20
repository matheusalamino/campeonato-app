import { brasiliaInputToIso, brasiliaParts, CHAMPIONSHIP_TIME_ZONE } from "@/lib/datetime-br";

/**
 * Uma janela de repouso, vinda de `sabbath_windows`.
 *
 * Quem chama entrega a janela ATUAL OU A PROXIMA — a que a consulta
 * `ends_at >= now() ORDER BY starts_at LIMIT 1` devolve. `null` nao quer dizer
 * "hoje nao e sabado": quer dizer que a tabela nao alcanca este instante, e
 * so nesse caso a regra conservadora entra.
 *
 * Um VAO no meio da tabela e o modo de falha mais perigoso do par, e vale igual
 * dos dois lados: as linhas depois do buraco ainda satisfazem `ends_at >= now()`,
 * entao a consulta devolve uma janela FUTURA, este modulo responde "ainda nao e
 * sabado" e a tela abre a inscricao em todo sabado dentro do vao — caladamente,
 * sem nunca chegar na regra conservadora. Quem estender a tabela comeca pela
 * ultima sexta ja gravada, nunca depois dela.
 */
export type SabbathWindow = { startsAt: string; endsAt: string };

/*
 * A REGRA CONSERVADORA — sexta 17h a sabado 20h30, horario de Brasilia.
 *
 * So entra quando a tabela nao alcanca o instante. Pausa mais larga que a real,
 * nunca menos: errar pausando a mais custa algumas horas de inscricao, errar
 * pausando a menos custa a observancia.
 *
 * E o unico ramo do modulo que le hora de PAREDE, e por isso o unico que o
 * horario de verao mexe — as janelas gravadas sao instantes absolutos, imunes.
 *
 * Espelha o TERCEIRO ramo de `public.is_sabbath` na migration
 * 20260819030000_sabbath_windows.sql. Mexeu aqui, mexa la — nada cobra os dois
 * lados alem do teste de cada um.
 */

/** Sexta. Folga de ~30 min: o por do sol mais cedo do ano e 17:30:40. */
const SABBATH_FALLBACK_START = "17:00";

/**
 * Sabado.
 *
 * Nao e 19h: a tabela `sabbath_windows` tem DEZ sabados de janeiro com por do
 * sol depois das 19h, o ultimo as 19:01:47, e o corte ali encerraria a pausa
 * antes do sol se por — errando para o lado proibido justo onde existe para nao
 * errar.
 *
 * E nao e 19h30 porque isto le hora de PAREDE. Sob horario de verao
 * reinstituido, aquele mesmo por do sol de 19:01:47 passa a marcar 20:01:47, e
 * 19h30 recriaria o bug uma hora mais fundo. 20h30 cobre os dois regimes com
 * ~28 min de folga, a mesma margem da sexta.
 *
 * Considerado e recusado: ler a hora com offset fixo de -3 seria exato nos dois
 * regimes, mas custaria uma segunda nocao de "hora local" no codigo — e
 * `brasiliaParts`, que o versiculo vai usar, precisa da hora CIVIL. Este ramo e
 * rede de seguranca: obvio e generoso vale mais que exato e sutil.
 */
const SABBATH_FALLBACK_END = "20:30";

const FRIDAY = 5;
const SATURDAY = 6;

/** A partir de quantos minutos antes do por do sol o formulario avisa. */
export const SUNSET_NOTICE_MINUTES = 30;
/** A quantos minutos do por do sol o bloco de pagamento some. */
export const SUNSET_PAYMENT_CUTOFF_MINUTES = 10;

/**
 * De quanto em quanto tempo o formulario reavalia o por do sol.
 *
 * Meio minuto e resolucao de sobra para uma faixa que mostra HORA ABSOLUTA — ela
 * nao conta minutos, entao meio minuto de atraso nao aparece no texto. O que o
 * numero precisa ser e PEQUENO em relacao ao corte: os dez minutos do corte sao
 * o estado mais curto que um tick nao pode pular, e quem o pula ve o QR na tela
 * ate o proprio por do sol. Um tick de uma hora — a edicao de uma tecla —
 * tambem deixaria quem abre a pagina quarenta minutos antes sem faixa nenhuma.
 *
 * A relacao esta assertada em sabbath.test.ts, no espirito do
 * `MIN_RENEW_GAP_MS * 2 < HEARTBEAT_INTERVAL_MS`: aqui tambem nao ha nada alem
 * do teste segurando dois numeros que so fazem sentido juntos.
 */
export const SUNSET_TICK_MS = 30_000;

/** O texto e montado aqui dentro, nunca vem de fora: `undefined` seria bug nosso. */
function brasiliaAt(date: string, hhmm: string): string {
  const iso = brasiliaInputToIso(`${date}T${hhmm}`);
  if (!iso) throw new Error(`Instante de Brasilia invalido: ${date}T${hhmm}`);
  return iso;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * "17:00" -> 1020. Le os minutos tambem: 17h30 nao pode virar 17h em silencio.
 *
 * As constantes ficam como texto "HH:MM", e nao como minutos ja calculados,
 * para lerem igual ao `time '17:00'` do SQL — o preco e esta conversao.
 *
 * UNICO ponto em que os dois lados nao sao a mesma regra: o SQL compara `time`
 * COM SEGUNDOS e isto compara minuto-do-dia, jogando os segundos fora. Sabado
 * 20:30:30 da `false` la e `true` aqui. No maximo 59s, e para o lado de pausar
 * a mais; se algum dia precisar casar ao segundo, e aqui que mexe.
 */
function hhmmToMinutes(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

type ParsedWindow = { startsAt: string; endsAt: string; start: number; end: number };

/**
 * A janela lida como par de instantes, ou `null` se vier ilegivel.
 *
 * Qualquer comparacao com `NaN` e falsa, entao uma janela corrompida faria
 * `isSabbath` responder `false` — "nao e sabado" — e ABRIR a inscricao no
 * sabado. E a unica direcao que esta feature nao pode errar. Ilegivel vira
 * `null` e cai na regra conservadora, junto com "a tabela nao alcanca".
 *
 * Janela INVERTIDA cai junto, pelo mesmo motivo: com `start > end` nenhum
 * instante satisfaz `t >= start && t <= end`, e a resposta seria de novo "nao e
 * sabado". O `CHECK (ends_at > starts_at)` fecha a origem no banco, mas a porta
 * que sobra e o mapeamento manual de quem consome — `{ startsAt: row.starts_at,
 * endsAt: row.ends_at }`, dois `string`, troca invisivel ao typecheck.
 *
 * As colunas sao `timestamptz NOT NULL`, entao o caminho realista nao produz
 * isso. A guarda mora aqui, e nao em cada funcao, porque as tres leem a mesma
 * janela e nenhuma delas deveria decidir sozinha o que fazer com dado podre.
 */
function parseWindow(window: SabbathWindow | null): ParsedWindow | null {
  if (!window) return null;
  const start = Date.parse(window.startsAt);
  const end = Date.parse(window.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end < start) return null;
  return { startsAt: window.startsAt, endsAt: window.endsAt, start, end };
}

/**
 * A inscricao esta pausada neste instante?
 *
 * `now` por parametro pela mesma disciplina do `registrationGate`: sem isso nao
 * ha como testar as bordas, que sao o unico lugar onde esta regra pode errar.
 *
 * Bordas inclusivas, coerentes com o resto da feature.
 *
 * Precondicoes que este modulo NAO garante, e que quem chama precisa manter:
 *
 * - `now` valido. Um `Date` invalido lanca no ramo conservador e devolve
 *   `false` no ramo da janela. Sem guarda porque nenhum chamador consegue
 *   produzir isso hoje — quem chama passa `new Date()`.
 * - `window` vinda da consulta atual-ou-proxima. Uma janela ja VENCIDA devolve
 *   `false` sem cair no fallback: daqui nao da para distinguir "ja passou" de
 *   "ainda nao chegou" sem reabrir a decisao de qual janela e a certa. Manter
 *   o `ends_at >= now()` na consulta e requisito, nao detalhe de implementacao.
 */
export function isSabbath(now: Date, window: SabbathWindow | null): boolean {
  const parsed = parseWindow(window);
  if (parsed) {
    const t = now.getTime();
    // Janela futura devolve false, e NAO cai na regra conservadora: a tabela
    // esta funcionando. Sem esta distincao o site pausaria toda sexta as 17h em
    // vez do por do sol real, semana apos semana.
    //
    // Bordas INCLUSIVAS nas duas pontas, e esta e a linha que decide 100% dos
    // casos reais — a regra conservadora so roda depois de 2029. Espelha o
    // PRIMEIRO ramo de `public.is_sabbath`, `WHERE p_at >= starts_at AND p_at
    // <= ends_at`, na migration 20260819030000_sabbath_windows.sql. Se um dia
    // alguem perguntar "o segundo exato do por do sol conta?", a resposta esta
    // aqui e la, e as duas tem que mudar juntas.
    return t >= parsed.start && t <= parsed.end;
  }

  const { dow, minutes } = brasiliaParts(now);
  return (dow === FRIDAY && minutes >= hhmmToMinutes(SABBATH_FALLBACK_START))
      || (dow === SATURDAY && minutes <= hhmmToMinutes(SABBATH_FALLBACK_END));
}

/**
 * Quando a pausa vigente termina.
 *
 * So faz sentido chamar quando `isSabbath` disse `true` — e o que garante
 * que o ramo sem janela esta numa sexta ou num sabado. Fora disso a resposta e
 * sintaticamente valida e semanticamente lixo: numa terca devolve a quarta as
 * 20h30, e com uma janela vencida devolve um instante no passado. Pergunte se
 * esta pausada antes de perguntar quando termina.
 */
export function sabbathEndsAt(now: Date, window: SabbathWindow | null): string {
  const parsed = parseWindow(window);
  if (parsed) return parsed.endsAt;
  const { date, dow } = brasiliaParts(now);
  const saturday = dow === SATURDAY ? date : addDays(date, 1);
  return brasiliaAt(saturday, SABBATH_FALLBACK_END);
}

/**
 * Quando a proxima pausa comeca, quando isso e sabido.
 *
 * Com janela e sempre exato. Sem janela, a regra conservadora so conhece o
 * comeco do sabado corrente: em qualquer outro dia devolve `null`, e nao ha o
 * que avisar — a proxima pausa esta a mais de um dia.
 *
 * Atencao para quem for montar a tela: DURANTE a pausa os dois ramos discordam.
 * Com janela devolve um inicio ja passado, e `sunsetAlert` le "cutoff"; sem
 * janela, num sabado, devolve `null` e le "none". Isso deixou de depender de
 * quem chama: `sabbathStatus`, logo abaixo, e o unico caminho da pagina ate
 * aqui, e ele nao pergunta o inicio enquanto a pausa vale. A divergencia
 * continua existindo nesta funcao, mas ficou inalcancavel por construcao.
 */
export function sabbathStartsAt(now: Date, window: SabbathWindow | null): string | null {
  const parsed = parseWindow(window);
  if (parsed) return parsed.startsAt;
  const { date, dow } = brasiliaParts(now);
  if (dow !== FRIDAY) return null;
  return brasiliaAt(date, SABBATH_FALLBACK_START);
}

/** A pausa vigente, quando ha uma. `endsAt` e quando ela termina. */
export type SabbathPause = { endsAt: string };

/**
 * O que a pagina precisa saber sobre a pausa: o veredito e o proximo por do sol.
 *
 * Uniao discriminada, e nao um par de campos independentes, pelo mesmo motivo
 * do `RegistrationGate`: a combinacao proibida — pausado E com por do sol a
 * anunciar — deixa de ser coisa que um comentario pede e passa a ser coisa que
 * o compilador recusa.
 */
export type SabbathStatus =
  | { pause: SabbathPause; sunsetAt: null }
  | { pause: null; sunsetAt: string | null };

/**
 * A decisao inteira da pagina sobre o sabado, num lugar so.
 *
 * Existe porque a alternativa nao tem rede. Montada a mao no Server Component,
 * a regra vira expressoes soltas que nenhum teste de comportamento alcanca — e
 * a pior delas passa no `tsc` sem reclamar: chamar `sabbathEndsAt` sem antes
 * perguntar `isSabbath` devolve `rest` para todo campeonato QUE ESTARIA NO
 * WIZARD, em qualquer dia, e a inscricao morre calada. Nao e "todo campeonato":
 * a ordem do gate mantem `draft`, lotado e prazo vencido nos seus proprios
 * desfechos, e generalizar isso seria repetir no comentario o exagero que
 * motivou a reordenacao.
 *
 * `sunsetAt` e null durante a pausa, e essa e a invariante que esta funcao
 * existe para guardar: quem ja esta pausado ve a tela de repouso, com a
 * contagem do FIM; o por do sol so interessa a quem ainda esta preenchendo.
 * Quem trava a invariante e a uniao acima; aqui ela so e escrita uma vez.
 *
 * Ela tambem fecha a precondicao que o docblock de `sabbathEndsAt` descreve:
 * `sabbathEndsAt` so e alcancado depois de `isSabbath` dizer `true`, entao o
 * ramo em que os dois discordam durante a pausa fica inalcancavel por
 * construcao, e nao por disciplina de quem chama.
 */
export function sabbathStatus(now: Date, window: SabbathWindow | null): SabbathStatus {
  if (isSabbath(now, window)) {
    return { pause: { endsAt: sabbathEndsAt(now, window) }, sunsetAt: null };
  }
  return { pause: null, sunsetAt: sabbathStartsAt(now, window) };
}

/**
 * O quanto o por do sol ja aperta — e, quando aperta, a que horas ele e.
 *
 * Uniao discriminada pelo mesmo motivo do `SabbathStatus` logo acima: a
 * combinacao proibida — apertar sem saber a hora — deixa de ser coisa que um
 * comentario pede e passa a ser coisa que o compilador recusa.
 *
 * Aqui isso resolve dois perigos de uma vez, e os dois ja tinham mordido:
 *
 * - O nivel e o instante viajavam como duas `string` a um caractere de
 *   distancia (`sunset` e `sunsetAt`) no mesmo arquivo de 828 linhas. Como
 *   `"cutoff"` E `string`, passar um no lugar do outro compilava, passava no
 *   eslint e so explodia em runtime.
 * - A guarda `alert === "none" || !startsAt` no componente lia como redundancia
 *   e convidava a ser "simplificada" pela metade — e sem a primeira metade a
 *   faixa aparece a semana inteira, em todo carregamento. Agora ela nao e
 *   opiniao: sem estreitar o nivel nao ha `at` para formatar.
 */
export type SunsetAlert =
  | { level: "none" }
  | { level: "notice" | "cutoff"; at: string };

/**
 * O aviso do por do sol no formulario.
 *
 * A pausa cria uma porta nova para o "pagou e foi recusado": alguem faz o PIX
 * as 17h50, sobe o comprovante, e e recusado as 18h05. Isto NAO move a borda do
 * calculo — a pausa continua exata no por do sol; o que muda e o que a tela
 * mostra antes dela.
 *
 * Depois do por do sol continua respondendo "cutoff", e nao um quarto estado:
 * quem decide que a pausa comecou e o servidor, e a pergunta que leva ate ele e
 * `sunsetHasPassed`, logo abaixo.
 */
export function sunsetAlert(now: Date, startsAt: string | null): SunsetAlert {
  if (!startsAt) return { level: "none" };
  const target = Date.parse(startsAt);
  if (Number.isNaN(target)) return { level: "none" };

  const minutes = (target - now.getTime()) / 60_000;
  if (minutes <= SUNSET_PAYMENT_CUTOFF_MINUTES) return { level: "cutoff", at: startsAt };
  if (minutes <= SUNSET_NOTICE_MINUTES) return { level: "notice", at: startsAt };
  return { level: "none" };
}

/**
 * O por do sol ja aconteceu, no relogio que `nowMs` carrega?
 *
 * Separada de `sunsetAlert` porque a resposta nao muda a tela: ela manda
 * RECARREGAR, para o servidor dizer se a pausa comecou. O wizard nao se tranca
 * sozinho — o relogio do aparelho pode estar errado nos dois sentidos, e quem
 * tem a janela de `sabbath_windows` na mao e o servidor.
 *
 * Borda inclusiva, igual a de `isSabbath`: no instante exato do por do sol a
 * pausa ja vale, e a tela que corresponde a isso e a de repouso. Isto NAO move a
 * borda do calculo — repete deste lado a que ja existe la.
 *
 * Instante ilegivel responde `false`, e nao `true`, pela mesma disciplina das
 * irmas deste arquivo. E aqui errar para `true` teria forma propria: cada tick
 * mandaria recarregar, o servidor re-renderizaria exatamente a mesma pagina, e o
 * jogador ficaria num loop de refresh a cada meio minuto.
 */
export function sunsetHasPassed(nowMs: number, sunsetAt: string): boolean {
  const target = Date.parse(sunsetAt);
  if (Number.isNaN(target)) return false;
  return nowMs >= target;
}

/**
 * "17:50" — a hora do por do sol em Brasilia, ou `null` quando nao ha o que
 * anunciar.
 *
 * O FUSO e a promessa central desta frase: o por do sol e um fato de Brasilia,
 * nao do aparelho. Impresso em UTC, o aviso diria uma hora que nao existe para
 * quem le e viraria armadilha — o jogador acharia que ainda tem horas de sobra.
 *
 * Recebe o alerta INTEIRO, e nao o instante solto, por dois motivos que
 * `announceableEndsAt` logo abaixo ja ensinou:
 *
 * - Com `(startsAt: string)` a assinatura tambem aceitava o NIVEL, porque
 *   `SunsetAlert` era subtipo de `string`. `formatSunset(alert)` compilava,
 *   passava no eslint e nos 393 testes, e explodia em runtime.
 * - `new Intl.DateTimeFormat(...).format(new Date("banana"))` LANCA
 *   `RangeError`. Em render de Client Component sem error boundary isso e tela
 *   branca na pagina de inscricao inteira. As cinco irmas desta feature degradam
 *   (`parseWindow` -> `null`, `sunsetAlert` -> "none", `slotCountdown` ->
 *   `null`, `remainingUntil` -> `done`, `announceableEndsAt` -> `null`); esta
 *   degrada para `null`, e a faixa simplesmente nao aparece.
 *
 * MORA NESTE ARQUIVO pelo mesmo motivo do `announceableEndsAt`: quem decide
 * quando avisar e quem escreve a hora do aviso tem que envelhecer junto — mexer
 * nos minutos la em cima e quebrar o texto aqui e a mesma edicao. E o formatador
 * e justamente a parte que nao precisa de React nenhum para ser testada com um
 * instante conhecido.
 */
export function sunsetTimeLabel(alert: SunsetAlert): string | null {
  if (alert.level === "none") return null;
  const instant = new Date(alert.at);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

/**
 * O proximo por do sol como a PAGINA entrega ao formulario: o instante, e o
 * relogio de quem sabe as horas.
 *
 * `serverNow` e o `new Date()` do render do servidor — o mesmo que decidiu se a
 * pausa ja vale. Sem ele o formulario comparava o por do sol com o relogio do
 * APARELHO, e um celular alguns minutos errado desligava a faixa e o corte nos
 * dois sentidos: adiantado, o `router.refresh()` disparava a cada tick para
 * sempre, porque o servidor re-renderizava a mesma tela; atrasado, o QR ficava
 * na frente do jogador nos minutos reais antes da pausa.
 *
 * Os dois campos vem num objeto so, e nao como duas props `string`, porque lado
 * a lado seriam dois ISOs intercambiaveis pelo `tsc` — trocar um pelo outro
 * compila e produz lixo silencioso. E `null` quando nao ha por do sol a anunciar
 * mantem a outra combinacao proibida (instante sem relogio) fora do alcance.
 */
export type NextSunset = { at: string; serverNow: string };

/**
 * O quanto o relogio do aparelho esta atrasado em relacao ao do servidor.
 *
 * Some com `Date.now()` para dar a hora do servidor sem uma segunda rodada de
 * rede. NAO e um segundo relogio: e a correcao do unico que existe — o tick
 * continua sendo um so, para a faixa e para o bloco de pagamento.
 *
 * Medido UMA vez, na montagem: refazer a medida a cada tick faria a correcao
 * andar junto com a latencia da rede.
 *
 * Carimbo ilegivel devolve zero, e nao `NaN`. Zero e o comportamento antigo —
 * confiar no aparelho —, que erra as vezes; `NaN` contamina a aritmetica e
 * desliga a faixa e o corte SEMPRE, calado.
 *
 * O erro que sobra e o tempo entre o render do servidor e a montagem no
 * aparelho (rede + hidratacao), e ele cai para o lado seguro: o formulario se
 * acha um pouco mais cedo do que e, entao avisa e recarrega um instante depois
 * — nunca antes de o servidor concordar.
 */
export function clockSkewMs(serverNow: string, deviceNowMs: number): number {
  const stamped = Date.parse(serverNow);
  if (Number.isNaN(stamped)) return 0;
  return stamped - deviceNowMs;
}

/**
 * O fim da pausa em que da para confiar a ponto de ANUNCIAR o dia da semana.
 *
 * Devolve o proprio `endsAt` quando ele cai num sabado de Brasilia, e `null`
 * quando nao da para afirmar nada.
 *
 * O dia da semana nao e decoracao na tela de repouso: a pausa vai do por do sol
 * de sexta ao de sabado, entao a inscricao volta sempre num SABADO. Uma tela
 * dizendo "voltam quinta-feira" contradiz, com toda a confianca, a propria razao
 * de a pausa existir — e quem le conclui que ou o site esta quebrado ou a
 * observancia e negociavel.
 *
 * Nos dois caminhos reais o dia bate: as janelas de `sabbath_windows` terminam
 * no por do sol de um sabado, e a regra conservadora termina no sabado as 20h30
 * — as duas coisas que este arquivo ja decide. Nao cair num sabado significa
 * dado corrompido, e a resposta certa para dado corrompido nao e um dia errado
 * com ar de certeza, e sim a copia honesta que a tela ja tem para quando
 * ninguem sabe a hora.
 *
 * MORA NESTE ARQUIVO por ser o modulo deste conceito: quem define quando a
 * pausa termina (`sabbathEndsAt`, `SABBATH_FALLBACK_END`) e quem sabe se aquele
 * instante merece ser anunciado tem que envelhecer junto — mover a borda la e
 * quebrar a guarda aqui e a mesma edicao. Reusa o `SATURDAY` acima em vez de
 * redeclarar, e acompanha `sunsetAlert`: helper de apresentacao ja e vizinhanca
 * conhecida daqui.
 *
 * NAO mora no RestOverlay.tsx, que e o unico consumidor, porque de la nao ha
 * teste: importar o componente arrasta `RegistrationWizard` -> `actions.ts` ->
 * `services/public-registration.ts` -> `import "server-only"`, que nao resolve
 * no vitest (environment "node"). Exportar de la nao resolveria; stubar
 * `server-only` no vitest.config seria mexer em infra compartilhada por causa
 * de uma funcao pura de quatro linhas.
 *
 * Le o dia por `brasiliaParts`, e nao por `getUTCDay()`. MEDIDO: hoje os dois
 * concordam em 100% dos casos. As 178 janelas reais terminam entre 20h30 e
 * 22h01 UTC de sabado, e a regra conservadora as 23h30 UTC de sabado — nenhuma
 * cruza a meia-noite, entao `getUTCDay()` aceitaria exatamente as mesmas. Isto
 * e risco latente evitado, nao bug evitado, e o argumento e mais forte assim.
 *
 * Vale mesmo assim porque a margem e de trinta minutos: `SABBATH_FALLBACK_END`
 * ja foi movido uma vez, de 19h para 20h30, e o docblock dele raciocina
 * abertamente sobre move-lo de novo. Empurrado para 21h, o fim da regra
 * conservadora vira meia-noite UTC de domingo e `getUTCDay()` passaria a recusar
 * justamente o dado BOM, calado. Ler o dia em Brasilia e o que torna essa
 * mexida inofensiva.
 *
 * `Date` invalido devolve `null` junto — e nao lanca. `brasiliaParts` LANCA
 * nesse caso, e derrubar a pagina de repouso por causa de uma string podre seria
 * trocar um texto errado por tela nenhuma.
 */
export function announceableEndsAt(endsAt: string | null): string | null {
  if (!endsAt) return null;
  const instant = new Date(endsAt);
  if (Number.isNaN(instant.getTime())) return null;
  return brasiliaParts(instant).dow === SATURDAY ? endsAt : null;
}
