import { describe, it, expect } from "vitest";
import {
  isSabbath, sabbathEndsAt, sabbathStartsAt, sunsetAlert, sabbathStatus, announceableEndsAt,
  sunsetHasPassed, sunsetTimeLabel, clockSkewMs, nextSunsetAlert,
  SUNSET_NOTICE_MINUTES, SUNSET_PAYMENT_CUTOFF_MINUTES, SUNSET_TICK_MS,
  type SabbathWindow,
} from "./sabbath";

/** 21/08/2026 e uma sexta; 22/08 um sabado. Por do sol ficticio as 17h50. */
const JANELA: SabbathWindow = {
  startsAt: "2026-08-21T20:50:00.000Z", // sexta 17h50 em Brasilia
  endsAt: "2026-08-22T20:51:00.000Z",   // sabado 17h51
};

const em = (iso: string) => new Date(iso);

describe("isSabbath com a janela da tabela", () => {
  it("pausa no instante exato do inicio", () => {
    expect(isSabbath(em(JANELA.startsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo antes do inicio", () => {
    expect(isSabbath(em("2026-08-21T20:49:59.999Z"), JANELA)).toBe(false);
  });

  it("ainda pausa no instante exato do fim", () => {
    expect(isSabbath(em(JANELA.endsAt), JANELA)).toBe(true);
  });

  it("nao pausa um milissegundo depois do fim", () => {
    expect(isSabbath(em("2026-08-22T20:51:00.001Z"), JANELA)).toBe(false);
  });

  it("NAO cai na regra conservadora quando a janela e futura", () => {
    /*
     * O erro mais facil deste modulo. Sexta as 17h30 em Brasilia, com a tabela
     * funcionando e o por do sol as 17h50: faltam vinte minutos, e o site tem
     * que continuar aberto. Ler `window` como "a linha que cobre agora" e cair
     * na regra conservadora quando ela nao cobre pausaria TODA sexta as 17h,
     * para sempre, mesmo com a tabela perfeita.
     */
    expect(isSabbath(em("2026-08-21T20:30:00.000Z"), JANELA)).toBe(false);
  });
});

describe("isSabbath sem janela — a regra conservadora", () => {
  it("nao pausa na sexta as 16h59", () => {
    expect(isSabbath(em("2026-08-21T19:59:00.000Z"), null)).toBe(false);
  });

  it("pausa na sexta as 17h em ponto", () => {
    expect(isSabbath(em("2026-08-21T20:00:00.000Z"), null)).toBe(true);
  });

  it("pausa na madrugada de sabado", () => {
    expect(isSabbath(em("2026-08-22T05:00:00.000Z"), null)).toBe(true);
  });

  it("ainda pausa no sabado as 20h30 em ponto", () => {
    expect(isSabbath(em("2026-08-22T23:30:00.000Z"), null)).toBe(true);
  });

  it("nao pausa no sabado as 20h31", () => {
    expect(isSabbath(em("2026-08-22T23:31:00.000Z"), null)).toBe(false);
  });

  it("ainda pausa as 19h02 de um sabado de janeiro, quando o sol se poe 19h01", () => {
    // O caso que tirou o corte das 19h. Sem ele, alguem "arruma" a constante de
    // volta e o ramo conservador passa a errar contra a observancia — em dez
    // sabados por decada, calado.
    expect(isSabbath(em("2029-01-13T22:02:00.000Z"), null)).toBe(true);
  });

  it("ainda pausa sob horario de verao, quando o por do sol marca 20h01", () => {
    // 12/01/2019 foi sabado, e o Brasil estava em horario de verao. Este
    // instante — a mesma hora UTC do por do sol de sabado mais tardio da tabela
    // — le 20:01:47 no relogio de parede, contra 19:01:47 sem DST. Com o corte
    // em 19h30 este caso devolveria false: a pausa encerrada 31 min antes do
    // sol se por. As bordas acima tambem quebram se alguem voltar para 19h30,
    // mas so por repetirem o numero da constante; este e o unico que quebra
    // por causa de um por do sol real.
    expect(isSabbath(em("2019-01-12T22:01:47.000Z"), null)).toBe(true);
  });

  it("nao pausa nos outros dias, a qualquer hora", () => {
    // Quarta 18h, domingo 18h, quinta 23h — todos em Brasilia.
    expect(isSabbath(em("2026-08-19T21:00:00.000Z"), null)).toBe(false);
    expect(isSabbath(em("2026-08-23T21:00:00.000Z"), null)).toBe(false);
    expect(isSabbath(em("2026-08-21T02:00:00.000Z"), null)).toBe(false);
  });
});

describe("sabbathEndsAt", () => {
  it("com janela, devolve o fim da janela", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), JANELA)).toBe(JANELA.endsAt);
  });

  it("sem janela, numa sexta, aponta as 20h30 do sabado seguinte", () => {
    expect(sabbathEndsAt(em("2026-08-21T20:30:00.000Z"), null))
      .toBe("2026-08-22T23:30:00.000Z");
  });

  it("sem janela, num sabado, aponta as 20h30 do mesmo dia", () => {
    expect(sabbathEndsAt(em("2026-08-22T05:00:00.000Z"), null))
      .toBe("2026-08-22T23:30:00.000Z");
  });

  it("sem janela, numa sexta que vira o mes, aponta o sabado do mes seguinte", () => {
    // 31/07/2026 e uma sexta. Isto prende a SAIDA da virada de mes, nao a
    // implementacao: trocar `addDays` por aritmetica de texto passaria aqui,
    // porque "2026-07-32" NAO e recusado — o regex de `brasiliaInputToIso`
    // aceita \d{2} e o `Date.UTC` normaliza para 1o de agosto. Verificado; nao
    // conte com uma recusa que nao existe.
    expect(sabbathEndsAt(em("2026-07-31T20:30:00.000Z"), null))
      .toBe("2026-08-01T23:30:00.000Z");
  });
});

