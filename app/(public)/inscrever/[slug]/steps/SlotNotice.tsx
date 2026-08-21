"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SlotReservation } from "@/features/registration/slot";
import { slotCountdown } from "@/features/registration/slot-keepalive";

/** Hora local no formato 14h37, para o jogador saber quando voltar. */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}h${String(d.getMinutes()).padStart(2, "0")}`;
}

const goldTone = {
  background: "rgba(230,180,34,.08)",
  border: "1px solid rgba(230,180,34,.25)",
  color: "var(--gala-ink)",
};
const redTone = {
  background: "rgba(220,38,38,.10)",
  border: "1px solid rgba(220,38,38,.35)",
  color: "var(--gala-ink)",
};

/**
 * O texto da faixa e o tom em que ele entra.
 *
 * `urgent` e severidade, nao bloqueio: decide a tinta vermelha e o container
 * que anuncia na hora. Os dois eixos nao coincidem — "voce ja esta inscrito"
 * tambem impede seguir e mesmo assim e dourado, porque a noticia e boa. A
 * pergunta que classifica e "isso e ma noticia para o jogador?".
 */
function noticeFor(
  slot: SlotReservation,
  /** A reserva existe, mas o prazo dela ja passou. */
  expired: boolean,
): { urgent: boolean; body: ReactNode } {
  if (slot.ok) {
    /*
     * Dourado, e nao vermelho, apesar de ser noticia ruim: nao e veredito sobre
     * lotacao — a vaga pode continuar ali, so a reserva que a segurava venceu.
     * Afirmar que acabou seria inventar, e a verdade chega junto com o toque,
     * que dispara uma reserva nova.
     */
    if (expired) {
      return {
        urgent: false,
        body: (
          <>
            Sua reserva de vaga venceu enquanto a página ficou parada. Toque na tela para
            reservar de novo — só então saberemos se a vaga continua disponível.
          </>
        ),
      };
    }
    return {
      urgent: false,
      body: slot.isWaitlist ? (
        <>
          ✓ Sua vaga está garantida na <b>LISTA DE ESPERA</b> enquanto você preenche.
          Avisaremos se uma vaga principal abrir.
        </>
      ) : (
        <>✓ Sua vaga está garantida enquanto você preenche. Pode seguir com calma.</>
      ),
    };
  }

  switch (slot.reason) {
    case "already_registered":
      return {
        urgent: false,
        body: <>Você já está inscrito neste campeonato. Não é necessário se inscrever de novo.</>,
      };

    case "all_reserved":
      return {
        urgent: true,
        body: (
          <>
            As vagas estão em processo de inscrição neste momento. Algumas podem voltar{" "}
            {/* Sem horario a frase precisa mudar de forma: "a partir das alguns
                minutos" nao e portugues. */}
            {slot.retryAt ? (
              <>
                a partir das <b>{formatLocalTime(slot.retryAt)}</b>
              </>
            ) : (
              <>em alguns minutos</>
            )}{" "}
            — vale tentar de novo.
          </>
        ),
      };

    case "full":
      return { urgent: true, body: <>As vagas para este campeonato se esgotaram.</> };

    case "error":
      // Nao afirma nada sobre lotacao porque nao sabemos: a chamada e que
      // falhou. Convida a repetir, que e o que costuma resolver.
      return {
        urgent: true,
        body: <>Não foi possível confirmar sua vaga agora. Tente novamente em instantes.</>,
      };

    case "not_found":
    case "not_open":
      // Nenhum dos dois e lotacao cheia: o primeiro e campeonato que sumiu do
      // ar durante o preenchimento, o segundo e status que saiu de
      // `subscribing`. Dizer "esgotaram" aqui seria inventar.
      return { urgent: true, body: <>As inscrições para este campeonato não estão abertas.</> };
  }

  // Sem `default`, de proposito. Com um, todo membro novo da uniao escorregaria
  // calado para a ultima frase — e foi assim que "esgotaram" passou a ser dita
  // para quem nao tinha esgotado nada. Aqui o compilador cobra o proximo.
  slot satisfies never;
}

/**
 * Estado da vaga do jogador, no topo do formulario.
 *
 * Existe porque no campeonato passado houve quem pagasse o PIX e fosse
 * recusado no envio: a lotacao encheu enquanto preenchia. Aqui ele sabe, antes
 * de pagar, se tem vaga e qual.
 */
export default function SlotNotice({ slot }: { slot: SlotReservation | null }) {
  /*
   * Relogio local, so para o contador. Meio minuto e resolucao de sobra para um
   * rotulo em minutos, e o re-render fica preso aqui em vez de sacudir o
   * formulario inteiro.
   *
   * Corre desde a montagem, e nao so quando a reserva chega: parado, ele ficaria
   * marcando a hora em que a pagina abriu, e a primeira reserva — que nasce
   * depois do CPF, as vezes muitos minutos depois — apareceria com mais tempo do
   * que tem de verdade.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // `expires_at` atravessava a RPC e o servico sem ninguem ler. E o unico jeito
  // de o jogador saber que a promessa da faixa tem prazo — e quanto falta dele.
  const countdown = slot?.ok ? slotCountdown(slot.expiresAt, now) : null;
  const notice = slot ? noticeFor(slot, countdown?.expired === true) : null;

  const box = notice ? (
    <div
      className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed"
      style={notice.urgent ? redTone : goldTone}
    >
      {notice.body}
    </div>
  ) : null;

  /*
   * Os dois containers ficam sempre no DOM, mesmo vazios. Regiao live que nasce
   * junto com o conteudo nao anuncia de forma confiavel: o leitor de tela
   * precisa ja estar observando quando o texto entra. E aqui isso custa caro —
   * no caminho recusado esta faixa e o unico sinal, porque nao ha toast e o
   * foco nao se move, entao quem nao a ouve toca "Continuar" e nao recebe nada.
   *
   * Sao dois, e nao um so com a politeness trocando, porque mudar `aria-live`
   * de uma regiao ja observada tem suporte irregular.
   */
  return (
    <>
      <div aria-live="polite" aria-atomic="true">
        {notice && !notice.urgent ? box : null}
      </div>
      <div role="alert">{notice?.urgent ? box : null}</div>
      {/*
       * Fora das duas regioes live de proposito: dentro, o `aria-atomic` faria
       * o leitor de tela repetir a faixa inteira a cada minuto so porque o
       * numero mudou. Aqui ele continua legivel para quem navegar ate ele, e
       * nao anuncia sozinho — o unico estado que merece anuncio, o vencimento,
       * e dito pela propria faixa.
       *
       * Dourado quando aperta, nunca vermelho: o vermelho desta tela e reservado
       * para quem nao tem vaga, e um relogio vermelho ao lado do QR do PIX
       * assusta quem ainda tem tempo de sobra.
       */}
      {countdown && !countdown.expired && (
        <p
          className="-mt-3 mb-4 text-right text-[11px] leading-none"
          style={{ color: countdown.low ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
        >
          {countdown.label}
        </p>
      )}
    </>
  );
}
