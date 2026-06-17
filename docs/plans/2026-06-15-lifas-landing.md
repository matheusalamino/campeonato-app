# LIFAS Public Landing Site — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully public LIFAS landing site at `/` with a statistics dashboard at `/statistics` and an admin login modal, using the existing gala dark-gold design system.

**Architecture:** New `app/(landing)/` route group with its own layout containing a sticky glassmorphism header and a `"use client"` shell that owns login-modal state. All data fetching in page-level RSCs; interactive pieces (season selector, login modal) are isolated client components. Protected dashboard moves from `/` to `/dashboard` to eliminate route conflict.

**Tech Stack:** Next.js 16 App Router (RSC + client components), Supabase SSR (`@supabase/ssr`), Tailwind CSS with existing gala CSS variables, lucide-react icons, Vitest for pure-function tests.

---

## File Map

### New files
| Path | Responsibility |
|---|---|
| `app/(landing)/layout.tsx` | RSC layout: fetches `latestChampionshipId`, renders `LandingShell` |
| `app/(landing)/LandingShell.tsx` | `"use client"` wrapper: owns `loginOpen` state, renders header + modal |
| `app/(landing)/page.tsx` | RSC: fetches all landing data, composes hero + numbers sections |
| `app/(landing)/statistics/page.tsx` | RSC: fetches all stats data, composes season selector + two columns |
| `components/landing/LandingHeader.tsx` | Sticky glassmorphism nav bar |
| `components/landing/LoginModal.tsx` | `"use client"` login modal using `useLogin` hook |
| `components/landing/HeroSection.tsx` | Split hero: LIFAS story left, recent champions right |
| `components/landing/StatsChips.tsx` | 4 aggregate stat chips (reused on landing + stats pages) |
| `components/landing/TopScorersPreview.tsx` | Latest-season top-5 scorers with gold bars |
| `components/landing/SeasonStatsPanel.tsx` | `"use client"`: season pills + tab panel (Rankings/Standings/Discipline/Players) |
| `components/landing/AllTimePanel.tsx` | All-time records right column (RSC) |
| `lib/landing/queries.ts` | Server-side Supabase query functions + pure data mappers |
| `lib/landing/queries.test.ts` | Vitest tests for pure data-transformation functions |
| `features/hooks/useLogin.ts` | Extracted auth logic (shared by modal + `/login` page) |

### Modified files
| Path | Change |
|---|---|
| `app/(protected)/dashboard/page.tsx` | Moved from `app/(protected)/page.tsx` — URL changes `/` → `/dashboard` |
| `app/(protected)/page.tsx` | Deleted |
| `app/(auth)/login/page.tsx` | Uses `useLogin` hook; success redirect `"/"` → `"/dashboard"` |
| `components/Sidebar.tsx` | Dashboard link `href="/"` → `href="/dashboard"` |

---

## Task 1: Move protected dashboard to `/dashboard`

**Files:**
- Create: `app/(protected)/dashboard/page.tsx` (exact copy of current `app/(protected)/page.tsx`)
- Delete: `app/(protected)/page.tsx`
- Modify: `app/(auth)/login/page.tsx` line 56
- Modify: `components/Sidebar.tsx` line 134

- [ ] **Step 1: Create `/dashboard` page**

Create `app/(protected)/dashboard/page.tsx` with this exact content (copy from current `app/(protected)/page.tsx` — the Dashboard component unchanged):

```tsx
"use client";

import Link from "next/link";
import { Gamepad2, Trophy, BarChart3, ChevronRight, Activity, Crown, Shield } from "lucide-react";
import { useChampionship } from "@/components/ChampionshipContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Dashboard() {
  const { championship } = useChampionship();
  const [championTeam, setChampionTeam] = useState<{name: string, logo_url: string | null} | null>(null);

  useEffect(() => {
    async function loadChampion() {
      if (championship?.champion_team_id) {
        const supabase = createClient();
        const { data } = await supabase
          .from("championship_teams")
          .select("teams(name, logo_url)")
          .eq("id", championship.champion_team_id)
          .single();
        const team = Array.isArray(data?.teams) ? data.teams[0] : data?.teams;
        if (team) setChampionTeam(team);
      } else {
        setChampionTeam(null);
      }
    }
    loadChampion();
  }, [championship?.champion_team_id]);

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white uppercase tracking-tight">Dashboard</h1>
        <p className="text-zinc-500 text-sm">Gerenciamento central do campeonato.</p>
      </div>

      {championTeam && (
        <div className="relative overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-r from-yellow-900/20 via-yellow-600/10 to-transparent p-8 shadow-[0_0_40px_-10px_rgba(234,179,8,0.2)]">
          <div className="absolute -right-10 -top-10 opacity-10">
            <Crown className="w-64 h-64 text-yellow-500" />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-6">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-950 border-4 border-yellow-500 shadow-xl overflow-hidden p-1">
              {championTeam.logo_url ? (
                <img src={championTeam.logo_url} alt={championTeam.name} className="h-full w-full object-cover rounded-full" />
              ) : (
                <Shield className="h-10 w-10 text-zinc-500" />
              )}
            </div>
            <div className="text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
                <Crown className="w-5 h-5 text-yellow-500" />
                <span className="text-yellow-500 font-black uppercase tracking-[0.3em] text-sm">Campeão</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white">{championTeam.name}</h2>
              <p className="text-yellow-500/70 text-sm mt-1">O grande vencedor do campeonato!</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/games" className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-blue-500/50 transition-all duration-300">
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-blue-600/10 rounded-2xl group-hover:bg-blue-600 transition-colors duration-300">
                <Gamepad2 className="h-6 w-6 text-blue-500 group-hover:text-white" />
              </div>
              <Activity className="h-4 w-4 text-emerald-500 animate-pulse opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Jogos</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">Acompanhe as partidas em tempo real e resultados.</p>
            </div>
            <div className="pt-4 flex items-center text-blue-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Acessar Painel <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        <Link href="/championship/standings" className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-yellow-500/50 transition-all duration-300">
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-yellow-600/10 rounded-2xl group-hover:bg-yellow-600 transition-colors duration-300">
                <Trophy className="h-6 w-6 text-yellow-500 group-hover:text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Classificação</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">Veja a tabela de grupos e posições das equipes.</p>
            </div>
            <div className="pt-4 flex items-center text-yellow-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Ver Tabela <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        <Link href="/statistics" className="group relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/40 p-1 hover:border-purple-500/50 transition-all duration-300">
          <div className="relative z-10 flex flex-col h-full bg-zinc-950 rounded-[22px] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="p-3 bg-purple-600/10 rounded-2xl group-hover:bg-purple-600 transition-colors duration-300">
                <BarChart3 className="h-6 w-6 text-purple-500 group-hover:text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Estatísticas</h3>
              <p className="text-zinc-500 text-sm mt-1 leading-relaxed">Artilharia, assistências e disciplina do campeonato.</p>
            </div>
            <div className="pt-4 flex items-center text-purple-500 text-xs font-bold uppercase tracking-widest gap-1 group-hover:translate-x-1 transition-transform">
              Explorar Dados <ChevronRight className="h-3 w-3" />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      <div className="fixed top-0 right-0 -z-10 h-[500px] w-[500px] bg-blue-600/5 blur-[120px] rounded-full" />
      <div className="fixed bottom-0 left-0 -z-10 h-[400px] w-[400px] bg-purple-600/5 blur-[100px] rounded-full" />
    </div>
  );
}
```

