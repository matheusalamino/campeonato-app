/**
 * Inscricoes encerradas — por lotacao ou por prazo.
 *
 * Ate o A5 so havia uma historia, e o texto afirmava que as vagas tinham sido
 * preenchidas. Com o prazo governando, isso poderia ser mentira: pode sobrar
 * vaga e a tela dizer que encheu.
 */
export default function ClosedNotice({
  name, reason, endedAt,
}: {
  name: string;
  reason: "capacity" | "deadline";
  endedAt?: string;
}) {
  const quando = endedAt
    ? new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
      }).format(new Date(endedAt))
    : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl">🏁</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrições encerradas</h1>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        {reason === "capacity" ? (
          <>As vagas de <b>{name}</b> (incluindo a lista de espera) foram preenchidas. Obrigado pelo interesse!</>
        ) : (
          <>O prazo de inscrição de <b>{name}</b> terminou{quando ? <> em <b>{quando}</b></> : null}.</>
        )}
      </p>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        Acompanhe como torcedor e nos vemos na próxima edição 🏆
      </p>
    </div>
  );
}
