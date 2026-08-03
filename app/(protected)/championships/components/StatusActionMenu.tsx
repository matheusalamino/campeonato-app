"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown } from "lucide-react";
import {
  STATUS_LABELS,
  ALLOWED_TRANSITIONS,
  type ChampionshipStatus,
} from "@/types/championship";
import { changeChampionshipStatus } from "../actions";

export function StatusActionMenu({
  id,
  status,
  onChanged,
}: {
  id: string;
  status: ChampionshipStatus;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const targets = ALLOWED_TRANSITIONS[status];

  const close = useCallback(() => setOpen(false), []);

  // Close on scroll/resize so the fixed-position menu never shows at stale coords.
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  if (targets.length === 0) return null;

  function toggle() {
    if (!open && buttonRef.current) {
      // Anchor the menu to the trigger and render it in a portal, so the
      // table's `overflow-x-auto` wrapper can't clip it.
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setOpen((v) => !v);
  }

  function handleSelect(to: ChampionshipStatus) {
    setOpen(false);
    startTransition(async () => {
      const result = await changeChampionshipStatus({ id, from: status, to });
      if (result.ok) {
        toast.success(`Status alterado para "${STATUS_LABELS[to]}"`);
        onChanged?.();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={isPending}
        onClick={toggle}
        className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
      >
        Alterar status <ChevronDown className="h-3 w-3" />
      </button>
      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={close} />
            <div
              className="fixed z-50 w-48 rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg"
              style={{ top: coords.top, right: coords.right }}
            >
              {targets.map((to) => (
                <button
                  key={to}
                  type="button"
                  onClick={() => handleSelect(to)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {STATUS_LABELS[to]}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
