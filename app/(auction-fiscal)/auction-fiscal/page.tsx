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
let alertHornAudio: HTMLAudioElement | null = null;

type ChampionshipRow = { id: string; name: string };

type Participant = {
  draftPotBudgetId: string | null;
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

type TransferPlayerOption = {
  registrationId: string;
  name: string;
  position: string;
};

type TransferManagerOption = {
  championshipManagerId: string;
  displayName: string;
  players: TransferPlayerOption[];
};

const LS_KEY = "auctionFiscalChampionshipId";

function normalizePositionGroup(position: string | null | undefined) {
  const p = (position ?? "").trim().toLowerCase();
  if (!p) return "unknown" as const;
  if (p === "gol" || p.includes("goleiro")) return "goalkeeper" as const;
  return "line" as const;
}

function playAlertHorn() {
  try {
    if (typeof window === "undefined") return;
    if (!alertHornAudio) {
      alertHornAudio = new Audio("/audios/buzzer.mp3");
      alertHornAudio.preload = "auto";
    }
    alertHornAudio.currentTime = 0;
    void alertHornAudio.play().catch(() => undefined);
  } catch {
    // Silently ignore if audio playback is blocked by browser policy.
  }
}

export default function AuctionFiscalPage() {
  const [championships, setChampionships] = useState<ChampionshipRow[]>([]);
  const [payload, setPayload] = useState<PotPayload | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [isApplyingBulk, setIsApplyingBulk] = useState(false);
  const [isApplyingIndividual, setIsApplyingIndividual] = useState(false);
  const [isApplyingExtraBalance, setIsApplyingExtraBalance] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [confirmTransferOpen, setConfirmTransferOpen] = useState(false);
  const [isLoadingTransferOptions, setIsLoadingTransferOptions] = useState(false);
  const [isApplyingTransfer, setIsApplyingTransfer] = useState(false);
  const [transferManagers, setTransferManagers] = useState<TransferManagerOption[]>(
    [],
  );
  const [managerAId, setManagerAId] = useState("");
  const [managerBId, setManagerBId] = useState("");
  const [playerARegId, setPlayerARegId] = useState("");
  const [playerBRegId, setPlayerBRegId] = useState("");
  const [progressiveTarget, setProgressiveTarget] =
    useState<Participant | null>(null);
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

  const qualifiedParticipantsCount = useMemo(() => {
    if (!payload?.participants?.length) return 0;
    return payload.participants.filter((p) => p.draftPotBudgetId !== null).length;
  }, [payload]);

  const managerA = useMemo(
    () => transferManagers.find((m) => m.championshipManagerId === managerAId) ?? null,
    [transferManagers, managerAId],
  );
  const managerB = useMemo(
    () => transferManagers.find((m) => m.championshipManagerId === managerBId) ?? null,
    [transferManagers, managerBId],
  );
  const playerA = useMemo(
    () => managerA?.players.find((p) => p.registrationId === playerARegId) ?? null,
    [managerA, playerARegId],
  );
  const playerB = useMemo(
    () => managerB?.players.find((p) => p.registrationId === playerBRegId) ?? null,
    [managerB, playerBRegId],
  );
  const transferRuleValid = useMemo(() => {
    if (!playerA || !playerB) return false;
    return (
      normalizePositionGroup(playerA.position) ===
      normalizePositionGroup(playerB.position)
    );
  }, [playerA, playerB]);
  const canReviewTransfer = useMemo(() => {
    return (
      !!managerAId &&
      !!managerBId &&
      managerAId !== managerBId &&
      !!playerARegId &&
      !!playerBRegId &&
      transferRuleValid
    );
  }, [managerAId, managerBId, playerARegId, playerBRegId, transferRuleValid]);

  const resetTransferForm = useCallback(() => {
    setManagerAId("");
    setManagerBId("");
    setPlayerARegId("");
    setPlayerBRegId("");
  }, []);

  const loadTransferOptions = useCallback(async () => {
    if (!championshipId) {
      setTransferManagers([]);
      return;
    }
    setIsLoadingTransferOptions(true);
    try {
      const res = await fetch(
        `/api/draft/fiscal/transfer-window-options?championshipId=${encodeURIComponent(championshipId)}`,
      );
      const json = (await res.json()) as {
        managers?: TransferManagerOption[];
        error?: string;
      };
      if (!res.ok) {
        toast.error(json.error ?? "Erro ao carregar dados da transferência");
        setTransferManagers([]);
        return;
      }
      setTransferManagers(json.managers ?? []);
    } finally {
      setIsLoadingTransferOptions(false);
    }
  }, [championshipId]);

  async function applyBulk() {
    if (!championshipId) return;
    setIsApplyingBulk(true);
    try {
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
      setConfirmBulk(false);
      await fetchPot();
    } finally {
      setIsApplyingBulk(false);
    }
  }

  async function applyProgressive(p: Participant) {
    if (!championshipId) return;
    setIsApplyingIndividual(true);
    try {
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
      toast.success(
        `Multa de CC$ ${(json.amount ?? 0).toLocaleString("pt-BR")} aplicada.`,
      );
      playAlertHorn();
      setProgressiveTarget(null);
      await fetchPot();
    } finally {
      setIsApplyingIndividual(false);
    }
  }

  async function applyExtraBalance() {
    if (!championshipId) return;
    const amount = Number(extraBalanceAmount.replace(/\D/g, ""));
    if (!amount || amount % 1000 !== 0) {
      toast.error("Informe um valor válido em múltiplos de CC$ 1.000.");
      return;
    }

    setIsApplyingExtraBalance(true);
    try {
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
    } finally {
      setIsApplyingExtraBalance(false);
    }
  }

  async function openTransferWindow() {
    resetTransferForm();
    setConfirmTransferOpen(false);
    setTransferOpen(true);
    await loadTransferOptions();
  }

  async function applyTransfer() {
    if (!championshipId || !canReviewTransfer) return;
    setIsApplyingTransfer(true);
    try {
      const res = await fetch("/api/draft/fiscal/apply-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId,
          managerACmId: managerAId,
          playerARegistrationId: playerARegId,
          managerBCmId: managerBId,
          playerBRegistrationId: playerBRegId,
        }),
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Erro ao aplicar transferência");
        return;
      }
      toast.success("Transferência 1x1 registrada com sucesso.");
      setConfirmTransferOpen(false);
      setTransferOpen(false);
      await Promise.all([fetchPot(), loadTransferOptions()]);
    } finally {
      setIsApplyingTransfer(false);
    }
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
              disabled={!payload?.auctionOpen || qualifiedParticipantsCount === 0}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
              onClick={() => setConfirmBulk(true)}
            >
              Multa Geral (CC$ 2.000)
            </button>
            <button
              type="button"
              disabled={!championshipId}
              className="rounded-lg border border-indigo-600/50 bg-indigo-900/20 px-3 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-900/35 disabled:opacity-40"
              onClick={() => void openTransferWindow()}
            >
              Janela de Transferência
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
                  payload.participants.map((p) => {
                    const isQualified = p.draftPotBudgetId !== null;
                    return (
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
                            disabled={
                              !payload.auctionOpen ||
                              !isQualified ||
                              isApplyingIndividual
                            }
                            className="rounded-md border bg-amber-700 px-2 py-1 text-xs hover:bg-amber-600 disabled:opacity-40 cursor-pointer"
                            onClick={() => {
                              if (!isQualified) return;
                              setProgressiveTarget(p);
                            }}
                            title={
                              !isQualified
                                ? "Somente cartolas qualificados no pote atual podem receber multa individual."
                                : undefined
                            }
                          >
                            Multa Individual
                          </button>
                        </td>
                      </tr>
                    );
                  })
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
              disponível. O tipo será definido automaticamente pelo pote:{" "}
              <span className="font-medium">no_bid_goalkeeper</span> para GOL e{" "}
              <span className="font-medium">no_bid_player</span> para linha.
            </p>
            <p className="text-xs text-zinc-500">
              A multa geral será aplicada somente aos cartolas qualificados para
              o leilão do pote atual.
            </p>
            <p className="font-medium text-amber-200/90">
              Você confirma que deseja aplicar a multa geral agora?
            </p>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={isApplyingBulk}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setConfirmBulk(false)}
            >
              Não, cancelar
            </button>
            <button
              type="button"
              disabled={isApplyingBulk}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600"
              onClick={() => void applyBulk()}
            >
              {isApplyingBulk ? "Aplicando..." : "Sim, aplicar multa geral"}
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
            <DialogTitle>Confirmar Multa Individual</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Multa progressiva de &quot;over budget&quot; em passos de CC$ 2.000,
              debitada primeiro do saldo do pote atual e, se faltar, do saldo
              geral.
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
                  {progressiveTarget.nextProgressiveFineByType.over_budget.toLocaleString(
                    "pt-BR",
                  )}
                </span>
              </p>
              <p className="text-xs text-zinc-500">
                Progressão de CC$ 2.000 por ocorrência (1ª = CC$ 2.000, 2ª = CC$
                4.000, …).
              </p>
              <p className="text-xs text-zinc-500">
                Regra de débito: primeiro no pote atual; caso não cubra o valor
                total, o restante é debitado do saldo geral.
              </p>
              <p className="font-medium text-amber-200/90 pt-1">
                Você confirma que deseja aplicar esta multa a este cartola?
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={isApplyingIndividual}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setProgressiveTarget(null)}
            >
              Não, cancelar
            </button>
            <button
              type="button"
              disabled={isApplyingIndividual}
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600"
              onClick={() =>
                progressiveTarget && void applyProgressive(progressiveTarget)
              }
            >
              {isApplyingIndividual ? "Aplicando..." : "Sim, aplicar multa"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={transferOpen}
        onOpenChange={(open) => {
          if (isApplyingTransfer) return;
          setTransferOpen(open);
          if (!open) {
            setConfirmTransferOpen(false);
            resetTransferForm();
          }
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Janela de Transferência</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Troca simples 1x1 entre cartolas. Selecione um cartola e jogador de
              cada lado para prosseguir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-zinc-300">
            {isLoadingTransferOptions ? (
              <p className="text-zinc-500">Carregando cartolas e elencos...</p>
            ) : (
              <>
                <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Cartola A
                  </p>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                    value={managerAId}
                    onChange={(e) => {
                      setManagerAId(e.target.value);
                      setPlayerARegId("");
                    }}
                  >
                    <option value="">Selecione o Cartola A</option>
                    {transferManagers.map((m) => (
                      <option
                        key={`a-${m.championshipManagerId}`}
                        value={m.championshipManagerId}
                        disabled={m.championshipManagerId === managerBId}
                      >
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                    value={playerARegId}
                    onChange={(e) => setPlayerARegId(e.target.value)}
                    disabled={!managerA}
                  >
                    <option value="">Selecione o Jogador X</option>
                    {(managerA?.players ?? []).map((p) => (
                      <option key={`pa-${p.registrationId}`} value={p.registrationId}>
                        {p.name} ({p.position || "Sem posição"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 rounded-lg border border-zinc-800 p-3">
                  <p className="text-xs uppercase tracking-wide text-zinc-500">
                    Cartola B
                  </p>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                    value={managerBId}
                    onChange={(e) => {
                      setManagerBId(e.target.value);
                      setPlayerBRegId("");
                    }}
                  >
                    <option value="">Selecione o Cartola B</option>
                    {transferManagers.map((m) => (
                      <option
                        key={`b-${m.championshipManagerId}`}
                        value={m.championshipManagerId}
                        disabled={m.championshipManagerId === managerAId}
                      >
                        {m.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2"
                    value={playerBRegId}
                    onChange={(e) => setPlayerBRegId(e.target.value)}
                    disabled={!managerB}
                  >
                    <option value="">Selecione o Jogador Y</option>
                    {(managerB?.players ?? []).map((p) => (
                      <option key={`pb-${p.registrationId}`} value={p.registrationId}>
                        {p.name} ({p.position || "Sem posição"})
                      </option>
                    ))}
                  </select>
                </div>

                {playerA && playerB && !transferRuleValid && (
                  <p className="text-xs text-red-300">
                    Troca inválida: somente Goleiro ↔ Goleiro ou Linha ↔ Linha.
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={isApplyingTransfer}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setTransferOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isLoadingTransferOptions || !canReviewTransfer}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium hover:bg-indigo-600 disabled:opacity-40"
              onClick={() => setConfirmTransferOpen(true)}
            >
              Revisar transferência
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmTransferOpen}
        onOpenChange={(open) => {
          if (isApplyingTransfer) return;
          setConfirmTransferOpen(open);
        }}
      >
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Confirmar transferência 1x1</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Confira os jogadores e cartolas antes de registrar a troca.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-zinc-300">
            <p>
              <span className="text-zinc-500">Cartola A:</span>{" "}
              <span className="font-medium text-zinc-100">
                {managerA?.displayName ?? "—"}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">Jogador X:</span>{" "}
              <span className="font-medium text-zinc-100">
                {playerA ? `${playerA.name} (${playerA.position})` : "—"}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">Cartola B:</span>{" "}
              <span className="font-medium text-zinc-100">
                {managerB?.displayName ?? "—"}
              </span>
            </p>
            <p>
              <span className="text-zinc-500">Jogador Y:</span>{" "}
              <span className="font-medium text-zinc-100">
                {playerB ? `${playerB.name} (${playerB.position})` : "—"}
              </span>
            </p>
            <p className="pt-1 text-xs text-zinc-500">
              Regra: Goleiro troca com Goleiro. Jogador de linha troca com
              jogador de linha.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              disabled={isApplyingTransfer}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setConfirmTransferOpen(false)}
            >
              Não, cancelar
            </button>
            <button
              type="button"
              disabled={isApplyingTransfer || !canReviewTransfer}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-medium hover:bg-indigo-600 disabled:opacity-40"
              onClick={() => void applyTransfer()}
            >
              {isApplyingTransfer
                ? "Aplicando..."
                : "Sim, confirmar transferência"}
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
              disabled={isApplyingExtraBalance}
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setExtraBalanceOpen(false)}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={isApplyingExtraBalance}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-600"
              onClick={() => void applyExtraBalance()}
            >
              {isApplyingExtraBalance ? "Aplicando..." : "Confirmar crédito"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