- [ ] **Step 2: Delete the old root page**

```bash
rm app/\(protected\)/page.tsx
```

- [ ] **Step 3: Fix login redirect in `app/(auth)/login/page.tsx`**

On line 56, change `router.replace("/")` to `router.replace("/dashboard")`:

```tsx
// before:
router.replace("/");
// after:
router.replace("/dashboard");
```

- [ ] **Step 4: Fix Sidebar dashboard link in `components/Sidebar.tsx`**

On line 134, change `href="/"` to `href="/dashboard"`:

```tsx
// before:
href="/"
// after:
href="/dashboard"
```

- [ ] **Step 5: Verify build passes**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors about conflicting routes for `/`.

- [ ] **Step 6: Commit**

```bash
git add app/\(protected\)/dashboard/page.tsx app/\(auth\)/login/page.tsx components/Sidebar.tsx
git rm app/\(protected\)/page.tsx
git commit -m "refactor: move protected dashboard from / to /dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Extract `useLogin` hook

**Files:**
- Create: `features/hooks/useLogin.ts`
- Modify: `app/(auth)/login/page.tsx`

- [ ] **Step 1: Create `features/hooks/useLogin.ts`**

```ts
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function useLogin() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setErrorMessage(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage("Invalid email or password.");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (profile?.role === "manager") {
          router.replace("/team-manager");
          router.refresh();
          return;
        }
        if (profile?.role === "auction_fiscal") {
          router.replace("/auction-fiscal");
          router.refresh();
          return;
        }
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setErrorMessage("Could not connect. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function clearError() {
    setErrorMessage(null);
  }

  return { login, loading, errorMessage, clearError };
}
```

- [ ] **Step 2: Update `app/(auth)/login/page.tsx` to use the hook**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";
import { useLogin } from "@/features/hooks/useLogin";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, errorMessage } = useLogin();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  return (
    <div className="w-full max-w-md bg-zinc-900 p-8 rounded-xl border border-zinc-800 shadow-lg">
      <h1 className="text-3xl font-bold mb-6 text-center">🏆 Login</h1>
      <form onSubmit={handleLogin} className="space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          className="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          className="w-full bg-zinc-800 border border-zinc-700 p-3 rounded-lg"
          onChange={(e) => setPassword(e.target.value)}
        />
        {errorMessage && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {errorMessage}
          </p>
        )}
        <button
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60 transition py-3 rounded-lg font-semibold"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify the existing /login page still works**

```bash
npm run dev
```

Visit `http://localhost:3000/login` and confirm the login form renders. No functional change expected.

- [ ] **Step 4: Commit**

```bash
git add features/hooks/useLogin.ts app/\(auth\)/login/page.tsx
git commit -m "refactor: extract useLogin hook from login page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Landing layout, shell, and header

**Files:**
- Create: `components/landing/LandingHeader.tsx`
- Create: `app/(landing)/LandingShell.tsx`
- Create: `app/(landing)/layout.tsx`

- [ ] **Step 1: Create `components/landing/LandingHeader.tsx`**

```tsx
import Link from "next/link";

interface LandingHeaderProps {
  liveChampionshipId: string | null;
  onLoginClick: () => void;
}

