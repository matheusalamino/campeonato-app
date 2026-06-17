import type { AggregateStats } from "@/lib/landing/queries";

interface HomeNumbersBarProps {
  stats: AggregateStats;
}

export default function HomeNumbersBar({ stats }: HomeNumbersBarProps) {
  const items = [
    { value: stats.seasons, label: "Temporadas" },
    { value: stats.goals, label: "Gols Marcados" },
    { value: stats.players, label: "Jogadores" },
  ];

  return (
    <div
      className="w-full py-10 px-8 md:px-14"
      style={{ background: "var(--gala-bg-1)", borderTop: "1px solid var(--gala-line)", borderBottom: "1px solid var(--gala-line)" }}
    >
      <div className="flex flex-wrap justify-center gap-12 md:gap-24">
        {items.map(({ value, label }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <span
              className="font-serif text-5xl font-extrabold tabular-nums"
              style={{
                background:
                  "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              {value.toLocaleString("pt-BR")}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-ink-dim)]">
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
