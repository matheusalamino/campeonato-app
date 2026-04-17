"use client";

import { useState, useEffect, useRef } from "react";
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

type SpecialCardBidModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  potBudget: {
    remainingBudget: number;
  } | null;
  specialCardUseId: string | null;
  championshipId: string;
  championshipManagerId: string;
  onSuccess: () => void;
};

const TIMER_SECONDS = 20;

function formatCC(value: number) {
  return `CC$ ${value.toLocaleString("pt-BR")}`;
}

export function SpecialCardBidModal({
  open,
  onOpenChange,
  potBudget,
  specialCardUseId,
  championshipId,
  championshipManagerId,
  onSuccess,
}: SpecialCardBidModalProps) {
  const maxBid = potBudget
    ? Math.floor(potBudget.remainingBudget / 1000) * 1000
    : 0;

  const [bidAmount, setBidAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(TIMER_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!open) {
      setSecondsLeft(TIMER_SECONDS);
      setBidAmount(0);
      submittedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    submittedRef.current = false;
    setSecondsLeft(TIMER_SECONDS);

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (!submittedRef.current) {
            submittedRef.current = true;
            handleAutoSubmit();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submitBid(amount: number) {
    if (!specialCardUseId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/draft/special-card-bid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId,
          championshipManagerId,
          specialCardUseId,
          bidAmount: amount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Erro ao enviar lance");
        return;
      }

      toast.success(`Lance de ${formatCC(amount)} enviado!`);
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleAutoSubmit() {
    submitBid(0);
  }

  async function handleConfirm() {
    if (submitting) return;
    submittedRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    await submitBid(bidAmount);
  }

  const timerColor =
    secondsLeft > 10
      ? "text-emerald-400"
      : secondsLeft > 5
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Lance às Cegas — Carta Especial</span>
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Defina seu lance. O tempo é limitado!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Timer */}
          <div className="text-center">
            <p className={`text-5xl font-bold tabular-nums ${timerColor}`}>
              {secondsLeft}s
            </p>
            <p className="text-xs text-zinc-500 mt-1">Tempo restante</p>
          </div>

          {/* Bid amount */}
          <div className="text-center">
            <p className="text-3xl font-bold text-amber-300 tabular-nums">
              {formatCC(bidAmount)}
            </p>
          </div>

          {/* Slider */}
          {maxBid > 0 && (
            <div className="px-2">
              <Slider
                min={0}
                max={maxBid}
                step={1000}
                value={[bidAmount]}
                onValueChange={([v]) => setBidAmount(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
                <span>{formatCC(0)}</span>
                <span>{formatCC(maxBid)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={handleConfirm}
            disabled={submitting || secondsLeft === 0}
            className="w-full rounded-xl bg-amber-600 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none transition"
          >
            {submitting ? "Enviando..." : "Confirmar Lance"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
