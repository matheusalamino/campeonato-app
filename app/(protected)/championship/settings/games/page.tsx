"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Shield, Gamepad2 } from "lucide-react";
import { toast } from "sonner";
import { useChampionship } from "@/components/ChampionshipContext";
import {
  toDateTimeLocalValue,
  useChampionshipMatches,
} from "@/features/hooks/useChampionshipMatches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function TeamBadge({
  label,
  logoUrl,
  muted = false,
}: {
  label: string;
  logoUrl: string | null;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-3 py-3",
        muted
          ? "border-dashed border-zinc-700 bg-zinc-900/70 text-zinc-400"
          : "border-zinc-800 bg-zinc-900 text-white",
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-zinc-800">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : (
          <Shield className="h-5 w-5 text-zinc-500" />
        )}
      </div>

      <span
        className={cn(
          "text-sm font-medium uppercase tracking-wide",
          muted && "text-zinc-400",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export default function ChampionshipGamesSettingsPage() {
  const { championship } = useChampionship();
  const { groups, loading, saveMatchDetails } = useChampionshipMatches(
    championship?.id ?? null,
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [roundDrafts, setRoundDrafts] = useState<Record<string, number>>({});
  const [finalDrafts, setFinalDrafts] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (!championship) {
    return (
      <div className="p-6 text-zinc-400">Selecione um campeonato no menu lateral</div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-1">
        <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
          Configurações
        </p>
        <h1 className="text-2xl font-bold">Jogos</h1>
        <p className="text-sm text-zinc-400">
          Visualize todos os confrontos previstos e defina a data e o horário de
          cada partida.
        </p>
      </div>

      {loading && (
        <Card className="border-zinc-800 bg-zinc-950 text-white">
          <CardContent className="py-6 text-zinc-400">Carregando jogos...</CardContent>
        </Card>
      )}

      {!loading && groups.length === 0 && (
        <Card className="border-zinc-800 bg-zinc-950 text-white">
          <CardContent className="py-6 text-zinc-400">
            Nenhuma fase foi cadastrada para este campeonato.
          </CardContent>
        </Card>
      )}

      {!loading &&
        groups.map((phase) => (
          <Card
            key={phase.id}
            className="border-zinc-800 bg-zinc-950 text-white shadow-none"
          >
            <CardHeader className="border-b border-zinc-800">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-zinc-500" />
                {phase.name}
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 pt-6">
              {phase.matches.length === 0 && (
                <div className="rounded-lg border border-dashed border-zinc-800 px-4 py-5 text-sm text-zinc-500">
                  Nenhum confronto gerado para esta fase.
                </div>
              )}

              {phase.matches.map((match) => {
                const currentValue =
                  drafts[match.id] ?? toDateTimeLocalValue(match.scheduledAt);
                const currentRound = roundDrafts[match.id] ?? match.roundNumber ?? 1;
                const currentFinal = finalDrafts[match.id] ?? match.isFinal ?? false;

                const hasChanges =
                  currentValue !== toDateTimeLocalValue(match.scheduledAt) ||
                  currentRound !== (match.roundNumber ?? 1) ||
                  currentFinal !== (match.isFinal ?? false);

                return (
                  <div
                    key={match.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-base font-semibold flex items-center gap-2">
                          {match.matchName ?? match.matchCode ?? "Confronto"}
                          {currentFinal && <span className="text-[10px] uppercase tracking-widest bg-yellow-500 text-black px-1.5 py-0.5 rounded font-black">FINAL</span>}
                        </h2>
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {match.matchCode ?? "SEM CODIGO"}
                          {" • "}
                          Rodada {currentRound}
                        </p>
                      </div>

                      <div className="text-xs text-zinc-500">
                        {match.scheduledAt
                          ? `Agendado em ${new Date(match.scheduledAt).toLocaleString("pt-BR")}`
                          : "Sem data e horário definidos"}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
                      <TeamBadge
                        label={match.home.label}
                        logoUrl={match.home.logoUrl}
                        muted={match.home.type !== "team"}
                      />

                      <div className="flex items-center justify-center text-zinc-500">
                        <ChevronRight className="h-4 w-4 rotate-90 md:rotate-0" />
                        <span className="px-2 text-xs font-semibold uppercase tracking-[0.3em]">
                          VS
                        </span>
                        <ChevronRight className="h-4 w-4 rotate-180 md:block hidden" />
                      </div>

                      <TeamBadge
                        label={match.away.label}
                        logoUrl={match.away.logoUrl}
                        muted={match.away.type !== "team"}
                      />
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-zinc-800 pt-4 md:flex-row md:items-end">
                      <div className="w-full max-w-sm space-y-2">
                        <label className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Data e horário
                        </label>
                        <Input
                          type="datetime-local"
                          value={currentValue}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [match.id]: event.target.value,
                            }))
                          }
                          className="border-zinc-700 bg-zinc-950 text-white"
                        />
                      </div>

                      <div className="w-24 space-y-2">
                        <label className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          Rodada
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={currentRound}
                          onChange={(event) =>
                            setRoundDrafts((current) => ({
                              ...current,
                              [match.id]: parseInt(event.target.value) || 1,
                            }))
                          }
                          className="border-zinc-700 bg-zinc-950 text-white"
                        />
                      </div>

                      <div className="w-auto space-y-2 flex flex-col justify-end pb-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-yellow-500"
                            checked={currentFinal}
                            onChange={(e) => setFinalDrafts(current => ({ ...current, [match.id]: e.target.checked }))}
                          />
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-400 font-bold">É Final?</span>
                        </label>
                      </div>

                      <div className="flex gap-2 md:ml-auto">
                        <Button
                          type="button"
                          disabled={!hasChanges || savingId === match.id}
                          onClick={async () => {
                            setSavingId(match.id);
                            const { error } = await saveMatchDetails(
                              match.id,
                              currentValue,
                              currentRound,
                              currentFinal
                            );
                            setSavingId(null);
                            if (error) { toast.error(error); return; }
                            setDrafts((current) => ({ ...current, [match.id]: currentValue }));
                            setRoundDrafts((current) => ({ ...current, [match.id]: currentRound }));
                            setFinalDrafts((current) => ({ ...current, [match.id]: currentFinal }));
                            toast.success("Dados do jogo salvos");
                          }}
                        >
                          {savingId === match.id ? "Salvando..." : "Salvar"}
                        </Button>

                        <Link
                          href={`/games/${match.id}`}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-all"
                        >
                          <Gamepad2 className="h-4 w-4" />
                          Súmula
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