export default function LandingHeader({ liveChampionshipId, onLoginClick }: LandingHeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 md:px-10"
      style={{
        background: "rgba(5,5,7,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--gala-line)",
      }}
    >
      <Link href="/" className="flex items-center gap-2">
        <span className="text-lg">⚽</span>
        <span
          className="font-serif font-extrabold tracking-widest text-sm uppercase"
          style={{
            background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS
        </span>
      </Link>

      <nav className="hidden sm:flex items-center gap-6">
        <Link
          href="/statistics"
          className="text-xs font-bold uppercase tracking-widest text-[var(--gala-ink-dim)] hover:text-[var(--gala-gold-2)] transition-colors"
        >
          Statistics
        </Link>
        {liveChampionshipId && (
          <Link
            href={`/live/${liveChampionshipId}`}
            className="text-xs font-bold uppercase tracking-widest text-[var(--gala-ink-dim)] hover:text-[var(--gala-gold-2)] transition-colors"
          >
            Live
          </Link>
        )}
      </nav>

      <button
        onClick={onLoginClick}
        className="rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
        }}
      >
        Admin Login
      </button>
    </header>
  );
}
```

- [ ] **Step 2: Create `app/(landing)/LandingShell.tsx`**

```tsx
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import LandingHeader from "@/components/landing/LandingHeader";
import LoginModal from "@/components/landing/LoginModal";

interface LandingShellProps {
  children: ReactNode;
  liveChampionshipId: string | null;
}

export default function LandingShell({ children, liveChampionshipId }: LandingShellProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div
      className="gala-bg antialiased text-[var(--gala-ink)]"
      style={{ margin: "0 -40px" }}
    >
      <LandingHeader
        liveChampionshipId={liveChampionshipId}
        onLoginClick={() => setLoginOpen(true)}
      />
      {children}
      <footer
        className="mt-16 py-6 text-center text-xs text-[var(--gala-ink-dim)]"
        style={{ borderTop: "1px solid var(--gala-line)" }}
      >
        © LIFAS · Liga de Futebol Adventista de Sorocaba · Sorocaba, SP
      </footer>
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(landing)/layout.tsx`**

```tsx
import { createClient } from "@/lib/supabase/server";
import LandingShell from "./LandingShell";
import type { ReactNode } from "react";

export default async function LandingLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  return <LandingShell liveChampionshipId={data?.id ?? null}>{children}</LandingShell>;
}
```

- [ ] **Step 4: Verify the route group shell renders**

Create a temporary stub at `app/(landing)/page.tsx`:

```tsx
export default function LandingPage() {
  return <div className="px-6 py-20 text-center text-white">Coming soon</div>;
}
```

Run `npm run dev` and visit `http://localhost:3000`. You should see the gala background, sticky header with "LIFAS" logo, and "Admin Login" button (clicking it will error since `LoginModal` doesn't exist yet — that's expected).

- [ ] **Step 5: Commit**

```bash
git add components/landing/LandingHeader.tsx app/\(landing\)/LandingShell.tsx app/\(landing\)/layout.tsx app/\(landing\)/page.tsx
git commit -m "feat: add (landing) route group with shell and header

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Login modal

**Files:**
- Create: `components/landing/LoginModal.tsx`

- [ ] **Step 1: Create `components/landing/LoginModal.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useLogin } from "@/features/hooks/useLogin";

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login, loading, errorMessage, clearError } = useLogin();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      setEmail("");
      setPassword("");
      clearError();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose, clearError]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const rect = dialogRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      dialogRef.current?.close();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await login(email, password);
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={handleBackdropClick}
      className="m-auto w-full max-w-sm rounded-xl p-0 backdrop:bg-[rgba(5,5,7,0.75)] backdrop:backdrop-blur-sm"
      style={{
        background: "#050507",
        borderTop: "2px solid var(--gala-gold-2)",
        borderLeft: "1px solid var(--gala-line)",
        borderRight: "1px solid var(--gala-line)",
        borderBottom: "1px solid var(--gala-line)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.8), 0 -4px 20px rgba(212,160,23,0.2)",
        color: "var(--gala-ink)",
      }}
    >
      <div className="relative p-8">
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          className="absolute right-4 top-4 text-sm text-[var(--gala-ink-dim)] hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="mb-6 text-center">
          <p className="text-[9px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Restricted Area
          </p>
          <h2 className="mt-1 text-xl font-black text-white">Administrator Login</h2>
          <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
            Only authorized admins may sign in
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[2px] text-[var(--gala-ink-dim)] mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent pb-2 text-sm text-white outline-none transition-colors"
              style={{ borderBottom: "1px solid var(--gala-line)" }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-gold-2)")}
              onBlur={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-line)")}
            />
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-[2px] text-[var(--gala-ink-dim)] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent pb-2 text-sm text-white outline-none transition-colors"
              style={{ borderBottom: "1px solid var(--gala-line)" }}
              onFocus={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-gold-2)")}
              onBlur={(e) => (e.currentTarget.style.borderBottomColor = "var(--gala-line)")}
            />
          </div>

          {errorMessage && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-lg py-3 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
            }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Verify the modal opens and closes**

Run `npm run dev`, visit `http://localhost:3000`, click "Admin Login". The modal should:
- Appear centered with gala styling and gold top border
- Close when clicking outside or pressing Escape
- Show gold-tinted label "Restricted Area"
- Show error message on wrong credentials
- Redirect on correct credentials

- [ ] **Step 3: Commit**

