"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const supabase = createClient();

type ChampionshipRow = { id: string; name: string };

type Participant = {
  championshipManagerId: string;
  displayName: string;
  currentBalance: number;
  remainingPotBudget: number;
  nextProgressiveOverBudgetFine: number;
};

type PotPayload = {
  championshipId: string;
  championshipName: string;
  auctionOpen: boolean;
  potNumber: number | null;
  potPosition: string | null;
  participants: Participant[];
};

const LS_KEY = "auctionFiscalChampionshipId";

export default function AuctionFiscalPage() {
  const [championships, setChampionships] = useState<ChampionshipRow[]>([]);
  const [championshipId, setChampionshipId] = useState<string>("");
  const [payload, setPayload] = useState<PotPayload | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [progressiveTarget, setProgressiveTarget] = useState<Participant | null>(
    null,
  );

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (saved) setChampionshipId(saved);
  }, []);

  useEffect(() => {
    if (championshipId) localStorage.setItem(LS_KEY, championshipId);
  }, [championshipId]);

  useEffect(() => {
    async function loadChamps() {
      setLoadingList(true);
      const { data, error } = await supabase
        .from("championships")
        .select("id, name")
        .is("deleted_at", null)
        .order("name");

      if (error) {
        toast.error("Não foi possível carregar campeonatos");
        setChampionships([]);
      } else {
        setChampionships((data ?? []) as ChampionshipRow[]);
      }
      setLoadingList(false);
    }
    void loadChamps();
  }, []);

  const fetchPot = useCallback(async () => {
    if (!championshipId) {
      setPayload(null);
      return;
    }
    const res = await fetch(
      `/api/draft/fiscal/pot-participants?championshipId=${encodeURIComponent(championshipId)}`,
    );
    const json = (await res.json()) as PotPayload & { error?: string };
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao carregar o pote");
      setPayload(null);
      return;
    }
    setPayload(json);
  }, [championshipId]);

  useEffect(() => {
    void fetchPot();
    const id = setInterval(() => void fetchPot(), 3500);
    return () => clearInterval(id);
  }, [fetchPot]);

  const potLabel = useMemo(() => {
    if (!payload?.auctionOpen || payload.potNumber == null || !payload.potPosition) {
      return null;
    }
    return `Pote ${payload.potNumber} (${payload.potPosition})`;
  }, [payload]);

  async function applyBulk() {
    if (!championshipId) return;
    setConfirmBulk(false);
    const res = await fetch("/api/draft/fiscal/bulk-general-fine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ championshipId }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      appliedCount?: number;
      error?: string;
    };
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao aplicar multa geral");
      return;
    }
    toast.success(
      `Multa geral aplicada (${json.appliedCount ?? 0} cartola(s)).`,
    );
    await fetchPot();
  }

  async function applyProgressive(p: Participant) {
    if (!championshipId) return;
    const res = await fetch("/api/draft/fiscal/apply-over-budget-fine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        championshipId,
        championshipManagerId: p.championshipManagerId,
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      amount?: number;
      error?: string;
    };
    if (!res.ok) {
      toast.error(json.error ?? "Erro ao aplicar multa");
      return;
    }
    toast.success(`Multa de CC$ ${(json.amount ?? 0).toLocaleString("pt-BR")} aplicada.`);
    setProgressiveTarget(null);
    await fetchPot();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Fiscal do leilão
        </h1>
        <p className="text-sm text-zinc-400">
          Acompanhe os saldos atualizados automaticamente enquanto o admin
          opera o leilão na apresentação. Aplique multas com confirmação antes
          de registrar.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Campeonato
        </label>
        <select
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          disabled={loadingList}
          value={championshipId}
          onChange={(e) => setChampionshipId(e.target.value)}
        >
          <option value="">Selecione…</option>
          {championships.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </section>

      {championshipId && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {payload?.championshipName ?? "…"}
              </p>
              <p className="text-xs text-zinc-500">
                {payload?.auctionOpen && potLabel
                  ? `Leilão ativo: ${potLabel}`
                  : "Aguardando o admin abrir o leilão do pote no modo apresentação."}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => void fetchPot()}
            >
              Atualizar agora
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!payload?.auctionOpen || !payload.participants.length}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
              onClick={() => setConfirmBulk(true)}
            >
              Multa geral (CC$ 2.000)
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/80 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Cartola</th>
                  <th className="px-3 py-2 text-right">Saldo geral</th>
                  <th className="px-3 py-2 text-right">No pote</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {!payload?.participants.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-6 text-center text-zinc-500"
                    >
                      {payload?.auctionOpen
                        ? "Nenhum cartola com pote em aberto para este leilão."
                        : "Quando o admin abrir o leilão na apresentação, os cartolas do pote aparecerão aqui."}
                    </td>
                  </tr>
                ) : (
                  payload.participants.map((p) => (
                    <tr
                      key={p.championshipManagerId}
                      className="border-t border-zinc-800/80"
                    >
                      <td className="px-3 py-2 font-medium">{p.displayName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        CC$ {p.currentBalance.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                        CC$ {p.remainingPotBudget.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={!payload.auctionOpen}
                          className="rounded-md border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                          onClick={() => setProgressiveTarget(p)}
                        >
                          Multa individual
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Dialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Confirmar multa geral</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Esta ação registra multas no sistema. Só continue se tiver certeza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-zinc-300">
            {potLabel && (
              <p>
                <span className="text-zinc-500">Pote atual: </span>
                <span className="font-medium text-zinc-200">{potLabel}</span>
              </p>
            )}
            <p>
              Será aplicada multa fixa de até CC$ 2.000 por cartola com saldo
              geral positivo (se o saldo for menor, debita apenas o disponível).
            </p>
            <p className="font-medium text-amber-200/90">
              Você confirma que deseja aplicar a multa geral agora?
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setConfirmBulk(false)}
            >
              Não, cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600"
              onClick={() => void applyBulk()}
            >
              Sim, aplicar multa geral
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!progressiveTarget}
        onOpenChange={(o) => !o && setProgressiveTarget(null)}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Confirmar multa individual</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Multa progressiva (lance acima do saldo). O débito será feito no
              saldo geral do cartola.
            </DialogDescription>
          </DialogHeader>
          {progressiveTarget && (
            <div className="space-y-3 text-sm text-zinc-300">
              <p>
                <span className="text-zinc-500">Cartola: </span>
                <span className="font-medium text-zinc-100">
                  {progressiveTarget.displayName}
                </span>
              </p>
              <p>
                <span className="text-zinc-500">Valor desta aplicação: </span>
                <span className="text-lg font-semibold text-amber-300 tabular-nums">
                  CC${" "}
                  {progressiveTarget.nextProgressiveOverBudgetFine.toLocaleString(
                    "pt-BR",
                  )}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                Progressão de CC$ 2.000 por ocorrência (1ª = CC$ 2.000, 2ª = CC$
                4.000, …).
              </p>
              <p className="font-medium text-amber-200/90 pt-1">
                Você confirma que deseja aplicar esta multa a este cartola?
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setProgressiveTarget(null)}
            >
              Não, cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600"
              onClick={() =>
                progressiveTarget && void applyProgressive(progressiveTarget)
              }
            >
              Sim, aplicar multa
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
