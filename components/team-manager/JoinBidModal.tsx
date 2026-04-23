"use client";

import { useState, useEffect } from "react";
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
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Lance de Habilitação
            {qualificationPotLabel ? (
              <span className="block text-base font-normal text-zinc-400 mt-1">
                {qualificationPotLabel}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Defina o valor do lance às cegas para participar do leilão deste
            pote.
          </DialogDescription>
        </DialogHeader>

        {qualificationPotNumber != null && qualificationPotPosition ? (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">
              Jogadores neste pote
            </p>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
              {potPreviewLoading ? (
                <p className="text-xs text-zinc-500 py-4">Carregando elenco…</p>
              ) : potPlayers.length === 0 ? (
                <p className="text-xs text-zinc-500 py-2">
                  Nenhum jogador listado para este pote.
                </p>
              ) : (
                potPlayers
                  .filter((p) => p.registration_id)
                  .map((p) => (
                    <div
                      key={p.registration_id}
                      className="flex flex-col items-center gap-1 shrink-0 w-[52px]"
                    >
                      <div className="relative w-11 h-11">
                        {p.photo_url ? (
                          <img
                            src={p.photo_url}
                            alt=""
                            className="w-full h-full rounded-full object-cover border border-amber-600/40"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-[10px] text-zinc-500">
                            ?
                          </div>
                        )}
                        <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-4 px-0.5 rounded-full bg-zinc-950 border border-amber-500/50 text-[8px] font-bold text-amber-200 flex items-center justify-center leading-none">
                          {p.overall ?? "–"}
                        </span>
                      </div>
                      <span className="text-[8px] text-center text-zinc-300 leading-tight line-clamp-2 w-full">
                        {p.name}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        ) : null}

        {canBid ? (
          <div className="space-y-6 py-2">
            <div className="text-center">
              <p className="text-3xl font-bold text-amber-300 tabular-nums">
                {formatCC(bidAmount)}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Saldo disponível: {formatCC(currentBalance)}
              </p>
            </div>

            <div className="px-2">
              <Slider
                min={minBid}
                max={maxBid}
                step={1000}
                value={[bidAmount]}
                onValueChange={([v]) => setBidAmount(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>{formatCC(minBid)}</span>
                <span>{formatCC(maxBid)}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-zinc-400 py-4">
            Saldo insuficiente para dar um lance (mínimo {formatCC(minBid)}).
          </p>
        )}

        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canBid || submitting}
            className="w-full sm:w-auto rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:pointer-events-none transition"
          >
            {submitting ? "Enviando..." : "Confirmar Lance"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
