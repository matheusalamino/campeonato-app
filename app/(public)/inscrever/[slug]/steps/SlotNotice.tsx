"use client";

import type { SlotReservation } from "@/features/registration/slot";

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
 * Estado da vaga do jogador, no topo do formulario.
 *
 * Existe porque no campeonato passado houve quem pagasse o PIX e fosse
 * recusado no envio: a lotacao encheu enquanto preenchia. Aqui ele sabe, antes
 * de pagar, se tem vaga e qual.
 */
export default function SlotNotice({ slot }: { slot: SlotReservation | null }) {
  if (!slot) return null;

  if (slot.ok) {
    return (
      <div className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed" style={goldTone}>
        {slot.isWaitlist ? (
          <>
            ✓ Sua vaga está garantida na <b>LISTA DE ESPERA</b> enquanto você preenche.
            Avisaremos se uma vaga principal abrir.
          </>
        ) : (
          <>✓ Sua vaga está garantida enquanto você preenche. Pode seguir com calma.</>
        )}
      </div>
    );
  }

  if (slot.reason === "already_registered") {
    return (
      <div className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed" style={goldTone}>
        Você já está inscrito neste campeonato. Não é necessário se inscrever de novo.
      </div>
    );
  }

  if (slot.reason === "all_reserved") {
    return (
      <div className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed" style={redTone}>
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
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-2xl px-3 py-3 text-xs leading-relaxed" style={redTone}>
      As vagas para este campeonato se esgotaram.
    </div>
  );
}