describe("sabbathStartsAt", () => {
  it("com janela, devolve o inicio da janela", () => {
    expect(sabbathStartsAt(em("2026-08-21T18:00:00.000Z"), JANELA)).toBe(JANELA.startsAt);
  });

  it("sem janela, numa sexta, aponta as 17h do mesmo dia", () => {
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), null))
      .toBe("2026-08-21T20:00:00.000Z");
  });

  it("sem janela, fora da sexta, devolve null — nao ha o que avisar", () => {
    expect(sabbathStartsAt(em("2026-08-19T13:00:00.000Z"), null)).toBeNull();
  });
});

describe("janela podre — cai na regra conservadora, nunca em 'nao e sabado'", () => {
  const PODRE: SabbathWindow = { startsAt: "banana", endsAt: "banana" };
  /** So a ponta final podrida: prende a guarda em `||`, que um `&&` afrouxaria. */
  const MEIO_PODRE: SabbathWindow = { startsAt: JANELA.startsAt, endsAt: "banana" };
  /** As pontas de JANELA trocadas — o que um mapeamento manual produz. */
  const INVERTIDA: SabbathWindow = { startsAt: JANELA.endsAt, endsAt: JANELA.startsAt };
  const SABADO_2H = "2026-08-22T05:00:00.000Z";

  it("pausa num sabado, em vez de abrir a inscricao", () => {
    // Comparar com NaN e sempre falso, entao sem a guarda `t >= NaN && t <= NaN`
    // da false — "nao e sabado" — e a inscricao ABRIRIA no sabado. E a unica
    // direcao que esta feature nao pode errar.
    expect(isSabbath(em(SABADO_2H), PODRE)).toBe(true);
  });

  it("pausa tambem quando so uma das pontas esta podre", () => {
    expect(isSabbath(em(SABADO_2H), MEIO_PODRE)).toBe(true);
  });

  it("sabbathEndsAt nao entrega a string podre para a tela", () => {
    expect(sabbathEndsAt(em(SABADO_2H), PODRE)).toBe("2026-08-22T23:30:00.000Z");
  });

  it("sabbathStartsAt nao entrega a string podre para a tela", () => {
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), PODRE))
      .toBe("2026-08-21T20:00:00.000Z");
  });

  it("pausa com a janela INVERTIDA, que o typecheck nao pega", () => {
    /*
     * Mesma forma do caso podre, uma casa ao lado: com as pontas trocadas
     * nenhum instante satisfaz `t >= start && t <= end`, entao sem a guarda a
     * resposta seria "nao e sabado" e a inscricao abriria. O CHECK do banco
     * fecha a origem; a porta que sobra e o mapeamento manual de quem consome,
     * onde `starts_at` e `ends_at` sao dois `string` e a troca e invisivel.
     */
    expect(isSabbath(em(SABADO_2H), INVERTIDA)).toBe(true);
  });

  it("nao entrega os instantes trocados para a tela", () => {
    // Sem a guarda, `sabbathEndsAt` devolveria um instante ANTERIOR ao inicio.
    expect(sabbathEndsAt(em(SABADO_2H), INVERTIDA)).toBe("2026-08-22T23:30:00.000Z");
    expect(sabbathStartsAt(em("2026-08-21T13:00:00.000Z"), INVERTIDA))
      .toBe("2026-08-21T20:00:00.000Z");
  });
});

