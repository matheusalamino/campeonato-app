# Goal Soundtrack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play a 10-second clip of a national team's soundtrack whenever a goal is recorded in the súmula page.

**Architecture:** A static lookup utility (`lib/team-soundtracks.ts`) maps normalized team names to existing audio files in `public/audios/soundtracks/`. The utility is called directly in `AddEventSheet.save()` after the event saves successfully. Module-level audio state prevents stacking sounds from rapid goal entries.

**Tech Stack:** Next.js 14 App Router, TypeScript, HTML5 Audio API, existing audio files in `public/audios/soundtracks/`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/team-soundtracks.ts` | **Create** | Static map + `playTeamSoundtrack()` function |
| `app/(protected)/games/[id]/page.tsx` | **Modify** | Import utility, call after goal saves in `AddEventSheet.save()` |

---

### Task 1: Create `lib/team-soundtracks.ts`

**Files:**
- Create: `lib/team-soundtracks.ts`

- [ ] **Step 1: Create the file**

```typescript
// lib/team-soundtracks.ts
const SOUNDTRACKS: Record<string, string> = {
  argentina: "/audios/soundtracks/argentina.mp3",
  brasil:    "/audios/soundtracks/brasil.mp4",
  espanha:   "/audios/soundtracks/espanha.mp3",
  franca:    "/audios/soundtracks/franca.mp3",
  japao:     "/audios/soundtracks/japao.mp4",
  mexico:    "/audios/soundtracks/mexico.mp3",
  portugal:  "/audios/soundtracks/portugal.mp3",
  usa:       "/audios/soundtracks/usa.mp3",
};

const STOP_AFTER_MS = 10_000;

let currentAudio: HTMLAudioElement | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

export function playTeamSoundtrack(teamName: string): void {
  if (typeof window === "undefined") return;

  const key = teamName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");

  const src = SOUNDTRACKS[key];
  if (!src) return;

  if (stopTimer !== null) clearTimeout(stopTimer);
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  try {
    const audio = new Audio(src);
    audio.preload = "auto";
    currentAudio = audio;
    void audio.play().catch(() => undefined);
    stopTimer = setTimeout(() => {
      audio.pause();
      currentAudio = null;
      stopTimer = null;
    }, STOP_AFTER_MS);
  } catch {
    // Silently ignore any playback errors
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/team-soundtracks.ts
git commit -m "feat: add team soundtrack utility with 10s playback"
```

---

### Task 2: Trigger soundtrack in `AddEventSheet` after goal save

**Files:**
- Modify: `app/(protected)/games/[id]/page.tsx` — lines 1-15 (import) and lines 395–408 (`save()` function success block)

Context: `AddEventSheet` (line 313) receives `detail: MatchDetail` which has `detail.homeTeam.championshipTeamId`, `detail.homeTeam.name`, `detail.awayTeam.championshipTeamId`, `detail.awayTeam.name`. Inside the component, `teamId` is the selected team's `championshipTeamId` and `opposingTeamId` (line 329) is already computed as the other team.

- [ ] **Step 1: Add import at top of `app/(protected)/games/[id]/page.tsx`**

Find the existing import block (around line 10–21). Add after the last import:

```typescript
import { playTeamSoundtrack } from "@/lib/team-soundtracks";
```

- [ ] **Step 2: Add soundtrack call in `save()` after the success toast**

In the `save()` function, the success block is at lines 396–407:

```typescript
    setSaving(false);
    const label =
      eventType === "PENALTY"
        ? penaltyOutcome === "PENALTY_GOAL"
          ? "Gol de pênalti"
          : penaltyOutcome === "PENALTY_SAVED"
          ? "Pênalti defendido"
          : "Pênalti (fora)"
        : (EVENT_META[eventType]?.label ?? eventType);
    toast.success(`${label} registrado em ${formatTime(elapsed)}`);
    onSaved();
    onClose();
```

Replace with:

```typescript
    setSaving(false);
    const label =
      eventType === "PENALTY"
        ? penaltyOutcome === "PENALTY_GOAL"
          ? "Gol de pênalti"
          : penaltyOutcome === "PENALTY_SAVED"
          ? "Pênalti defendido"
          : "Pênalti (fora)"
        : (EVENT_META[eventType]?.label ?? eventType);
    toast.success(`${label} registrado em ${formatTime(elapsed)}`);

    const isGoalEvent =
      eventType === "GOAL" ||
      eventType === "OWN_GOAL" ||
      (eventType === "PENALTY" && penaltyOutcome === "PENALTY_GOAL");
    if (isGoalEvent) {
      // OWN_GOAL: the celebrating team is the one that didn't commit the own goal
      const scoringTeamId = eventType === "OWN_GOAL" ? opposingTeamId : teamId;
      const teamName =
        scoringTeamId === detail.homeTeam.championshipTeamId
          ? detail.homeTeam.name
          : detail.awayTeam.name;
      playTeamSoundtrack(teamName);
    }

    onSaved();
    onClose();
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test — regular goal**

1. Open a match in the súmula page in the browser
2. Tap the `+` button to add an event
3. Select "Gol", pick a national team (e.g., Brasil), pick a player, confirm
4. Expected: success toast appears **and** the Brasil soundtrack plays for ~10 seconds then stops

- [ ] **Step 5: Manual test — own goal**

1. Add an event, select "G. Contra", pick team A (the team conceding the own goal), pick a player
2. Expected: team **B**'s soundtrack plays (the team that benefits from the own goal)

- [ ] **Step 6: Manual test — penalty goal**

1. Add a "Pênalti" event, pick the shooter team, pick a player, select outcome "Gol"
2. Expected: that team's soundtrack plays

- [ ] **Step 7: Manual test — rapid goals**

1. Record two goals in quick succession (before 10 seconds elapses)
2. Expected: first sound stops immediately, second team's sound starts — no overlap

- [ ] **Step 8: Commit**

```bash
git add app/\(protected\)/games/\[id\]/page.tsx
git commit -m "feat: play team soundtrack on goal in súmula page"
```
