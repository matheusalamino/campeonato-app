import type { Champion } from "@/lib/landing/queries";

interface HeroSectionProps {
  recentChampions: Champion[];
}

export default function HeroSection({ recentChampions }: HeroSectionProps) {
  return (
    <section className="gala-beams relative overflow-hidden px-6 py-20 md:px-10">
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* Left: LIFAS story */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Liga de Futebol Adventista de Sorocaba
          </p>
          <h1
            className="mt-3 font-serif text-4xl font-extrabold leading-tight sm:text-5xl"
            style={{
              background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            The Official Record of Sorocaba Football
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--gala-ink-dim)]">
            Every match. Every goal. Every season — preserved.
          </p>
          <a
            href="/statistics"
            className="mt-8 inline-block rounded-lg px-6 py-3 text-sm font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
            }}
          >
            View Championships →
          </a>
        </div>

        {/* Right: recent champions panel */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
            border: "1px solid var(--gala-line)",
          }}
        >
          <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Recent Champions
          </p>
          {recentChampions.length === 0 ? (
            <p className="text-sm text-[var(--gala-ink-dim)]">No championships recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentChampions.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center gap-4 rounded-xl px-4 py-3"
                  style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                    style={{
                      background: i === 0
                        ? "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))"
                        : "var(--gala-panel)",
                      color: i === 0 ? "#050507" : "var(--gala-gold-2)",
                      border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
                    }}
                  >
                    {i === 0 ? "🏆" : c.season ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {c.championName ?? "—"}
                    </p>
                    <p className="text-[10px] text-[var(--gala-ink-dim)]">
                      {c.name}{c.season ? ` · ${c.season}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Gold dust particles */}
      {[...Array(6)].map((_, i) => (
        <span
          key={i}
          className="gala-dust"
          style={{
            left: `${10 + i * 15}%`,
            width: `${3 + (i % 3)}px`,
            height: `${3 + (i % 3)}px`,
            animationDuration: `${8 + i * 3}s`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}
    </section>
  );
}
