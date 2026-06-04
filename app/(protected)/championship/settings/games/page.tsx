"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCircle2, ChevronRight, Gamepad2, Shield } from "lucide-react";
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
        "flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3",
        muted
          ? "border-dashed border-zinc-700 bg-zinc-900/70 text-zinc-400"
          : "border-zinc-800 bg-zinc-900 text-white",
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 sm:h-11 sm:w-11">
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
          "min-w-0 truncate text-sm font-medium uppercase tracking-wide",
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
    <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
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
            <CardHeader className="border-b border-zinc-800 px-4 py-4 sm:px-6">
              <CardTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                <CalendarDays className="h-5 w-5 text-zinc-500" />
                <span className="truncate">{phase.name}</span>
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-4 px-4 pt-4 sm:px-6 sm:pt-6">
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

                const isCompleted = match.status === "COMPLETED";

                return (
                  <div
                    key={match.id}
                    className={cn(
                      "rounded-xl border p-3 transition-all duration-300 sm:p-4",
                      isCompleted 
                        ? "border-emerald-700/40 bg-emerald-950/15 shadow-inner" 
                        : "border-zinc-800 bg-zinc-900/60"
                    )}
                  >
                    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold sm:text-base">
                          {match.matchName ?? match.matchCode ?? "Confronto"}
                          {currentFinal && <span className="text-[10px] uppercase tracking-widest bg-yellow-500 text-black px-1.5 py-0.5 rounded font-black">FINAL</span>}
                          {isCompleted && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                              <CheckCircle2 className="h-3 w-3" />
                              FINALIZADO
                            </span>
                          )}
                        </h2>
                        <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                          {match.matchCode ?? "SEM CODIGO"}
                          {" • "}
                          Rodada {currentRound}
                        </p>
                      </div>

                      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:text-right lg:text-zinc-500">
                        {match.scheduledAt
                          ? `Agendado em ${new Date(match.scheduledAt).toLocaleString("pt-BR")}`
                          : "Sem data e horário definidos"}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
                      <TeamBadge
                        label={match.home.label}
                        logoUrl={match.home.logoUrl}
                        muted={match.home.type !== "team"}
                      />

                      <div className="flex flex-col items-center justify-center py-1 text-zinc-500">
                        {match.status !== "NOT_STARTED" ? (
                          <div
                            className={cn(
                              "flex items-center gap-3 rounded-full border px-4 py-1.5 font-mono text-lg font-black tracking-wider shadow-md",
                              isCompleted
                                ? "border-emerald-500/30 bg-emerald-950/60 text-emerald-100"
                                : "border-zinc-800 bg-zinc-950 text-white",
                            )}
                          >
                            <span>{match.homeScore ?? 0}</span>
                            <span className="text-zinc-600 text-xs">x</span>
                            <span>{match.awayScore ?? 0}</span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center">
                            <ChevronRight className="h-4 w-4 rotate-90 lg:rotate-0" />
                            <span className="px-2 text-xs font-semibold uppercase tracking-[0.3em]">
                              VS
                            </span>
                            <ChevronRight className="hidden h-4 w-4 rotate-180 lg:block" />
                          </div>
                        )}
                      </div>

                      <TeamBadge
                        label={match.away.label}
                        logoUrl={match.away.logoUrl}
                        muted={match.away.type !== "team"}
                      />
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-[minmax(0,2fr)_minmax(6rem,1fr)] lg:flex lg:items-end lg:gap-3">
                      <div className="w-full space-y-2 lg:max-w-sm">
                        <label className="text-xs uppercase tracking-[0.18em] text-zinc-500 block">
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
                          className="border-zinc-700 bg-zinc-950 text-white w-full"
                        />
                      </div>

                      <div className="w-full space-y-2 lg:w-24">
                        <label className="text-xs uppercase tracking-[0.18em] text-zinc-500 block">
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
                          className="border-zinc-700 bg-zinc-950 text-white w-full"
                        />
                      </div>

                      <div className="flex flex-col justify-end space-y-2 sm:col-span-2 lg:col-span-1 lg:pb-2">
                        <label className="flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 px-3 lg:border-0 lg:bg-transparent lg:px-0">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded bg-zinc-900 border-zinc-700 accent-yellow-500"
                            checked={currentFinal}
                            onChange={(e) => setFinalDrafts(current => ({ ...current, [match.id]: e.target.checked }))}
                          />
                          <span className="text-xs uppercase tracking-[0.18em] text-zinc-400 font-bold">É Final?</span>
                        </label>
                      </div>

                      <div className="flex w-full flex-col gap-2 sm:col-span-2 sm:flex-row lg:col-span-1 lg:ml-auto lg:w-auto">
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
                          className="w-full sm:flex-1 lg:w-auto lg:flex-none"
                        >
                          {savingId === match.id ? "Salvando..." : "Salvar"}
                        </Button>

                        <Link
                          href={`/games/${match.id}`}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 sm:flex-1 lg:w-auto lg:flex-none"
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