```bash
git add components/landing/LoginModal.tsx
git commit -m "feat: add admin login modal with gala top-accent design

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Server-side data query functions and tests

**Files:**
- Create: `lib/landing/queries.ts`
- Create: `lib/landing/queries.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `lib/landing/queries.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aggregateAllTimeScorers, mapChampionRows, type ChampionRow, type RawPlayerStat } from "./queries";

describe("aggregateAllTimeScorers", () => {
  it("sums goals for the same player name across seasons", () => {
    const players = [
      { registration_id: "r1", player_name: "Carlos", photo_url: null },
      { registration_id: "r2", player_name: "Carlos", photo_url: null },
      { registration_id: "r3", player_name: "Marcos", photo_url: null },
    ];
    const stats: RawPlayerStat[] = [
      { registration_id: "r1", goals: 10 },
      { registration_id: "r2", goals: 8 },
      { registration_id: "r3", goals: 5 },
    ];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result[0]).toEqual({ playerName: "Carlos", totalGoals: 18, photoUrl: null });
    expect(result[1]).toEqual({ playerName: "Marcos", totalGoals: 5, photoUrl: null });
  });

  it("returns sorted descending by totalGoals", () => {
    const players = [
      { registration_id: "r1", player_name: "A", photo_url: null },
      { registration_id: "r2", player_name: "B", photo_url: null },
    ];
    const stats: RawPlayerStat[] = [
      { registration_id: "r1", goals: 3 },
      { registration_id: "r2", goals: 7 },
    ];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result[0].playerName).toBe("B");
    expect(result[1].playerName).toBe("A");
  });

  it("excludes players with zero goals", () => {
    const players = [{ registration_id: "r1", player_name: "A", photo_url: null }];
    const stats: RawPlayerStat[] = [{ registration_id: "r1", goals: 0 }];
    const result = aggregateAllTimeScorers(players, stats);
    expect(result).toHaveLength(0);
  });
});

describe("mapChampionRows", () => {
  it("maps DB rows to typed champion objects", () => {
    const rows: ChampionRow[] = [
      { id: "c1", name: "Campeonato V", season: "2025", champion_name: "União FC" },
      { id: "c2", name: "Campeonato IV", season: "2024", champion_name: null },
    ];
    const result = mapChampionRows(rows);
    expect(result[0]).toEqual({ id: "c1", name: "Campeonato V", season: "2025", championName: "União FC" });
    expect(result[1].championName).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run lib/landing/queries.test.ts 2>&1
```

Expected: `Cannot find module './queries'`

- [ ] **Step 3: Create `lib/landing/queries.ts`**

```ts
import { createClient } from "@/lib/supabase/server";

// --- Pure data types (exported for tests) ---

export type RawPlayerStat = { registration_id: string; goals: number };
export type ChampionRow = {
  id: string;
  name: string;
  season: string | null;
  champion_name: string | null;
};

// --- Pure data transformers (exported for tests) ---

export type AllTimeScorer = { playerName: string; totalGoals: number; photoUrl: string | null };

export function aggregateAllTimeScorers(
  players: { registration_id: string; player_name: string; photo_url: string | null }[],
  stats: RawPlayerStat[],
): AllTimeScorer[] {
  const statsByReg = new Map(stats.map((s) => [s.registration_id, s.goals]));
  const byName = new Map<string, AllTimeScorer>();

  for (const p of players) {
    const goals = statsByReg.get(p.registration_id) ?? 0;
    const existing = byName.get(p.player_name);
    if (existing) {
      existing.totalGoals += goals;
    } else {
      byName.set(p.player_name, {
        playerName: p.player_name,
        totalGoals: goals,
        photoUrl: p.photo_url,
      });
    }
  }

  return Array.from(byName.values())
    .filter((s) => s.totalGoals > 0)
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 10);
}

export type Champion = { id: string; name: string; season: string | null; championName: string | null };

export function mapChampionRows(rows: ChampionRow[]): Champion[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    season: r.season,
    championName: r.champion_name,
  }));
}

// --- Server query functions ---

export type AggregateStats = {
  seasons: number;
  goals: number;
  players: number;
};

export async function getAggregateStats(): Promise<AggregateStats> {
  const supabase = await createClient();
  const [champRes, statsRes] = await Promise.all([
    supabase.from("championships").select("id", { count: "exact", head: true }),
    supabase.from("public_player_stats").select("registration_id, goals"),
  ]);

  const seasons = champRes.count ?? 0;
  const statsRows = statsRes.data ?? [];
  const goals = statsRows.reduce((sum, r) => sum + (r.goals as number), 0);
  const players = statsRows.length;

  return { seasons, goals, players };
}

export async function getRecentChampions(limit = 4): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(
      `id, name, season,
      championship_teams!champion_team_id (
        teams ( name )
      )`,
    )
    .order("season", { ascending: false })
    .limit(limit);

  if (!data) return [];

  return data.map((row) => {
    const ct = Array.isArray(row.championship_teams) ? row.championship_teams[0] : row.championship_teams;
    const team = ct ? (Array.isArray(ct.teams) ? ct.teams[0] : ct.teams) : null;
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      championName: (team as { name: string } | null)?.name ?? null,
    };
  });
}

export type TopScorer = {
  playerName: string;
  teamName: string | null;
  photoUrl: string | null;
  goals: number;
};

export async function getLatestSeasonTopScorers(limit = 5): Promise<{ scorers: TopScorer[]; seasonName: string | null }> {
  const supabase = await createClient();
  const { data: champData } = await supabase
    .from("championships")
    .select("id, name")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!champData) return { scorers: [], seasonName: null };

  const [playersRes, statsRes] = await Promise.all([
    supabase.from("public_players").select("registration_id, player_name, team_name, photo_url").eq("championship_id", champData.id),
    supabase.from("public_player_stats").select("registration_id, goals").eq("championship_id", champData.id),
  ]);

  const players = playersRes.data ?? [];
  const stats = statsRes.data ?? [];
  const statsByReg = new Map(stats.map((s) => [s.registration_id, s.goals as number]));
  const playerMap = new Map(players.map((p) => [p.registration_id, p]));

  const scorers: TopScorer[] = stats
    .filter((s) => (s.goals as number) > 0)
    .sort((a, b) => (b.goals as number) - (a.goals as number))
    .slice(0, limit)
    .map((s) => {
      const p = playerMap.get(s.registration_id);
      return {
        playerName: p?.player_name ?? "Unknown",
        teamName: p?.team_name ?? null,
        photoUrl: p?.photo_url ?? null,
        goals: statsByReg.get(s.registration_id) ?? 0,
      };
    });

  return { scorers, seasonName: champData.name };
}

export async function getAllChampionships(): Promise<Champion[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("championships")
    .select(
      `id, name, season,
      championship_teams!champion_team_id (
        teams ( name )
      )`,
    )
    .order("season", { ascending: false });

  if (!data) return [];

  return data.map((row) => {
    const ct = Array.isArray(row.championship_teams) ? row.championship_teams[0] : row.championship_teams;
    const team = ct ? (Array.isArray(ct.teams) ? ct.teams[0] : ct.teams) : null;
    return {
      id: row.id,
      name: row.name,
      season: row.season,
      championName: (team as { name: string } | null)?.name ?? null,
    };
  });
}

export async function getAllTimeTopScorers(): Promise<AllTimeScorer[]> {
  const supabase = await createClient();
  const [playersRes, statsRes] = await Promise.all([
    supabase.from("public_players").select("registration_id, player_name, photo_url"),
    supabase.from("public_player_stats").select("registration_id, goals"),
  ]);
  return aggregateAllTimeScorers(playersRes.data ?? [], (statsRes.data ?? []) as RawPlayerStat[]);
}

export type MostTitlesTeam = { teamName: string; titles: number };

export async function getMostTitlesTeams(limit = 5): Promise<MostTitlesTeam[]> {
  const champions = await getAllChampionships();
  const byTeam = new Map<string, number>();
  for (const c of champions) {
    if (!c.championName) continue;
    byTeam.set(c.championName, (byTeam.get(c.championName) ?? 0) + 1);
  }
  return Array.from(byTeam.entries())
    .map(([teamName, titles]) => ({ teamName, titles }))
    .sort((a, b) => b.titles - a.titles)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run lib/landing/queries.test.ts 2>&1
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/landing/queries.ts lib/landing/queries.test.ts
git commit -m "feat: add server-side data queries for landing site

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Landing page — hero section

**Files:**
- Create: `components/landing/HeroSection.tsx`
- Modify: `app/(landing)/page.tsx`

- [ ] **Step 1: Create `components/landing/HeroSection.tsx`**

```tsx
import type { Champion } from "@/lib/landing/queries";

