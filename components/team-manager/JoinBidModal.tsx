"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import type { PotAuctionPlayersResponse } from "@/app/api/draft/pot-auction-players/route";

type JoinBidModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBalance: number;
  championshipId: string;
  championshipManagerId: string;
  qualificationPotNumber: number | null;
  qualificationPotPosition: string | null;
  /** e.g. "Pote 2 (Atacante)" — shown in title when staff opened the window */
  qualificationPotLabel: string | null;
  /** Close modal if staff closes the window while it is open */
  qualificationWindowOpen: boolean;
  onSuccess: () => void;
};

function formatCC(value: number) {
  return `CC$ ${value.toLocaleString("pt-BR")}`;
}

export function JoinBidModal({
  open,
  onOpenChange,
  currentBalance,
  championshipId,
  championshipManagerId,
  qualificationPotNumber,
  qualificationPotPosition,
  qualificationPotLabel,
  qualificationWindowOpen,
  onSuccess,
}: JoinBidModalProps) {
  useEffect(() => {
    if (open && !qualificationWindowOpen) {
      onOpenChange(false);
    }
  }, [open, qualificationWindowOpen, onOpenChange]);

  const [potPlayers, setPotPlayers] = useState<
    PotAuctionPlayersResponse["players"]
  >([]);
  const [potPreviewLoading, setPotPreviewLoading] = useState(false);

  useEffect(() => {
    if (
      !open ||
      qualificationPotNumber == null ||
      !qualificationPotPosition?.trim()
    ) {
      setPotPlayers([]);
      return;
    }

    const ac = new AbortController();
    setPotPreviewLoading(true);

    const q = new URLSearchParams({
      championshipId,
      potNumber: String(qualificationPotNumber),
      potPosition: qualificationPotPosition.trim(),
    });

    void fetch(`/api/draft/pot-auction-players?${q.toString()}`, {
      signal: ac.signal,
    })
      .then(async (res) => {
        if (!res.ok) return;
        const json = (await res.json()) as PotAuctionPlayersResponse;
        if (!ac.signal.aborted) {
          setPotPlayers(json.players ?? []);
        }
      })
      .catch(() => {
        if (!ac.signal.aborted) setPotPlayers([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setPotPreviewLoading(false);
      });

    return () => ac.abort();
  }, [
    open,
    championshipId,
    qualificationPotNumber,
    qualificationPotPosition,
  ]);

  const minBid = 1000;
  const maxBid = Math.floor(currentBalance / 1000) * 1000;
  const canBid = maxBid >= minBid;

  const [bidAmount, setBidAmount] = useState(minBid);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!canBid || submitting) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/draft/join-pot-bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId,
          championshipManagerId,
          bidAmount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar lance");
        return;
      }

      toast.success("Lance de habilitação enviado!");
      onOpenChange(false);
      setBidAmount(minBid);
      onSuccess();
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // grid + scroll no Safari/Chrome: usar flex + scroll só no meio evita “barra branca” e overflow zoado
        // Usamos style inline para forçar max-width/max-height sem batalhar especificidade
        // com as classes default do shadcn DialogContent.
        // dvh em vez de vh para respeitar a altura visível real no Safari (evita o modal colar no fundo)
        style={{
          maxWidth: "min(640px, calc(100% - 1.5rem))",
          maxHeight: "calc(100dvh - 2.5rem)",
        }}
        className="flex! h-auto! w-full! flex-col! gap-0! overflow-hidden border border-zinc-800 bg-zinc-900 p-0 text-white"
      >
        <div className="shrink-0 border-b border-zinc-800/90 p-5 pb-4">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="pr-6 font-semibold leading-snug">
              Lance de Habilitação
            </DialogTitle>
            {qualificationPotLabel ? (
              <p className="text-sm font-medium text-amber-200/90">
                {qualificationPotLabel}
              </p>
            ) : null}
            <DialogDescription className="sr-only">
              Defina o valor do lance às cegas para participar do leilão deste
              pote. Use o controle deslizante e confirme com o botão.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4">
          <div className="space-y-5">
            {qualificationPotNumber != null && qualificationPotPosition ? (
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Elenco do Pote
                </h3>
                <div
                  className="rounded-xl border border-zinc-800/90 bg-zinc-950/50 px-3 py-3"
                  role="region"
                  aria-label="Jogadores neste pote"
                >
                  <div className="flex gap-3 overflow-x-auto pt-2 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {potPreviewLoading ? (
                      <p className="w-full py-2 text-center text-sm text-zinc-500">
                        Carregando elenco…
                      </p>
                    ) : potPlayers.length === 0 ? (
                      <p className="w-full py-1 text-center text-sm text-zinc-500">
                        Nenhum jogador listado para este pote.
                      </p>
                    ) : (
                      potPlayers
                        .filter((p) => p.registration_id)
                        .map((p) => (
                          <div
                            key={p.registration_id}
                            className="flex w-16 shrink-0 flex-col items-center gap-1.5"
                          >
                            <div
                              className="relative shrink-0"
                              style={{ width: 48, height: 48 }}
                            >
                              {p.photo_url ? (
                                <Image
                                  src={p.photo_url}
                                  alt={p.name}
                                  width={96}
                                  height={96}
                                  unoptimized
                                  sizes="48px"
                                  className="h-12 w-12 rounded-full border border-amber-500/35 object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center rounded-full border border-zinc-600/80 bg-zinc-800 text-xs text-zinc-500">
                                  ?
                                </div>
                              )}
                              <span
                                className="absolute z-10 flex items-center justify-center rounded-full border border-amber-500/50 bg-zinc-950 text-[10px] font-bold leading-none text-amber-200 shadow-sm tabular-nums"
                                style={{
                                  top: -6,
                                  right: -6,
                                  minWidth: 22,
                                  height: 18,
                                  padding: "0 4px",
                                }}
                              >
                                {p.overall ?? "–"}
                              </span>
                            </div>
                            <span className="w-full text-center text-[11px] leading-snug text-zinc-200 line-clamp-2 sm:text-xs">
                              {p.name}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            <p className="text-pretty wrap-break-word text-sm leading-relaxed text-zinc-400">
              Ajuste o valor do lance (às cegas) para participar do leilão deste
              pote. O mínimo é {formatCC(minBid)}.
            </p>

            {canBid ? (
              <div className="space-y-5 rounded-xl border border-zinc-800/90 bg-zinc-950/60 p-4 sm:p-5">
                <div className="space-y-2 text-center">
                  <p className="text-xs font-medium text-zinc-500">Seu Lance</p>
                  <p className="text-2xl font-bold tracking-tight text-amber-200 tabular-nums sm:text-3xl">
                    {formatCC(bidAmount)}
                  </p>
                  <p className="text-sm text-zinc-400">
                    Saldo Disponível:{" "}
                    <span className="text-zinc-200 tabular-nums">
                      {formatCC(currentBalance)}
                    </span>
                  </p>
                </div>

                <div className="px-0.5">
                  {/* respiro vertical para o thumb não cobrir os rótulos embaixo */}
                  <div className="px-0 py-1.5">
                    <Slider
                      min={minBid}
                      max={maxBid}
                      step={1000}
                      value={[bidAmount]}
                      onValueChange={([v]) => setBidAmount(v)}
                      className="w-full"
                    />
                  </div>
                  <div className="mt-3 flex justify-between gap-3 text-xs tabular-nums text-zinc-500">
                    <span className="min-w-0 wrap-break-word text-left">
                      {formatCC(minBid)}
                    </span>
                    <span className="min-w-0 wrap-break-word text-right">
                      {formatCC(maxBid)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-4 text-center text-sm leading-relaxed text-zinc-400">
                Saldo insuficiente para dar um lance. É necessário pelo menos{" "}
                {formatCC(minBid)}.
              </p>
            )}
          </div>
        </div>

        <DialogFooter
          style={{ paddingBottom: 28 }}
          className="shrink-0 border-t border-zinc-800/60 px-5 pt-4 sm:gap-3"
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-11 w-full rounded-lg bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canBid || submitting}
            className="min-h-11 w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-40 sm:w-auto"
          >
            {submitting ? "Enviando…" : "Confirmar Lance"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
