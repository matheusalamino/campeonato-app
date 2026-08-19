import { describe, it, expect } from "vitest";
import { sabbathWindows, sunsetAt, fridaysBetween } from "./generate-sabbath-windows.mjs";

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

describe("sunsetAt", () => {
  /*
   * As duas ancoras existem para pegar erro SISTEMATICO, nao imprecisao de
   * minuto: fuso trocado (3h), estacao invertida (~1h20), dia errado. A faixa
   * de 5 minutos e larga de proposito.
   *
   * Os dois valores foram conferidos em 19/08/2026 contra a tabela publicada em
   * https://www.timeanddate.com/sun/brazil/sorocaba, e batidos de novo contra a
   * API do sunrise-sunset.org (NOAA), que e implementacao independente do
   * suncalc. Se um dia divergirem, o valor publicado manda.
   */
  it("bate com o por do sol publicado de Sorocaba no inverno", () => {
    // 19/06/2026, sexta, perto do solsticio de inverno. Publicado: 17h31.
    const minutos = brasiliaMinutes(sunsetAt("2026-06-19"));
    expect(minutos).toBeGreaterThanOrEqual(17 * 60 + 28);
    expect(minutos).toBeLessThanOrEqual(17 * 60 + 38);
  });

  it("bate com o por do sol publicado de Sorocaba no verao", () => {
    // 18/12/2026, sexta, perto do solsticio de verao. Publicado: 18h54.
    const minutos = brasiliaMinutes(sunsetAt("2026-12-18"));
    expect(minutos).toBeGreaterThanOrEqual(18 * 60 + 47);
    expect(minutos).toBeLessThanOrEqual(18 * 60 + 57);
  });

  it("poe o sol mais cedo em junho que em dezembro", () => {
    // Hemisferio sul. Sem este caso, trocar a latitude de sinal passaria: as
    // duas ancoras acima tem faixas largas e nao se comparam entre si.
    expect(brasiliaMinutes(sunsetAt("2026-06-19")))
      .toBeLessThan(brasiliaMinutes(sunsetAt("2026-12-18")));
  });
});

describe("fridaysBetween", () => {
  it("comeca na primeira sexta a partir da data pedida", () => {
    // 01/08/2026 e um sabado; a primeira sexta e 07/08.
    expect(fridaysBetween("2026-08-01", "2026-08-31")[0]).toBe("2026-08-07");
  });

  it("nao passa da data final", () => {
    const dias = fridaysBetween("2026-08-01", "2026-08-31");
    expect(dias[dias.length - 1]).toBe("2026-08-28");
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
});

describe("fridaysBetween com data invalida", () => {
  /*
   * Duas falhas, e nenhuma das duas grita.
   *
   * `fromStr` invalido pendura o processo: o laco que procura a primeira sexta
   * roda `while (dia.getUTCDay() !== 5)`, e numa Invalid Date isso e
   * `NaN !== 5` — sempre verdadeiro, para sempre. Quem digitou errado fica
   * olhando um terminal parado, sem mensagem e sem saida.
   *
   * `toStr` invalido e pior, porque parece que funcionou: `dia <= Invalid Date`
   * e sempre falso, entao a funcao devolve vazio calada, o CLI imprime nada e
   * sai com codigo 0. Um VALUES sem linha nenhuma pode acabar colado numa
   * migration.
   *
   * O timeout curto e proposital, mas nao e a rede de verdade: um laco infinito
   * SINCRONO trava o event loop, e o timeout do vitest nunca chega a disparar.
   * A rede e a guarda em si.
   */
  it("recusa fromStr invalido em vez de girar para sempre", { timeout: 3000 }, () => {
    expect(() => fridaysBetween("banana", "2026-12-31")).toThrow(/fromStr/);
  });

  it("recusa toStr invalido em vez de devolver vazio calado", { timeout: 3000 }, () => {
    expect(() => fridaysBetween("2026-08-01", "banana")).toThrow(/toStr/);
  });

  it("diz qual argumento veio ruim, o que veio e o que se esperava", { timeout: 3000 }, () => {
    expect(() => fridaysBetween("01/08/2026", "2026-12-31"))
      .toThrow('Data invalida em fromStr: "01/08/2026". Esperado o formato YYYY-MM-DD.');
  });
});

describe("sabbathWindows", () => {
  const janelas = sabbathWindows("2026-08-01", "2029-12-31");

  it("gera o periodo inteiro do plano", () => {
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

  it("arredonda o inicio para baixo e o fim para cima, no segundo", () => {
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
