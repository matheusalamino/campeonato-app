"use client";

import { sunsetTimeLabel, type SunsetAlert } from "@/features/registration/sabbath";
import { goldTone } from "./tones";

/**
 * O aviso de que o por do sol esta chegando.
 *
 * Apresentacional puro: quem tica o relogio e o wizard, porque o MESMO alerta
 * decide se o bloco de pagamento aparece. Dois relogios divergiriam, e a tela
 * diria que ha tempo para pagar com o QR ja fora do ar — ou o contrario.
 */
export default function SunsetNotice({ alert }: { alert: SunsetAlert }) {
  // Nivel e instante chegam juntos (`SunsetAlert` e uniao discriminada), entao
  // aqui nao ha par a conferir: sem o que anunciar, o rotulo e `null`.
  const hora = sunsetTimeLabel(alert);

  const faixa = hora === null ? null : (
    <div className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed" style={goldTone}>
      {alert.level === "cutoff" ? (
        <>
          🌅 As inscrições entram em repouso às <b>{hora}</b>, daqui a poucos minutos. O pagamento
          foi fechado para você não pagar e ser recusado. <b>Não pague nada agora</b> — as
          inscrições voltam após o pôr do sol de sábado. Se você já pagou, guarde o comprovante:
          é só enviá-lo quando elas voltarem.
        </>
      ) : (
        <>
          🌅 As inscrições entram em repouso às <b>{hora}</b>, com o pôr do sol. Guardamos o sábado
          e elas voltam automaticamente amanhã à noite. Se for pagar, pague agora — o pagamento
          fecha alguns minutos antes.
        </>
      )}
    </div>
  );

  /*
   * Os dois containers ficam SEMPRE no DOM, mesmo vazios, e sao dois — igual ao
   * `SlotNotice`, e pelos dois motivos de la: regiao live que nasce junto com o
   * conteudo nao anuncia de forma confiavel (o leitor de tela precisa ja estar
   * observando quando o texto entra), e trocar o `aria-live` de uma regiao ja
   * observada tem suporte irregular.
   *
   * Aqui a primeira parte nem e hipotese: o alerta comeca em "none" em TODO
   * carregamento, por causa da hidratacao, e so ganha nivel dentro do efeito. O
   * texto chega sempre depois da montagem.
   *
   * A POLIDEZ ACOMPANHA O NIVEL, e este e o unico lugar do formulario onde
   * dourado e assertivo se encontram. O `SlotNotice` codificou um eixo so —
   * `urgent` decide a tinta vermelha E a regiao que anuncia na hora —, e o ramo
   * `sabbath` de la escolheu educado, com a justificativa de que nada ali pede
   * pressa. Vale igual para o aviso de trinta minutos, que so informa uma hora
   * marcada: ele entra pela regiao educada.
   *
   * O corte e o que separa os dois eixos. Ele nao e ma noticia — a pausa e da
   * comunidade do jogador e tem hora para acabar, entao o tom continua dourado
   * —, mas ALGO ACABOU DE SUMIR da tela sem ele tocar em nada, e a unica
   * explicacao esta nesta faixa. Quem depende do leitor de tela ficaria sem
   * nenhum sinal de que o QR e o envio do comprovante deixaram a pagina.
   */
  return (
    <>
      <div aria-live="polite" aria-atomic="true">
        {alert.level === "notice" ? faixa : null}
      </div>
      <div role="alert">{alert.level === "cutoff" ? faixa : null}</div>
    </>
  );
}
