import SeasonStatsPanel from "@/components/landing/SeasonStatsPanel";
import { getAllChampionships } from "@/lib/landing/queries";

export default async function StatisticsPage() {
  const championships = await getAllChampionships();

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 md:px-10">
      <header className="mb-10">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Estatísticas Oficiais ━ ✦ ━
        </p>
        <div className="mt-2 flex items-end justify-between gap-4 flex-wrap">
          <h1
            className="font-serif text-3xl font-extrabold sm:text-4xl"
            style={{
              background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            Estatísticas LIFAS
          </h1>
          <a
            href="/historico"
            className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[var(--gala-gold-2)] hover:text-[var(--gala-gold-1)] transition-colors"
          >
            Ver Histórico Completo →
          </a>
        </div>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          Recordes históricos e destaques da temporada · atualizado em tempo real
        </p>
      </header>

      <SeasonStatsPanel championships={championships} />
    </main>
  );
}
