"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { SlidersHorizontal } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PlayerRadar from "@/components/PlayerRadar";
import type { PublicPlayer, PublicPlayerStats } from "@/lib/public/types";
import { POSITION_LABELS } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { sumVotePoints } from "@/lib/public/match-stats";

const supabase = createClient();
type SkillRow = { registration_id: string; skill: string; rating: number };

const EMPTY_STATS: Omit<PublicPlayerStats, "registrationId"> = {
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
  decisiveSaves: 0, penaltySaves: 0, fouls: 0, matchesPlayed: 0, minutesPlayed: 0,
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function MobilePlayersTab({
  championshipId,
  rankings,
}: {
  championshipId: string;
  rankings: PublicRankings;
}) {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingTeam, setPendingTeam] = useState("all");
  const [pendingPosition, setPendingPosition] = useState("all");
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [skillsData, setSkillsData] = useState<{ regId: string; rows: SkillRow[] } | null>(null);
  const [votePoints, setVotePoints] = useState<Map<string, number>>(new Map());

  // Fix 3: refs to preserve dialog content during Radix close animation
  const dialogPlayer = useRef<PublicPlayer | null>(null);
  const dialogStats = useRef<PublicPlayerStats | null>(null);

  // Fix 4: cancelled guard for votePoints fetch
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("best_player_votes").select("registration_id, points")
        .eq("championship_id", championshipId);
      if (!cancelled) setVotePoints(sumVotePoints(data ?? []));
    })();
    return () => { cancelled = true; };
  }, [championshipId]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("public_player_skills").select("registration_id, skill, rating")
        .eq("registration_id", selected.registrationId);
      if (!cancelled) setSkillsData({ regId: selected.registrationId, rows: (data ?? []) as SkillRow[] });
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const skills = selected && skillsData?.regId === selected.registrationId ? skillsData.rows : [];
  const statsById = useMemo(
    () => new Map(rankings.stats.map((s) => [s.registrationId, s])),
    [rankings.stats],
  );
  const teams = useMemo(
    () => [...new Set(rankings.players.map((p) => p.teamName).filter(Boolean))].sort() as string[],
    [rankings.players],
  );
  const positions = useMemo(
    () => [...new Set(rankings.players.map((p) => p.position).filter(Boolean))].sort() as string[],
    [rankings.players],
  );

  const filtered = useMemo(
    () =>
      rankings.players.filter((p) => {
        if (team !== "all" && p.teamName !== team) return false;
        if (position !== "all" && p.position !== position) return false;
        if (search.trim()) {
          const q = normalize(search);
          const hay = normalize(`${p.playerName} ${p.officialName ?? ""} ${p.teamName ?? ""}`);
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [rankings.players, team, position, search],
  );

  const selStats = selected
    ? statsById.get(selected.registrationId) ?? { registrationId: selected.registrationId, ...EMPTY_STATS }
    : null;

  // Fix 3: update refs when we have real data
  if (selected) dialogPlayer.current = selected;
  if (selStats) dialogStats.current = selStats;

  function openSheet() {
    setPendingTeam(team);
    setPendingPosition(position);
    setSheetOpen(true);
  }

  function applyFilters() {
    setTeam(pendingTeam);
    setPosition(pendingPosition);
    setSheetOpen(false);
  }

  const activeFilterCount = (team !== "all" ? 1 : 0) + (position !== "all" ? 1 : 0);
  const pendingFilterCount = (pendingTeam !== "all" ? 1 : 0) + (pendingPosition !== "all" ? 1 : 0);

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar jogador…"
          className="flex-1 rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-sm placeholder-[#665f73] outline-none focus:border-[var(--gala-gold-3)]"
        />
        <button
          type="button"
          onClick={openSheet}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-black uppercase tracking-wide transition-all"
          style={{
            background: activeFilterCount > 0 ? "rgba(212,160,23,0.12)" : "var(--gala-bg-1)",
            border: activeFilterCount > 0 ? "1px solid var(--gala-gold-2)" : "1px solid var(--gala-line)",
            color: activeFilterCount > 0 ? "var(--gala-gold-2)" : "var(--gala-ink-dim)",
          }}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeFilterCount > 0 ? activeFilterCount : ""}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.map((p) => {
          const s = statsById.get(p.registrationId);
          return (
            <button
              key={p.registrationId}
              type="button"
              onClick={() => setSelected(p)}
              className="gala-panel flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-[var(--gala-gold-3)]/60"
            >
              {p.photoUrl ? (
                <Image
                  src={p.photoUrl}
                  alt={p.playerName}
                  width={44}
                  height={44}
                  className="size-11 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#2a2438] text-xs font-extrabold">
                  {p.playerName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.playerName}</span>
                <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                  <span>{(p.position && (POSITION_LABELS[p.position] ?? p.position)) ?? "—"} ·</span>
                  <span className="truncate">{p.teamName ?? "—"}</span>
                </span>
              </span>
              <span className="shrink-0 text-right text-[10px] text-[var(--gala-ink-dim)]">
                <b className="block text-base text-[var(--gala-gold-2)]">{s?.goals ?? 0}</b> gols
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador encontrado.</p>
        )}
      </div>

      {/* Fix 1: Radix Sheet replacing hand-rolled div sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-2xl border-t border-zinc-800 bg-zinc-900 pb-8"
        >
          <SheetHeader className="mb-4 flex-row items-center justify-between px-5 pt-5 pb-0">
            <SheetTitle className="text-sm font-black uppercase tracking-widest text-white">Filtros</SheetTitle>
          </SheetHeader>
          <div className="space-y-5 px-5">
            <div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Time</p>
              <div className="flex flex-wrap gap-2">
                {[{ val: "all", label: "Todos" }, ...teams.map((t) => ({ val: t, label: t }))].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPendingTeam(val)}
                    className="rounded-full px-3 py-1 text-[10px] font-bold transition-all"
                    style={
                      pendingTeam === val
                        ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                        : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[9px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">Posição</p>
              <div className="flex flex-wrap gap-2">
                {[{ val: "all", label: "Todas" }, ...positions.map((pos) => ({ val: pos, label: POSITION_LABELS[pos] ?? pos }))].map(({ val, label }) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setPendingPosition(val)}
                    className="rounded-full px-3 py-1 text-[10px] font-bold transition-all"
                    style={
                      pendingPosition === val
                        ? { background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-2)", color: "var(--gala-gold-2)" }
                        : { background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)", color: "var(--gala-ink-dim)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 flex gap-3 px-5">
            {/* Fix 2: Limpar commits immediately */}
            <button
              type="button"
              onClick={() => {
                setPendingTeam("all");
                setPendingPosition("all");
                setTeam("all");
                setPosition("all");
                setSheetOpen(false);
              }}
              className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold uppercase tracking-wider text-zinc-400 transition-all hover:bg-zinc-800"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="flex-[2] rounded-xl bg-amber-600 py-3 text-sm font-black uppercase tracking-wider text-white transition-all hover:bg-amber-500"
            >
              Aplicar{pendingFilterCount > 0 ? ` (${pendingFilterCount})` : ""}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Fix 3: use refs to avoid blank flash during close animation */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md border-[var(--gala-line)] bg-[#0c0a10] text-white">
          {dialogPlayer.current && dialogStats.current ? (
            <div>
              <div className="flex items-center gap-3">
                {dialogPlayer.current.photoUrl ? (
                  <Image src={dialogPlayer.current.photoUrl} alt={dialogPlayer.current.playerName} width={56} height={56} className="size-14 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-base font-black text-[#0b0a12]">
                    {dialogPlayer.current.playerName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-lg font-extrabold">{dialogPlayer.current.playerName}</DialogTitle>
                  <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                    <span>{(dialogPlayer.current.position && (POSITION_LABELS[dialogPlayer.current.position] ?? dialogPlayer.current.position)) ?? "—"} ·</span>
                    <span>{dialogPlayer.current.teamName ?? "—"}</span>
                  </p>
                </div>
                {dialogPlayer.current.finalOverall !== null ? (
                  <div className="rounded-lg border border-[rgba(212,160,23,.4)] bg-[#171320] px-3 py-1.5 text-center">
                    <span className="gala-gold-text block font-serif text-xl font-extrabold">{dialogPlayer.current.finalOverall}</span>
                    <span className="text-[8px] tracking-[2px] text-[var(--gala-ink-dim)]">OVERALL</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {([
                  ["Gols", dialogStats.current.goals], ["Assist.", dialogStats.current.assists],
                  ["Pts Craque", votePoints.get(dialogPlayer.current.registrationId) ?? 0],
                  ["🟨 Amarelos", dialogStats.current.yellowCards], ["🟥 Vermelhos", dialogStats.current.redCards],
                  ["Faltas", dialogStats.current.fouls],
                  ["Defesas", dialogStats.current.decisiveSaves], ["Pên. Defend.", dialogStats.current.penaltySaves],
                  ["Jogos", dialogStats.current.matchesPlayed],
                ] as [string, number][]).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-[var(--gala-line)] bg-[#171320] px-1 py-2">
                    <span className="gala-gold-text block font-serif text-base font-extrabold">{value}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[var(--gala-ink-dim)]">{label}</span>
                  </div>
                ))}
              </div>
              {skills.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[var(--gala-line)] bg-[#171320] p-2">
                  <PlayerRadar data={skills.map((s) => ({ skill: s.skill, label: s.skill, value: s.rating * 20 }))} />
                  <p className="text-center text-[8px] uppercase tracking-[2px] text-[var(--gala-ink-dim)]">Radar de habilidades</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
