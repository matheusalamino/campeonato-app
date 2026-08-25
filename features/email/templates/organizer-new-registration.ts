import { positionLabel } from "@/lib/public/types";
import { assuntoCom, corpoDe, type EmailBody } from "./body";

/**
 * O AVISO INTERNO de inscricao nova. Vai para `ORGANIZER_EMAIL`, e nao para
 * quem se inscreveu -- a separacao esta em `isOrganizerKind`
 * (features/email/kinds.ts), e o texto abaixo so faz sentido para quem
 * organiza.
 *
 * ── A POSICAO SAI PELO ROTULO, E ISSO NAO E ESTILO ──
 *
 * `players.preferred_position` guarda CODIGO desde o A8 -- `GOL|ZAG|MEI|ATA`,
 * com a CHECK `players_preferred_position_known` da migration
 * 20260821010000. Imprimir a coluna crua manda `ATA` para a caixa de quem
 * organiza, e nada acusa: o `tsc` ve `string` dos dois lados.
 *
 * A varredura do A8 tambem nao acusaria. MEDIDO:
 * `features/players/vocabulary-sweep.test.ts` VARRE `features/**` e portanto
 * alcanca este arquivo, mas o que ela procura sao os literais por EXTENSO
 * ("Goleiro", "Atacante") -- o defeito daqui e o inverso, imprimir o codigo, e
 * ela fica verde em cima dele. E `features/players/position-display.test.ts`
 * nomeia cinco arquivos de `app/**` e `components/**`, um por um, sem varrer
 * nada.
 *
 * As redes que SOBRAM sao TRES, em dois arquivos -- MEDIDO plantando o codigo
 * cru no lugar de `positionLabel`, que acende exatamente estas:
 *
 *   organizer-new-registration.test.ts  "exibe a posicao pelo ROTULO, nunca
 *                                        pelo codigo cru"
 *   render.test.ts                      "o aviso da organizacao leva a posicao
 *                                        pelo rotulo"
 *   render.test.ts                      "poe cada campo do resumo no campo
 *                                        certo dos QUATRO templates"
 *
 * A primeira versao deste docblock dizia "a unica rede", e era falso: contava
 * so o teste vizinho e esquecia as duas do render.
 *
 * ── POR QUE NAO HA LINK PARA O ADMIN ──
 *
 * Porque nao ha rota estavel para apontar. Procurado em `app/`: a lista de
 * inscritos e `app/(protected)/championship/players/page.tsx`, e o caminho dela
 * nao leva o campeonato -- a pagina escolhe qual mostrar pelo
 * `useChampionship()`, contexto do lado do cliente. Um link para la pousaria
 * quem clicasse no campeonato que estivesse selecionado, que nao e
 * necessariamente o da inscricao que chegou.
 *
 * E por isso esta funcao NAO recebe `siteUrl`. O esboco da tarefa previa o
 * parametro contando com o link; sem link ele seria argumento morto, e o
 * commit ff38841 deste mesmo bloco existe justamente para matar um desses --
 * `tsc` nao acusa parametro que ninguem le.
 */
export type OrganizerNewRegistrationData = {
  playerName: string | null;
  championshipName: string | null;
  isWaitlist: boolean;
  /** O CODIGO da coluna, cru. Quem traduz e esta funcao, uma vez. */
  preferredPosition: string | null;
};

export function organizerNewRegistrationEmail(data: OrganizerNewRegistrationData): EmailBody {
  const nome = data.playerName;

  // UM ponto de decisao, como no comprovante: o assunto e o corpo nao podem
  // discordar sobre a mesma inscricao.
  const situacao = data.isWaitlist ? "lista de espera" : "vaga principal";

  const posicao = data.preferredPosition ? positionLabel(data.preferredPosition) : null;

  return {
    subject: assuntoCom(
      nome ? `Nova inscrição: ${nome}` : "Nova inscrição",
      data.championshipName,
    ),
    ...corpoDe([
      { texto: nome ? `${nome} acabou de se inscrever.` : "Entrou uma inscrição nova." },
      { texto: `Posição preferida: ${posicao ?? "não informada"}` },
      { texto: `Situação: ${situacao}` },
    ]),
  };
}
