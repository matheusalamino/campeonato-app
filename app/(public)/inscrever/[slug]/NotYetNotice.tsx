import { CHAMPIONSHIP_TIME_ZONE } from "@/lib/datetime-br";
import Countdown from "./steps/Countdown";

/**
 * O link da inscricao circula por WhatsApp e Instagram, entao muita gente cai
 * aqui antes da hora. Dizer so "indisponivel" faria a pessoa embora sem saber
 * quando voltar.
 */
export default function NotYetNotice({
  name, opensAt,
}: { name: string; opensAt: string }) {
  const formattedOpensAt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: CHAMPIONSHIP_TIME_ZONE,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(opensAt));

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl" aria-hidden="true">⏳</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrições ainda não abriram</h1>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        As inscrições para <b>{name}</b> abrem em <b>{formattedOpensAt}</b>.
      </p>
      <Countdown targetIso={opensAt} />
    </div>
  );
}
