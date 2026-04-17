"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type PlayerSearchCardProps = {
  name: string;
  position: string;
  overall: number | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
};

const positionColors: Record<string, string> = {
  Goleiro: "bg-yellow-500/20 text-yellow-300",
  Zagueiro: "bg-blue-500/20 text-blue-300",
  Meia: "bg-emerald-500/20 text-emerald-300",
  Atacante: "bg-red-500/20 text-red-300",
  GOL: "bg-yellow-500/20 text-yellow-300",
  ZAG: "bg-blue-500/20 text-blue-300",
  MEIA: "bg-emerald-500/20 text-emerald-300",
  ATA: "bg-red-500/20 text-red-300",
};

function overallColor(overall: number | null) {
  if (!overall) return "text-zinc-400";
  if (overall >= 80) return "text-emerald-400";
  if (overall >= 60) return "text-yellow-400";
  return "text-orange-400";
}

export function PlayerSearchCard({
  name,
  position,
  overall,
  isFavorite,
  onToggleFavorite,
}: PlayerSearchCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 p-3">
      {/* Overall */}
      <div
        className={cn(
          "w-11 h-11 rounded-lg flex items-center justify-center text-lg font-bold shrink-0 bg-zinc-800",
          overallColor(overall),
        )}
      >
        {overall ?? "–"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <span
          className={cn(
            "inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium",
            positionColors[position] ?? "bg-zinc-700 text-zinc-300",
          )}
        >
          {position}
        </span>
      </div>

      {/* Favorite button */}
      <button
        onClick={onToggleFavorite}
        className="p-2 rounded-lg hover:bg-zinc-800 transition shrink-0"
      >
        <Star
          className={cn(
            "w-5 h-5 transition",
            isFavorite
              ? "fill-yellow-400 text-yellow-400"
              : "text-zinc-600",
          )}
        />
      </button>
    </div>
  );
}
