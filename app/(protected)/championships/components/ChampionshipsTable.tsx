"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { parseSeasonYear } from "@/lib/championship-year";
import type { Championship, ChampionshipStatus } from "@/types/championship";
import { deleteChampionship } from "../actions";
import { StatusBadge } from "./StatusBadge";
import { StatusActionMenu } from "./StatusActionMenu";

export function ChampionshipsTable({ championships }: { championships: Championship[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<Championship | null>(null);

  function confirmDelete() {
    if (!target) return;
    const id = target.id;
    startTransition(async () => {
      const result = await deleteChampionship(id);
      if (result.ok) {
        toast.success("Campeonato excluído");
        router.refresh();
      } else {
        toast.error(result.error);
      }
      setTarget(null);
    });
  }

  if (championships.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-700 p-12 text-center">
        <p className="mb-4 text-zinc-400">Nenhum campeonato cadastrado.</p>
        <Link
          href="/championships/new"
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-500"
        >
          <Plus className="h-4 w-4" /> Criar Campeonato
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-zinc-800 md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Ano</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Capacidade</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {championships.map((c) => (
              <tr key={c.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">{parseSeasonYear(c.season, null) || "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={(c.status as ChampionshipStatus) ?? "draft"} />
                </td>
                <td className="px-4 py-3">
                  {c.max_players ?? "—"}
                  {c.max_waitlist_players ? ` (+${c.max_waitlist_players})` : ""}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <StatusActionMenu
                      id={c.id}
                      status={(c.status as ChampionshipStatus) ?? "draft"}
                    />
                    <Link
                      href={`/championships/${c.id}/edit`}
                      className="rounded-md bg-zinc-800 p-1.5 hover:bg-zinc-700"
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => setTarget(c)}
                      className="rounded-md bg-red-600/80 p-1.5 hover:bg-red-600"
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {championships.map((c) => (
          <div key={c.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-zinc-400">{parseSeasonYear(c.season, null) || "—"}</p>
              </div>
              <StatusBadge status={(c.status as ChampionshipStatus) ?? "draft"} />
            </div>
            <p className="mb-3 text-xs text-zinc-400">
              Capacidade: {c.max_players ?? "—"}
              {c.max_waitlist_players ? ` (+${c.max_waitlist_players})` : ""}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusActionMenu id={c.id} status={(c.status as ChampionshipStatus) ?? "draft"} />
              <Link
                href={`/championships/${c.id}/edit`}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs hover:bg-zinc-700"
              >
                Editar
              </Link>
              <button
                type="button"
                onClick={() => setTarget(c)}
                className="rounded-md bg-red-600/80 px-3 py-1.5 text-xs hover:bg-red-600"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Delete confirm */}
      <Dialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir campeonato</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir &quot;{target?.name}&quot;? Esta ação pode ser
              revertida apenas no banco de dados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="rounded-md bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmDelete}
              className="rounded-md bg-red-600 px-4 py-2 text-sm hover:bg-red-500 disabled:opacity-50"
            >
              {isPending ? "Excluindo..." : "Excluir"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
