"use client";
import type { ReactNode } from "react";

export default function StepShell({
  index, title, open, done, onToggle, children,
}: {
  index: number; title: string; open: boolean; done: boolean;
  onToggle: () => void; children: ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border transition"
      style={{
        borderColor: open ? "rgba(230,180,34,.35)" : "var(--gala-line)",
        background: open ? "rgba(230,180,34,.06)" : "rgba(255,255,255,.02)",
        opacity: open || done ? 1 : 0.6,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-bold" style={{ color: open ? "var(--gala-gold-2)" : "var(--gala-ink)" }}>
          {index} · {title}
        </span>
        <span className="text-xs">{done ? "✓" : open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}
