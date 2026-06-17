# Súmula Edit, Prize Overrides & Responsive Public Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent features: edit match events in completed games, admin prize overrides for public pages, and responsive design across all public pages.

**Architecture:**
- Feature 1: `EditEventModal` in `app/(protected)/games/[id]/page.tsx`; edit = soft-delete old event + insert replacement using existing `removeMatchEvent`/`addMatchEvent` services.
- Feature 2: New `championship_prize_overrides` DB table (uuid `override_value`, no FK — stores `registration_id` for player prizes or `championship_team_id` for técnico); admin section in championship settings; `usePublicRankings` injects override at rank 1 before display.
- Feature 3: Single root overflow fix (`overflow-x-hidden` on body) + mobile nav to `LandingHeader`, then systematic padding adjustments across landing and public components.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgREST), Tailwind CSS, TypeScript, Lucide React, Sonner toasts

---

## Feature 1: Súmula Edit-in-Place

### Task 1: Edit-in-Place for Match Events

**Files:**
- Modify: `app/(protected)/games/[id]/page.tsx`

Key context:
- `MatchEventItem` type (from `useMatchDetail.ts`) already has `assistPlayerId`, `playerInId`, `playerId`, `period`, `eventTimeS`.
- `removeMatchEvent` soft-deletes and reverses card side-effects. `addMatchEvent` inserts and applies card side-effects. Both are in `services/match-events.service.ts`.
- Current `EventList` is `readonly={isCompleted}` — trash button hidden on completed matches.
- Current Add Event button is guarded by `isInProgress`.

- [ ] **Step 1: Add `Pencil` to the lucide-react import**

At the top of `app/(protected)/games/[id]/page.tsx`, find:
```tsx
import {
  ArrowLeft, ArrowUpDown, Hand, Shield, ShieldCheck, Clock, CheckCircle2, ChevronRight,
  Plus, Trash2, Target, AlertCircle, Square, Star, ArrowUpRight,
} from "lucide-react";
```

Replace with:
```tsx
import {
  ArrowLeft, ArrowUpDown, Hand, Shield, ShieldCheck, Clock, CheckCircle2, ChevronRight,
  Plus, Trash2, Target, AlertCircle, Square, Star, ArrowUpRight, Pencil,
} from "lucide-react";
```

- [ ] **Step 2: Add `editingEvent` state to `MatchPage`**

In the `MatchPage` function, after the existing `const [showVoteModal, setShowVoteModal] = useState(false);` line, add:
```tsx
const [editingEvent, setEditingEvent] = useState<MatchEventItem | null>(null);
```

- [ ] **Step 3: Update `EventList` signature and buttons**

Find the `EventList` function signature:
```tsx
function EventList({ detail, readonly }: { detail: MatchDetail; readonly: boolean }) {
```

Replace with:
```tsx
function EventList({ detail, readonly, onEdit }: {
  detail: MatchDetail;
  readonly: boolean;
  onEdit: (ev: MatchEventItem) => void;
}) {
```

Find the trash button block at the end of each event row:
```tsx
{!readonly && (
  <button onClick={() => void deleteEvent(ev)}
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-colors self-center">
    <Trash2 className="h-4 w-4" />
  </button>
)}
```

Replace with:
```tsx
<div className="flex items-center gap-0.5 self-center">
  <button
    onClick={() => onEdit(ev)}
    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-blue-500/10 hover:text-blue-400 transition-colors"
    title="Editar evento"
  >
    <Pencil className="h-3.5 w-3.5" />
  </button>
  {!readonly && (
    <button onClick={() => void deleteEvent(ev)}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-red-500/10 hover:text-red-500 transition-colors">
      <Trash2 className="h-4 w-4" />
    </button>
  )}
</div>
```

- [ ] **Step 4: Update `EventList` call in `MatchPage` JSX**

Find:
```tsx
<EventList detail={detail} readonly={isCompleted} />
```

Replace with:
```tsx
<EventList
  detail={detail}
  readonly={isCompleted}
  onEdit={(ev) => setEditingEvent(ev)}
/>
```

- [ ] **Step 5: Unlock Add Event button for completed matches**

Find:
```tsx
{isInProgress && detail.match.current_period !== "penalties" && (
  <button onClick={() => setShowAddEvent(true)}
```

Replace `isInProgress` with `!isCompleted`:
```tsx
{!isCompleted && detail.match.current_period !== "penalties" && (
  <button onClick={() => setShowAddEvent(true)}
```

- [ ] **Step 6: Add `EditEventModal` component**

Add this component to the file just before the `MatchPage` export function (after `AddEventSheet`, around line 769):

