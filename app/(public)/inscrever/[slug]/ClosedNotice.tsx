import { CHAMPIONSHIP_TIME_ZONE } from "@/lib/datetime-br";

/**
 * Inscricoes encerradas — por lotacao ou por prazo.
 *
 * Ate o A5 so havia uma historia, e o texto afirmava que as vagas tinham sido
 * preenchidas. Com o prazo governando, isso poderia ser mentira: pode sobrar
 * vaga e a tela dizer que encheu.
 */
export default function ClosedNotice(
  props: { name: string } & ({ reason: "capacity" } | { reason: "deadline"; endedAt: string }),
) {
  const { name } = props;
  const formattedEndedAt = props.reason === "deadline"
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: CHAMPIONSHIP_TIME_ZONE,
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      }).format(new Date(props.endedAt))
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl" aria-hidden="true">🏁</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrições encerradas</h1>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        {props.reason === "capacity" ? (
          <>As vagas de <b>{name}</b> (incluindo a lista de espera) foram preenchidas. Obrigado pelo interesse!</>
        ) : (
          <>O prazo de inscrição de <b>{name}</b> terminou em <b>{formattedEndedAt}</b>.</>
        )}
      </p>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        Acompanhe como torcedor e nos vemos na próxima edição 🏆
      </p>
    </div>
  );
}
