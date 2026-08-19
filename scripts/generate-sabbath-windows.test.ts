import { describe, it, expect } from "vitest";
import { getTimes } from "suncalc";
import {
  sabbathWindows, sunsetAt, fridaysBetween, toSqlRows, SOROCABA,
} from "./generate-sabbath-windows.mjs";

/** Hora local de Brasilia em minutos desde a meia-noite. */
function brasiliaMinutes(d: Date): number {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
}

/** Dia da semana em Brasilia. 5 = sexta, 6 = sabado. */
function brasiliaDow(d: Date): number {
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

describe("SOROCABA", () => {
  it("as coordenadas de Sorocaba sao decisao de projeto, nao configuracao", () => {
    /*
     * Change-detector de proposito. A constante nao e um detalhe de
     * implementacao: ela codifica uma DECISAO DE DESENHO — o lugar e constante
     * do projeto, e nao coluna configuravel, porque diferente das datas do
     * campeonato a igreja e os jogos sao sempre no mesmo lugar.
     *
     * Sem este caso, trocar para Sao Paulo (~60 km, -3,4 min no por do sol)
     * sobrevive a suite inteira: so morreria la pelo Rio. Quem vier editar
     * estes numeros tem que sentir que esta mexendo numa decisao.
     */
    expect(SOROCABA.latitude).toBe(-23.5015);
    expect(SOROCABA.longitude).toBe(-47.4526);
  });
});

describe("sunsetAt", () => {
  /*
   * As duas ancoras existem para pegar erro SISTEMATICO, nao imprecisao de
   * minuto: fuso trocado (3h), estacao invertida (~1h20), dia errado. A faixa
   * e de +-5 minutos em torno do valor publicado, larga de proposito — a rede
   * fina para a escolha da chave e para as coordenadas esta nos casos
   * dedicados, nao aqui.
   *
   * Os dois valores foram conferidos em 19/08/2026 contra a tabela publicada em
   * https://www.timeanddate.com/sun/brazil/sorocaba, e batidos de novo contra a
   * API do sunrise-sunset.org (NOAA), que e implementacao independente do
   * suncalc. Se um dia divergirem, o valor publicado manda.
   */
  it("bate com o por do sol publicado de Sorocaba no inverno", () => {
    // 19/06/2026, sexta, perto do solsticio de inverno. Publicado: 17h31.
    const minutos = brasiliaMinutes(sunsetAt("2026-06-19"));
    expect(minutos).toBeGreaterThanOrEqual(17 * 60 + 26);
    expect(minutos).toBeLessThanOrEqual(17 * 60 + 36);
  });

  it("bate com o por do sol publicado de Sorocaba no verao", () => {
    // 18/12/2026, sexta, perto do solsticio de verao. Publicado: 18h54.
    const minutos = brasiliaMinutes(sunsetAt("2026-12-18"));
    expect(minutos).toBeGreaterThanOrEqual(18 * 60 + 49);
    expect(minutos).toBeLessThanOrEqual(18 * 60 + 59);
  });

  it("usa a chave `sunset` do suncalc, nunca `sunsetStart`", () => {
    /*
     * O requisito era explicito e nao tinha rede nenhuma: trocar a chave cabe
     * folgado dentro das faixas acima, porque `sunsetStart` fica so ~2,6 min
     * antes — com truncamento para o minuto isso chega a aparecer como 2.
     *
     * `sunsetStart` e quando a borda INFERIOR do disco toca o horizonte;
     * `sunset` e quando a borda superior some, que e a definicao que a
     * observancia usa.
     *
     * O dano da troca e ASSIMETRICO, e e por isso que este caso existe. Ela
     * desliza a janela inteira ~2,6 min para tras: no inicio, o por do sol de
     * sexta, isso ate pausa mais cedo — mais conservador. No FIM, o por do sol
     * de sabado, encerraria a pausa ANTES de o sol se por de verdade, nas 178
     * linhas de uma vez. E a regra de ouro invertida, e so essa ponta machuca.
     */
    const referencia = new Date("2026-06-19T15:00:00Z");
    const { sunset, sunsetStart } = getTimes(
      referencia, SOROCABA.latitude, SOROCABA.longitude,
    );
    const sunsetMs = Number(sunset?.getTime());
    const sunsetStartMs = Number(sunsetStart?.getTime());
    expect(Number.isNaN(sunsetMs)).toBe(false);
    expect(Number.isNaN(sunsetStartMs)).toBe(false);

    const calculado = sunsetAt("2026-06-19").getTime();
    expect(calculado).toBe(sunsetMs);
    expect(calculado).toBeGreaterThan(sunsetStartMs);
  });

  it("recusa data invalida em vez de culpar a astronomia", () => {
    // A irma das guardas de fridaysBetween, e a unica que faltava: os sete call
    // sites internos passam data valida, entao so um teste cobre este caminho.
    expect(() => sunsetAt("banana"))
      .toThrow('Data invalida em dateStr: "banana". Esperado o formato YYYY-MM-DD.');
  });

  it("poe o sol mais cedo em junho que em dezembro", () => {
    // Hemisferio sul, afirmado numa linha e sem depender de tabela publicada
    // nenhuma: e o unico caso que compara as duas datas ENTRE SI. (Nao e ele
    // que segura a inversao de latitude — as ancoras acima matam isso com ~87
    // min de folga: invertida, 19/06 daria 18h58 e 18/12, 17h27.)
    expect(brasiliaMinutes(sunsetAt("2026-06-19")))
      .toBeLessThan(brasiliaMinutes(sunsetAt("2026-12-18")));
  });
});

describe("fridaysBetween", () => {
  it("comeca na primeira sexta a partir da data pedida", () => {
    // 01/08/2026 e um sabado; a primeira sexta e 07/08.
    expect(fridaysBetween("2026-08-01", "2026-08-31")[0]).toBe("2026-08-07");
  });

  it("inclui fromStr quando ela ja E uma sexta", () => {
    // 07/08/2026 e sexta. O outro caso comeca num sabado, entao a borda
    // inclusiva de baixo nunca rodava: trocar o `while` por `do/while` passava
    // verde e comia a primeira janela.
    expect(fridaysBetween("2026-08-07", "2026-08-28")[0]).toBe("2026-08-07");
  });

  it("nao passa da data final", () => {
    const dias = fridaysBetween("2026-08-01", "2026-08-31");
    expect(dias[dias.length - 1]).toBe("2026-08-28");
  });

  it("inclui toStr quando ela ja E uma sexta", () => {
    // Nenhum outro range termina numa sexta — 31/08/2026 e 31/12/2029 sao
    // segundas —, entao afrouxar `dia <= fim` para `dia < fim` passava verde e
    // derrubava calada a ultima janela da tabela.
    const dias = fridaysBetween("2026-08-01", "2029-12-28");
    expect(dias[dias.length - 1]).toBe("2029-12-28");
    expect(dias.length).toBe(178);
  });

  it("devolve so sextas, de sete em sete dias", () => {
    const dias = fridaysBetween("2026-08-01", "2026-12-31");
    for (const dia of dias) {
      expect(new Date(`${dia}T00:00:00Z`).getUTCDay()).toBe(5);
    }
    for (let i = 1; i < dias.length; i++) {
      const anterior = Date.parse(`${dias[i - 1]}T00:00:00Z`);
      const atual = Date.parse(`${dias[i]}T00:00:00Z`);
      expect(atual - anterior).toBe(7 * 86_400_000);
    }
  });

  describe("com data invalida", () => {
    // Cada ponta falha calada de um jeito diferente, e o porque de cada uma
    // esta no JSDoc de `assertDateStr`, que e o dono da justificativa.
    //
    // Sem timeout de caso de proposito: laco infinito SINCRONO trava o event
    // loop e o timer do vitest nunca dispara — conferido, a suite passava de
    // 40s no vermelho. Um numero ali daria uma sensacao de rede que nao existe.
    it("recusa fromStr invalido em vez de girar para sempre", () => {
      expect(() => fridaysBetween("banana", "2026-12-31")).toThrow(/fromStr/);
    });

    it("recusa toStr invalido em vez de devolver vazio calado", () => {
      expect(() => fridaysBetween("2026-08-01", "banana")).toThrow(/toStr/);
    });

    it("diz qual argumento veio ruim, o que veio e o que se esperava", () => {
      expect(() => fridaysBetween("01/08/2026", "2026-12-31"))
        .toThrow('Data invalida em fromStr: "01/08/2026". Esperado o formato YYYY-MM-DD.');
    });
  });
});

describe("sabbathWindows", () => {
  const janelas = sabbathWindows("2026-08-01", "2029-12-31");

  it("gera 178 janelas no periodo do plano", () => {
    expect(janelas.length).toBe(178);
  });

  it("comeca numa sexta e termina no sabado, hora de Brasilia", () => {
    // O erro que este caso mata: usar o mesmo dia nas duas pontas, ou deslocar
    // um dia por ler a data em UTC.
    for (const j of janelas) {
      expect(brasiliaDow(j.startsAt)).toBe(5);
      expect(brasiliaDow(j.endsAt)).toBe(6);
    }
  });

  it("dura entre 23h e 25h", () => {
    for (const j of janelas) {
      const horas = (j.endsAt.getTime() - j.startsAt.getTime()) / 3_600_000;
      expect(horas).toBeGreaterThan(23);
      expect(horas).toBeLessThan(25);
    }
  });

  it("poe todo inicio e todo fim entre 17h e 19h30 de Brasilia", () => {
    // Um instante lido como UTC cairia entre 20h e 22h. Esta e a rede que pega
    // o erro de fuso em qualquer linha, nao so nas duas ancoradas.
    for (const j of janelas) {
      for (const instante of [j.startsAt, j.endsAt]) {
        expect(brasiliaMinutes(instante)).toBeGreaterThanOrEqual(17 * 60);
        expect(brasiliaMinutes(instante)).toBeLessThanOrEqual(19 * 60 + 30);
      }
    }
  });

  it("nao deixa buraco entre um sabado e o seguinte", () => {
    /*
     * Buraco no meio da tabela e a falha silenciosa desta feature: a consulta
     * devolveria a proxima janela, o codigo concluiria "ainda nao e sabado", e
     * o site trabalharia no sabado sem ninguem ver. A regra conservadora NAO
     * cobre isso — ela so entra quando a tabela acaba.
     */
    for (let i = 1; i < janelas.length; i++) {
      const dias =
        (janelas[i].startsAt.getTime() - janelas[i - 1].startsAt.getTime()) / 86_400_000;
      expect(dias).toBeGreaterThan(6.9);
      expect(dias).toBeLessThan(7.1);
    }
  });

  it("zera os milissegundos das duas pontas", () => {
    // Nao e capricho de formatacao: o erro de arredondamento passa a cair
    // sempre a favor da observancia, e o diff da migration fica sem
    // milissegundos para conferir.
    for (const j of janelas) {
      expect(j.startsAt.getMilliseconds()).toBe(0);
      expect(j.endsAt.getMilliseconds()).toBe(0);
    }
  });

  it("arredonda para fora da janela, nunca para dentro", () => {
    /*
     * O caso irmao do de cima, e o que da sentido a ele: aquele prova que o
     * arredondamento aconteceu, este prova a DIRECAO. Trocar `baixo` por `cima`
     * passa inteiro por um `getMilliseconds() === 0` — e encurtaria a pausa em
     * ate um segundo nas duas pontas, nas 178 linhas de uma vez, errando contra
     * a observancia. O limite de mil milissegundos tambem impede o contrario:
     * arredondar para a hora cheia "por seguranca" e chamar de conservador.
     */
    const sextas = fridaysBetween("2026-08-01", "2029-12-31");
    expect(sextas.length).toBe(janelas.length);

    // O dia seguinte e recalculado aqui de proposito, sem usar o helper do
    // modulo: e a recomputacao INDEPENDENTE que faz este caso pegar erro na
    // aritmetica de dia. "DRYar" com nextDayStr tiraria justamente isso.
    sextas.forEach((sexta, i) => {
      const sabado = new Date(Date.parse(`${sexta}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10);
      const inicioReal = sunsetAt(sexta).getTime();
      const fimReal = sunsetAt(sabado).getTime();

      // Comeca no por do sol ou antes dele, nunca depois.
      expect(janelas[i].startsAt.getTime()).toBeLessThanOrEqual(inicioReal);
      expect(inicioReal - janelas[i].startsAt.getTime()).toBeLessThan(1000);

      // Termina no por do sol ou depois dele, nunca antes.
      expect(janelas[i].endsAt.getTime()).toBeGreaterThanOrEqual(fimReal);
      expect(janelas[i].endsAt.getTime() - fimReal).toBeLessThan(1000);
    });
  });
});

describe("toSqlRows", () => {
  /*
   * Esta e a funcao que escreve a migration, e e nela que toda a justificativa
   * de "auditavel no diff da PR" se apoia. Estava sem cobertura nenhuma:
   * trocar as duas colunas de lugar passava verde, e a tabela nasceria com
   * cada sabado comecando no por do sol de sabado e terminando no de sexta.
   */
  const JANELAS = [
    {
      startsAt: new Date("2026-08-07T20:50:18.000Z"),
      endsAt: new Date("2026-08-08T20:50:43.000Z"),
    },
    {
      startsAt: new Date("2029-12-28T21:58:44.000Z"),
      endsAt: new Date("2029-12-29T21:59:06.000Z"),
    },
  ];

  it("escreve uma linha por janela, starts_at antes de ends_at, em UTC", () => {
    // A ordem das colunas e a metade que importa: casa com o
    // `INSERT INTO sabbath_windows (starts_at, ends_at) VALUES` da migration.
    expect(toSqlRows(JANELAS)).toBe(
      "  ('2026-08-07T20:50:18.000Z', '2026-08-08T20:50:43.000Z')," +
        " -- sex 17:50:18 -> sab 17:50:43\n" +
        "  ('2029-12-28T21:58:44.000Z', '2029-12-29T21:59:06.000Z')" +
        " -- sex 18:58:44 -> sab 18:59:06",
    );
  });

  it("traduz cada linha para horario de Brasilia, ao lado do UTC", () => {
    /*
     * As linhas existem para serem auditadas contra tabela publicada, e as
     * tabelas de Sorocaba estao em horario de Brasilia. Sem a traducao, quem
     * revisa le `20:50:18` como noite alta e conclui que o dado esta errado.
     * O -3 tem que aparecer: se o comentario repetisse o UTC, ele daria
     * confianca sem dar informacao.
     */
    const [primeira] = toSqlRows(JANELAS).split("\n");
    expect(primeira).toContain("'2026-08-07T20:50:18.000Z'");
    expect(primeira).toContain("-- sex 17:50:18 -> sab 17:50:43");
  });

  it("nao deixa virgula sobrando na ultima linha", () => {
    // O VALUES termina com `ON CONFLICT`; virgula a mais e erro de sintaxe que
    // so aparece na hora de aplicar a migration. Agora a linha termina no
    // comentario, entao o que se checa e o SQL antes dele.
    const ultima = toSqlRows(JANELAS).split("\n").at(-1)!;
    const sql = ultima.slice(0, ultima.indexOf(" --"));
    expect(sql.endsWith(")")).toBe(true);
    expect(sql.endsWith("),")).toBe(false);
  });

  it("poe a virgula antes do comentario, nunca depois", () => {
    /*
     * `--` come o resto da linha. Uma virgula depois do comentario sumiria para
     * o Postgres, e o VALUES quebraria so na hora de aplicar a migration —
     * longe daqui, com a mensagem apontando para a linha seguinte.
     */
    const [primeira] = toSqlRows(JANELAS).split("\n");
    expect(primeira.indexOf("),")).toBeLessThan(primeira.indexOf(" --"));
  });

  it("devolve texto vazio sem janela nenhuma", () => {
    expect(toSqlRows([])).toBe("");
  });
});