```tsx
// ─── EDIT EVENT MODAL ────────────────────────────────────────────────────────
function EditEventModal({ event, detail, onClose, onSaved }: {
  event: MatchEventItem;
  detail: MatchDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allPlayers = [...detail.homePlayers, ...detail.awayPlayers];
  const findPlayer = (id: string | null) =>
    id ? allPlayers.find(p => p.registrationId === id) ?? null : null;

  const [eventType, setEventType] = useState(event.eventType);
  const [teamId] = useState(event.teamId); // team is not editable
  const [player, setPlayer] = useState<MatchPlayer | null>(findPlayer(event.playerId));
  const [assistPlayer, setAssistPlayer] = useState<MatchPlayer | null>(findPlayer(event.assistPlayerId));
  const [playerIn, setPlayerIn] = useState<MatchPlayer | null>(findPlayer(event.playerInId));
  const [step, setStep] = useState<number>(4);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const teamPlayers = teamId === detail.homeTeam.championshipTeamId
    ? detail.homePlayers
    : detail.awayPlayers;

  const filteredTeam = teamPlayers.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredSecondary = teamPlayers.filter(p =>
    p.registrationId !== player?.registrationId &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredBench = teamPlayers.filter(p =>
    p.registrationId !== player?.registrationId &&
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function save() {
    setSaving(true);
    try {
      await removeMatchEvent({
        eventId: event.id,
        knockoutMatchId: detail.match.id,
        registrationId: event.playerId,
        eventType: event.eventType,
      });
      await addMatchEvent({
        knockoutMatchId: detail.match.id,
        teamId,
        registrationId: player?.registrationId ?? null,
        eventType,
        eventTimeS: event.eventTimeS,
        period: event.period,
        assistPlayerId: assistPlayer?.registrationId ?? null,
        playerInId: playerIn?.registrationId ?? null,
        championshipId: detail.match.championship_id ?? "",
      });
      const isGoalRelated = ["GOAL", "OWN_GOAL", "PENALTY_GOAL"].includes(eventType) ||
        ["GOAL", "OWN_GOAL", "PENALTY_GOAL"].includes(event.eventType);
      if (isGoalRelated) {
        await resyncScore(detail.match.id, detail.homeTeam.championshipTeamId, detail.awayTeam.championshipTeamId);
      }
      toast.success("Evento atualizado");
      onSaved();
      onClose();
    } catch {
      toast.error("Erro ao atualizar evento");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Editar Evento</h3>
            <span className="font-mono text-zinc-400">{formatTime(event.eventTimeS)}</span>
          </div>

          {/* Step 1: Event type */}
          {step === 1 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Tipo de evento</p>
              <div className="grid grid-cols-3 gap-2">
                {EVENT_TYPES.map((e) => (
                  <button key={e.type} onClick={() => { setEventType(e.type); setSearch(""); setStep(3); }}
                    className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-all active:scale-95",
                      eventType === e.type
                        ? "border-blue-500 bg-zinc-700"
                        : "border-zinc-700 bg-zinc-800 hover:border-blue-500 hover:bg-zinc-700"
                    )}>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900", EVENT_META[e.type].color)}>
                      <EventIconByType type={e.type} className="h-5 w-5" />
                    </span>
                    <span className="text-zinc-300 font-medium">{e.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => { setSearch(""); setStep(4); }} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3: Player picker */}
          {step === 3 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                {eventType === "SUBSTITUTION" ? "Jogador saindo" : "Jogador principal"}
              </p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar jogador..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredTeam.map(p => (
                  <button key={p.registrationId} onClick={() => {
                    setPlayer(p); setSearch("");
                    if (eventType === "GOAL") setStep(3.5);
                    else if (eventType === "SUBSTITUTION") setStep(3.6);
                    else setStep(4);
                  }}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group",
                      player?.registrationId === p.registrationId && "bg-zinc-800/70"
                    )}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>}
                    </div>
                    <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                  </button>
                ))}
                {filteredTeam.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>}
              </div>
              <button onClick={() => { setSearch(""); setStep(1); }} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.5: Assist prompt */}
          {step === 3.5 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300 text-center">Houve assistência no gol?</p>
              <div className="flex gap-3 mb-3">
                <button onClick={() => { setAssistPlayer(null); setStep(4); }}
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-sm font-bold text-zinc-300 hover:border-zinc-500 transition-all">
                  Não
                </button>
                <button onClick={() => { setSearch(""); setStep(3.51); }}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-all">
                  Sim
                </button>
              </div>
              <button onClick={() => { setSearch(""); setStep(3); }} className="mt-2 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.51: Assist player picker */}
          {step === 3.51 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Quem deu a assistência?</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar assistente..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredSecondary.map(p => (
                  <button key={p.registrationId} onClick={() => { setAssistPlayer(p); setSearch(""); setStep(4); }}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group",
                      assistPlayer?.registrationId === p.registrationId && "bg-zinc-800/70"
                    )}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>}
                    </div>
                    <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                  </button>
                ))}
                {filteredSecondary.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>}
              </div>
              <button onClick={() => { setSearch(""); setStep(3.5); }} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 3.6: Substitution player-in */}
          {step === 3.6 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">Quem está entrando?</p>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Buscar jogador..." className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500" />
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {filteredBench.map(p => (
                  <button key={p.registrationId} onClick={() => { setPlayerIn(p); setSearch(""); setStep(4); }}
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-zinc-800 transition-all text-left group",
                      playerIn?.registrationId === p.registrationId && "bg-zinc-800/70"
                    )}>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden group-hover:border-blue-500/50">
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-zinc-500">{p.number ?? "?"}</span>}
                    </div>
                    <span className="font-bold text-white group-hover:text-blue-400 transition-colors">{p.name}</span>
                  </button>
                ))}
                {filteredBench.length === 0 && <p className="py-4 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>}
              </div>
              <button onClick={() => { setSearch(""); setStep(3); }} className="mt-4 text-xs font-bold text-zinc-500 hover:text-zinc-300 uppercase tracking-wider">← Voltar</button>
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar edição</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 p-4 space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                  <span className="text-zinc-400">Tipo</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-white">
                    <span className={cn(EVENT_META[eventType]?.color ?? "text-zinc-400")}>
                      <EventIconByType type={eventType} className="h-4 w-4" />
                    </span>
                    {EVENT_META[eventType]?.label ?? eventType}
                  </span>
                </div>
                {eventType === "SUBSTITUTION" ? (
                  <>
                    <div className="flex justify-between"><span className="text-zinc-400">Saiu</span><span className="font-bold text-red-400">{player?.name ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Entrou</span><span className="font-bold text-emerald-400">{playerIn?.name ?? "—"}</span></div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between"><span className="text-zinc-400">Jogador</span><span className="font-bold text-white">{player?.name ?? "—"}</span></div>
                    {eventType === "GOAL" && (
                      <div className="flex justify-between"><span className="text-zinc-400">Assistência</span><span className="font-bold text-zinc-300">{assistPlayer?.name ?? "Sem assistência"}</span></div>
                    )}
                  </>
                )}
                <div className="flex justify-between border-t border-zinc-800 pt-2">
                  <span className="text-zinc-400">Tempo</span>
                  <span className="font-mono font-bold text-blue-400">{formatTime(event.eventTimeS)}</span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                <button onClick={() => { setSearch(""); setStep(1); }} className="hover:text-zinc-300 underline">Mudar tipo</button>
                <span>·</span>
                <button onClick={() => { setSearch(""); setStep(3); }} className="hover:text-zinc-300 underline">Mudar jogador</button>
                {eventType === "GOAL" && (
                  <>
                    <span>·</span>
                    <button onClick={() => { setSearch(""); setStep(3.5); }} className="hover:text-zinc-300 underline">Mudar assistência</button>
                  </>
                )}
              </div>

              <div className="mt-5 flex gap-3">
                <button onClick={onClose} className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider">
                  Cancelar
                </button>
                <button onClick={save} disabled={saving}
                  className="flex-[2] rounded-xl bg-amber-600 py-3 text-sm font-black text-white hover:bg-amber-500 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-amber-900/20">
                  {saving ? "Salvando..." : "✏️ Salvar Edição"}
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

- [ ] **Step 7: Mount `EditEventModal` in `MatchPage` JSX**

At the end of the `MatchPage` return, just before the closing `</div>`, add after the existing `{showVoteModal && ...}` blocks:

```tsx
{editingEvent && detail && (
  <EditEventModal
    event={editingEvent}
    detail={detail}
    onClose={() => setEditingEvent(null)}
    onSaved={() => { setEditingEvent(null); void reload(); }}
  />
)}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the changed file.

