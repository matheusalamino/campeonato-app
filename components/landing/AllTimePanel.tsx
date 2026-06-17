import PlayerAvatar from "@/components/landing/PlayerAvatar";
import type { AllTimeScorer, MostTitlesTeam, Champion } from "@/lib/landing/queries";

interface AllTimePanelProps {
  topScorers: AllTimeScorer[];
  mostTitlesTeams: MostTitlesTeam[];
  hallOfChampions: Champion[];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
      {children}
    </p>
  );
}

export default function AllTimePanel({
  topScorers,
  mostTitlesTeams,
  hallOfChampions,
}: AllTimePanelProps) {
  return (
    <aside className="flex flex-col gap-8">
      {/* Artilheiros de todos os tempos */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Artilheiros Históricos</SectionTitle>
        {topScorers.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">Sem dados ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topScorers.map((scorer, i) => (
              <li key={scorer.playerName} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <PlayerAvatar
                  photoUrl={scorer.photoUrl}
                  name={scorer.playerName}
                  sizeClass="h-6 w-6"
                  textSizeClass="text-[8px]"
                  isFirst={i === 0}
                />
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">{scorer.playerName}</span>
                <span className="font-black tabular-nums text-[var(--gala-gold-2)]">
                  {scorer.totalGoals} ⚽
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mais títulos */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Mais Títulos</SectionTitle>
        {mostTitlesTeams.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">Sem dados ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mostTitlesTeams.map((team, i) => (
              <li key={team.teamName} className="flex items-center gap-3">
                <span className="w-5 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-white">{team.teamName}</span>
                <span className="flex items-center gap-2 text-xs font-black text-[var(--gala-gold-2)]">
                  {team.titles}× 🏆
                </span>
                <span className="flex gap-1">
                  {team.championsLeague > 0 && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.2)", color: "var(--gala-gold-2)" }}>
                      CL {team.championsLeague}×
                    </span>
                  )}
                  {team.copaDomundo > 0 && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black" style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }}>
                      CM {team.copaDomundo}×
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hall dos Campeões */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Hall dos Campeões</SectionTitle>
        {hallOfChampions.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">Nenhum campeonato ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hallOfChampions.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
              >
                <span className="text-xs font-black text-[var(--gala-gold-2)] w-10 shrink-0">
                  {c.season ?? "—"}
                </span>
                {c.tournamentType && (
                  <span className="text-[8px] font-black rounded px-1.5 py-0.5 shrink-0"
                    style={
                      c.tournamentType === "champions_league"
                        ? { background: "rgba(212,160,23,0.12)", border: "1px solid rgba(212,160,23,0.2)", color: "var(--gala-gold-2)" }
                        : { background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.2)", color: "#60a5fa" }
                    }
                  >
                    {c.tournamentType === "champions_league" ? "🏆 CL" : "🌍 CM"}
                  </span>
                )}
                <span className="flex-1 truncate text-sm font-bold text-white">
                  {c.championName ?? <span className="font-normal text-[var(--gala-ink-dim)]">A definir</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
