"use client";

import { useState } from "react";
import type { Champion, PodiumEntry } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import TeamLogo from "@/components/landing/TeamLogo";
import BracketSection from "@/components/landing/BracketSection";
import DisciplineTab from "@/components/landing/DisciplineTab";
import PremiosTab from "@/components/landing/PremiosTab";
import MobileStandingsTab from "@/components/mobile/tabs/MobileStandingsTab";
import MobileFilteredRankingsTab from "@/components/mobile/tabs/MobileFilteredRankingsTab";

type TabId = "classificacao" | "bracket" | "estatisticas" | "disciplina" | "premios";

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "classificacao", icon: "🗂️", label: "Class." },
  { id: "bracket", icon: "🗓️", label: "Bracket" },
  { id: "estatisticas", icon: "📊", label: "Stats" },
  { id: "disciplina", icon: "🟨", label: "Discipl." },
  { id: "premios", icon: "🏅", label: "Prêmios" },
];

interface Props {
  tournamentTitle: string;
  editions: Champion[];
  initialPodium: PodiumEntry[];
}

export default function MobileTournamentShell({ tournamentTitle: _tournamentTitle, editions, initialPodium }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(editions[0]?.id ?? null);
  const [tab, setTab] = useState<TabId>("classificacao");

  const isAllEditions = selectedId === null;
  const { rankings, loading } = usePublicRankings(selectedId, 5);

  const selectedEdition = editions.find((e) => e.id === selectedId) ?? null;
  const first = initialPodium.find((p) => p.place === 1);
  const second = initialPodium.find((p) => p.place === 2);
  const third = initialPodium.find((p) => p.place === 3);

  return (
    <div>
      {/* Edition chip row — sticky below LandingHeader (53px) */}
      <div
        className="sticky top-[53px] z-40 flex gap-2 overflow-x-auto px-4 py-3"
        style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}
      >
        <ChipButton label="Todos" active={selectedId === null} onClick={() => { setSelectedId(null); setTab("classificacao"); }} />
        {editions.map((e) => (
          <ChipButton
            key={e.id}
            label={e.season ?? e.name}
            active={selectedId === e.id}
            onClick={() => { setSelectedId(e.id); setTab("classificacao"); }}
          />
        ))}
      </div>

      {/* Champion strip — only shown for editions[0] since initialPodium is fetched for that edition */}
      {!isAllEditions && selectedId === (editions[0]?.id ?? null) && first && (
        <div
          className="px-4 py-3"
          style={{
            background: "linear-gradient(180deg, rgba(212,160,23,0.06), transparent)",
            borderBottom: "1px solid var(--gala-line)",
          }}
        >
          <p className="mb-1.5 text-[8px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            {selectedEdition?.name}{selectedEdition?.season ? ` · ${selectedEdition.season}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <TeamLogo logoUrl={first.logoUrl} name={first.teamName} size={28} />
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase text-[var(--gala-gold-2)]">🏆 Campeão</p>
                <p className="truncate text-sm font-black text-white">{first.teamName}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {second && (
                <div
                  className="rounded-lg px-2.5 py-1.5 text-center"
                  style={{ background: "var(--gala-panel)", border: "1px solid var(--gala-line)" }}
                >
                  <p className="text-[7px] font-black text-[var(--gala-ink-dim)]">🥈 2º</p>
                  <p className="max-w-[60px] truncate text-[10px] font-black text-[var(--gala-ink)]">{second.teamName}</p>
                </div>
              )}
              {third && (
                <div
                  className="rounded-lg px-2.5 py-1.5 text-center"
                  style={{ background: "var(--gala-panel)", border: "1px solid var(--gala-line)" }}
                >
                  <p className="text-[7px] font-black text-[var(--gala-ink-dim)]">🥉 3º</p>
                  <p className="max-w-[60px] truncate text-[10px] font-black text-[var(--gala-ink)]">{third.teamName}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab content — pb-24 clears the fixed bottom nav */}
      <div className="px-4 py-4 pb-24">
        {isAllEditions ? (
          <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">
            Selecione uma edição acima para ver classificação, artilheiros, bracket e prêmios.
          </p>
        ) : loading && rankings.players.length === 0 && (tab === "estatisticas" || tab === "disciplina" || tab === "premios") ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "classificacao" && selectedId ? (
          <MobileStandingsTab championshipId={selectedId} />
        ) : tab === "bracket" && selectedId ? (
          <BracketSection championshipId={selectedId} />
        ) : tab === "estatisticas" ? (
          <MobileFilteredRankingsTab key={selectedId} rankings={rankings} />
        ) : tab === "disciplina" ? (
          <DisciplineTab rankings={rankings} />
        ) : (
          <PremiosTab rankings={rankings} />
        )}
      </div>

      {/* Bottom navigation — fixed, only when an edition is selected */}
      {!isAllEditions && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex"
          style={{ background: "#0d0b17", borderTop: "1px solid var(--gala-line)", paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[7px] font-black uppercase tracking-[0.04em] transition-colors"
              style={{ color: tab === t.id ? "var(--gala-gold-1)" : "var(--gala-ink-dim)" }}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all"
      style={
        active
          ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
          : { background: "var(--gala-panel)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
      }
    >
      {label}
    </button>
  );
}