- [ ] **Step 9: Manual test**

Open a completed match (`/games/[id]` where match status is COMPLETED). Verify:
- Pencil icon appears on every event row
- Clicking pencil opens `EditEventModal` pre-filled with event data
- Changing assist player on a GOAL and confirming updates the event correctly
- Trash button is hidden (readonly) for completed matches
- "Evento" button in the controls bar now appears for completed matches

- [ ] **Step 10: Commit**

```bash
git add "app/(protected)/games/[id]/page.tsx"
git commit -m "feat: edit-in-place for match events in completed súmulas"
```

---

## Feature 2: Admin Prize Overrides

### Task 2: DB Migration — `championship_prize_overrides`

**Files:**
- Create: `supabase/migrations/20260620000000_championship_prize_overrides.sql`

- [ ] **Step 1: Create migration file**

```sql
BEGIN;

-- override_value stores registration_id for player prizes (craque, goleiro, revelacao)
-- and championship_team_id for the tecnico prize.
-- No FK constraint intentionally — allows storing either entity type.
CREATE TABLE public.championship_prize_overrides (
  championship_id uuid NOT NULL REFERENCES public.championships(id) ON DELETE CASCADE,
  prize_key       text NOT NULL CHECK (prize_key IN ('craque', 'goleiro', 'revelacao', 'tecnico')),
  override_value  uuid NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (championship_id, prize_key)
);

ALTER TABLE public.championship_prize_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON public.championship_prize_overrides
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "auth_write" ON public.championship_prize_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT ON public.championship_prize_overrides TO anon, authenticated;

COMMIT;
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applies cleanly. Verify in Supabase dashboard that `championship_prize_overrides` table exists with `championship_id`, `prize_key`, `override_value`, `updated_at` columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000000_championship_prize_overrides.sql
git commit -m "feat: add championship_prize_overrides table for manual prize winners"
```