describe("sunsetAlert", () => {
  const inicio = JANELA.startsAt; // sexta 17h50

  it("fica calado a 31 minutos", () => {
    expect(sunsetAlert(em("2026-08-21T20:19:00.000Z"), inicio)).toEqual({ level: "none" });
  });

  it("avisa a 30 minutos em ponto, e leva o instante junto", () => {
    // O instante viaja DENTRO do alerta desde a T10: e o que impede a faixa de
    // ter um nivel para apertar e nenhuma hora para mostrar.
    expect(sunsetAlert(em("2026-08-21T20:20:00.000Z"), inicio))
      .toEqual({ level: "notice", at: inicio });
  });

  it("ainda so avisa a 11 minutos", () => {
    expect(sunsetAlert(em("2026-08-21T20:39:00.000Z"), inicio))
      .toEqual({ level: "notice", at: inicio });
  });

  it("corta o pagamento a 10 minutos em ponto", () => {
    // Dez minutos e tempo insuficiente para trocar para o app do banco, pagar,
    // tirar print e subir. E a porta do "pagou e foi recusado".
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), inicio))
      .toEqual({ level: "cutoff", at: inicio });
  });

  it("continua cortando depois do por do sol", () => {
    expect(sunsetAlert(em("2026-08-21T21:00:00.000Z"), inicio))
      .toEqual({ level: "cutoff", at: inicio });
  });

  it("fica calado sem inicio conhecido e com inicio ilegivel", () => {
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), null)).toEqual({ level: "none" });
    expect(sunsetAlert(em("2026-08-21T20:40:00.000Z"), "banana")).toEqual({ level: "none" });
  });
});

/**
 * O bail-out que a uniao custou.
 *
 * Enquanto o alerta era `string`, `setSunset("none")` batia no `Object.is` do
 * React e nao renderizava nada. Virando objeto, `sunsetAlert` passou a devolver
 * um `{ level: "none" }` NOVO a cada chamada — e o wizard tica a cada meio
 * minuto, com `sunsetAt` nao-nulo em todo instante fora da pausa. Sem esta
 * comparacao, o formulario inteiro reconcilia do sabado ao entardecer ate a sexta
 * para dizer sempre a mesma coisa.
 *
 * Cobre as duas direcoes, e por IDENTIDADE (`toBe`), que e o que o React le:
 * devolver o proximo quando nada mudou reconcilia o formulario a toa; devolver
 * o anterior quando o alerta mudou prende a faixa num nivel velho, que e o
 * estrago pior.
 */
describe("nextSunsetAlert", () => {
  const inicio = JANELA.startsAt;

  it("dois 'nada a anunciar' sao a mesma coisa, mesmo sendo objetos diferentes", () => {
    const a = sunsetAlert(em("2026-08-21T20:19:00.000Z"), inicio);
    const b = sunsetAlert(em("2026-08-21T20:19:30.000Z"), inicio);
    // Objetos distintos de proposito: e exatamente o par que o tick produz.
    expect(a).not.toBe(b);
    // Devolve o ANTERIOR: e a identidade preservada que faz o React nao
    // reconciliar. `toBe` aqui e identidade, nao igualdade.
    expect(nextSunsetAlert(a, b)).toBe(a);
  });

  it("o mesmo nivel com o mesmo instante e a mesma coisa", () => {
    const anterior = { level: "notice", at: inicio } as const;
    expect(nextSunsetAlert(anterior, { level: "notice", at: inicio })).toBe(anterior);
  });

  it("mudar de nivel NAO e a mesma coisa — nos dois sentidos", () => {
    // Se isto respondesse `true`, a faixa ficaria presa: o corte chegaria sem o
    // texto mudar, e o jogador leria "se for pagar, pague agora" com o QR ja
    // fora do ar.
    const paraNotice = { level: "notice", at: inicio } as const;
    expect(nextSunsetAlert({ level: "none" }, paraNotice)).toBe(paraNotice);
    const paraNone = { level: "none" } as const;
    expect(nextSunsetAlert(paraNotice, paraNone)).toBe(paraNone);
    const paraCutoff = { level: "cutoff", at: inicio } as const;
    expect(nextSunsetAlert(paraNotice, paraCutoff)).toBe(paraCutoff);
  });

  it("mesmo nivel com OUTRO instante nao e a mesma coisa", () => {
    // Acontece de verdade: um `router.refresh()` que atravessa a pausa traz o
    // por do sol do sabado seguinte. O nivel pode nao mudar, mas a HORA impressa
    // na faixa muda — e sem repintar ela anuncia o por do sol da semana passada.
    const outraJanela = { level: "notice", at: "2026-08-28T20:45:00.000Z" } as const;
    expect(nextSunsetAlert({ level: "notice", at: inicio }, outraJanela)).toBe(outraJanela);
  });
});

