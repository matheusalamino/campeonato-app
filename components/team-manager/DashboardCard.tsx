"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  icon: ReactNode;
  label: string;
  badge?: string;
  disabled?: boolean;
  onClick: () => void;
  variant?: "default" | "gold" | "destructive";
};

export function DashboardCard({
  icon,
  label,
  badge,
  disabled,
  onClick,
  variant = "default",
}: DashboardCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-center justify-center gap-2 rounded-2xl p-5 text-center transition-all active:scale-95",
        "min-h-[120px] w-full",
        variant === "default" &&
          "bg-zinc-900 border border-zinc-800 hover:border-zinc-600",
        variant === "gold" &&
          "bg-gradient-to-br from-yellow-900/40 to-amber-950/40 border border-yellow-700/50 hover:border-yellow-500/70",
        variant === "destructive" &&
          "bg-gradient-to-br from-red-900/30 to-red-950/30 border border-red-700/40 hover:border-red-500/60",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-zinc-200">{label}</span>
      {badge && (
        <span className="absolute top-2 right-2 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}
