# Craque do Campeonato Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After each match completes, the admin records three best-player votes (home manager, away manager, referee). Points accumulate by phase weight and a new "Craque" tab in the standings page shows the live leaderboard with vote history.

**Architecture:** New `best_player_votes` Supabase table stores one row per voter-role per match. Phase weight (1/2/3) is set by the admin in PhaseConfigDrawer and stored in `phases.vote_weight`. The match page auto-opens a voting modal on completion and exposes a retroactive button. A new `useBestPlayer` hook drives the standings tab leaderboard.

**Tech Stack:** Next.js 14, TypeScript, Supabase (Postgres + client SDK), Tailwind CSS, Lucide React icons, Sonner for toasts.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260612000000_best_player.sql` | Create | DB: `vote_weight` on phases + `best_player_votes` table |
| `types/championship.ts` | Modify | Add `vote_weight` to `Phase`, `CreatePhaseDTO`, `UpdatePhaseDTO` |
| `types/best-player.ts` | Create | `VoterRole`, `ExistingVote`, `VoteDetail`, `PlayerScore` types |
| `components/PhaseConfigDrawer.tsx` | Modify | Add vote weight selector + persist in `handleSave` |
| `features/hooks/useMatchDetail.ts` | Modify | Add `vote_weight` to phase select; expose `voteWeight` in return |
| `features/hooks/useBestPlayer.ts` | Create | Fetch + aggregate `best_player_votes` into ranked leaderboard |
| `components/BestPlayerVoteModal.tsx` | Create | 4-step voting modal (home mgr → away mgr → referee → confirm) |
| `app/(protected)/games/[id]/page.tsx` | Modify | Existing votes fetch; auto-trigger modal; retroactive button |
| `app/(protected)/championship/standings/page.tsx` | Modify | Add third "Craque" tab powered by `useBestPlayer` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260612000000_best_player.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260612000000_best_player.sql

-- 1. Add vote_weight to phases (defaults to 1 so existing phases are unaffected)
ALTER TABLE phases ADD COLUMN IF NOT EXISTS vote_weight INTEGER NOT NULL DEFAULT 1;

-- 2. Create best_player_votes table
CREATE TABLE IF NOT EXISTS best_player_votes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES knockout_matches(id) ON DELETE CASCADE,
  championship_id UUID NOT NULL REFERENCES championships(id) ON DELETE CASCADE,
  registration_id UUID NOT NULL REFERENCES championship_registrations(id) ON DELETE CASCADE,
  voter_role      TEXT NOT NULL CHECK (voter_role IN ('home_manager', 'away_manager', 'referee')),
  points          INTEGER NOT NULL CHECK (points > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT best_player_votes_match_voter_unique UNIQUE (match_id, voter_role)
);

-- 3. Enable RLS (consistent with all other tables in this project)
ALTER TABLE best_player_votes ENABLE ROW LEVEL SECURITY;

-- Allow full access for authenticated users (same pattern as match_events_v2)
CREATE POLICY "authenticated full access" ON best_player_votes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

- [ ] **Step 2: Apply the migration to your local/staging Supabase**

```bash
# If using local Supabase CLI:
supabase db push

# Or apply via the Supabase dashboard SQL editor
# Copy/paste the SQL from the migration file
```

Expected: no errors, `phases` table now has `vote_weight` column, `best_player_votes` table exists.

- [ ] **Step 3: Commit the migration**

```bash
git add supabase/migrations/20260612000000_best_player.sql
git commit -m "feat: add vote_weight to phases and best_player_votes table"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `types/championship.ts`
- Create: `types/best-player.ts`

- [ ] **Step 1: Add `vote_weight` to Phase types in `types/championship.ts`**

Find the `Phase` type and add the field:
```typescript
export type Phase = {
  id: string;
  championship_id: string;
  name: string;
  abbreviation: string;
  type: PhaseType;
  order_number: number;
  is_home_away: boolean;
  created_at: string;
  reset_yellow_cards: boolean;
  yellow_cards_reset_done: boolean;
  vote_weight: number; // 1 | 2 | 3 — points per vote for best player award
};
```

Find `CreatePhaseDTO` and add:
```typescript
export type CreatePhaseDTO = {
  name: string;
  type: PhaseType;
  order_number: number;
  championship_id: string;
  abbreviation: string;
  is_home_away: boolean;
  vote_weight?: number; // defaults to 1 in DB if omitted
};
```