---

### Task 3: Admin Prize Overrides UI in Settings Page

**Files:**
- Modify: `app/(protected)/championship/settings/page.tsx`

- [ ] **Step 1: Add prize-related type and constants after the existing imports**

After the `GlobalSettings` type definition, add:

```tsx
type PrizeKey = 'craque' | 'goleiro' | 'revelacao' | 'tecnico';

const PRIZE_LABELS: Record<PrizeKey, { label: string; emoji: string; isTeam: boolean }> = {
  craque:    { label: "Melhor Jogador",  emoji: "⭐", isTeam: false },
  goleiro:   { label: "Melhor Goleiro",  emoji: "🧤", isTeam: false },
  revelacao: { label: "Revelação",       emoji: "🚀", isTeam: false },
  tecnico:   { label: "Técnico",         emoji: "📋", isTeam: true  },
};
```

- [ ] **Step 2: Add prize state to `SettingsPage`**

Inside `SettingsPage`, after the `const [savingPodium, setSavingPodium] = useState(false);` line, add:

```tsx
const [registeredPlayers, setRegisteredPlayers] = useState<{ id: string; name: string }[]>([]);
const [prizeOverrides, setPrizeOverrides] = useState<Partial<Record<PrizeKey, string>>>({});
const [savingPrize, setSavingPrize] = useState<PrizeKey | null>(null);
```

- [ ] **Step 3: Extend the existing `useEffect` to fetch players and overrides**

Find the existing `useEffect` that starts with:
```tsx
useEffect(() => {
  if (!championship?.id) return;
  void (async () => {
    const [teamsRes, champRes] = await Promise.all([
```

Change `const [teamsRes, champRes]` to `const [teamsRes, champRes, playersRes, overridesRes]` and add two more fetches to the array:

```tsx
const [teamsRes, champRes, playersRes, overridesRes] = await Promise.all([
  supabase
    .from("championship_teams")
    .select("id, teams ( name )")
    .eq("championship_id", championship.id),
  supabase
    .from("championships")
    .select("champion_team_id, runner_up_team_id, third_place_team_id")
    .eq("id", championship.id)
    .maybeSingle(),
  supabase
    .from("championship_registrations")
    .select("id, players(name)")
    .eq("championship_id", championship.id),
  supabase
    .from("championship_prize_overrides")
    .select("prize_key, override_value")
    .eq("championship_id", championship.id),
]);
```

Then, after the existing `setChampTeams` and `setPodium` calls, add:

```tsx
const players = ((playersRes.data ?? []) as any[]).map((r) => ({
  id: r.id as string,
  name: (Array.isArray(r.players) ? r.players[0]?.name : r.players?.name) as string ?? r.id,
})).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
setRegisteredPlayers(players);

const overrides: Partial<Record<PrizeKey, string>> = {};
for (const row of (overridesRes.data ?? []) as { prize_key: string; override_value: string }[]) {
  overrides[row.prize_key as PrizeKey] = row.override_value;
}
setPrizeOverrides(overrides);
```

- [ ] **Step 4: Add `handleSavePrizeOverride` function**

After the `handleSavePodium` function, add:

```tsx
async function handleSavePrizeOverride(prizeKey: PrizeKey, overrideValue: string | null) {
  if (!championship?.id) return;
  setSavingPrize(prizeKey);
  try {
    if (overrideValue) {
      await supabase.from("championship_prize_overrides").upsert({
        championship_id: championship.id,
        prize_key: prizeKey,
        override_value: overrideValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: "championship_id,prize_key" });
      setPrizeOverrides(prev => ({ ...prev, [prizeKey]: overrideValue }));
      toast.success("Prêmio salvo");
    } else {
      await supabase.from("championship_prize_overrides")
        .delete()
        .eq("championship_id", championship.id)
        .eq("prize_key", prizeKey);
      setPrizeOverrides(prev => { const next = { ...prev }; delete next[prizeKey]; return next; });
      toast.success("Override removido");
    }
  } catch {
    toast.error("Erro ao salvar prêmio");
  } finally {
    setSavingPrize(null);
  }
}
```

