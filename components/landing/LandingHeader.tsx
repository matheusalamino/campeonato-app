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
