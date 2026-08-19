export default function NotOpenNotice() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
      <div className="text-5xl" aria-hidden="true">⏳</div>
      <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrições indisponíveis</h1>
      <p className="max-w-sm text-sm text-[var(--gala-ink-dim)]">
        As inscrições para este campeonato não estão abertas no momento.
      </p>
    </div>
  );
}