Find `UpdatePhaseDTO` and add:
```typescript
export type UpdatePhaseDTO = {
  id: string;
  name?: string;
  type?: PhaseType;
  order_number?: number;
  abbreviation?: string;
  is_home_away?: boolean;
  vote_weight?: number;
  groupSettings?: UpdatePhaseGroupSettings;
  knockoutSettings?: UpdatePhaseKnockoutSettings;
};
```

- [ ] **Step 2: Create `types/best-player.ts`**

```typescript
export type VoterRole = 'home_manager' | 'away_manager' | 'referee';

export type ExistingVote = {
  voterRole: VoterRole;
  registrationId: string;
};

export type VoteDetail = {
  matchId: string;
  matchName: string;
  phaseName: string;
  voterRole: VoterRole;
  points: number;
};

export type PlayerScore = {
  registrationId: string;
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
  totalPoints: number;
  votes: VoteDetail[];
};
```

- [ ] **Step 3: Commit**

```bash
git add types/championship.ts types/best-player.ts
git commit -m "feat: add vote_weight type and best-player types"
```

---

## Task 3: PhaseConfigDrawer — Vote Weight Selector

**Files:**
- Modify: `components/PhaseConfigDrawer.tsx`

The drawer currently manages tiebreaker rules (group phases) and knockout settings. We add a vote weight selector that applies to **all** phase types. It reads `phase.vote_weight` as initial state and persists it via the existing `phases.update` call in `handleSave`.

- [ ] **Step 1: Add `voteWeight` state initialized from the phase prop**

Near the top of the `PhaseConfigDrawer` function, after the existing state declarations (around line 24), add:

```typescript
const [voteWeight, setVoteWeight] = useState<number>(phase.vote_weight ?? 1);
```

- [ ] **Step 2: Persist `vote_weight` in `handleSave`**

The `handleSave` function already calls `supabase.from("phases").update({ reset_yellow_cards: resetYellows })`. Extend that update object to include `vote_weight`:

```typescript
const { error: phaseError } = await supabase
  .from("phases")
  .update({ reset_yellow_cards: resetYellows, vote_weight: voteWeight })
  .eq("id", phase.id);
if (phaseError) throw phaseError;
```

- [ ] **Step 3: Add the vote weight UI section**

In the JSX, inside the scrollable content div (`<div className="flex-1 overflow-y-auto p-6 space-y-8">`), add a new section **after** the existing phase-type-specific content (tiebreaker rules or knockout settings) and **before** the yellow card reset section. Insert:

```tsx
{/* ── Vote Weight (Craque do Campeonato) ────────────────────────── */}
<div className="space-y-3">
  <div className="space-y-1">
    <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
      <Trophy className="h-3.5 w-3.5 text-yellow-500" /> Craque do Campeonato
    </h3>
    <p className="text-[11px] text-zinc-500 leading-relaxed">
      Peso dos votos desta fase para o Craque do Campeonato.
    </p>
  </div>
  <div className="flex gap-2">
    {[
      { value: 1, label: "1 pt", description: "Grupos / Repescagem" },
      { value: 2, label: "2 pts", description: "Semifinal" },
      { value: 3, label: "3 pts", description: "Final" },
    ].map((opt) => (
      <button
        key={opt.value}
        type="button"
        onClick={() => setVoteWeight(opt.value)}
        className={cn(
          "flex-1 flex flex-col items-center gap-1 rounded-xl border p-3 text-xs font-bold transition-all",
          voteWeight === opt.value
            ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
            : "border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
        )}
      >
        <span className="text-lg font-black">{opt.label}</span>
        <span className="text-[10px] font-medium opacity-70">{opt.description}</span>
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 4: Verify manually**

Open the app, navigate to a championship's phases, open PhaseConfigDrawer for any phase. Confirm the 3-button selector appears, can be toggled, and saving a phase persists the chosen weight (check the Supabase `phases` table row).

- [ ] **Step 5: Commit**

```bash
git add components/PhaseConfigDrawer.tsx
git commit -m "feat: add vote weight selector to PhaseConfigDrawer"
```

---

## Task 4: Extend `useMatchDetail` with `voteWeight`

**Files:**
- Modify: `features/hooks/useMatchDetail.ts`

`useMatchDetail` already fetches the phase row for the match (around line 362). We extend that select to include `vote_weight` and expose it in the return value.

- [ ] **Step 1: Add `voteWeight` to the `MatchDetail` type**

`MatchDetail` is already exported from `useMatchDetail.ts` at line 123. Find the type definition and add `voteWeight` as the last field before the closing `}`:

```typescript
  hasPenalties: boolean;
  hasExtraTime: boolean;
  voteWeight: number; // from phases.vote_weight
};
```

- [ ] **Step 2: Extend the phase select query**

Find the `supabase.from("phases").select("reset_yellow_cards, yellow_cards_reset_done")` call (around line 362) and add `vote_weight` to the select:

```typescript
supabase
  .from("phases")
  .select("reset_yellow_cards, yellow_cards_reset_done, vote_weight")
  .eq("id", match.phase_id)
  .single(),
