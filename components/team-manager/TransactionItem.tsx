"use client";

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Gavel,
  AlertTriangle,
  Undo2,
  Trophy,
  Sparkles,
  Banknote,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TransactionItemProps = {
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
};

const typeConfig: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  INITIAL_BALANCE: {
    icon: <Trophy className="w-4 h-4" />,
    label: "Saldo Inicial",
    color: "text-emerald-400",
  },
  POT_BID_RESERVE: {
    icon: <Gavel className="w-4 h-4" />,
    label: "Reserva — Habilitação",
    color: "text-blue-400",
  },
  POT_BID_REFUND: {
    icon: <Undo2 className="w-4 h-4" />,
    label: "Reembolso — Habilitação",
    color: "text-emerald-400",
  },
  GOALKEEPER_PURCHASE: {
    icon: <Banknote className="w-4 h-4" />,
    label: "Compra de Goleiro",
    color: "text-orange-400",
  },
  FINE_NO_BID_GOALKEEPER: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Multa — Sem lance (goleiro)",
    color: "text-red-400",
  },
  FINE_NO_BID_PLAYER: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Multa — Sem lance (jogador)",
    color: "text-red-400",
  },
  FINE_REMAINING_BUDGET: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Multa — Saldo restante",
    color: "text-red-400",
  },
  FINE_OVER_BUDGET: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Multa — Lance acima do orçamento",
    color: "text-red-400",
  },
  FINE_MANUAL: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: "Multa — Manual",
    color: "text-red-400",
  },
  POT_BUDGET_RETURN: {
    icon: <ArrowUpCircle className="w-4 h-4" />,
    label: "Devolução do pote",
    color: "text-emerald-400",
  },
  ADDITIONAL_ROUND_PURCHASE: {
    icon: <Banknote className="w-4 h-4" />,
    label: "Compra — Rodada Adicional",
    color: "text-orange-400",
  },
  DRAFT_PLAYER_PURCHASE: {
    icon: <Banknote className="w-4 h-4" />,
    label: "Compra — Leilão / Draft",
    color: "text-orange-400",
  },
};

function formatCC(value: number) {
  const abs = Math.abs(value);
  const prefix = value >= 0 ? "+" : "-";
  return `${prefix} CC$ ${abs.toLocaleString("pt-BR")}`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TransactionItem({
  type,
  amount,
  description,
  createdAt,
}: TransactionItemProps) {
  const config = typeConfig[type] ?? {
    icon: <Sparkles className="w-4 h-4" />,
    label: type,
    color: "text-zinc-400",
  };

  return (
    <div className="flex items-center gap-3 py-3 border-b border-zinc-800/50 last:border-0">
      <div className={cn("shrink-0", config.color)}>{config.icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {description || config.label}
        </p>
        <p className="text-[10px] text-zinc-500">{formatTime(createdAt)}</p>
      </div>
      <span
        className={cn(
          "text-sm font-bold tabular-nums shrink-0",
          amount >= 0 ? "text-emerald-400" : "text-red-400",
        )}
      >
        {formatCC(amount)}
      </span>
    </div>
  );
}
