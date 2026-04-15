"use client";

import { cn } from "@/lib/utils";

type BalanceDisplayProps = {
  currentBalance: number;
  initialBalance: number;
  potBudget?: {
    potNumber: number;
    potPosition: string;
    remainingBudget: number;
    initialBudget: number;
  } | null;
};

function formatCC(value: number) {
  return `CC$ ${value.toLocaleString("pt-BR")}`;
}

export function BalanceDisplay({
  currentBalance,
  initialBalance,
  potBudget,
}: BalanceDisplayProps) {
  const balancePercent = initialBalance > 0
    ? Math.round((currentBalance / initialBalance) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <p className="text-xs text-zinc-400 uppercase tracking-wider">
          Saldo Geral
        </p>
        <p
          className={cn(
            "text-2xl sm:text-3xl font-bold mt-1 tabular-nums",
            currentBalance > 20000
              ? "text-emerald-400"
              : currentBalance > 5000
                ? "text-yellow-400"
                : "text-red-400",
          )}
        >
          {formatCC(currentBalance)}
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${balancePercent}%` }}
          />
        </div>
        <p className="text-[10px] text-zinc-500 mt-1">
          {formatCC(currentBalance)} de {formatCC(initialBalance)}
        </p>
      </div>

      {potBudget && (
        <div className="rounded-2xl bg-zinc-900 border border-amber-900/40 p-4">
          <p className="text-xs text-amber-400/80 uppercase tracking-wider">
            Pote {potBudget.potNumber} — {potBudget.potPosition}
          </p>
          <p className="text-xl font-bold text-amber-300 mt-1 tabular-nums">
            {formatCC(potBudget.remainingBudget)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{
                width: `${
                  potBudget.initialBudget > 0
                    ? Math.round(
                        (potBudget.remainingBudget / potBudget.initialBudget) *
                          100,
                      )
                    : 0
                }%`,
              }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1">
            {formatCC(potBudget.remainingBudget)} de{" "}
            {formatCC(potBudget.initialBudget)}
          </p>
        </div>
      )}
    </div>
  );
}