- [ ] **Step 5: Add prizes section to JSX**

After the `{/* RESULTADO FINAL / PÓDIO */}` closing `</section>` tag (around line 392 in the original), add:

```tsx
{/* PRÊMIOS INDIVIDUAIS */}
<section className="rounded-xl border border-[var(--gala-line)] bg-[var(--gala-panel)] p-5">
  <h3 className="mb-1 flex items-center gap-2 text-sm font-black">
    <Trophy className="h-4 w-4 text-[var(--gala-gold-2)]" />
    Prêmios Individuais
  </h3>
  <p className="mb-4 text-xs text-[var(--gala-ink-dim)]">
    Define o vencedor votado de cada prêmio. Substitui o resultado algorítmico nas páginas públicas.
  </p>
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    {(Object.entries(PRIZE_LABELS) as [PrizeKey, typeof PRIZE_LABELS[PrizeKey]][]).map(([key, { label, emoji, isTeam }]) => {
      const options = isTeam ? champTeams : registeredPlayers;
      return (
        <div key={key} className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">
            {emoji} {label}
          </label>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-[var(--gala-line)] bg-[var(--gala-bg-0)] px-3 py-2 text-sm"
              value={prizeOverrides[key] ?? ""}
              onChange={(e) => void handleSavePrizeOverride(key, e.target.value || null)}
              disabled={savingPrize === key}
            >
              <option value="">— Sem override (automático) —</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {prizeOverrides[key] && (
              <button
                onClick={() => void handleSavePrizeOverride(key, null)}
                disabled={savingPrize === key}
                className="rounded-lg border border-red-900/50 px-2 py-1 text-xs text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-50"
                title="Remover override"
              >
                ✕
              </button>
            )}
          </div>
          {savingPrize === key && (
            <p className="text-[10px] text-[var(--gala-ink-dim)]">Salvando...</p>
          )}
        </div>
      );
    })}
  </div>
</section>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Manual test**

Open `/championship/settings`. Scroll to "Prêmios Individuais" section. Verify:
- Dropdowns populate with players (or teams for Técnico).
- Selecting a player saves immediately and shows current override.
- ✕ button clears the override.
- Reload: override persists from DB.

- [ ] **Step 8: Commit**

```bash
git add "app/(protected)/championship/settings/page.tsx"
git commit -m "feat: admin UI for individual prize overrides in championship settings"
```

---

### Task 4: Update `usePublicRankings` to Apply Overrides

**Files:**
- Modify: `lib/public/types.ts`
- Modify: `features/hooks/usePublicRankings.ts`

- [ ] **Step 1: Add `isOverride` to `RankingEntry` type**

Open `lib/public/types.ts`. Find the `RankingEntry` type (it has fields `registrationId`, `playerName`, `teamName`, `teamLogoUrl`, `photoUrl`, `position`, `value`, `detail`).

Add `isOverride?: boolean` to the type:

```ts
export type RankingEntry = {
  registrationId: string;
  playerName: string;
  teamName: string | null;
  teamLogoUrl: string | null;
  photoUrl: string | null;
  position: string | null;
  value: number;
  detail?: string | null;
  isOverride?: boolean;
};
```

- [ ] **Step 2: Add `PrizeOverrideRow` type to `usePublicRankings.ts`**

After the `RevelationRow` type definition, add:

```ts
type PrizeOverrideRow = {
  prize_key: string;
  override_value: string;
};
```

- [ ] **Step 3: Add override fetch to the `load` Promise.all**

In the `load` function, find the `Promise.all` call. Add `overridesRes` as the last item:

```ts
const [playersRes, statsRes, votesRes, iogRes, revRes, managerVotesRes, champRes, overridesRes] = await Promise.all([
  supabase.from("public_players").select("*").eq("championship_id", championshipId),
  supabase.from("public_player_stats").select("*").eq("championship_id", championshipId),
  supabase.from("best_player_votes").select("registration_id, points").eq("championship_id", championshipId),
  supabase.rpc("public_goalkeeper_iog", { p_championship_id: championshipId }),
  supabase.rpc("public_revelation_candidates", { p_championship_id: championshipId }),
  supabase
    .from("public_best_manager_votes")
    .select("championship_team_id, team_name, team_logo_url, manager_name, manager_photo, points")
    .eq("championship_id", championshipId),
  supabase.from("championships").select("period_duration, periods_count").eq("id", championshipId).maybeSingle(),
  supabase.from("championship_prize_overrides").select("prize_key, override_value").eq("championship_id", championshipId),
]);
```

- [ ] **Step 4: Add `applyOverride` helper inside `load`, before `setRankings`**

After the `const managers = ...` line and before `setRankings`, add:

```ts
const overrideMap = new Map<string, string>(
  ((overridesRes.data ?? []) as PrizeOverrideRow[]).map(r => [r.prize_key, r.override_value])
);