/**
 * A pergunta que leva ao servidor.
 *
 * Nao decide tela: decide RECARREGAR. Por isso as duas direcoes do erro tem
 * pesos diferentes e as duas estao aqui — cedo demais poe a pagina em loop de
 * refresh, tarde demais deixa o formulario aberto depois da pausa comecar.
 */
describe("sunsetHasPassed", () => {
  const inicio = JANELA.startsAt; // sexta 17h50
  const t = (iso: string) => new Date(iso).getTime();

  it("no instante exato do por do sol ja passou", () => {
    // Borda INCLUSIVA, igual a de `isSabbath`: naquele milissegundo a pausa ja
    // vale no servidor, e a tela que corresponde a isso e a de repouso. Trocar
    // por `>` deixaria um tick inteiro de formulario aberto dentro da pausa.
    expect(sunsetHasPassed(t(inicio), inicio)).toBe(true);
  });

  it("um milissegundo antes ainda nao passou", () => {
    // E esta e a outra direcao: com `<=` invertido para o outro lado, ou com a
    // comparacao trocada de sinal, TODO carregamento recarregaria a pagina.
    expect(sunsetHasPassed(t(inicio) - 1, inicio)).toBe(false);
  });

  it("muito depois continua passado", () => {
    expect(sunsetHasPassed(t(inicio) + 3 * 60 * 60_000, inicio)).toBe(true);
  });

  it("instante ilegivel responde que NAO passou", () => {
    // Responder `true` aqui mandaria recarregar a cada tick, e o servidor
    // devolveria exatamente a mesma pagina: loop de refresh a cada meio minuto.
    expect(sunsetHasPassed(t(inicio) + 60_000, "banana")).toBe(false);
    expect(sunsetHasPassed(t(inicio) + 60_000, "")).toBe(false);
  });
});

/**
 * O relogio de quem sabe as horas.
 *
 * O wizard roda no aparelho do jogador. Antes desta correcao ele comparava o por
 * do sol com `Date.now()`, e um celular dez minutos errado desligava a faixa e o
 * corte nos DOIS sentidos.
 */
describe("clockSkewMs", () => {
  it("mede o quanto o aparelho esta atrasado em relacao ao servidor", () => {
    const servidor = "2026-08-21T20:30:00.000Z";
    const aparelho = new Date("2026-08-21T20:20:00.000Z").getTime(); // 10 min atras
    expect(clockSkewMs(servidor, aparelho)).toBe(10 * 60_000);
  });

  it("mede tambem o aparelho ADIANTADO, com sinal negativo", () => {
    // Este e o caso que punha a pagina em loop de refresh: o aparelho achava que
    // o por do sol ja tinha passado, o servidor discordava, e a tela recarregava
    // a mesma coisa a cada tick.
    const servidor = "2026-08-21T20:30:00.000Z";
    const aparelho = new Date("2026-08-21T20:45:00.000Z").getTime();
    expect(clockSkewMs(servidor, aparelho)).toBe(-15 * 60_000);
  });

  it("relogios iguais nao corrigem nada", () => {
    const servidor = "2026-08-21T20:30:00.000Z";
    expect(clockSkewMs(servidor, new Date(servidor).getTime())).toBe(0);
  });

  it("carimbo ilegivel devolve zero, e nao NaN", () => {
    // `NaN` contaminaria a aritmetica do tick e desligaria a faixa e o corte
    // SEMPRE, calado. Zero e o comportamento antigo — confiar no aparelho —, que
    // erra as vezes em vez de errar sempre.
    expect(clockSkewMs("banana", 1_000)).toBe(0);
    expect(clockSkewMs("", 1_000)).toBe(0);
  });
});

