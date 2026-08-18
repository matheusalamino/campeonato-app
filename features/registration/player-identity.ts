/**
 * Decide se a submissao publica pode gravar os dados de identidade do jogador.
 *
 * A inscricao publica e anonima: o CPF e o unico identificador, nao e segredo
 * e o digito verificador permite gerar validos. Se a submissao pudesse
 * sobrescrever um jogador existente, qualquer pessoa que digitasse o CPF de
 * outra reescreveria nome, e-mail, WhatsApp e data de nascimento dela.
 *
 * Por isso so gravamos a identidade quando o CPF ainda nao existe. Para um
 * jogador ja cadastrado a submissao apenas cria o vinculo da nova inscricao;
 * correcao de cadastro e feita pelo admin, que e autenticado.
 */
export function shouldPersistPlayerIdentity(existingPlayerId: string | null): boolean {
  return !existingPlayerId;
}
