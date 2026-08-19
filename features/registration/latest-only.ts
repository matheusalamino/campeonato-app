/**
 * Sequenciador de chamadas concorrentes: so a mais recente pode virar estado.
 *
 * A reserva da vaga e renovada a cada passo do wizard, sem esperar a anterior.
 * Enquanto o resultado so pintava uma faixa, duas renovacoes em voo eram
 * inofensivas. Desde que a reserva comanda a navegacao, nao sao: um "ok" velho
 * chegando depois de um veredito ruim mais novo reabriria um avanco que deveria
 * estar fechado — e devolveria o jogador ao passo do pagamento sem vaga.
 *
 * Cada chamada tira uma senha. Se outra tirou depois, o resultado ja nasceu
 * velho e volta como `null`: nao pode virar estado nem decidir navegacao.
 */
export function createLatestOnly() {
  let latest = 0;
  return async function latestOnly<T>(run: () => Promise<T>): Promise<T | null> {
    const ticket = ++latest;
    const value = await run();
    return ticket === latest ? value : null;
  };
}