/**
 * A hora que a faixa imprime.
 *
 * O fuso e a promessa central da frase, e a suite roda com TZ=UTC (ver
 * vitest.config.ts): qualquer leitura pelo fuso da MAQUINA sairia com tres horas
 * a mais, e o jogador leria que tem tempo de sobra quando nao tem.
 */
describe("sunsetTimeLabel", () => {
  it("escreve a hora de Brasilia, e nao a de UTC", () => {
    // 2026-08-21T20:50Z e 17:50 em Brasilia.
    expect(sunsetTimeLabel({ level: "notice", at: JANELA.startsAt })).toBe("17:50");
    expect(sunsetTimeLabel({ level: "cutoff", at: JANELA.startsAt })).toBe("17:50");
  });

  it("escreve tambem um por do sol que ja e outro dia em UTC", () => {
    // 2026-08-21 21:10 em Brasilia = 2026-08-22 00:10 UTC.
    expect(sunsetTimeLabel({ level: "cutoff", at: "2026-08-22T00:10:00.000Z" })).toBe("21:10");
  });

  it("sem alerta nao ha hora a escrever", () => {
    expect(sunsetTimeLabel({ level: "none" })).toBeNull();
  });

  it("instante podre devolve null, e NAO lanca", () => {
    // `Intl.DateTimeFormat().format(new Date("banana"))` lanca RangeError, e em
    // render de Client Component sem error boundary isso e tela branca na pagina
    // de inscricao inteira. Degrada como as cinco irmas desta feature.
    expect(() => sunsetTimeLabel({ level: "cutoff", at: "banana" })).not.toThrow();
    expect(sunsetTimeLabel({ level: "cutoff", at: "banana" })).toBeNull();
    expect(sunsetTimeLabel({ level: "notice", at: "" })).toBeNull();
  });
});

describe("os numeros do por do sol, e a relacao entre eles", () => {
  it("o aviso comeca antes do corte", () => {
    // Invertidos, o corte nunca aconteceria: `sunsetAlert` testa o corte
    // primeiro, e com o corte maior que o aviso o nivel "notice" some da uniao.
    expect(SUNSET_PAYMENT_CUTOFF_MINUTES).toBeLessThan(SUNSET_NOTICE_MINUTES);
  });

  it("o tick cabe varias vezes no estado mais curto que ele nao pode pular", () => {
    // Os dez minutos do corte sao a janela mais estreita. Um tick maior que ela
    // — `SUNSET_TICK_MS` trocado por uma hora, a edicao de uma tecla — deixaria
    // o QR do PIX na tela ate o proprio por do sol, e quem abrisse a pagina
    // quarenta minutos antes nunca veria a faixa. Nada alem deste teste segura
    // os dois numeros juntos.
    expect(SUNSET_TICK_MS * 4).toBeLessThanOrEqual(SUNSET_PAYMENT_CUTOFF_MINUTES * 60_000);
  });

  it("e nao cabe TANTAS vezes que vire ruido", () => {
    // O teto acima nao tem piso: `SUNSET_TICK_MS = 250` passa nele, e poe o
    // formulario para reavaliar quatro vezes por segundo sem mudar nada na
    // tela — a faixa imprime hora de PAREDE (hh:mm), entao nada abaixo de um
    // segundo pode aparecer para o jogador. O que sobra e bateria queimada num
    // aparelho parado, e o docblock de `SUNSET_TICK_MS` afirmava segurar "a
    // relacao" segurando um lado so.
    //
    // Cem fatias do corte e o limite generoso: entre 4 e 100 cabe qualquer
    // numero defensavel (30s da 20), e fora disso e engano de tecla — a mesma
    // forma de erro que o teto pega do outro lado.
    expect(SUNSET_TICK_MS * 100).toBeGreaterThanOrEqual(SUNSET_PAYMENT_CUTOFF_MINUTES * 60_000);
  });
});

