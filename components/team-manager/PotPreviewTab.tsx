"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { PlayerSearchCard } from "@/components/team-manager/PlayerSearchCard";
import { cn } from "@/lib/utils";

type PotPlayer = {
  id: string;
  registrationId: string | null;
  name: string;
  overall: number;
  photo: string | null;
};

type DraftPotGroup = {
  pot_number: number;
  position: string;
  max_managers: number;
  players: PotPlayer[];
  average_overall: number;
};

type CatalogPlayer = {
  registrationId: string;
  position: string;
  isPurchased: boolean;
  purchasePrice: number | null;
};

type PotPreviewTabProps = {
  championshipId: string;
  searchQuery: string;
  favoriteIds: Set<string>;
  toggleFavorite: (registrationId: string) => void;
  catalogByRegistration: Map<string, CatalogPlayer>;
};

function positionHeaderClass(position: string) {
  const p = position.toUpperCase();
  if (p.includes("GOL")) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (p.includes("ZAG")) return "border-blue-500/40 bg-blue-500/10 text-blue-200";
  if (p.includes("MEIA")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (p.includes("ATA")) return "border-red-500/40 bg-red-500/10 text-red-200";
  return "border-zinc-600 bg-zinc-800/80 text-zinc-200";
}

export function PotPreviewTab({
  championshipId,
  searchQuery,
  favoriteIds,
  toggleFavorite,
  catalogByRegistration,
}: PotPreviewTabProps) {
  const [pots, setPots] = useState<DraftPotGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/draft/get-pots?championshipId=${encodeURIComponent(championshipId)}`,
      );
      const json = (await res.json()) as {
        pots?: DraftPotGroup[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Não foi possível carregar os potes");
        setPots([]);
        return;
      }
      const list = json.pots ?? [];
      list.forEach((pot) => {
        pot.players.sort((a, b) => b.overall - a.overall);
      });
      list.sort((a, b) => {
        if (a.pot_number !== b.pot_number) return a.pot_number - b.pot_number;
        return a.position.localeCompare(b.position, "pt-BR");
      });
      setPots(list);
    } catch {
      setError("Erro ao carregar os potes");
      setPots([]);
    } finally {
      setLoading(false);
    }
  }, [championshipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const q = searchQuery.trim().toLowerCase();

  const filteredPots = useMemo(() => {
    if (!q) return pots;
    return pots
      .map((pot) => ({
        ...pot,
        players: pot.players.filter((pl) =>
          pl.name.toLowerCase().includes(q),
        ),
      }))
      .filter((pot) => pot.players.length > 0);
  }, [pots, q]);

  if (loading) {
    return (
      <p className="text-center text-sm text-zinc-500 py-10">
        Carregando pré-visualização dos potes…
      </p>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-6 text-center text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (pots.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500 py-10 leading-relaxed">
        Ainda não há potes gerados para este campeonato. Quando a organização
        publicar o chapeamento, a distribuição dos jogadores por pote aparecerá
        aqui.
      </p>
    );
  }

  if (filteredPots.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500 py-10">
        Nenhum jogador nos potes corresponde à busca.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Pré-visualização do chapeamento: cada bloco mostra os jogadores sorteados
        para aquele pote e posição. Use a busca acima para filtrar por nome.
      </p>

      {filteredPots.map((pot) => (
        <section
          key={`${pot.position}-${pot.pot_number}`}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
        >
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 px-3 py-2.5",
              positionHeaderClass(pot.position),
            )}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 className="text-sm font-semibold tracking-tight">
                Pote {pot.pot_number}
              </h2>
              <span className="text-xs font-medium opacity-90">
                {pot.position}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] tabular-nums opacity-90">
              <span>Média OVR {pot.average_overall}</span>
              {pot.max_managers > 0 && (
                <span className="text-zinc-400">
                  · até {pot.max_managers} cartolas
                </span>
              )}
            </div>
          </div>

          <div className="p-2 space-y-2">
            {pot.players.map((pl) => {
              const rid = pl.registrationId;
              const meta = rid ? catalogByRegistration.get(rid) : undefined;
              const positionLabel = meta?.position ?? pot.position;

              if (rid) {
                return (
                  <PlayerSearchCard
                    key={`${pot.pot_number}-${pot.position}-${rid}`}
                    name={pl.name}
                    position={positionLabel}
                    overall={pl.overall ?? null}
                    photoUrl={pl.photo}
                    isPurchased={meta?.isPurchased ?? false}
                    purchasePrice={meta?.purchasePrice ?? null}
                    isFavorite={favoriteIds.has(rid)}
                    onToggleFavorite={() => toggleFavorite(rid)}
                  />
                );
              }

              return (
                <div
                  key={`${pot.pot_number}-${pot.position}-${pl.id}`}
                  className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 p-3 opacity-90"
                >
                  <div className="w-11 h-11 rounded-full bg-zinc-800 border border-zinc-600 overflow-hidden shrink-0">
                    {pl.photo ? (
                      <Image
                        src={pl.photo}
                        alt={pl.name}
                        width={44}
                        height={44}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
                        ?
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{pl.name}</p>
                    <p className="text-[11px] text-zinc-500">
                      Sem inscrição no campeonato — favoritos indisponíveis
                    </p>
                  </div>
                  <div className="text-base font-bold tabular-nums text-zinc-300 w-10 text-center">
                    {pl.overall || "–"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
