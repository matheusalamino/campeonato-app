/**
 * O CHECK de pagamento conferido do admin: o estado do controle, e o que ele
 * pode fazer.
 *
 * ── POR QUE ISTO NAO MORA NA TELA ──
 *
 * Porque `app/**` nao esta no `include` de `vitest.config.ts` -- que so alcanca
 * `lib/**`, `features/**` e `scripts/**` --, nenhum glob deste repo alcanca
 * `.test.tsx`, e nao ha job de teste no CI (`.github/workflows` so tem
 * `migrate.yml`). Regra escrita dentro de `PlayersSection.tsx` nasce sem rede:
 * a T6 mediu TRES mutacoes reais atravessando os cinco portoes inteiros com a
 * logica ainda em `app/**`, uma delas mandando um segredo para o log do banco.
 *
 * Entao a decisao mora aqui e a tela so CHAMA. Ha assertiva de fiacao em
 * `features/registration/players-admin-wiring.test.ts`, que le o `.tsx` como
 * texto -- e cujas negativas ("estes literais NAO aparecem la") sao o que
 * impede a regra de voltar para a tela por copia.
 *
 * ── O CHECK E DE MAO UNICA, E ISSO E DECISAO DE DESENHO ──
 *
 * Marcar o pagamento dispara `trg_enqueue_payment_verified`, que enfileira UMA
 * linha `payment_verified` com `dedupe_key` = id da inscricao. O par (kind,
 * dedupe_key) e UNIQUE na fila.
 *
 * A consequencia, e ela e o motivo desta secao existir: DESMARCAR E MARCAR DE
 * NOVO NAO MANDA UM SEGUNDO E-MAIL. A linha antiga continua la e o
 * `ON CONFLICT DO NOTHING` do gatilho a preserva. Um "conferido" clicado por
 * engano e desfeito QUEIMA o aviso daquela inscricao para sempre -- reenviar
 * exige apagar a linha da fila a mao, no banco.
 *
 * Por isso `canMark` e falso para quem ja esta conferido: a tela nao oferece o
 * desmarcar. Nao e que o banco proiba -- ele nao proibe, e um UPDATE a mao
 * desmarca sem reclamar. E que oferecer o botao seria oferecer um caminho cujo
 * desfazer nao desfaz.
 */

/**
 * A entrada aceita AUSENTE, e isso e a metade que se paga.
 *
 * `payment_verified` e `boolean NOT NULL DEFAULT false` no banco, mas em
 * `types/registration.ts` ele e `payment_verified?: boolean` -- opcional. E o
 * `select()` do PostgREST e uma string sem typecheck nenhum: esquecer a coluna
 * la faz o campo chegar `undefined`, e nao quebra nada.
 *
 * O default TEM de ser "nao conferido". `?? true` -- ou um `!!` mal colocado
 * que lesse ausencia como presenca -- faria toda inscricao aparecer conferida
 * no dia em que alguem mexesse no `select`, e o admin nunca marcaria ninguem.
 * Falhar para o lado do "ainda nao" e o unico lado seguro: o pior que acontece
 * e alguem marcar de novo o que ja estava marcado, e o `WHEN` do gatilho
 * engole isso sem enfileirar nada.
 */
export type PaymentCheckInput = {
  paymentVerified: boolean | null | undefined;
};

export type PaymentCheckView = {
  /** O estado ja normalizado. Ausente e nulo contam como NAO conferido. */
  verified: boolean;
  /** O que o controle diz. */
  label: string;
  /** O controle aceita clique? Falso para quem ja esta conferido -- ver o
   *  docblock do arquivo sobre a mao unica. */
  canMark: boolean;
};

/** O rotulo de quem JA foi conferido. Exportado porque a assertiva de fiacao
 *  precisa provar que este literal NAO esta escrito dentro do `.tsx`. */
export const PAYMENT_CHECK_LABEL_VERIFIED = "Pagamento conferido";

/** O rotulo de quem ainda nao foi. */
export const PAYMENT_CHECK_LABEL_PENDING = "Conferir pagamento";

/**
 * O texto da confirmacao, e ele NAO e enfeite.
 *
 * O clique manda um e-mail que nao volta atras, e o unico lugar onde quem
 * clica descobre isso e aqui. Sem esta frase o controle e um botao que parece
 * reversivel porque a coluna e um booleano.
 */
export const PAYMENT_CHECK_CONFIRM = {
  title: "Confirmar pagamento conferido",
  body:
    "O jogador recebe um e-mail avisando que o pagamento foi conferido. " +
    "Esse aviso sai uma vez só: desmarcar depois não o cancela, e marcar de " +
    "novo não manda outro.",
  confirmLabel: "Marcar como conferido",
  cancelLabel: "Cancelar",
} as const;

/** O estado do controle a partir do que veio do banco. */
export function paymentCheckView(input: PaymentCheckInput): PaymentCheckView {
  const verified = input.paymentVerified === true;

  return {
    verified,
    label: verified ? PAYMENT_CHECK_LABEL_VERIFIED : PAYMENT_CHECK_LABEL_PENDING,
    canMark: !verified,
  };
}

/**
 * O que vai no `.update()`.
 *
 * Aqui, e nao na tela, pelo motivo da allowlist do `toRow`: nome de coluna
 * escrito a mao dentro de `app/**` nao passa por typecheck nenhum -- o cliente
 * do Supabase aceita a string --, e um typo grava em lugar nenhum sem levantar
 * erro. Com o objeto vindo daqui, o typo vira assertiva vermelha em
 * `payment-check.test.ts`.
 *
 * So `true`: nao ha `markPaymentUnverified`, pela mao unica do docblock do
 * arquivo.
 */
export function markPaymentVerifiedPatch(): { payment_verified: true } {
  return { payment_verified: true };
}
