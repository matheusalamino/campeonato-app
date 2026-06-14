# Goal Soundtrack Feature — Design Spec

**Date:** 2026-06-13
**Branch:** feature/best-player-championship (or new feature branch)
**Status:** Approved

---

## Overview

When a match official records a goal in the súmula page, the national team's soundtrack plays automatically for 10 seconds. This applies to GOAL, PENALTY_GOAL, and OWN_GOAL events. For an own goal, the celebrating team's (opposing team's) soundtrack plays, not the conceding team's.

---

## Approach

Approach A: static lookup map + inline playback. A small utility file holds the team → file mapping and the `playTeamSoundtrack()` function. The call site is `AddEventSheet` immediately after `addMatchEvent()` resolves successfully.

---

## New File: `lib/team-soundtracks.ts`

Static map from normalized team name to soundtrack path. All files already exist under `public/audios/soundtracks/`.

```
argentina → /audios/soundtracks/argentina.mp3
brasil    → /audios/soundtracks/brasil.mp4
espanha   → /audios/soundtracks/espanha.mp3
franca    → /audios/soundtracks/franca.mp3
japao     → /audios/soundtracks/japao.mp4
mexico    → /audios/soundtracks/mexico.mp3
portugal  → /audios/soundtracks/portugal.mp3
usa       → /audios/soundtracks/usa.mp3
```

**Normalization:** `teamName.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "")` — converts accented characters before lookup (`"França"` → `"franca"`, `"Japão"` → `"japao"`).

**Module-level state:**
- `currentAudio: HTMLAudioElement | null` — reference to the currently playing audio instance
- `stopTimer: ReturnType<typeof setTimeout> | null` — reference to the 10s stop timer

**Exported function:**
```typescript
export function playTeamSoundtrack(teamName: string): void
```

Logic:
1. Return early if `typeof window === "undefined"` (SSR guard)
2. Normalize team name and look up in map; return silently if not found
3. Clear any existing `stopTimer` and pause any `currentAudio`
4. Create new `Audio(src)`, call `.play()` (catch and ignore rejections)
5. Set `stopTimer` to pause audio after 10 000 ms

---

## Modified File: `app/(protected)/games/[id]/page.tsx`

**Props added to `AddEventSheet`:** `homeTeamId`, `homeTeamName`, `awayTeamId`, `awayTeamName` — all already available in the page's match detail state.

**After `addMatchEvent()` succeeds**, determine which team name to play:

| Event type   | Team name to play                                   |
|--------------|-----------------------------------------------------|
| GOAL         | `selectedTeam` name                                 |
| PENALTY_GOAL | `selectedTeam` name                                 |
| OWN_GOAL     | The other team's name (home if selected is away, and vice versa) |

Call `playTeamSoundtrack(resolvedTeamName)` immediately before or after the success toast.

---

## Edge Cases

| Scenario | Behavior |
|---|---|
| Browser autoplay policy blocks playback | `.catch(() => undefined)` + outer `try/catch` — silent fail, no UI impact |
| Second goal recorded while audio is playing | Previous audio paused and timer cleared before new audio starts |
| Team has no soundtrack (future non-national teams) | `playTeamSoundtrack` returns early silently |
| SSR / server context | Guarded by `typeof window === "undefined"` check |
| Mixed file extensions (.mp3 / .mp4) | Handled explicitly by the static map |

---

## Out of Scope

- Spectator / live score pages — audio plays only for the match official in the súmula page
- Volume controls or mute toggle — not requested
- Converting .mp4 files to .mp3 — HTML5 Audio handles both formats natively
- Adding soundtracks for teams beyond the current 8 national teams — handled by silent no-op

---

## Files Changed

| File | Change |
|---|---|
| `lib/team-soundtracks.ts` | **New** — static map + `playTeamSoundtrack()` |
| `app/(protected)/games/[id]/page.tsx` | **Modified** — pass team props to AddEventSheet, call `playTeamSoundtrack` after goal save |
