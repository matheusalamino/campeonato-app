"use client";

import { useState, useTransition } from "react";
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
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const targets = ALLOWED_TRANSITIONS[status];

  if (targets.length === 0) return null;

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
    <div className="relative inline-block text-left">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
      >
        Alterar status <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-lg">
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
        </>
      )}
    </div>
  );
}
