import Link from "next/link";
import type { Champion } from "@/lib/landing/queries";

interface HomeTournamentCardsProps {
  copaDomundo: Champion | null;
  championsLeague: Champion | null;
}

interface TournamentCardProps {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  latest: Champion | null;
}

function TournamentCard({ href, icon, title, subtitle, latest }: TournamentCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex-1 min-w-0 rounded-2xl p-5 sm:p-8 flex flex-col gap-4 transition-all hover:scale-[1.01]"
      style={{
        background: "linear-gradient(135deg, rgba(212,160,23,0.06), rgba(5,5,7,0.95))",
        border: "1px solid var(--gala-line)",
      }}
    >
      <div>
        <p className="text-[10px] font-black uppercase tracking-[4px] text-[var(--gala-gold-2)]">
          {icon} {subtitle}
        </p>
        <h2
          className="mt-2 font-serif text-3xl font-extrabold leading-tight"
          style={{
            background:
              "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {title}
        </h2>
      </div>

      {latest ? (
        <div
          className="rounded-xl px-5 py-4 flex flex-col gap-1"
          style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
        >
          <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            Última edição · {latest.season ?? latest.name}
          </p>
          {latest.championName ? (
            <>
              <p className="text-lg font-black text-white">{latest.championName}</p>
              <p className="text-xs text-[var(--gala-ink-dim)]">🏆 Campeão</p>
            </>
          ) : (
            <p className="text-sm text-[var(--gala-ink-dim)]">Campeão a definir</p>
          )}
        </div>
      ) : (
        <div
          className="rounded-xl px-5 py-4"
          style={{ background: "var(--gala-bg-1)", border: "1px solid var(--gala-line)" }}
        >
          <p className="text-sm text-[var(--gala-ink-dim)]">Nenhuma edição registrada ainda.</p>
        </div>
      )}

      <span className="text-xs font-bold tracking-widest text-[var(--gala-gold-2)] group-hover:text-[var(--gala-gold-1)] transition-colors">
        Ver campeonato →
      </span>
    </Link>
  );
}

export default function HomeTournamentCards({ copaDomundo, championsLeague }: HomeTournamentCardsProps) {
  return (
    <section className="w-full px-4 py-8 sm:px-8 md:py-12 md:px-14">
      <div className="flex flex-col md:flex-row gap-6">
        <TournamentCard
          href="/copa-do-mundo"
          icon="🌍"
          subtitle="Copa do Mundo · Sorocaba"
          title="Copa do Mundo Sorocaba"
          latest={copaDomundo}
        />
        <TournamentCard
          href="/champions-league"
          icon="🏆"
          subtitle="Champions League · Sorocaba"
          title="Champions League Sorocaba"
          latest={championsLeague}
        />
      </div>
    </section>
  );
}