function applyPlayerOverride(prizeKey: string, entries: RankingEntry[]): RankingEntry[] {
  const overrideId = overrideMap.get(prizeKey);
  if (!overrideId) return entries;
  const p = byId.get(overrideId);
  if (!p) return entries;
  const overrideEntry: RankingEntry = {
    registrationId: p.registrationId,
    playerName: p.playerName,
    teamName: p.teamName,
    teamLogoUrl: p.teamLogoUrl,
    photoUrl: p.photoUrl,
    position: p.position,
    value: 0,
    isOverride: true,
  };
  return [overrideEntry, ...entries.filter(e => e.registrationId !== overrideId)];
}

function applyTeamOverride(prizeKey: string, entries: RankingEntry[]): RankingEntry[] {
  const overrideTeamId = overrideMap.get(prizeKey);
  if (!overrideTeamId) return entries;
  const existing = entries.find(e => e.registrationId === overrideTeamId);
  if (!existing) return entries;
  return [{ ...existing, isOverride: true }, ...entries.filter(e => e.registrationId !== overrideTeamId)];
}
```

- [ ] **Step 5: Apply overrides in `setRankings`**

Change the `setRankings` call to wrap each ranking:

```ts
setRankings({
  players, stats,
  topScorers: buildStatRanking(stats, players, (s) => s.goals, topN),
  topAssists: buildStatRanking(stats, players, (s) => s.assists, topN),
  craque: applyPlayerOverride('craque', buildVoteRanking(voteTotals, players, topN)),
  craqueByPosition: groupRankingByPosition(voteTotals, players, topN),
  goalkeepers: applyPlayerOverride('goleiro', goalkeepers),
  revelations: applyPlayerOverride('revelacao', revelations),
  managers: applyTeamOverride('tecnico', managers),
});
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add lib/public/types.ts features/hooks/usePublicRankings.ts
git commit -m "feat: inject prize overrides into public rankings at rank 1"
```

---

### Task 5: Show Override Badge in Public Display Components

**Files:**
- Modify: `components/landing/PremiosTab.tsx`
- Modify: `components/public/stats/RankingsTab.tsx`

Note: `components/landing/PodiumBlock.tsx` needs no changes — it reads `rankings.craque[0]`, `rankings.goalkeepers[0]`, `rankings.revelations[0]`, `rankings.managers[0]` which already reflect the override from Task 4.

- [ ] **Step 1: Add override badge in `PremiosTab` — `AwardCard` component**

In `components/landing/PremiosTab.tsx`, find in `AwardCard`:
```tsx
<div className="min-w-0 flex-1">
  <p className="truncate font-bold text-white">{entry.playerName}</p>
  <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">{entry.teamName}</p>
  {entry.detail && (
    <p className="text-[10px] text-[var(--gala-gold-2)] font-bold mt-0.5">{entry.detail}</p>
  )}
</div>
```

Replace with:
```tsx
<div className="min-w-0 flex-1">
  <div className="flex items-center gap-1.5 flex-wrap">
    <p className="truncate font-bold text-white">{entry.playerName}</p>
    {entry.isOverride && (
      <span
        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
        style={{ background: "rgba(212,160,23,0.15)", border: "1px solid var(--gala-gold-3)", color: "var(--gala-gold-2)" }}
      >
        ★ Premiado
      </span>
    )}
  </div>
  <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">{entry.teamName}</p>
  {entry.detail && (
    <p className="text-[10px] text-[var(--gala-gold-2)] font-bold mt-0.5">{entry.detail}</p>
  )}
