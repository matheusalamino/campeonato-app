import { assuntoCom, corpoDe, saudacao, type EmailBody, type Paragrafo } from "./body";

/**
 * O COMPROVANTE da inscricao, em duas variantes: vaga garantida e lista de
 * espera.
 *
 * ── FUNCAO PURA, E ISSO E LOAD-BEARING ──
 *
 * Sem relogio, sem `process.env`, sem I/O. Quem sabe o instante, o ambiente e o
 * banco e o dreno; aqui so entra o que o argumento traz. E o que torna a
 * MUTACAO possivel: uma funcao que lesse o ambiente daria resultado diferente
 * conforme a maquina, e ai um vermelho nao provaria nada sobre o codigo.
 *
 * ── POR QUE O LINK DE VERIFICACAO E NULAVEL ──
 *
 * Porque na data deste arquivo ele nao existe: o token de verificacao nasce na
 * T6, e `features/email/render.ts` passa `null`. O bloco inteiro fica de fora
 * quando nao ha link -- nao sai href vazio, nao sai convite a clicar em nada.
 * Ha assertiva sobre isso nos DOIS lugares: aqui (`sem link, nao sobra bloco
 * orfao`) e em render.test.ts, que declara que HOJE o comprovante sai sem link.
 *
 * ── O TEXTO NAO E DECISAO DESTE ARQUIVO ──
 *
 * As frases abaixo sao PROPOSTA: elas vao para a caixa de entrada de todo
 * mundo que se inscrever, e nenhum portao deste repo revisa texto. (Uma versao
 * anterior dizia "64 pessoas"; o numero nao tinha ancora nenhuma no repo -- o
 * unico 64 e a contagem de inscricoes do seed local, que muda na proxima
 * inscricao.) Elas foram
 * escritas com duas restricoes que nao sao estilo:
 *
 *  1. A variante de espera NAO promete ordem de fila. A regra do goleiro do
 *     bloco A6b inverte a ordem -- e o A6b nem existe ainda --, entao
 *     "chamamos pela ordem da lista" nasceria falsa. O que se promete e o
 *     AVISO, nao a posicao.
 *  2. Nao ha prazo em lugar nenhum. "Em breve" e promessa que ninguem deste
 *     repo pode cumprir.
 */
export type RegistrationCommittedData = {
  playerName: string | null;
  championshipName: string | null;
  isWaitlist: boolean;
  verificationLink: string | null;
};

export function registrationCommittedEmail(data: RegistrationCommittedData): EmailBody {
  // UM ponto de decisao, e nao um por corpo. Com o ramo repetido no assunto e
  // no texto, inverter so um deles produziria um e-mail cujo assunto diz uma
  // coisa e cujo corpo diz outra -- e nenhuma assertiva de conteudo veria a
  // metade certa.
  const variante = data.isWaitlist
    ? {
        titulo: "Você está na lista de espera",
        paragrafos: [
          "As vagas já estavam preenchidas quando sua inscrição chegou, então você entrou na lista de espera.",
          "Se abrir vaga, a organização avisa por e-mail.",
        ],
      }
    : {
        titulo: "Inscrição confirmada",
        paragrafos: [
          "Sua inscrição está confirmada.",
          "Agora é com a organização: ela confere o comprovante de pagamento e avisa por e-mail assim que conferir.",
        ],
      };

  const paragrafos: Paragrafo[] = [
    { texto: saudacao(data.playerName) },
    ...variante.paragrafos.map((texto) => ({ texto })),
  ];

  if (data.verificationLink) {
    paragrafos.push({
      texto: "Confirme seu e-mail para não perder nenhum aviso:",
      link: data.verificationLink,
    });
  }

  return {
    subject: assuntoCom(variante.titulo, data.championshipName),
    ...corpoDe(paragrafos),
  };
}
