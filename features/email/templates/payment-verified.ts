import { assuntoCom, corpoDe, saudacao, type EmailBody, type Paragrafo } from "./body";

/**
 * O AVISO de que a organizacao conferiu o pagamento.
 *
 * ── FUNCAO PURA, PELO MESMO MOTIVO DOS IRMAOS ──
 *
 * Sem relogio, sem `process.env`, sem I/O. Quem sabe o instante, o ambiente e o
 * banco e o dreno; aqui so entra o que o argumento traz. E o que torna a
 * MUTACAO possivel: uma funcao que lesse o ambiente daria resultado diferente
 * conforme a maquina, e ai um vermelho nao provaria nada sobre o codigo.
 *
 * ── UMA VARIANTE SO, E A LISTA DE ESPERA E O MOTIVO DE OLHAR DUAS VEZES ──
 *
 * `registrationCommittedEmail` tem duas variantes porque a lotacao muda o que
 * ha para dizer. Aqui nao ha ramo: o dado de entrada sao dois campos, e nenhum
 * deles e `isWaitlist`.
 *
 * Isso e uma DECISAO, e ela restringe o texto. Uma inscricao de lista de espera
 * tambem pode ter o pagamento conferido, e esse aviso chega igual a ela. Entao
 * nenhuma frase daqui pode afirmar que a pessoa vai jogar, que a vaga esta
 * garantida ou que ela subiu de posicao -- todas seriam falsas justamente para
 * quem esta esperando. O que se afirma e o que vale nos dois casos: o pagamento
 * foi conferido, e nao falta mais nada da parte de quem se inscreveu.
 *
 * ── O TEXTO NAO E DECISAO DESTE ARQUIVO ──
 *
 * As frases abaixo sao PROPOSTA: elas vao para a caixa de entrada de quem se
 * inscreveu, e nenhum portao deste repo revisa texto. Foram escritas com tres
 * restricoes que nao sao estilo:
 *
 *  1. Nao ha PRAZO em lugar nenhum. "Em breve" e promessa que ninguem deste
 *     repo pode cumprir.
 *  2. Nao ha promessa de ORDEM DE FILA. A regra do goleiro do bloco A6b
 *     inverte a ordem -- e o A6b nem existe ainda.
 *  3. Nao ha promessa de VAGA, pelo motivo da secao acima.
 *
 * Ele fecha o par que o comprovante abriu: a variante de vaga garantida de
 * `registration-committed.ts` diz que a organizacao "confere o comprovante de
 * pagamento e avisa por e-mail assim que conferir". ESTE e aquele aviso.
 *
 * ── UM AVISO POR INSCRICAO, PARA SEMPRE ──
 *
 * A `dedupe_key` da fila e o id da inscricao, e o par (kind, dedupe_key) e
 * UNIQUE. Desmarcar o pagamento e marcar de novo NAO produz um segundo e-mail
 * -- a linha antiga ainda esta la. Quem mexer no texto deste arquivo depois de
 * a fila ja ter drenado nao alcanca quem ja recebeu a versao anterior.
 */
export type PaymentVerifiedData = {
  playerName: string | null;
  championshipName: string | null;
};

export function paymentVerifiedEmail(data: PaymentVerifiedData): EmailBody {
  const paragrafos: Paragrafo[] = [
    { texto: saudacao(data.playerName) },
    { texto: "A organização conferiu o seu pagamento." },
    { texto: "Sua inscrição está completa — não falta mais nada da sua parte." },
    { texto: "Qualquer novidade sobre o campeonato, a organização avisa por e-mail." },
  ];

  return {
    subject: assuntoCom("Pagamento conferido", data.championshipName),
    ...corpoDe(paragrafos),
  };
}
