"use client";

import type { Champion } from "@/lib/landing/queries";

interface TournamentSidebarProps {
  title: string;
  editions: Champion[];
  selectedId: string | null;          // null = "Todos"
  onSelect: (id: string | null) => void;
}

export default function TournamentSidebar({
  title,
  editions,
  selectedId,
  onSelect,
}: TournamentSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-[53px] self-start overflow-y-auto"
        style={{
          width: "22%",
          maxHeight: "calc(100vh - 53px)",
          background: "var(--gala-bg-1)",
          borderRight: "1px solid var(--gala-line)",
        }}
      >
        <div className="px-5 pt-6 pb-2">
          <p className="text-[9px] font-black uppercase tracking-[3px] text-[var(--gala-gold-2)]">
            {title}
          </p>
        </div>

        <nav className="flex flex-col pb-6">
          <SidebarRow
            label="Todos os anos"
            sublabel={`${editions.length} edições`}
            active={selectedId === null}
            onClick={() => onSelect(null)}
          />
          {editions.map((c) => (
            <SidebarRow
              key={c.id}
              label={c.season ?? c.name}
              sublabel={c.championName ?? "Campeão a definir"}
              active={selectedId === c.id}
              onClick={() => onSelect(c.id)}
            />
          ))}
        </nav>
      </aside>

      {/* Mobile chip row */}
      <div
        className="md:hidden flex gap-2 overflow-x-auto px-4 py-3 shrink-0 sticky top-[53px] z-40"
        style={{ background: "var(--gala-bg-1)", borderBottom: "1px solid var(--gala-line)" }}
      >
        <ChipButton label="Todos" active={selectedId === null} onClick={() => onSelect(null)} />
        {editions.map((c) => (
          <ChipButton
            key={c.id}
            label={c.season ?? c.name}
            active={selectedId === c.id}
            onClick={() => onSelect(c.id)}
          />
        ))}
      </div>
    </>
  );
}

function SidebarRow({
  label,
  sublabel,
  active,
  onClick,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-5 py-3 transition-colors"
      style={
        active
          ? {
              background: "rgba(212,160,23,0.08)",
              borderLeft: "3px solid var(--gala-gold-2)",
            }
          : {
              borderLeft: "3px solid transparent",
            }
      }
    >
      <p
        className="text-sm font-bold"
        style={{ color: active ? "var(--gala-gold-1)" : "var(--gala-ink)" }}
      >
        {label}
      </p>
      <p className="text-[10px] text-[var(--gala-ink-dim)] truncate">{sublabel}</p>
    </button>
  );
}

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all whitespace-nowrap"
      style={
        active
          ? {
              background: "rgba(212,160,23,0.12)",
              border: "1px solid var(--gala-gold-2)",
              color: "var(--gala-gold-2)",
            }
          : {
              background: "var(--gala-panel)",
              border: "1px solid var(--gala-line)",
              color: "var(--gala-ink-dim)",
            }
      }
    >
      {label}
    </button>
  );
}
