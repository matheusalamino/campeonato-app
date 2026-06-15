"use client";

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
