/**
 * Gera as linhas literais da tabela `sabbath_windows`.
 *
 * Roda uma vez a cada regeracao, nunca numa requisicao — por isso `suncalc` e
 * devDependency. O Postgres nao roda suncalc, e a trava precisa valer no
 * servidor; a saida daqui vira o VALUES de uma migration, onde os horarios
 * ficam auditaveis no diff da PR.
 *
 * Uso:
 *   node scripts/generate-sabbath-windows.mjs 2026-08-01 2029-12-31
 */
// Import nomeado, e nao default: o suncalc 2.x e ESM puro e nao exporta
// default. `import SunCalc from "suncalc"` — a forma da versao 1.x, que ainda
// aparece em todo tutorial — quebra na carga, antes de qualquer calculo.
import { getTimes } from "suncalc";
import { pathToFileURL } from "node:url";

/**
 * Sorocaba/SP, centro da cidade.
 *
 * Constante do projeto, e nao coluna configuravel: diferente das datas do
 * campeonato, que mudam por edicao, a igreja e os jogos sao sempre no mesmo
 * lugar. A diferenca entre o centro, a igreja e o campo e de segundos.
 */
export const SOROCABA = { latitude: -23.5015, longitude: -47.4526 };

const DIA_MS = 86_400_000;

/**
 * O por do sol em Sorocaba na data local informada ("YYYY-MM-DD").
 *
 * `sunset` do suncalc e o instante em que a borda superior do disco solar some
 * no horizonte — a definicao que a observancia usa. Nao troque por
 * `sunsetStart`, que e quando a borda INFERIOR toca o horizonte, alguns
 * minutos antes.
 */
export function sunsetAt(dateStr) {
  // 15:00Z fica perto do meio-dia solar de Sorocaba (~15:07Z), entao o suncalc
  // resolve o dia local certo sem risco de escorregar para o vizinho.
  const referencia = new Date(`${dateStr}T15:00:00Z`);
  const { sunset } = getTimes(referencia, SOROCABA.latitude, SOROCABA.longitude);
  // O suncalc 2.x devolve null quando o sol nao se poe no dia — dia polar, que
  // em Sorocaba nao existe. O guarda esta aqui pelo tipo, nao pelo caso: sem
  // ele `sunsetAt` e `Date | null`, e o estouro aconteceria la adiante, no
  // arredondamento, numa mensagem que nao diz qual data faltou.
  if (!sunset) throw new Error(`Sem por do sol calculado para ${dateStr} em Sorocaba`);
  return sunset;
}

/**
 * Le "YYYY-MM-DD" como meia-noite UTC, ou estoura dizendo qual argumento veio
 * ruim.
 *
 * Uma Invalid Date que passe daqui falha de dois jeitos calados, e nenhum deles
 * aponta o culpado. Em `fromStr`, o laco que procura a primeira sexta testa
 * `dia.getUTCDay() !== 5`, que numa Invalid Date e `NaN !== 5` — verdadeiro
 * para sempre: o processo pendura sem mensagem nenhuma. Em `toStr` e pior,
 * porque parece ter dado certo: `dia <= fim` e sempre falso, a funcao devolve
 * lista vazia, e o CLI imprime nada e sai com codigo 0.
 */
function midnightUtc(dateStr, argumento) {
  const dia = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dia.getTime())) {
    throw new Error(
      `Data invalida em ${argumento}: ${JSON.stringify(dateStr)}. ` +
        "Esperado o formato YYYY-MM-DD.",
    );
  }
  return dia;
}

/** Todas as sextas entre duas datas locais, inclusive. */
export function fridaysBetween(fromStr, toStr) {
  // Na ordem dos argumentos, para o erro apontar o primeiro que veio ruim.
  let dia = midnightUtc(fromStr, "fromStr");
  const fim = midnightUtc(toStr, "toStr");
  while (dia.getUTCDay() !== 5) dia = new Date(dia.getTime() + DIA_MS);

  const sextas = [];
  while (dia <= fim) {
    sextas.push(dia.toISOString().slice(0, 10));
    dia = new Date(dia.getTime() + 7 * DIA_MS);
  }
  return sextas;
}

/** Arredonda para o segundo, na direcao pedida. */
function noSegundo(instante, direcao) {
  const segundos = instante.getTime() / 1000;
  return new Date((direcao === "baixo" ? Math.floor(segundos) : Math.ceil(segundos)) * 1000);
}

/**
 * As janelas de sabado: por do sol de sexta ao por do sol de sabado.
 *
 * Inicio para baixo e fim para cima de proposito — o erro de arredondamento
 * cai sempre a favor da observancia, nunca contra.
 */
export function sabbathWindows(fromStr, toStr) {
  return fridaysBetween(fromStr, toStr).map((sexta) => {
    const sabado = new Date(Date.parse(`${sexta}T00:00:00Z`) + DIA_MS)
      .toISOString()
      .slice(0, 10);
    return {
      startsAt: noSegundo(sunsetAt(sexta), "baixo"),
      endsAt: noSegundo(sunsetAt(sabado), "cima"),
    };
  });
}

/** As linhas do VALUES da migration, uma por sabado. */
export function toSqlRows(janelas) {
  return janelas
    .map((j) => `  ('${j.startsAt.toISOString()}', '${j.endsAt.toISOString()}')`)
    .join(",\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , de, ate] = process.argv;
  if (!de || !ate) {
    console.error("Uso: node scripts/generate-sabbath-windows.mjs <YYYY-MM-DD> <YYYY-MM-DD>");
    process.exit(1);
  }
  console.log(toSqlRows(sabbathWindows(de, ate)));
}
