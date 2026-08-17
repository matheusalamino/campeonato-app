"use client";

import { useState } from "react";
import type { Champion, PodiumEntry } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import TournamentSidebar from "@/components/landing/TournamentSidebar";
import PodiumBlock from "@/components/landing/PodiumBlock";
import TournamentTabs from "@/components/landing/TournamentTabs";

interface TournamentPageShellProps {
  tournamentTitle: string;
  editions: Champion[];
  initialPodium: PodiumEntry[];
}

export default function TournamentPageShell({
  tournamentTitle,
  editions,
  initialPodium,
}: TournamentPageShellProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    editions[0]?.id ?? null,
  );

  const isAllEditions = selectedId === null;
  const selectedEdition = editions.find((e) => e.id === selectedId) ?? null;

  const { rankings, loading } = usePublicRankings(selectedId, 5);

  const podium = isAllEditions ? [] : initialPodium;

  const blockTitle = isAllEditions
    ? `${tournamentTitle} · Todos os anos`
    : selectedEdition
    ? `${selectedEdition.name}${selectedEdition.season ? ` · ${selectedEdition.season}` : ""}`
    : tournamentTitle;

  return (
    <div className="flex min-h-screen">
      <TournamentSidebar
        title={tournamentTitle}
        editions={editions}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        <PodiumBlock
          championshipName={blockTitle}
          podium={podium}
          rankings={rankings}
          isAllEditions={isAllEditions}
        />

        {!isAllEditions && selectedId && (
          <TournamentTabs
            championshipId={selectedId}
            rankings={rankings}
            loading={loading}
          />
        )}

        {isAllEditions && (
          <div className="px-6 py-10 md:px-10">
            <p className="text-sm text-[var(--gala-ink-dim)]">
              Selecione uma edição na barra lateral para ver classificação, artilheiros, bracket e prêmios.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
