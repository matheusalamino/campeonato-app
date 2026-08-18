import RegistrationWizard, { type WizardChampionship } from "./RegistrationWizard";

export default function RestOverlay({
  championship, liveCount,
}: { championship: WizardChampionship; liveCount: number }) {
  return (
    <div className="relative min-h-screen">
      {/* `inert` alem de aria-hidden: pointer-events-none barra o mouse, mas o Tab
          continuaria entrando num conteudo anunciado como inexistente. */}
      <div inert aria-hidden className="pointer-events-none select-none blur-[4px] opacity-50">
        <RegistrationWizard championship={championship} liveCount={liveCount} />
      </div>
      <div className="fixed inset-0 flex items-center justify-center px-6" style={{ background: "rgba(4,4,7,.55)" }}>
        <div className="max-w-sm w-full rounded-3xl border p-6 text-center"
             style={{ background: "#0d0d11", borderColor: "rgba(230,180,34,.35)" }}>
          <div className="text-4xl">🌅</div>
          <h2 className="text-lg font-extrabold text-[var(--gala-gold-2)] my-3">Inscrições em repouso</h2>
          <p className="text-sm leading-relaxed text-[var(--gala-ink-dim)]">
            As Seventh-day Adventists, our registrations are paused from Friday sunset to Saturday sunset.
            Registrations will automatically resume shortly after sunset. In the meantime, feel free to learn
            more about our community!
          </p>
          <a href="https://youtube.com/@adventistascampolim" target="_blank" rel="noopener noreferrer"
             className="mt-5 inline-block w-full rounded-xl py-3 font-bold text-[#050507]"
             style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            ▶ Conheça a gente
          </a>
        </div>
      </div>
    </div>
  );
}
