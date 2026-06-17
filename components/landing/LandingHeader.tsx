"use client";

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

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-8 py-3 md:px-14"
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

      <button
        onClick={onLoginClick}
        className="rounded-lg px-5 py-2 text-xs font-black uppercase tracking-widest text-[#050507] transition-opacity hover:opacity-90 shrink-0"
        style={{
          background: "linear-gradient(135deg, var(--gala-gold-3), var(--gala-gold-2))",
        }}
      >
        Entrar
      </button>
    </header>
  );
}
