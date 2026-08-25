import { assuntoCom, corpoDe, saudacao, type EmailBody, type Paragrafo } from "./body";

/**
 * O AVISO de que a pessoa saiu da lista de espera e tem vaga.
 *
 * ── FUNCAO PURA, PELO MESMO MOTIVO DOS IRMAOS ──
 *
 * Sem relogio, sem `process.env`, sem I/O. Quem sabe o instante, o ambiente e o
 * banco e o dreno; aqui so entra o que o argumento traz. E o que torna a
 * MUTACAO possivel: uma funcao que lesse o ambiente daria resultado diferente
 * conforme a maquina, e ai um vermelho nao provaria nada sobre o codigo.
 *
 * ── ESTE E-MAIL FECHA UMA PROMESSA QUE O COMPROVANTE JA FEZ ──
 *
 * A variante de lista de espera de `registration-committed.ts` diz: "Se abrir
 * vaga, a organizacao avisa por e-mail." ESTE e aquele aviso, e e por isso que
 * ele nao precisa se apresentar nem explicar o que e a lista de espera.
 *
 * ── AQUI A PROMESSA DE VAGA E O ASSUNTO, E NAO O PERIGO ──
 *
 * `payment-verified.ts` proibe a palavra "vaga" no proprio texto, e a proibicao
 * esta certa LA: aquele aviso nao recebe `isWaitlist` e vai igual para quem
 * ainda espera. Aqui e o contrario -- a vaga e a unica noticia que este e-mail
 * carrega, e cala-la o esvaziaria. As duas redes nao se cruzam: a denylist de
 * `payment-verified.test.ts` so exercita `paymentVerifiedEmail`, e nenhuma
 * assertiva deste repo le os templates como texto (conferido por varredura de
 * `templates/` em features/, lib/ e scripts/ -- os tres arquivos que citam a
 * pasta sao render.ts, render.test.ts e summary-row.ts, e nenhum le arquivo).
 *
 * ── O TEXTO NAO E DECISAO DESTE ARQUIVO ──
 *
 * As frases abaixo sao PROPOSTA, e precisam de revisao humana: elas vao para a
 * caixa de entrada de uma pessoa, e nenhum portao deste repo revisa texto. Elas
 * foram escritas com QUATRO restricoes que nao sao estilo, e cada uma tem
 * assertiva em `waitlist-promoted.test.ts`:
 *
 *  1. **Nao promete ORDEM DE FILA.** A regra do A6b e que jogador de linha
 *     segue a ordem da espera, MAS goleiro que desiste e substituido pelo
 *     goleiro da espera independentemente da ordem dele. Entao "chegou a sua
 *     vez na fila" nasce falsa justamente para o goleiro -- e este template nao
 *     recebe a posicao para poder distinguir.
 *  2. **Nao promete PRAZO.** Nao ha quem o cumpra neste repo.
 *  3. **Nao diz POR QUE abriu vaga.** "Alguem desistiu" e informacao de outra
 *     pessoa, e nao cabe a esta caixa de entrada.
 *  4. **Nao inventa etapa.** Nao ha confirmacao a dar, nem link a clicar, nem
 *     formulario a refazer -- nada disso existe no repo. O que se diz sobre o
 *     que vem depois e condicional e sem sujeito novo: se faltar algo, a
 *     organizacao avisa. E o mesmo canal que os outros tres e-mails ja usam.
 *
 * ── SEM LINK DE VERIFICACAO, E ISSO E DECISAO ──
 *
 * `kindNeedsVerificationLink` (features/email/verification.ts) continua
 * devolvendo true SO para `registration_committed`, e este `kind` nao entrou
 * la. O motivo nao e esquecimento: a emissao de token e sempre NOVA -- ela
 * sorteia e regrava o hash --, entao emitir um aqui INVALIDARIA o link que a
 * pessoa ja recebeu no comprovante e ainda nao usou. O comprovante e o convite
 * natural; este e-mail nao tem o que provar. Ver o docblock de
 * `issueVerificationToken` em services/email-outbox.ts.
 */
export type WaitlistPromotedData = {
  playerName: string | null;
  championshipName: string | null;
};

export function waitlistPromotedEmail(data: WaitlistPromotedData): EmailBody {
  const paragrafos: Paragrafo[] = [
    { texto: saudacao(data.playerName) },
    { texto: "Você saiu da lista de espera e agora tem vaga no campeonato." },
    { texto: "Sua inscrição continua a mesma — você não precisa se inscrever de novo." },
    { texto: "Se ainda faltar alguma coisa da sua parte, a organização avisa por e-mail." },
  ];

  return {
    subject: assuntoCom("Você tem vaga no campeonato", data.championshipName),
    ...corpoDe(paragrafos),
  };
}