</div>
```

- [ ] **Step 2: Add override badge in `RankingsTab` — `Row` component**

In `components/public/stats/RankingsTab.tsx`, find in `Row`:
```tsx
<span className="flex-1 truncate">
  {entry.playerName}
  <small className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
    {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
  </small>
</span>
```

Replace with:
```tsx
<span className="flex-1 min-w-0">
  <span className="flex items-center gap-1 flex-wrap">
    <span className="truncate">{entry.playerName}</span>
    {entry.isOverride && (
      <span
        className="shrink-0 rounded-full px-1 py-0.5 text-[8px] font-black uppercase"
        style={{ background: "rgba(212,160,23,0.12)", border: "1px solid var(--gala-gold-3)", color: "var(--gala-gold-2)" }}
      >
        ★
      </span>
    )}
  </span>
  <small className="block text-[10px] uppercase tracking-wide text-[var(--gala-ink-dim)]">
    {entry.teamName ?? "—"}{entry.detail ? ` · ${entry.detail}` : ""}
  </small>
</span>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual test**

In championship settings, set a Revelação override. Open the public `/stats/[championshipId]` page → Rankings tab → check "Revelações" card shows the override player at rank 1 with ★ badge. Also open the tournament landing page → Prêmios tab → confirm the badge appears.

- [ ] **Step 5: Commit**

```bash
git add components/landing/PremiosTab.tsx components/public/stats/RankingsTab.tsx
git commit -m "feat: show ★ Premiado badge for manual prize override winners"
```

---

## Feature 3: Responsive Public Pages

### Task 6: Root Overflow Fix + Mobile Navigation

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/landing/LandingHeader.tsx`

Context: The root `app/layout.tsx` gives `main` `pl-10 pr-10` (40px padding each side). `LandingShell` uses `margin: "0 -40px"` to make landing pages full-width, which overflows on mobile. Fix: `overflow-x-hidden` on body. `LandingHeader` hides nav on mobile with no fallback — add hamburger menu.

- [ ] **Step 1: Fix root overflow**

In `app/layout.tsx`, find:
```tsx
<body className="bg-zinc-950 text-zinc-100 min-h-screen">
```

Replace with:
```tsx
<body className="bg-zinc-950 text-zinc-100 min-h-screen overflow-x-hidden">
```

- [ ] **Step 2: Rewrite `LandingHeader` with hamburger menu**

Replace the entire content of `components/landing/LandingHeader.tsx` with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface LandingHeaderProps {
  liveChampionshipId: string | null;
  onLoginClick: () => void;
}

const NAV_LINKS = [
  { href: "/copa-do-mundo", label: "Copa do Mundo" },
  { href: "/champions-league", label: "Champions League" },
  { href: "/historico", label: "Histórico" },
];

export default function LandingHeader({ liveChampionshipId, onLoginClick }: LandingHeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 sm:px-8 md:px-14"
        style={{
          background: "rgba(5,5,7,0.88)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: "1px solid var(--gala-line)",
        }}
      >
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl">⚽</span>
          <span
            className="font-serif font-extrabold tracking-widest text-base uppercase"
            style={{
              background:
                "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            LIFAS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs font-bold uppercase tracking-widest transition-colors"
                style={{ color: active ? "var(--gala-gold-2)" : "var(--gala-ink-dim)" }}
              >
                {link.label}
              </Link>
            );
          })}
          {liveChampionshipId && (
            <Link
              href={`/live/${liveChampionshipId}`}
              className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Ao Vivo
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <button
            onClick={onLoginClick}
            className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90 shrink-0"
            style={{ background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))" }}
          >
            Entrar
          </button>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-[var(--gala-ink-dim)] transition-colors hover:text-white"
            style={{ background: "rgba(212,160,23,0.06)", border: "1px solid var(--gala-line)" }}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </header>

      {/* Mobile dropdown nav */}
      {menuOpen && (
        <div
          className="md:hidden sticky top-[53px] z-40"
          style={{ background: "rgba(5,5,7,0.96)", borderBottom: "1px solid var(--gala-line)" }}
        >
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className="block px-6 py-3.5 text-xs font-bold uppercase tracking-widest transition-colors"
              style={{
                color: pathname.startsWith(link.href) ? "var(--gala-gold-2)" : "var(--gala-ink-dim)",
                borderBottom: "1px solid var(--gala-line)",
              }}
            >
              {link.label}
            </Link>
          ))}
          {liveChampionshipId && (
            <Link
              href={`/live/${liveChampionshipId}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-6 py-3.5 text-xs font-bold uppercase tracking-widest text-red-400"
              style={{ borderBottom: "1px solid var(--gala-line)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              Ao Vivo
            </Link>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Manual test on 375px viewport**

Open DevTools → set viewport to 375px wide. Verify:
- No horizontal scroll on any landing page
- Hamburger (☰) appears in top-right of header
- Clicking ☰ opens dropdown with all nav links
- Nav links navigate correctly and close the dropdown

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx components/landing/LandingHeader.tsx
git commit -m "fix: prevent horizontal overflow on mobile, add hamburger nav to landing header"
```

---

### Task 7: Landing Page Padding Fixes

**Files:**
- Modify: `app/(landing)/page.tsx`
- Modify: `components/landing/HomeTournamentCards.tsx`
- Modify: `components/landing/HomeNumbersBar.tsx`
- Modify: `components/landing/PodiumBlock.tsx`
- Modify: `components/landing/TournamentTabs.tsx`

- [ ] **Step 1: Fix landing home page section padding**

In `app/(landing)/page.tsx`, find:
```tsx
<section className="px-8 py-12 md:px-14">
```

Replace with:
```tsx
<section className="px-4 py-8 sm:px-8 md:py-12 md:px-14">
```

- [ ] **Step 2: Fix `HomeTournamentCards` paddings**

In `components/landing/HomeTournamentCards.tsx`, find:
```tsx
<section className="w-full px-8 py-12 md:px-14">
```

Replace with:
```tsx
<section className="w-full px-4 py-8 sm:px-8 md:py-12 md:px-14">
```

Also find the `TournamentCard` Link padding:
```tsx
className="group relative flex-1 min-w-0 rounded-2xl p-8 flex flex-col gap-4 transition-all hover:scale-[1.01]"
```

Replace with:
```tsx
className="group relative flex-1 min-w-0 rounded-2xl p-5 sm:p-8 flex flex-col gap-4 transition-all hover:scale-[1.01]"
```

- [ ] **Step 3: Fix `HomeNumbersBar` padding**

In `components/landing/HomeNumbersBar.tsx`, find:
```tsx
className="w-full py-10 px-8 md:px-14"
```

Replace with:
```tsx
className="w-full py-8 px-4 sm:px-8 md:py-10 md:px-14"
```

- [ ] **Step 4: Fix `PodiumBlock` paddings**

In `components/landing/PodiumBlock.tsx`, find:
```tsx
className="w-full px-8 py-8 md:px-10"
```

Replace with:
```tsx
className="w-full px-4 py-6 sm:px-8 md:py-8 md:px-10"
```

Find the podium row:
```tsx
<div className="mb-8 flex items-end justify-center gap-4">
```

Replace with:
```tsx
<div className="mb-6 flex items-end justify-center gap-2 sm:gap-4">
```

- [ ] **Step 5: Fix `TournamentTabs` content padding**

In `components/landing/TournamentTabs.tsx`, find:
```tsx
<div className="px-6 py-8 md:px-10">
```

Replace with:
```tsx
<div className="px-4 py-6 sm:px-6 md:py-8 md:px-10">
```

- [ ] **Step 6: Manual test all landing pages at 375px**

Check `/`, `/copa-do-mundo`, `/champions-league`, `/historico`. Verify:
- No horizontal scroll
- Cards stack vertically
- Text doesn't overflow containers
- Tournament sidebar shows chip row (already implemented in `TournamentSidebar`)

- [ ] **Step 7: Commit**

```bash
git add "app/(landing)/page.tsx" components/landing/HomeTournamentCards.tsx components/landing/HomeNumbersBar.tsx components/landing/PodiumBlock.tsx components/landing/TournamentTabs.tsx
git commit -m "fix: responsive paddings across landing page components"
```

---

### Task 8: Public Stats Page Mobile Fix

**Files:**
- Modify: `app/(public)/stats/[championshipId]/page.tsx`

Context: The page uses `max-w-5xl px-4` (already mobile-friendly). Grids in `RankingsTab`, `StandingsTab`, `PlayersTab` are already responsive. The main potential issue is the tab nav overflowing on very narrow screens.

- [ ] **Step 1: Make stats tab nav scrollable**

In `app/(public)/stats/[championshipId]/page.tsx`, find:
```tsx
<nav className="mt-5 flex justify-center gap-1" role="tablist">
```

Replace with:
```tsx
<nav className="mt-5 flex gap-1 overflow-x-auto pb-1 justify-start sm:justify-center" role="tablist">
```

- [ ] **Step 2: Manual test at 375px**

Open `/stats/[any-championship-id]`. Verify:
- Tabs are scrollable horizontally if they overflow
- Rankings grid stacks to 1 column on mobile
- Standings tables scroll horizontally within their own containers
- Player grid stacks to 1 column, filters stack vertically

- [ ] **Step 3: Commit**

```bash
git add "app/(public)/stats/[championshipId]/page.tsx"
git commit -m "fix: make public stats tab nav scrollable on mobile"
```

---

### Task 9: Live Page Mobile Safety

**Files:**
- Modify: `app/(public)/live/[championshipId]/page.tsx`

Context: The live page is a TV/presentation mode (fullscreen carousel with cursor-hide and wake-lock). It's not designed for mobile but should not crash or cause horizontal overflow.

- [ ] **Step 1: Prevent horizontal overflow on live page**

In `app/(public)/live/[championshipId]/page.tsx`, find:
```tsx
return (
  <main className={cursorHidden ? "cursor-none" : ""}>
```

Replace with:
```tsx
return (
  <main className={`overflow-x-hidden w-full${cursorHidden ? " cursor-none" : ""}`}>
```

- [ ] **Step 2: Commit**

```bash
git add "app/(public)/live/[championshipId]/page.tsx"
git commit -m "fix: prevent horizontal overflow on live page for mobile viewports"
```
