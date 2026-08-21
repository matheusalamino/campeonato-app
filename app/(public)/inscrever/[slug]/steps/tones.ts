import type { CSSProperties } from "react";

/**
 * Os dois tons das faixas do formulario de inscricao.
 *
 * Quem forcou a extracao foi o DOURADO: o trio (fundo + borda + tinta do texto)
 * chegou a QUARTA copia — `SlotNotice`, os dois avisos dentro do
 * `RegistrationWizard` e o `SunsetNotice`. A regra desta feature, escrita em
 * `features/registration/countdown.ts`, e que a extracao vem na terceira
 * ocorrencia.
 *
 * O `redTone` veio junto com UMA ocorrencia so, e por isso nao e o mesmo tipo de
 * mudanca: ele nao foi extraido, foi MOVIDO para ca. Veio porque os dois tons se
 * definem um contra o outro — a pergunta que classifica esta logo abaixo, e ela
 * nao da para ler com metade da resposta em outro arquivo.
 *
 * Nao e capricho de organizacao: as tres cores andam juntas ou nao andam. Mexer
 * no fundo sem mexer na borda deixa a faixa com um contorno que nao pertence a
 * ela, e o `tsc` nao tem como perceber que quatro objetos literais deveriam ser
 * o mesmo.
 *
 * A CLASSE das faixas ficou de fora de proposito: o `mb-4` so vale onde a faixa
 * separa blocos, e as duas do wizard nao o usam. Sao duas ocorrencias iguais, e
 * nao tres.
 */

/**
 * A boa noticia, e a ma noticia que nao e sobre perda.
 *
 * `SlotNotice` fixou a pergunta que classifica: "isso e ma noticia para o
 * jogador?". O vermelho desta tela diz perda ou incerteza; o dourado diz todo o
 * resto, inclusive a pausa de sabado — que congela o campeonato para todo mundo
 * e tem hora para voltar.
 */
export const goldTone: CSSProperties = {
  background: "rgba(230,180,34,.08)",
  border: "1px solid rgba(230,180,34,.25)",
  color: "var(--gala-ink)",
};

/** Perda ou incerteza sobre a vaga — e so isso. */
export const redTone: CSSProperties = {
  background: "rgba(220,38,38,.10)",
  border: "1px solid rgba(220,38,38,.35)",
  color: "var(--gala-ink)",
};
