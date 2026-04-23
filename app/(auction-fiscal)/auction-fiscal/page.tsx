"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
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
  managerName: string;
  managerPhotoUrl: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
  currentBalance: number;
  totalFineAmount: number;
  remainingPotBudget: number;
  nextProgressiveFineByType: {
    over_budget: number;
    no_bid_player: number;
    no_bid_goalkeeper: number;
  };
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
type ProgressiveFineType = "over_budget" | "no_bid_player" | "no_bid_goalkeeper";

function playAlertHorn() {
  try {
    const audioContext = new AudioContext();
    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.45, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.0);
    master.connect(audioContext.destination);

    const createBlast = (start: number, baseFreq: number) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(baseFreq, start);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.75, start + 0.22);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.9, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.24);
    };

    createBlast(now + 0.02, 420);
    createBlast(now + 0.34, 370);
    window.setTimeout(() => {
      void audioContext.close().catch(() => undefined);
    }, 1400);
  } catch {
    // Silently ignore if WebAudio is blocked by browser policy.
  }
}

export default function AuctionFiscalPage() {
  const [championships, setChampionships] = useState<ChampionshipRow[]>([]);
  const [payload, setPayload] = useState<PotPayload | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [progressiveTarget, setProgressiveTarget] =
    useState<Participant | null>(null);
  const [progressiveFineType, setProgressiveFineType] =
    useState<ProgressiveFineType>("over_budget");
  const [extraBalanceOpen, setExtraBalanceOpen] = useState(false);
  const [extraBalanceAmount, setExtraBalanceAmount] = useState("2000");
  const [championshipId, setChampionshipId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LS_KEY) ?? "";
  });

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
    const timeoutId = window.setTimeout(() => {
      void fetchPot();
    }, 0);

    const intervalId = window.setInterval(() => {
      void fetchPot();
    }, 3500);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [fetchPot]);

  const potLabel = useMemo(() => {
    if (
      !payload?.auctionOpen ||
      payload.potNumber == null ||
      !payload.potPosition
    ) {
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
    playAlertHorn();
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
        fineType: progressiveFineType,
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
    toast.success(
      `Multa de CC$ ${(json.amount ?? 0).toLocaleString("pt-BR")} aplicada.`,
    );
    playAlertHorn();
    setProgressiveTarget(null);
    await fetchPot();
  }

  async function applyExtraBalance() {
    if (!championshipId) return;
    const amount = Number(extraBalanceAmount.replace(/\D/g, ""));
    if (!amount || amount % 1000 !== 0) {
      toast.error("Informe um valor válido em múltiplos de CC$ 1.000.");
      return;
    }

    const res = await fetch("/api/draft/fiscal/grant-extra-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ championshipId, amount }),
    });

    const json = (await res.json()) as {
      success?: boolean;
      affected?: number;
      error?: string;
    };

    if (!res.ok) {
      toast.error(json.error ?? "Erro ao creditar saldo extra");
      return;
    }

    setExtraBalanceOpen(false);
    toast.success(
      `Saldo extra creditado para ${json.affected ?? 0} cartola(s).`,
    );
    await fetchPot();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          Fiscal do Leilão
        </h1>
        <p className="text-sm text-zinc-400">
          Acompanhe os saldos atualizados automaticamente enquanto o admin opera
          o leilão na apresentação. Aplique multas com confirmação antes de
          registrar.
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
              <p className="text-xs text-yellow-400 mt-2">
                {payload?.auctionOpen && potLabel
                  ? `Leilão Ativo: ${potLabel}`
                  : "Aguardando o admin abrir o leilão do pote no modo apresentação."}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
              onClick={() => void fetchPot()}
            >
              Atualizar Agora
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!payload?.auctionOpen || !payload.participants.length}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
              onClick={() => setConfirmBulk(true)}
            >
              Multa Geral (CC$ 2.000)
            </button>
            <button
              type="button"
              className="rounded-lg border border-emerald-600/50 bg-emerald-900/20 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-900/35"
              onClick={() => setExtraBalanceOpen(true)}
            >
              Saldo Extra
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-950/80 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Cartola / Time</th>
                  <th className="px-3 py-2 text-right">Saldo Geral</th>
                  <th className="px-3 py-2 text-right">Multas Total</th>
                  <th className="px-3 py-2 text-right">Pote Atual</th>
                  <th className="px-3 py-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {!payload?.participants.length ? (
                  <tr>
                    <td
                      colSpan={5}
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
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-2">
                          {p.teamLogoUrl ? (
                            <Image
                              src={p.teamLogoUrl}
                              alt={p.teamName ?? "Time"}
                              width={28}
                              height={28}
                              className="h-7 w-7 rounded-full object-cover border border-zinc-700"
                              unoptimized
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full border border-zinc-700 bg-zinc-800" />
                          )}
                          {p.managerPhotoUrl ? (
                            <Image
                              src={p.managerPhotoUrl}
                              alt={p.managerName}
                              width={28}
                              height={28}
                              className="h-7 w-7 rounded-full object-cover border border-amber-600/60"
                              unoptimized
                            />
                          ) : (
                            <div className="h-7 w-7 rounded-full border border-amber-600/60 bg-zinc-800" />
                          )}
                          <span>{p.displayName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        CC$ {p.currentBalance.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-300/90">
                        CC$ {p.totalFineAmount.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                        CC$ {p.remainingPotBudget.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={!payload.auctionOpen || p.remainingPotBudget <= 0}
                          className="rounded-md border bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600 disabled:opacity-40"
                          onClick={() => {
                            setProgressiveFineType("over_budget");
                            setProgressiveTarget(p);
                          }}
                        >
                          Multa Individual
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
              Esta ação registra multas no sistema. Só continue se tiver
              certeza.
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
              Será aplicada multa fixa de até CC$ 2.000 por cartola, debitando
              do saldo do pote atual. Se o saldo do pote for menor, debita só o
              disponível.
            </p>
            <p className="font-medium text-amber-200/90">
              Você confirma que deseja aplicar a multa geral agora?
            </p>
          </div>
          <DialogFooter className="gap-2">
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
              Multa progressiva em passos de CC$ 2.000, debitada do saldo do
              pote atual.
            </DialogDescription>
          </DialogHeader>
          {progressiveTarget && (
            <div className="space-y-3 text-sm text-zinc-300">
              <label className="block">
                <span className="mb-1 block text-zinc-500">Tipo da multa</span>
                <select
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                  value={progressiveFineType}
                  onChange={(e) =>
                    setProgressiveFineType(e.target.value as ProgressiveFineType)
                  }
                >
                  <option value="over_budget">Lance acima do saldo</option>
                  <option value="no_bid_player">Sem lance no jogador</option>
                  <option value="no_bid_goalkeeper">Sem lance no goleiro</option>
                </select>
              </label>
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
                  {progressiveTarget.nextProgressiveFineByType[
                    progressiveFineType
                  ].toLocaleString("pt-BR")}
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
          <DialogFooter className="gap-2">
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

      <Dialog open={extraBalanceOpen} onOpenChange={setExtraBalanceOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Creditar Saldo Extra</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Crédito geral para todos os cartolas do campeonato selecionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-zinc-300">
            <label className="block">
              <span className="mb-1 block text-zinc-500">Valor por cartola</span>
              <input
                type="text"
                inputMode="numeric"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                value={extraBalanceAmount}
                onChange={(e) =>
                  setExtraBalanceAmount(e.target.value.replace(/\D/g, ""))
                }
                placeholder="Ex.: 2000"
              />
            </label>
            <p className="text-xs text-zinc-500">
              Use múltiplos de CC$ 1.000.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setExtraBalanceOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600"
              onClick={() => void applyExtraBalance()}
            >
              Confirmar crédito
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
