/**
 * Le o resultado de uma consulta de linha unica sem confundir os dois motivos
 * pelos quais `data` chega null.
 *
 * `.maybeSingle()` devolve `data: null` tanto quando a linha nao existe quanto
 * quando a consulta falhou. Quem le so o `data` junta os dois casos, e a falha
 * passa a se parecer com ausencia: foi assim que o staging duas migrations
 * atras — `42703: column "pix_key" does not exist` — virou um 404 seco na
 * pagina de inscricao, sem nada no log dizendo que faltava coluna.
 */

/** O formato de erro do PostgREST, frouxo o bastante para falha de rede. */
export type QueryFailure = {
  message: string;
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

/**
 * Devolve a linha, ou `null` quando ela realmente nao existe.
 *
 * Lanca quando a consulta falhou — esse caso nao e 404. `what` nomeia o que se
 * procurava, para a mensagem no log dizer qual consulta quebrou.
 */
// `data: T` e nao `data: T | null`: o supabase-js tipa o resultado como uniao
// (`{ data: Row, error: null } | { data: null, error: PostgrestError }`), e com
// `T | null` a inferencia cruza os dois bracos e colapsa `T` em `never`. Aqui
// `T` sai como `Row | null`, que e exatamente o que a chamada precisa estreitar.
export function requireRow<T>(
  result: { data: T; error: QueryFailure | null },
  what: string,
): T {
  // O erro vem antes do `data` de proposito: uma resposta parcial nao pode
  // passar por consulta boa.
  if (result.error) {
    const { code, message } = result.error;
    // O `code` e opcional — queda de rede chega sem ele, e um `undefined`
    // interpolado esconderia a mensagem que importa.
    const prefixo = code ? `${code} ` : "";
    throw new Error(`Failed to load ${what}: ${prefixo}${message}`, {
      cause: result.error,
    });
  }
  return result.data;
}
