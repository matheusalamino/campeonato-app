import type { PodiumEntry } from "@/lib/landing/queries";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import PlayerAvatar from "@/components/landing/PlayerAvatar";
import TeamLogo from "@/components/landing/TeamLogo";

interface PodiumBlockProps {
  championshipName: string;
  podium: PodiumEntry[];
  rankings: PublicRankings;
  isAllEditions: boolean;
}

const PLACE_CONFIG = {
  1: { height: "h-28", border: "2px solid var(--gala-gold-2)", bg: "linear-gradient(135deg, rgba(212,160,23,0.15), rgba(5,5,7,0.95))", shadow: "0 0 24px rgba(212,160,23,0.2)", label: "🏆 Campeão", labelColor: "var(--gala-gold-1)" },
  2: { height: "h-20", border: "1px solid var(--gala-line)", bg: "var(--gala-bg-1)", shadow: undefined, label: "🥈 2º Lugar", labelColor: "var(--gala-ink-dim)" },
  3: { height: "h-16", border: "1px solid var(--gala-line)", bg: "var(--gala-bg-1)", shadow: undefined, label: "🥉 3º Lugar", labelColor: "var(--gala-ink-dim)" },
} as const;

export default function PodiumBlock({
  championshipName,
  podium,
  rankings,
  isAllEditions,
}: PodiumBlockProps) {
  const first = podium.find((p) => p.place === 1);
  const second = podium.find((p) => p.place === 2);
  const third = podium.find((p) => p.place === 3);

  const artilheiro = rankings.topScorers[0] ?? null;
  const maestro = rankings.topAssists[0] ?? null;
  const craque = rankings.craque[0] ?? null;
  const goleiro = rankings.goalkeepers[0] ?? null;
  const revelacao = rankings.revelations[0] ?? null;

  const prizes = [
    { label: "Artilheiro", player: artilheiro, detail: artilheiro ? `${artilheiro.value} ⚽` : null },
    { label: "Maestro", player: maestro, detail: maestro ? `${maestro.value} 🎯` : null },
    { label: "Melhor Jogador", player: craque, detail: null },
    { label: "Melhor Goleiro", player: goleiro, detail: goleiro?.detail ?? null },
    { label: "Revelação", player: revelacao, detail: null },
  ];

  return (
    <div
      className="w-full px-8 py-8 md:px-10"
      style={{ borderBottom: "1px solid var(--gala-line)" }}
    >
      <p className="mb-6 text-[9px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
        {championshipName}
      </p>

      {/* Podium — only when a specific edition is selected */}
      {!isAllEditions && (
        <div className="mb-8 flex items-end justify-center gap-4">
          {second ? (
            <PodiumCard place={2} teamName={second.teamName} logoUrl={second.logoUrl} />
          ) : (
            <div className="w-36" />
          )}
          {first ? (
            <PodiumCard place={1} teamName={first.teamName} logoUrl={first.logoUrl} />
          ) : (
            <div className="w-44 h-28 rounded-xl flex items-center justify-center" style={{ border: "2px dashed var(--gala-line)" }}>
              <p className="text-xs text-[var(--gala-ink-dim)]">A definir</p>
            </div>
          )}
          {third ? (
            <PodiumCard place={3} teamName={third.teamName} logoUrl={third.logoUrl} />
          ) : (
            <div className="w-32" />
          )}
        </div>
      )}

      {/* Prize strip — always visible */}
      <div className="flex flex-wrap gap-3">
        {prizes.map(({ label, player, detail }) => (
          <div
            key={label}
            className="flex-1 min-w-[140px] rounded-xl p-4 flex flex-col gap-2"
            style={{
              background: "rgba(212,160,23,0.06)",
              border: "1px solid rgba(212,160,23,0.15)",
            }}
          >
            <p className="text-[8px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">
              {label}
            </p>
            {player ? (
              <div className="flex items-center gap-2">
                <PlayerAvatar
                  photoUrl={player.photoUrl ?? null}
                  name={player.playerName}
                  sizeClass="h-8 w-8"
                  textSizeClass="text-[9px]"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">{player.playerName}</p>
                  {detail && (
                    <p className="text-[10px] text-[var(--gala-gold-2)] font-black">{detail}</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--gala-ink-dim)]">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PodiumCard({ place, teamName, logoUrl }: { place: 1 | 2 | 3; teamName: string; logoUrl: string | null }) {
  const cfg = PLACE_CONFIG[place];
  const widthClass = place === 1 ? "w-44" : place === 2 ? "w-36" : "w-32";
  const logoSize = place === 1 ? 40 : 32;
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`${widthClass} ${cfg.height} rounded-xl flex flex-col items-center justify-center gap-2 px-3`}
        style={{ background: cfg.bg, border: cfg.border, boxShadow: cfg.shadow }}
      >
        <TeamLogo logoUrl={logoUrl} name={teamName} size={logoSize} />
        <p
          className="text-center font-black text-sm leading-tight"
          style={{ color: place === 1 ? "var(--gala-gold-1)" : "var(--gala-ink)" }}
        >
          {teamName}
        </p>
      </div>
      <p className="text-[9px] font-black uppercase tracking-[1px]" style={{ color: cfg.labelColor }}>
        {cfg.label}
      </p>
    </div>
  );
}
