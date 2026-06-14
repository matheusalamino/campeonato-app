"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import PlayerRadar from "@/components/PlayerRadar";
import type { PublicPlayer, PublicPlayerStats } from "@/lib/public/types";
import { POSITION_LABELS } from "@/lib/public/types";
import type { PublicRankings } from "@/features/hooks/usePublicRankings";
import { sumVotePoints } from "@/lib/public/match-stats";

const supabase = createClient();

type SkillRow = { registration_id: string; skill: string; rating: number };

const EMPTY_STATS: Omit<PublicPlayerStats, "registrationId"> = {
  goals: 0, assists: 0, yellowCards: 0, redCards: 0,
  decisiveSaves: 0, penaltySaves: 0, fouls: 0, matchesPlayed: 0,
};

function normalize(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function PlayersTab({ championshipId, rankings }: {
  championshipId: string; rankings: PublicRankings;
}) {
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [position, setPosition] = useState("all");
  const [selected, setSelected] = useState<PublicPlayer | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [votePoints, setVotePoints] = useState<Map<string, number>>(new Map());

  // Pontos de craque por jogador (exibidos no perfil)
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("best_player_votes").select("registration_id, points")
        .eq("championship_id", championshipId);
      setVotePoints(sumVotePoints(data ?? []));
    })();
  }, [championshipId]);

  // Radar do jogador selecionado
  useEffect(() => {
    // Limpa o radar anterior ao trocar/fechar (não mostrar dados do jogador errado)
    setSkills([]);
    if (!selected) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("public_player_skills").select("registration_id, skill, rating")
        .eq("registration_id", selected.registrationId);
      // Ignora respostas fora de ordem (clique rápido em outro jogador)
      if (!cancelled) setSkills((data ?? []) as SkillRow[]);
    })();
    return () => { cancelled = true; };
  }, [selected]);

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

  // Busca por nome, nome oficial ou time — CPF fica fora de propósito (LGPD)
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

  const selectClass = "rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-xs text-[var(--gala-ink-dim)]";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Buscar jogador por nome, apelido ou time…"
          className="flex-1 rounded-lg border border-[var(--gala-line)] bg-[#171320] px-3 py-2 text-sm placeholder-[#665f73] outline-none focus:border-[var(--gala-gold-3)]"
        />
        <select value={team} onChange={(e) => setTeam(e.target.value)} className={selectClass} aria-label="Filtrar por time">
          <option value="all">Time: Todos</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={position} onChange={(e) => setPosition(e.target.value)} className={selectClass} aria-label="Filtrar por posição">
          <option value="all">Posição: Todas</option>
          {positions.map((p) => <option key={p} value={p}>{POSITION_LABELS[p] ?? p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const s = statsById.get(p.registrationId);
          return (
            <button
              key={p.registrationId}
              onClick={() => setSelected(p)}
              className="gala-panel flex items-center gap-3 rounded-xl p-3 text-left transition-colors hover:border-[var(--gala-gold-3)]/60"
            >
              {p.photoUrl ? (
                <Image src={p.photoUrl} alt={p.playerName} width={40} height={40} className="size-10 rounded-full object-cover" />
              ) : (
                <span className="flex size-10 items-center justify-center rounded-full bg-[#2a2438] text-xs font-extrabold">
                  {p.playerName.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{p.playerName}</span>
                <span className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                  {(p.position && (POSITION_LABELS[p.position] ?? p.position)) ?? "—"} · {p.teamName ?? "—"}
                </span>
              </span>
              <span className="text-right text-[10px] text-[var(--gala-ink-dim)]">
                <b className="block text-sm text-[var(--gala-gold-2)]">{s?.goals ?? 0}</b> gols
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-[var(--gala-ink-dim)]">Nenhum jogador encontrado.</p>
        ) : null}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md border-[var(--gala-line)] bg-[#0c0a10] text-white">
          {selected && selStats ? (
            <div>
              <div className="flex items-center gap-3">
                {selected.photoUrl ? (
                  <Image src={selected.photoUrl} alt={selected.playerName} width={56} height={56} className="size-14 rounded-full object-cover ring-2 ring-[var(--gala-gold-3)]/60" />
                ) : (
                  <span className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--gala-gold-1)] to-[var(--gala-gold-3)] text-base font-black text-[#0b0a12]">
                    {selected.playerName.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div className="flex-1">
                  <DialogTitle className="text-lg font-extrabold">{selected.playerName}</DialogTitle>
                  <p className="text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
                    {(selected.position && (POSITION_LABELS[selected.position] ?? selected.position)) ?? "—"} · {selected.teamName ?? "—"}
                  </p>
                </div>
                {selected.finalOverall !== null ? (
                  <div className="rounded-lg border border-[rgba(212,160,23,.4)] bg-[#171320] px-3 py-1.5 text-center">
                    <span className="gala-gold-text block font-serif text-xl font-extrabold">{selected.finalOverall}</span>
                    <span className="text-[8px] tracking-[2px] text-[var(--gala-ink-dim)]">OVERALL</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {[
                  ["Gols", selStats.goals], ["Assist.", selStats.assists],
                  ["Pts Craque", votePoints.get(selected.registrationId) ?? 0],
                  ["🟨 Amarelos", selStats.yellowCards], ["🟥 Vermelhos", selStats.redCards],
                  ["Faltas", selStats.fouls],
                  ["Defesas", selStats.decisiveSaves], ["Pên. Defendidos", selStats.penaltySaves],
                  ["Jogos", selStats.matchesPlayed],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-lg border border-[var(--gala-line)] bg-[#171320] px-1 py-2">
                    <span className="gala-gold-text block font-serif text-base font-extrabold">{value}</span>
                    <span className="text-[8px] uppercase tracking-wider text-[var(--gala-ink-dim)]">{label}</span>
                  </div>
                ))}
              </div>

              {skills.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[var(--gala-line)] bg-[#171320] p-2">
                  {/* escala 1-5 → 0-100 para o domínio do PlayerRadar */}
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
