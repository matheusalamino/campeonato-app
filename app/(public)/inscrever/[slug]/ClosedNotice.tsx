export default function ClosedNotice({ name }: { name: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl">🏁</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrições encerradas</h1>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        As vagas de <b>{name}</b> (incluindo a lista de espera) foram preenchidas. Obrigado pelo interesse!
      </p>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        Acompanhe como torcedor e nos vemos na próxima edição 🏆
      </p>
    </div>
  );
}
