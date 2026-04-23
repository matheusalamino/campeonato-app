"use client";

import { Star } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

type PlayerSearchCardProps = {
  name: string;
  position: string;
  overall: number | null;
  photoUrl: string | null;
  isPurchased: boolean;
  purchasePrice: number | null;
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

function formatPrice(n: number) {
  return `CC$ ${n.toLocaleString("pt-BR")}`;
}

export function PlayerSearchCard({
  name,
  position,
  overall,
  photoUrl,
  isPurchased,
  purchasePrice,
  isFavorite,
  onToggleFavorite,
}: PlayerSearchCardProps) {
  const canFavorite = !isPurchased || isFavorite;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900 border border-zinc-800 p-3">
      {/* Foto (círculo) + overall (quadrado) */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative w-11 h-11 rounded-full overflow-hidden border border-zinc-600 bg-zinc-800">
          {photoUrl ? (
            <Image
              src={photoUrl}
              alt=""
              width={44}
              height={44}
              unoptimized
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
              ?
            </div>
          )}
        </div>
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center text-base font-bold shrink-0 bg-zinc-800 border border-zinc-700",
            overallColor(overall),
          )}
        >
          {overall ?? "–"}
        </div>
      </div>

      {/* Info + badges */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
              positionColors[position] ?? "bg-zinc-700 text-zinc-300",
            )}
          >
            {position}
          </span>
          {isPurchased && (
            <>
              <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/35">
                Leiloado
              </span>
              {purchasePrice != null && (
                <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {formatPrice(purchasePrice)}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          if (canFavorite) onToggleFavorite();
        }}
        disabled={!canFavorite}
        title={
          isPurchased && !isFavorite
            ? "Jogadores já leiloados não podem ser favoritados"
            : isFavorite
              ? "Remover dos favoritos"
              : "Adicionar aos favoritos"
        }
        className={cn(
          "p-2 rounded-lg transition shrink-0",
          canFavorite
            ? "hover:bg-zinc-800 cursor-pointer"
            : "opacity-35 cursor-not-allowed",
        )}
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
