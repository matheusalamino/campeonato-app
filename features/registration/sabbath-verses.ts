import { brasiliaParts } from "@/lib/datetime-br";

export type SabbathVerse = { reference: string; text: string };

/** Os dez levantados com o usuario. */
export const SABBATH_VERSES: readonly SabbathVerse[] = [
  {
    reference: "Êxodo 20:8-10",
    text: "Lembra-te do dia de sábado, para o santificar. Seis dias trabalharás e farás toda a tua obra, mas o sétimo dia é o sábado do Senhor, teu Deus.",
  },
  {
    reference: "Gênesis 2:3",
    text: "E abençoou Deus o dia sétimo e o santificou; porque nele descansou de toda a sua obra, que Deus criara e fizera.",
  },
  {
    reference: "Êxodo 31:13",
    text: "Certamente guardareis os meus sábados; porquanto isso é um sinal entre mim e vós nas vossas gerações; para que saibais que eu sou o Senhor, que vos santifica.",
  },
  {
    reference: "Isaías 58:13-14",
    text: "Se desviares o teu pé do sábado, de fazer a tua vontade no meu santo dia, e se chamares ao sábado deleitoso […] então te deleitarás no Senhor.",
  },
  {
    reference: "Levítico 23:3",
    text: "Seis dias se trabalhará, mas o sétimo dia será o sábado do descanso, santa convocação; nenhuma obra fareis; sábado do Senhor é em todas as vossas habitações.",
  },
  {
    reference: "Marcos 2:27-28",
    text: "O sábado foi feito por causa do homem, e não o homem por causa do sábado. Assim, o Filho do Homem até do sábado é Senhor.",
  },
  {
    reference: "Lucas 4:16",
    text: "E, chegando a Nazaré, onde fora criado, entrou num dia de sábado, segundo o seu costume, na sinagoga e levantou-se para ler.",
  },
  {
    reference: "Hebreus 4:9",
    text: "Portanto, resta ainda um repouso sabático para o povo de Deus.",
  },
  {
    reference: "Lucas 23:56",
    text: "E, voltando elas, prepararam especiarias e ungüentos e, no sábado, repousaram, conforme o mandamento.",
  },
  {
    reference: "Atos 16:13",
    text: "No dia de sábado, saímos fora das portas, para a beira do rio, onde julgávamos haver um lugar de oração; e, assentando-nos, falamos às mulheres que ali se tinham reunido.",
  },
];

const DAY_MS = 86_400_000;

/**
 * Uma sexta-feira qualquer — 02/01/2026 —, e a unica coisa que decide em que
 * dia da semana o versiculo vira.
 *
 * E aqui que mora a ancora na sexta, e nao num ajuste em cima do dia corrente.
 * O sabado atravessa a meia-noite: quem olha a tela as 23h de sexta e de novo
 * as 00h30 de sabado tem que ver o mesmo versiculo. Contando as semanas a
 * partir de uma SEXTA, os dois instantes caem na mesma semana por construcao.
 *
 * Contar as semanas a partir da epoch daria o mesmo resultado hoje, mas por
 * acidente: 01/01/1970 caiu numa quinta. Com a referencia implicita num dia
 * que nao a sexta, sexta e sabado ficam na mesma semana sem que nada no codigo
 * diga por que — e o teste da virada da meia-noite passa a nao poder falhar.
 */
const REFERENCE_FRIDAY = Date.parse("2026-01-02T00:00:00Z");

/**
 * O versiculo daquele sabado.
 *
 * Deterministico pela semana, e nao sorteado: `Math.random()` a cada render
 * causa divergencia de hidratacao no React e transforma o refresh em
 * caca-niquel.
 *
 * O dia da semana vem de `brasiliaParts` porque `getDay()` responderia com o
 * fuso da maquina, e o servidor roda em UTC: numa sexta as 22h de Brasilia,
 * para o UTC ja e sabado.
 *
 * De domingo a quinta devolve o versiculo do sabado que acabou de passar. O
 * status `rest` tambem e override manual, que o admin pode ligar num feriado
 * qualquer, e ali a tela precisa de um versiculo estavel — nao de um que troca
 * a cada meia-noite.
 */
export function verseForSabbath(now: Date): SabbathVerse {
  const { date } = brasiliaParts(now);
  const days = (Date.parse(`${date}T00:00:00Z`) - REFERENCE_FRIDAY) / DAY_MS;
  // Conta semanas inteiras antes do resto, em vez de tirar o resto do dia
  // direto. Sobre o dia, o ciclo pelos dez so fecharia porque 7 e 10 nao tem
  // divisor comum — e um decimo primeiro versiculo, ou um a menos, poderia
  // derrubar a lista para dois ou tres versiculos em rodizio, sem barulho.
  const weeks = Math.floor(days / 7);
  // `%` de negativo em JavaScript devolve negativo; o `+ length` cobre datas
  // anteriores a referencia sem obrigar quem le a pensar nisso.
  const index = ((weeks % SABBATH_VERSES.length) + SABBATH_VERSES.length) % SABBATH_VERSES.length;
  return SABBATH_VERSES[index];
}