```

- [ ] **Step 3: Include `voteWeight` in `setDetail`**

In the `setDetail({...})` call (around line 490), add:

```typescript
voteWeight: phaseRow?.vote_weight ?? 1,
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new type errors.

- [ ] **Step 5: Commit**

```bash
git add features/hooks/useMatchDetail.ts
git commit -m "feat: expose voteWeight from phase in useMatchDetail"
```

---

## Task 5: Create `useBestPlayer` Hook

**Files:**
- Create: `features/hooks/useBestPlayer.ts`

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PlayerScore, VoteDetail, VoterRole } from "@/types/best-player";

const supabase = createClient();

type RawVote = {
  id: string;
  match_id: string;
  registration_id: string;
  voter_role: string;
  points: number;
};

type RegInfo = {
  playerName: string;
  playerPhoto: string | null;
  teamId: string;
  teamName: string;
};

export function useBestPlayer(championshipId: string | null) {
  const [leaderboard, setLeaderboard] = useState<PlayerScore[]>([]);
  const [loading, setLoading] = useState(false);

  const regInfoMapRef = useRef<Map<string, RegInfo>>(new Map());
  const rawVotesRef = useRef<RawVote[]>([]);
  const matchMapRef = useRef<Map<string, { name: string; phaseId: string }>>(new Map());
  const phaseMapRef = useRef<Map<string, string>>(new Map()); // phaseId → phaseName

  const derive = useCallback(() => {
    const regInfoMap = regInfoMapRef.current;
    const matchMap = matchMapRef.current;
    const phaseMap = phaseMapRef.current;

    // Group votes by registration_id
    const scoreMap = new Map<string, { info: RegInfo; votes: VoteDetail[]; total: number }>();

    for (const vote of rawVotesRef.current) {
      const info = regInfoMap.get(vote.registration_id);
      if (!info) continue;

      const matchInfo = matchMap.get(vote.match_id);
      const voteDetail: VoteDetail = {
        matchId: vote.match_id,
        matchName: matchInfo?.name ?? "—",
        phaseName: matchInfo?.phaseId ? (phaseMap.get(matchInfo.phaseId) ?? "—") : "—",
        voterRole: vote.voter_role as VoterRole,
        points: vote.points,
      };

      const existing = scoreMap.get(vote.registration_id);
      if (existing) {
        existing.votes.push(voteDetail);
        existing.total += vote.points;
      } else {
        scoreMap.set(vote.registration_id, { info, votes: [voteDetail], total: vote.points });
      }
    }

    const result: PlayerScore[] = [];
    for (const [registrationId, { info, votes, total }] of scoreMap.entries()) {
      result.push({
        registrationId,
        playerName: info.playerName,
        playerPhoto: info.playerPhoto,
        teamId: info.teamId,
        teamName: info.teamName,
        totalPoints: total,
        votes,
      });
    }

    result.sort((a, b) => b.totalPoints - a.totalPoints);
    setLeaderboard(result);
  }, []);

  const load = useCallback(async () => {
    if (!championshipId) {
      regInfoMapRef.current = new Map();
      rawVotesRef.current = [];
      matchMapRef.current = new Map();
      phaseMapRef.current = new Map();
      setLeaderboard([]);
      return;
    }

    setLoading(true);
    try {
      // Parallel fetches
      const [votesRes, matchesRes, phasesRes, regsRes] = await Promise.all([
        supabase
          .from("best_player_votes")
          .select("id, match_id, registration_id, voter_role, points")
          .eq("championship_id", championshipId),
        supabase
          .from("knockout_matches")
          .select("id, name, phase_id")
          .eq("championship_id", championshipId),
        supabase
          .from("phases")
          .select("id, name")
          .eq("championship_id", championshipId),
        supabase
          .from("championship_registrations")
          .select("id, profile_photo_link, players(id, name)")
          .eq("championship_id", championshipId),
      ]);

      // Build match map
      const newMatchMap = new Map<string, { name: string; phaseId: string }>();
      for (const m of matchesRes.data ?? []) {
        newMatchMap.set(m.id, { name: m.name ?? "—", phaseId: m.phase_id ?? "" });
      }

      // Build phase map
      const newPhaseMap = new Map<string, string>();
      for (const p of phasesRes.data ?? []) {
        newPhaseMap.set(p.id, p.name);
      }

      // Build regInfoMap (reuse pattern from useDisciplinary)
      const regIds = (regsRes.data ?? []).map(r => r.id);
      const { data: ctpRows } = await supabase
        .from("championship_team_players")
        .select("registration_id, championship_team_id, championship_teams(id, teams(name))")
        .in("registration_id", regIds.length ? regIds : ["__none__"]);

      const ctpMap = new Map<string, { teamId: string; teamName: string }>();
      for (const ctp of ctpRows ?? []) {
        if (ctpMap.has(ctp.registration_id)) continue;
        const ct = ctp.championship_teams as unknown as { id: string; teams: { name: string } | { name: string }[] | null } | null;
        const teamsRel = ct?.teams;
        const teamName = (Array.isArray(teamsRel) ? teamsRel[0]?.name : teamsRel?.name) ?? "—";
        ctpMap.set(ctp.registration_id, { teamId: ctp.championship_team_id, teamName });
      }

      const newRegInfoMap = new Map<string, RegInfo>();
      for (const reg of regsRes.data ?? []) {
        const playersRel = reg.players as { id: string; name: string } | { id: string; name: string }[] | null;
        const playerName = (Array.isArray(playersRel) ? playersRel[0]?.name : playersRel?.name) ?? "—";
        const teamInfo = ctpMap.get(reg.id);
        newRegInfoMap.set(reg.id, {
          playerName,
          playerPhoto: reg.profile_photo_link ?? null,
          teamId: teamInfo?.teamId ?? "",
          teamName: teamInfo?.teamName ?? "—",
        });
      }

      regInfoMapRef.current = newRegInfoMap;
      rawVotesRef.current = (votesRes.data ?? []) as RawVote[];
      matchMapRef.current = newMatchMap;
      phaseMapRef.current = newPhaseMap;
    } finally {
      setLoading(false);
    }
  }, [championshipId]);

  const deriveRef = useRef(derive);
  deriveRef.current = derive;

  useEffect(() => { void load().then(() => deriveRef.current()); }, [load]);

  return {
    leaderboard,
    loading,
    reload: async () => { await load(); derive(); },
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add features/hooks/useBestPlayer.ts
git commit -m "feat: add useBestPlayer hook for championship leaderboard"
```

---

## Task 6: Create `BestPlayerVoteModal` Component

**Files:**
- Create: `components/BestPlayerVoteModal.tsx`

This is a 4-step modal (home manager → away manager → referee → confirm + submit). It follows the `AddEventSheet` style in `app/(protected)/games/[id]/page.tsx`.

- [ ] **Step 1: Create the file**

```typescript
"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { User, Star, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchPlayer } from "@/features/hooks/useMatchDetail";
import type { VoterRole, ExistingVote } from "@/types/best-player";

const supabase = createClient();

type Team = { championshipTeamId: string; name: string };

type Props = {
  matchId: string;
  championshipId: string;
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  voteWeight: number;
  existingVotes: ExistingVote[];
  onClose: () => void;
  onSaved: () => void;
};

const VOTER_LABELS: Record<VoterRole, string> = {
  home_manager: "Cartola da Casa",
  away_manager: "Cartola Visitante",
  referee: "Árbitro",
};

type Step = 1 | 2 | 3 | 4;

function PlayerPicker({
  players,
  selected,
  onSelect,
}: {
  players: MatchPlayer[];
  selected: MatchPlayer | null;
  onSelect: (p: MatchPlayer) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Buscar jogador..."
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {filtered.map(p => (
          <button
            key={p.registrationId}
            onClick={() => onSelect(p)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all text-left group",
              selected?.registrationId === p.registrationId
                ? "bg-yellow-500/10 border border-yellow-500/30"
                : "hover:bg-zinc-800"
            )}
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-zinc-600" />
              )}
              {selected?.registrationId === p.registrationId && (
                <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/20">
                  <Check className="h-4 w-4 text-yellow-400" />
                </div>
              )}
            </div>
            <div>
              <p className={cn(
                "font-bold text-sm",
                selected?.registrationId === p.registrationId ? "text-yellow-400" : "text-white"
              )}>
                {p.name}
              </p>
              {p.position && (
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</p>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>
        )}
      </div>
    </div>
  );
}

function findExisting(existingVotes: ExistingVote[], role: VoterRole, allPlayers: MatchPlayer[]): MatchPlayer | null {
  const vote = existingVotes.find(v => v.voterRole === role);
  if (!vote) return null;
  return allPlayers.find(p => p.registrationId === vote.registrationId) ?? null;
}

export function BestPlayerVoteModal({
  matchId,
  championshipId,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  voteWeight,
  existingVotes,
  onClose,
  onSaved,
}: Props) {
  const allPlayers = [...homePlayers, ...awayPlayers];

  const [step, setStep] = useState<Step>(1);
  const [homeManagerPick, setHomeManagerPick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "home_manager", awayPlayers)
  );
  const [awayManagerPick, setAwayManagerPick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "away_manager", homePlayers)
  );
  const [refereePick, setRefereePick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "referee", allPlayers)
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const votes: { voter_role: VoterRole; registration_id: string }[] = [];
    if (homeManagerPick) votes.push({ voter_role: "home_manager", registration_id: homeManagerPick.registrationId });
    if (awayManagerPick) votes.push({ voter_role: "away_manager", registration_id: awayManagerPick.registrationId });
    if (refereePick) votes.push({ voter_role: "referee", registration_id: refereePick.registrationId });

    if (votes.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const rows = votes.map(v => ({
        match_id: matchId,
        championship_id: championshipId,
        registration_id: v.registration_id,
        voter_role: v.voter_role,
        points: voteWeight,
      }));

      const { error } = await supabase
        .from("best_player_votes")
        .upsert(rows, { onConflict: "match_id,voter_role" });

      if (error) throw error;

      toast.success(`${votes.length} voto${votes.length > 1 ? "s" : ""} registrado${votes.length > 1 ? "s" : ""}!`);
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar votos");
    } finally {
      setSaving(false);
    }
  }

  const STEPS: { step: Step; role: VoterRole; label: string; players: MatchPlayer[]; pick: MatchPlayer | null; setPick: (p: MatchPlayer | null) => void }[] = [
    { step: 1, role: "home_manager", label: `Cartola da Casa (${homeTeam.name})`, players: awayPlayers, pick: homeManagerPick, setPick: setHomeManagerPick },
    { step: 2, role: "away_manager", label: `Cartola Visitante (${awayTeam.name})`, players: homePlayers, pick: awayManagerPick, setPick: setAwayManagerPick },
    { step: 3, role: "referee", label: "Árbitro", players: allPlayers, pick: refereePick, setPick: setRefereePick },
  ];

  const currentStepData = STEPS.find(s => s.step === step);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Craque da Partida</h3>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800 px-2 py-1 rounded-full">
              {voteWeight} pt{voteWeight > 1 ? "s" : ""} por voto
            </span>
          </div>

          {/* Step indicator */}
          {step < 4 && (
            <div className="flex gap-1 mb-4">
              {STEPS.map(s => (
                <div key={s.step} className={cn(
                  "h-1 flex-1 rounded-full transition-all",
                  s.step < step ? "bg-yellow-500" :
                  s.step === step ? "bg-yellow-500/60" : "bg-zinc-800"
                )} />
              ))}
              <div className={cn("h-1 flex-1 rounded-full transition-all", step === 4 ? "bg-yellow-500" : "bg-zinc-800")} />
            </div>
          )}

          {/* Steps 1-3: Player picker */}
          {step < 4 && currentStepData && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                <span className="text-yellow-500">Voto do {VOTER_LABELS[currentStepData.role]}</span>
                <br />
                <span className="text-xs text-zinc-500">{currentStepData.label} — escolha o destaque</span>
              </p>

              {currentStepData.pick && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                  <Check className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <p className="text-xs font-bold text-yellow-400">{currentStepData.pick.name} selecionado</p>
                </div>
              )}

              <PlayerPicker
                players={currentStepData.players}
                selected={currentStepData.pick}
                onSelect={p => { currentStepData.setPick(p); }}
              />

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => { currentStepData.setPick(null); setStep((step + 1) as Step); }}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Pular
                </button>
                <button
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={!currentStepData.pick}
                  className="flex-[2] rounded-xl bg-yellow-600 py-2.5 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-40 uppercase tracking-wider shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2"
                >
                  Próximo <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Summary + confirm */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar votos</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 divide-y divide-zinc-700/50 mb-5">
                {STEPS.map(s => (
                  <div key={s.role} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{VOTER_LABELS[s.role]}</p>
                      <p className={cn("text-sm font-bold mt-0.5", s.pick ? "text-white" : "text-zinc-600 italic")}>
                        {s.pick ? s.pick.name : "Pulado"}
                      </p>
                    </div>
                    {s.pick && (
                      <span className="text-xs font-black text-yellow-500">+{voteWeight}pt{voteWeight > 1 ? "s" : ""}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || (!homeManagerPick && !awayManagerPick && !refereePick)}
                  className="flex-[2] rounded-xl bg-yellow-600 py-3 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-yellow-900/20"
                >
                  {saving ? "Salvando..." : "✅ Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/BestPlayerVoteModal.tsx
git commit -m "feat: add BestPlayerVoteModal component"
```

---

## Task 7: Match Page Integration

**Files:**
- Modify: `app/(protected)/games/[id]/page.tsx`

Three additions: (1) fetch existing votes, (2) auto-trigger the modal on completion, (3) retroactive "Votar Craque" button.

- [ ] **Step 1: Add imports at the top of the file**

Add two new import lines after the existing imports:
```typescript
import { BestPlayerVoteModal } from "@/components/BestPlayerVoteModal";
import type { ExistingVote } from "@/types/best-player";
```

Then find the existing lucide-react import line and add `Star`:
```typescript
// Before:
import { ArrowLeft, ArrowUpDown, Hand, Shield, ShieldCheck, Clock, CheckCircle2, ChevronRight, Plus, Trash2, Target, AlertCircle, Square } from "lucide-react";
// After:
import { ArrowLeft, ArrowUpDown, Hand, Shield, ShieldCheck, Clock, CheckCircle2, ChevronRight, Plus, Trash2, Target, AlertCircle, Square, Star } from "lucide-react";
```

Also find the React import and add `useRef` and `useCallback` if not already present:
```typescript
import { useState, useRef, useCallback } from "react";
```

- [ ] **Step 2: Add state and existing-votes fetch inside `MatchPage`**

Inside the `MatchPage` component, after the existing state declarations (`showAddEvent`), add:

```typescript
const [showVoteModal, setShowVoteModal] = useState(false);
const [existingVotes, setExistingVotes] = useState<ExistingVote[]>([]);

// Fetch existing votes whenever match becomes completed or after a vote is saved
const fetchExistingVotes = useCallback(async () => {
  if (!detail?.match.id) return;
  const { data } = await supabase
    .from("best_player_votes")
    .select("voter_role, registration_id")
    .eq("match_id", detail.match.id);
  setExistingVotes(
    (data ?? []).map(v => ({ voterRole: v.voter_role as ExistingVote["voterRole"], registrationId: v.registration_id }))
  );
}, [detail?.match.id]);

useEffect(() => {
  if (detail?.match.status === "COMPLETED") void fetchExistingVotes();
}, [detail?.match.status, fetchExistingVotes]);
```

- [ ] **Step 3: Add auto-trigger effect**

After the existing-votes effect, add:

```typescript
const prevStatusRef = useRef<string | undefined>();
useEffect(() => {
  if (prevStatusRef.current !== "COMPLETED" && detail?.match.status === "COMPLETED") {
    setShowVoteModal(true);
  }
  prevStatusRef.current = detail?.match.status;
}, [detail?.match.status]);
```

Add `useRef` to the React import if it's not already there (it is — it's used by `useMatchDetail` internally, but the page itself may not import it). Check the existing imports in the file and add `useRef, useCallback` if missing.

- [ ] **Step 4: Add the retroactive button in the header**

The match page header (around line 815) has:
```tsx
{isCompleted && (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
    <CheckCircle2 className="h-3.5 w-3.5" /> Súmula Oficial
  </span>
)}
```

Replace this block with:
```tsx
{isCompleted && (
  <div className="flex items-center gap-2">
    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-400">
      <CheckCircle2 className="h-3.5 w-3.5" /> Súmula Oficial
    </span>
    <button
      onClick={() => setShowVoteModal(true)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition-all",
        existingVotes.length >= 3
          ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"
          : "bg-zinc-800 text-zinc-400 hover:text-yellow-400 hover:bg-yellow-500/10 border border-zinc-700"
      )}
    >
      <Star className="h-3.5 w-3.5" />
      {existingVotes.length >= 3 ? "Craque Votado" : "Votar Craque"}
      <span className="text-[10px] opacity-70">({existingVotes.length}/3)</span>
    </button>
  </div>
)}
```

- [ ] **Step 5: Render the modal at the bottom of the JSX**

After the existing `{showAddEvent && <AddEventSheet ... />}` block, add:

```tsx
{showVoteModal && detail && (
  <BestPlayerVoteModal
    matchId={detail.match.id}
    championshipId={detail.match.championship_id ?? ""}
    homeTeam={detail.homeTeam}
    awayTeam={detail.awayTeam}
    homePlayers={detail.homePlayers}
    awayPlayers={detail.awayPlayers}
    voteWeight={detail.voteWeight}
    existingVotes={existingVotes}
    onClose={() => setShowVoteModal(false)}
    onSaved={() => { void fetchExistingVotes(); }}
  />
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 7: Manual test**

1. Open a match that is NOT yet completed → confirm no "Votar Craque" button appears
2. Complete the match (end period 2) → confirm the voting modal opens automatically
3. Step through the modal: pick a player for step 1, skip step 2, pick for step 3, confirm
4. Modal closes; confirm the button shows "(2/3)"
5. Click "Votar Craque" again → modal reopens with the 2 existing picks pre-filled
6. Submit step 2 now → count shows "(3/3)" and button turns yellow

- [ ] **Step 8: Commit**

```bash
git add app/\(protected\)/games/\[id\]/page.tsx
git commit -m "feat: integrate BestPlayerVoteModal into match page"
```

---

## Task 8: Standings Page — Craque Tab

**Files:**
- Modify: `app/(protected)/championship/standings/page.tsx`

- [ ] **Step 1: Add imports**

Add to existing imports:
```typescript
import { useBestPlayer } from "@/features/hooks/useBestPlayer";
import type { PlayerScore } from "@/types/best-player";
import { Star, ChevronDown, ChevronUp } from "lucide-react";
```

- [ ] **Step 2: Expand the `activeTab` type and add state**

Find:
```typescript
const [activeTab, setActiveTab] = useState<"standings" | "disciplinary">("standings");
```

Replace with:
```typescript
const [activeTab, setActiveTab] = useState<"standings" | "disciplinary" | "best_player">("standings");
```

- [ ] **Step 3: Add `useBestPlayer` hook (lazy — only loads when tab opens)**

After the disciplinary state block (around line 40), add:
```typescript
// ── Best Player tab state ────────────────────────────────────────────────────
const { leaderboard, loading: loadingBestPlayer } = useBestPlayer(
  activeTab === "best_player" ? championship?.id || null : null
);
const [expandedPlayer, setExpandedPlayer] = useState<string | null>(null);
```

- [ ] **Step 4: Update the page header title**

Find the heading block that switches between "Classificação" and "Disciplina" titles:
```tsx
{activeTab === "standings" ? (
  <><Trophy className="h-6 w-6 text-yellow-500" /> Classificação</>
) : (
  <><ShieldAlert className="h-6 w-6 text-red-500" /> Disciplina</>
)}
```

Replace with:
```tsx
{activeTab === "standings" ? (
  <><Trophy className="h-6 w-6 text-yellow-500" /> Classificação</>
) : activeTab === "disciplinary" ? (
  <><ShieldAlert className="h-6 w-6 text-red-500" /> Disciplina</>
) : (
  <><Star className="h-6 w-6 text-yellow-500" /> Craque do Campeonato</>
)}
```

- [ ] **Step 5: Add "Craque" button to the tab switcher**

Find:
```tsx
<div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
  <button onClick={() => setActiveTab("standings")} ...>Classificação</button>
  <button onClick={() => setActiveTab("disciplinary")} ...>Disciplina</button>
</div>
```

Add the third button inside the div, after the "Disciplina" button:
```tsx
<button
  onClick={() => setActiveTab("best_player")}
  className={cn(
    "rounded-lg px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5",
    activeTab === "best_player" ? "bg-yellow-600 text-white" : "text-zinc-400 hover:text-white"
  )}
>
  <Star className="h-3 w-3" /> Craque
</button>
```

- [ ] **Step 6: Add the Craque tab content**

After the closing `)}` of the disciplinary tab content block, add:

```tsx
{/* ── Best Player tab content ───────────────────────────────────────── */}
{activeTab === "best_player" && (
  <div className="space-y-4">
    {loadingBestPlayer ? (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-zinc-900/50 border border-zinc-800" />
        ))}
      </div>
    ) : leaderboard.length === 0 ? (
      <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
        <Star className="h-8 w-8 opacity-30" />
        <p className="text-sm">Nenhum voto registrado ainda.</p>
      </div>
    ) : (
      <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl">
        <div className="bg-zinc-900/50 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-300 flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" /> Ranking
          </h3>
          <span className="text-[10px] text-zinc-500 font-medium">PONTOS</span>
        </div>
        <div className="divide-y divide-zinc-800/30">
          {leaderboard.map((player, idx) => {
            const isExpanded = expandedPlayer === player.registrationId;
            const rankBadge =
              idx === 0 ? "bg-yellow-500/20 text-yellow-500" :
              idx === 1 ? "bg-zinc-400/20 text-zinc-400" :
              idx === 2 ? "bg-orange-500/20 text-orange-500" :
              "text-zinc-600";
            const rankEmoji = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;

            return (
              <div key={player.registrationId}>
                <button
                  onClick={() => setExpandedPlayer(isExpanded ? null : player.registrationId)}
                  className="flex w-full items-center gap-3 px-4 py-3 hover:bg-zinc-900/40 transition-colors text-left"
                >
                  {/* Rank */}
                  <span className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-black shrink-0",
                    rankBadge
                  )}>
                    {rankEmoji ?? idx + 1}
                  </span>

                  {/* Photo */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 overflow-hidden ring-1 ring-zinc-700/50">
                    {player.playerPhoto ? (
                      <img src={player.playerPhoto} alt={player.playerName} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-zinc-600" />
                    )}
                  </div>

                  {/* Name + team */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-zinc-200 truncate">{player.playerName}</p>
                    <p className="text-[10px] text-zinc-500 truncate">{player.teamName}</p>
                  </div>

                  {/* Points */}
                  <span className="font-black text-white tabular-nums shrink-0">
                    {player.totalPoints} <span className="text-xs font-normal text-zinc-500">pts</span>
                  </span>

                  {/* Expand icon */}
                  {isExpanded
                    ? <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                    : <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                  }
                </button>

                {/* Expanded vote history */}
                {isExpanded && (
                  <div className="bg-zinc-950/50 px-4 pb-3 pt-1 space-y-2 border-t border-zinc-800/30">
                    {player.votes.map((vote, vIdx) => (
                      <div key={vIdx} className="flex items-center justify-between text-xs">
                        <div>
                          <p className="text-zinc-300 font-medium">{vote.matchName}</p>
                          <p className="text-zinc-600 text-[10px]">
                            {vote.phaseName} · {
                              vote.voterRole === "home_manager" ? "Cartola da Casa" :
                              vote.voterRole === "away_manager" ? "Cartola Visitante" :
                              "Árbitro"
                            }
                          </p>
                        </div>
                        <span className="font-black text-yellow-500">+{vote.points}pt{vote.points > 1 ? "s" : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    )}
  </div>
)}
```

Note: `User` is already imported in this file. Confirm `ChevronDown`, `ChevronUp`, and `Star` are added to imports in Step 1.

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 8: Manual test**

1. Navigate to a championship's standings page
2. Confirm three tabs appear: "Classificação", "Disciplina", "Craque"
3. Click "Craque" → shows empty state if no votes exist yet
4. After casting votes via the match page (Task 7), return here → player appears in ranking
5. Click a player row → vote history expands showing match name, phase, voter role, and points
6. Click again → collapses

- [ ] **Step 9: Commit**

```bash
git add app/\(protected\)/championship/standings/page.tsx
git commit -m "feat: add Craque do Campeonato tab to standings page"
```

---

## Task 9: Final Integration Check

- [ ] **Step 1: Run TypeScript check across the whole project**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npx tsc --noEmit 2>&1
```

Expected: zero errors.

- [ ] **Step 2: Run the dev server and do a full end-to-end smoke test**

```bash
cd /Users/ALAMINO/Documents/projects/campeonato-app && npm run dev
```

Smoke test checklist:
1. Open a phase config → vote weight selector shows with correct default (1)
2. Change to weight 2 → save → reopen → confirms weight 2 persisted
3. Complete a match → voting modal opens automatically
4. Cast all 3 votes → modal closes, button shows "(3/3)" in yellow
5. Re-open modal → all 3 picks pre-filled
6. Navigate to standings → Craque tab shows the voted player with correct points
7. Expand the player row → vote history shows match name, phase, voter role, points

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix: final integration adjustments for best player feature"
```

- [ ] **Step 4: Push the branch**

```bash
git push -u origin feature/best-player-championship
```