interface HeroSectionProps {
  recentChampions: Champion[];
}

export default function HeroSection({ recentChampions }: HeroSectionProps) {
  return (
    <section className="gala-beams relative overflow-hidden px-6 py-20 md:px-10">
      <div className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-2">
        {/* Left: LIFAS story */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Liga de Futebol Adventista de Sorocaba
          </p>
          <h1
            className="mt-3 font-serif text-4xl font-extrabold leading-tight sm:text-5xl"
            style={{
              background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            The Official Record of Sorocaba Football
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[var(--gala-ink-dim)]">
            Every match. Every goal. Every season — preserved.
          </p>
          <a
            href="/statistics"
            className="mt-8 inline-block rounded-lg px-6 py-3 text-sm font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
            }}
          >
            View Championships →
          </a>
        </div>

        {/* Right: recent champions panel */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
            border: "1px solid var(--gala-line)",
          }}
        >
          <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            Recent Champions
          </p>
          {recentChampions.length === 0 ? (
            <p className="text-sm text-[var(--gala-ink-dim)]">No championships recorded yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentChampions.map((c, i) => (
                <li
                  key={c.id}
                  className="flex items-center gap-4 rounded-xl px-4 py-3"
                  style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                    style={{
                      background: i === 0
                        ? "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))"
                        : "var(--gala-panel)",
                      color: i === 0 ? "#050507" : "var(--gala-gold-2)",
                      border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
                    }}
                  >
                    {i === 0 ? "🏆" : c.season ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {c.championName ?? "—"}
                    </p>
                    <p className="text-[10px] text-[var(--gala-ink-dim)]">
                      {c.name}{c.season ? ` · ${c.season}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Gold dust particles */}
      {[...Array(6)].map((_, i) => (
        <span
          key={i}
          className="gala-dust"
          style={{
            left: `${10 + i * 15}%`,
            width: `${3 + (i % 3)}px`,
            height: `${3 + (i % 3)}px`,
            animationDuration: `${8 + i * 3}s`,
            animationDelay: `${i * 1.5}s`,
          }}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Update `app/(landing)/page.tsx` with hero**

```tsx
import HeroSection from "@/components/landing/HeroSection";
import { getRecentChampions } from "@/lib/landing/queries";

export default async function LandingPage() {
  const recentChampions = await getRecentChampions(4);

  return (
    <main>
      <HeroSection recentChampions={recentChampions} />
    </main>
  );
}
```

- [ ] **Step 3: Verify hero renders**

Run `npm run dev` and visit `http://localhost:3000`. The hero section should show with gala background, gold headline, and recent champions panel on the right (or below on mobile).

- [ ] **Step 4: Commit**

```bash
git add components/landing/HeroSection.tsx app/\(landing\)/page.tsx
git commit -m "feat: add landing page hero with LIFAS story and recent champions

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Landing page — numbers section

**Files:**
- Create: `components/landing/StatsChips.tsx`
- Create: `components/landing/TopScorersPreview.tsx`
- Modify: `app/(landing)/page.tsx`

- [ ] **Step 1: Create `components/landing/StatsChips.tsx`**

```tsx
interface Chip {
  value: number;
  label: string;
}

export default function StatsChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="rounded-xl p-5 text-center"
          style={{
            background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
            border: "1px solid var(--gala-line)",
          }}
        >
          <p
            className="font-serif text-4xl font-black"
            style={{
              background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {chip.value.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[3px] text-[var(--gala-ink-dim)]">
            {chip.label}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/landing/TopScorersPreview.tsx`**

```tsx
import Link from "next/link";
import type { TopScorer } from "@/lib/landing/queries";

interface TopScorersPreviewProps {
  scorers: TopScorer[];
  seasonName: string | null;
}

export default function TopScorersPreview({ scorers, seasonName }: TopScorersPreviewProps) {
  if (scorers.length === 0) return null;
  const max = scorers[0]?.goals ?? 1;

  return (
    <div
      className="mt-8 rounded-2xl p-6"
      style={{
        background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
        border: "1px solid var(--gala-line)",
      }}
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
            {seasonName ?? "Latest Season"}
          </p>
          <h3 className="mt-0.5 text-sm font-black text-white">Top Scorers</h3>
        </div>
        <Link
          href="/statistics"
          className="text-[10px] font-bold uppercase tracking-widest text-[var(--gala-gold-2)] hover:text-[var(--gala-gold-1)] transition-colors"
        >
          View full statistics →
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {scorers.map((scorer, i) => (
          <li key={scorer.playerName} className="flex items-center gap-3">
            <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">
              {i + 1}
            </span>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-black"
              style={{
                background: i === 0
                  ? "linear-gradient(135deg, var(--gala-gold-1), var(--gala-gold-3))"
                  : "var(--gala-bg-1)",
                color: i === 0 ? "#050507" : "white",
                border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
              }}
            >
              {scorer.playerName.slice(0, 2).toUpperCase()}
            </div>
            <span className="flex-1 min-w-0">
              <span className="block truncate text-sm font-bold text-white">{scorer.playerName}</span>
              {scorer.teamName && (
                <span className="text-[10px] text-[var(--gala-ink-dim)]">{scorer.teamName}</span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 rounded-full"
                style={{
                  width: `${Math.round((scorer.goals / max) * 80)}px`,
                  background: "linear-gradient(90deg, var(--gala-gold-3), var(--gala-gold-2))",
                }}
              />
              <span className="w-8 text-right text-sm font-black text-[var(--gala-gold-2)]">
                {scorer.goals}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Update `app/(landing)/page.tsx` with numbers section**

```tsx
import HeroSection from "@/components/landing/HeroSection";
import StatsChips from "@/components/landing/StatsChips";
import TopScorersPreview from "@/components/landing/TopScorersPreview";
import { getRecentChampions, getAggregateStats, getLatestSeasonTopScorers } from "@/lib/landing/queries";

export default async function LandingPage() {
  const [recentChampions, stats, { scorers, seasonName }] = await Promise.all([
    getRecentChampions(4),
    getAggregateStats(),
    getLatestSeasonTopScorers(5),
  ]);

  const chips = [
    { value: stats.seasons, label: "Seasons" },
    { value: stats.goals, label: "Goals Scored" },
    { value: stats.players, label: "Players" },
  ];

  return (
    <main>
      <HeroSection recentChampions={recentChampions} />

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <p className="mb-6 text-center text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          By the numbers
        </p>
        <StatsChips chips={chips} />
        <TopScorersPreview scorers={scorers} seasonName={seasonName} />
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Verify the full landing page**

Run `npm run dev` and visit `http://localhost:3000`. You should see:
- Hero section with LIFAS story and recent champions
- "By the numbers" section with 3 stat chips (seasons, goals, players)
- Top scorers preview with gold bar chart and "View full statistics →" link

- [ ] **Step 5: Commit**

```bash
git add components/landing/StatsChips.tsx components/landing/TopScorersPreview.tsx app/\(landing\)/page.tsx
git commit -m "feat: add landing page numbers section with stats chips and top scorers

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Statistics page — season selector and left column

**Files:**
- Create: `components/landing/SeasonStatsPanel.tsx`
- Create: `app/(landing)/statistics/page.tsx`

- [ ] **Step 1: Create `components/landing/SeasonStatsPanel.tsx`**

This client component owns the selected season state, renders season pills, and switches between the four tab components (existing components are passed `championshipId`).

```tsx
"use client";

import { useState } from "react";
import type { Champion } from "@/lib/landing/queries";
import { usePublicRankings } from "@/features/hooks/usePublicRankings";
import RankingsTab from "@/components/public/stats/RankingsTab";
import StandingsTab from "@/components/public/stats/StandingsTab";
import PlayersTab from "@/components/public/stats/PlayersTab";

type TabId = "rankings" | "standings" | "discipline" | "players";

const TABS: { id: TabId; label: string }[] = [
  { id: "rankings", label: "🏆 Rankings" },
  { id: "standings", label: "📊 Standings" },
  { id: "discipline", label: "🟨 Discipline" },
  { id: "players", label: "👤 Players" },
];

interface SeasonStatsPanelProps {
  championships: Champion[];
}

export default function SeasonStatsPanel({ championships }: SeasonStatsPanelProps) {
  const [selectedId, setSelectedId] = useState<string>(championships[0]?.id ?? "");
  const [tab, setTab] = useState<TabId>("rankings");
  const { rankings, loading } = usePublicRankings(selectedId || null, 50);

  const selected = championships.find((c) => c.id === selectedId);

  return (
    <div>
      {/* Season pills */}
      <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
        {championships.map((c) => (
          <button
            key={c.id}
            onClick={() => { setSelectedId(c.id); setTab("rankings"); }}
            className="shrink-0 rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-all"
            style={
              c.id === selectedId
                ? {
                    background: "rgba(212,160,23,0.12)",
                    border: "1px solid var(--gala-gold-2)",
                    color: "var(--gala-gold-2)",
                  }
                : {
                    background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
                    border: "1px solid var(--gala-line)",
                    color: "var(--gala-ink-dim)",
                  }
            }
          >
            {c.season ?? c.name}
          </button>
        ))}
      </div>

      {/* Season name */}
      {selected && (
        <p className="mb-4 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          {selected.name}{selected.season ? ` · ${selected.season}` : ""}
          {selected.championName ? ` · Champion: ${selected.championName}` : ""}
        </p>
      )}

      {/* Tabs */}
      <nav className="mb-0 flex gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-t-lg px-4 py-2 text-[11px] font-bold uppercase tracking-wide transition-colors ${
              tab === t.id
                ? "border border-b-transparent text-[var(--gala-gold-1)]"
                : "text-[var(--gala-ink-dim)] hover:text-white"
            }`}
            style={
              tab === t.id
                ? {
                    background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
                    borderColor: "var(--gala-line)",
                  }
                : {}
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* Tab panel */}
      <div
        className="rounded-b-xl rounded-tr-xl p-4 sm:p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        {loading && rankings.players.length === 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl bg-[#171320]" />
            ))}
          </div>
        ) : tab === "rankings" ? (
          <RankingsTab rankings={rankings} />
        ) : tab === "standings" ? (
          <StandingsTab championshipId={selectedId} />
        ) : tab === "discipline" ? (
          <DisciplineTab rankings={rankings} />
        ) : (
          <PlayersTab championshipId={selectedId} rankings={rankings} />
        )}
      </div>
    </div>
  );
}

function DisciplineTab({ rankings }: { rankings: ReturnType<typeof usePublicRankings>["rankings"] }) {
  const byCards = [...rankings.stats]
    .filter((s) => s.yellowCards > 0 || s.redCards > 0)
    .sort((a, b) => b.yellowCards + b.redCards * 2 - (a.yellowCards + a.redCards * 2));

  const playerMap = new Map(rankings.players.map((p) => [p.registrationId, p]));

  if (byCards.length === 0) {
    return <p className="py-8 text-center text-sm text-[var(--gala-ink-dim)]">No discipline data yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {byCards.slice(0, 20).map((s) => {
        const p = playerMap.get(s.registrationId);
        return (
          <div key={s.registrationId} className="flex items-center gap-3 rounded-xl border border-[var(--gala-line)] bg-[#171320] px-4 py-3">
            <span className="flex-1 text-sm font-bold text-white">{p?.playerName ?? "Unknown"}</span>
            <span className="text-[10px] text-[var(--gala-ink-dim)]">{p?.teamName}</span>
            <span className="flex items-center gap-1 text-sm font-black">
              {s.yellowCards > 0 && <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: "#ca8a04", color: "#050507" }}>{s.yellowCards} 🟨</span>}
              {s.redCards > 0 && <span className="rounded px-1.5 py-0.5 text-[10px] font-black" style={{ background: "#dc2626", color: "white" }}>{s.redCards} 🟥</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(landing)/statistics/page.tsx`** (shell with left column only for now)

```tsx
import SeasonStatsPanel from "@/components/landing/SeasonStatsPanel";
import { getAllChampionships } from "@/lib/landing/queries";

export default async function StatisticsPage() {
  const championships = await getAllChampionships();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10">
      <header className="mb-10 text-center">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Official Statistics ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-3xl font-extrabold sm:text-4xl"
          style={{
            background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS Statistics
        </h1>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          All-time records and season highlights · updated in real time
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <SeasonStatsPanel championships={championships} />
        {/* AllTimePanel added in Task 9 */}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify the statistics page**

Run `npm run dev` and visit `http://localhost:3000/statistics`. You should see:
- Gold centered header "LIFAS Statistics"
- Season pills at the top (one per championship)
- Four tabs: Rankings, Standings, Discipline, Players
- Clicking a season pill updates the stats below

- [ ] **Step 4: Commit**

```bash
git add components/landing/SeasonStatsPanel.tsx app/\(landing\)/statistics/page.tsx
git commit -m "feat: add statistics page with season selector and tab panel

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Statistics page — All-Time right column

**Files:**
- Create: `components/landing/AllTimePanel.tsx`
- Modify: `app/(landing)/statistics/page.tsx`

- [ ] **Step 1: Create `components/landing/AllTimePanel.tsx`**

```tsx
import StatsChips from "@/components/landing/StatsChips";
import type { AggregateStats, AllTimeScorer, MostTitlesTeam, Champion } from "@/lib/landing/queries";

interface AllTimePanelProps {
  aggregateStats: AggregateStats;
  topScorers: AllTimeScorer[];
  mostTitlesTeams: MostTitlesTeam[];
  hallOfChampions: Champion[];
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
      {children}
    </p>
  );
}

export default function AllTimePanel({
  aggregateStats,
  topScorers,
  mostTitlesTeams,
  hallOfChampions,
}: AllTimePanelProps) {
  const chips = [
    { value: aggregateStats.seasons, label: "Seasons" },
    { value: aggregateStats.goals, label: "Goals" },
    { value: aggregateStats.players, label: "Players" },
  ];

  return (
    <aside className="flex flex-col gap-8">
      {/* Aggregate chips */}
      <section>
        <SectionTitle>By the numbers</SectionTitle>
        <StatsChips chips={chips} />
      </section>

      {/* All-time top scorers */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>All-Time Top Scorers</SectionTitle>
        {topScorers.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No data yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {topScorers.map((scorer, i) => (
              <li key={scorer.playerName} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[8px] font-black"
                  style={{
                    background: i === 0
                      ? "linear-gradient(135deg, var(--gala-gold-1), var(--gala-gold-3))"
                      : "var(--gala-bg-1)",
                    color: i === 0 ? "#050507" : "white",
                    border: i !== 0 ? "1px solid var(--gala-line)" : undefined,
                  }}
                >
                  {scorer.playerName.slice(0, 2).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">{scorer.playerName}</span>
                <span className="font-black tabular-nums text-[var(--gala-gold-2)]">
                  {scorer.totalGoals} ⚽
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Most championships won */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Most Championships Won</SectionTitle>
        {mostTitlesTeams.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No data yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {mostTitlesTeams.map((team, i) => (
              <li key={team.teamName} className="flex items-center gap-3">
                <span className="w-4 text-center text-xs font-black text-[var(--gala-gold-2)]">{i + 1}</span>
                <span className="flex-1 text-sm font-bold text-white">{team.teamName}</span>
                <span className="font-black text-[var(--gala-gold-2)]">
                  {team.titles}× 🏆
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Hall of champions */}
      <section
        className="rounded-2xl p-5"
        style={{
          background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
          border: "1px solid var(--gala-line)",
        }}
      >
        <SectionTitle>Hall of Champions</SectionTitle>
        {hallOfChampions.length === 0 ? (
          <p className="text-sm text-[var(--gala-ink-dim)]">No championships yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {hallOfChampions.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
              >
                <span
                  className="text-xs font-black"
                  style={{ color: "var(--gala-gold-2)", minWidth: "2.5rem" }}
                >
                  {c.season ?? "—"}
                </span>
                <span className="flex-1 truncate text-sm text-white">
                  {c.championName ?? <span className="text-[var(--gala-ink-dim)]">TBD</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
```

- [ ] **Step 2: Update `app/(landing)/statistics/page.tsx` to add AllTimePanel**

```tsx
import SeasonStatsPanel from "@/components/landing/SeasonStatsPanel";
import AllTimePanel from "@/components/landing/AllTimePanel";
import {
  getAllChampionships,
  getAggregateStats,
  getAllTimeTopScorers,
  getMostTitlesTeams,
} from "@/lib/landing/queries";

export default async function StatisticsPage() {
  const [championships, aggregateStats, topScorers, mostTitlesTeams] = await Promise.all([
    getAllChampionships(),
    getAggregateStats(),
    getAllTimeTopScorers(),
    getMostTitlesTeams(5),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-6 py-12 md:px-10">
      <header className="mb-10 text-center">
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          ━ ✦ ━ Official Statistics ━ ✦ ━
        </p>
        <h1
          className="mt-2 font-serif text-3xl font-extrabold sm:text-4xl"
          style={{
            background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          LIFAS Statistics
        </h1>
        <p className="mt-1 text-xs text-[var(--gala-ink-dim)]">
          All-time records and season highlights · updated in real time
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <SeasonStatsPanel championships={championships} />
        <AllTimePanel
          aggregateStats={aggregateStats}
          topScorers={topScorers}
          mostTitlesTeams={mostTitlesTeams}
          hallOfChampions={championships}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1
```

Expected: all tests pass (including the `lib/landing/queries.test.ts` tests from Task 5).

- [ ] **Step 4: Verify the complete statistics page**

Run `npm run dev` and visit `http://localhost:3000/statistics`. Verify:
- Two-column layout on desktop (season stats left, all-time panel right)
- All-time panel shows: aggregate chips, top scorers, most championship wins, hall of champions
- Season switching updates the left column without affecting the right column

- [ ] **Step 5: Commit**

```bash
git add components/landing/AllTimePanel.tsx app/\(landing\)/statistics/page.tsx
git commit -m "feat: add all-time records panel to statistics dashboard

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [x] **Spec section 1 (Routing):** Task 1 moves dashboard to `/dashboard`; layout.tsx creates `(landing)` group; middleware note addressed by protected layout's existing redirect-to-login behavior (no changes needed)
- [x] **Spec section 2 (Shell/Header):** Task 3 creates layout + LandingShell + LandingHeader; Task 4 creates LoginModal
- [x] **Spec section 3a (Hero):** Task 6 creates HeroSection with split layout, gala beams, recent champions
- [x] **Spec section 3b (Numbers):** Task 7 creates StatsChips + TopScorersPreview
- [x] **Spec section 4 (Stats Dashboard):** Task 8 creates SeasonStatsPanel + page shell; Task 9 adds AllTimePanel
- [x] **Spec section 5 (Login Modal):** Task 4 creates LoginModal with top-accent-flat design, `<dialog>`, Escape/backdrop close, useLogin hook
- [x] **Spec section 6 (Data Layer):** Task 5 creates all query functions; all fetched server-side in RSCs
- [x] **Spec section 7 (Code reuse):** RankingsTab/StandingsTab/PlayersTab reused in SeasonStatsPanel; usePublicRankings reused; gala CSS classes used throughout
- [x] **Type consistency:** `Champion`, `AllTimeScorer`, `MostTitlesTeam`, `TopScorer`, `AggregateStats` defined in `lib/landing/queries.ts` and used consistently in all components
- [x] **No placeholders:** All steps contain complete code