/*
 * A pagina nao decide nada sozinha, e estes testes sao a razao.
 *
 * As tres expressoes que montavam esta decisao viviam no Server Component, que
 * a suite nao alcanca: quatro mutacoes passavam no `tsc` E nos testes. A pior
 * — usar o fim do sabado sem antes perguntar se e sabado — devolvia `rest` para
 * todo campeonato QUE ESTARIA NO WIZARD, em qualquer dia. Nao para todos: os
 * quatro testes de ordem do gate mostram que `draft`, lotado e prazo vencido
 * seguem nos seus proprios desfechos.
 */
describe("sabbathStatus — a decisao da pagina num lugar so", () => {
  it("pausado: entrega o fim da pausa e CALA o por do sol", () => {
    // O sunsetAt null e a invariante. Quem ja esta pausado ve a tela de
    // repouso, com a contagem do FIM; avisar do por do sol que ja passou seria
    // contar a hora errada.
    expect(sabbathStatus(em("2026-08-22T05:00:00.000Z"), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("nao pausado com janela futura: sem pausa, e com o por do sol da janela", () => {
    // Sexta 17h30 em Brasilia, vinte minutos antes do por do sol.
    expect(sabbathStatus(em("2026-08-21T20:30:00.000Z"), JANELA))
      .toEqual({ pause: null, sunsetAt: JANELA.startsAt });
  });

  it("no instante exato do inicio ja pausa, e o por do sol some", () => {
    expect(sabbathStatus(em(JANELA.startsAt), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("no instante exato do fim ainda pausa", () => {
    expect(sabbathStatus(em(JANELA.endsAt), JANELA))
      .toEqual({ pause: { endsAt: JANELA.endsAt }, sunsetAt: null });
  });

  it("uma janela VENCIDA devolve um inicio no passado — o filtro da consulta e que impede", () => {
    /*
     * Nao e alcancavel em producao, e vale saber por que: `getSabbathWindow`
     * filtra `ends_at >= now`, entao uma janela vencida nunca chega aqui.
     *
     * Esta assercao existe para nomear o unico ponto EXECUTAVEL em que aquele
     * filtro pode ser falseado. Ele nao e a unica dependencia — o docblock de
     * `isSabbath` declara a mesma precondicao —, mas e a unica que roda, ja
     * que `services/**` esta fora do vitest.
     *
     * O estrago mudou de forma na T10 e ficou pior. Com uma janela vencida o
     * `sunsetAt` aponta para tras, entao `sunsetHasPassed` responde `true` em
     * todo tick e o formulario manda `router.refresh()` a cada meio minuto —
     * enquanto o servidor re-renderiza exatamente a mesma pagina, porque para
     * ele a pausa nao comecou. A pagina de inscricao vira um loop de recarga.
     * Quem mexer no filtro da consulta quebra isto aqui, e nao la.
     */
    expect(sabbathStatus(em("2026-08-22T20:51:00.001Z"), JANELA))
      .toEqual({ pause: null, sunsetAt: JANELA.startsAt });
  });

  it("sem janela, num dia comum: nao pausa e nao ha o que avisar", () => {
    // Terca, 18/08/2026.
    expect(sabbathStatus(em("2026-08-18T15:00:00.000Z"), null))
      .toEqual({ pause: null, sunsetAt: null });
  });

  it("sem janela, numa sexta de manha: a regra conservadora sabe o inicio", () => {
    // Sexta 10h em Brasilia; o fallback comeca as 17h = 20h UTC.
    expect(sabbathStatus(em("2026-08-21T13:00:00.000Z"), null))
      .toEqual({ pause: null, sunsetAt: "2026-08-21T20:00:00.000Z" });
  });

  it("sem janela, num sabado de manha: a regra conservadora pausa ate 20h30", () => {
    // Sabado 02h em Brasilia; o fallback termina as 20h30 = 23h30 UTC.
    expect(sabbathStatus(em("2026-08-22T05:00:00.000Z"), null))
      .toEqual({ pause: { endsAt: "2026-08-22T23:30:00.000Z" }, sunsetAt: null });
  });

  it("janela podre pausa pela regra conservadora, e nao vaza o inicio podre", () => {
    // Invertida: `parseWindow` recusa, e o sabado a noite cai no fallback.
    const invertida: SabbathWindow = { startsAt: JANELA.endsAt, endsAt: JANELA.startsAt };
    expect(sabbathStatus(em("2026-08-22T05:00:00.000Z"), invertida))
      .toEqual({ pause: { endsAt: "2026-08-22T23:30:00.000Z" }, sunsetAt: null });
  });
});

/**
 * A blindagem do dia da semana da tela de repouso.
 *
 * O usuario pediu esta guarda a partir de um screenshot em que a tela anunciava
 * "quinta-feira" — o dia da semana e a unica parte do texto que pode contradizer
 * a razao de a pausa existir.
 *
 * Prova nas DUAS direcoes de proposito. So testar "sabado passa" deixaria a
 * guarda invertida viva; so testar "quinta nao passa" deixaria viva a guarda que
 * recusa tudo. As duas mutacoes existem e as duas quebram a tela.
 */
describe("announceableEndsAt", () => {
  // Todos os instantes abaixo estao em UTC, com a hora de Brasilia no
  // comentario. A suite roda com TZ=UTC (ver vitest.config.ts), entao qualquer
  // leitura por fuso da MAQUINA seria UTC — e e exatamente o que a guarda nao
  // pode fazer.

  it("anuncia o fim de uma janela real, que cai num sabado", () => {
    // 2026-08-22 17:55:58 em Brasilia — o por do sol gravado em sabbath_windows.
    const real = "2026-08-22T20:55:58.000Z";
    expect(announceableEndsAt(real)).toBe(real);
  });

  it("anuncia o fim da regra conservadora, sabado as 20h30", () => {
    // 2026-08-22 20:30 em Brasilia.
    const conservador = "2026-08-22T23:30:00.000Z";
    expect(announceableEndsAt(conservador)).toBe(conservador);
  });

  /**
   * O caso que separa `brasiliaParts` de `getUTCDay()`, e o unico que separa.
   *
   * Nenhuma janela real chega aqui hoje: todas terminam bem longe da meia-noite
   * UTC, entao `getUTCDay()` aceitaria as mesmas que `brasiliaParts` aceita.
   * Esta e a assercao que transforma "risco latente" em regressao pega — sem
   * ela, trocar a leitura por `getUTCDay()` passa verde. A hora exata do maior
   * por do sol gravado nao esta escrita aqui de proposito: o dado e regerado, e
   * numero duro em prosa apodrece calado. O que nao muda e a folga.
   */
  it("anuncia um por do sol de sabado que ja e domingo em UTC", () => {
    // 2026-08-22 21:00 em Brasilia = 2026-08-23 00:00 UTC, um domingo em UTC.
    const cruzaMeiaNoite = "2026-08-23T00:00:00.000Z";
    expect(new Date(cruzaMeiaNoite).getUTCDay()).toBe(0); // domingo, se lido em UTC
    expect(announceableEndsAt(cruzaMeiaNoite)).toBe(cruzaMeiaNoite);
  });

  it("recusa sexta, quinta e domingo", () => {
    // Sexta 2026-08-21 17:55 / quinta 2026-08-20 17:55 / domingo 2026-08-23 17:55,
    // todos em Brasilia.
    expect(announceableEndsAt("2026-08-21T20:55:00.000Z")).toBeNull();
    expect(announceableEndsAt("2026-08-20T20:55:00.000Z")).toBeNull();
    expect(announceableEndsAt("2026-08-23T20:55:00.000Z")).toBeNull();
  });

  it("recusa um sabado que ja virou sexta em Brasilia", () => {
    // 2026-08-22 01:00 UTC e sabado em UTC, mas sexta 22h em Brasilia. O espelho
    // do caso da meia-noite, para o outro lado.
    const sabadoSoEmUtc = "2026-08-22T01:00:00.000Z";
    expect(new Date(sabadoSoEmUtc).getUTCDay()).toBe(6); // sabado, se lido em UTC
    expect(announceableEndsAt(sabadoSoEmUtc)).toBeNull();
  });

  it("recusa ausencia e lixo, sem lancar", () => {
    expect(announceableEndsAt(null)).toBeNull();
    expect(announceableEndsAt("")).toBeNull();
    // `brasiliaParts` lanca com Date invalido; a guarda precisa barrar antes.
    expect(() => announceableEndsAt("nao e uma data")).not.toThrow();
    expect(announceableEndsAt("nao e uma data")).toBeNull();
  });
});
