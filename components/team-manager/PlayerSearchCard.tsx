"use client";

import { Star } from "lucide-react";
import Image from "next/image";
import { positionLabel } from "@/lib/public/types";
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

/**
 * A cor da etiqueta por CODIGO de posicao.
 *
 * As quatro PALAVRAS que estavam aqui sairam na virada da 20260821010000 —
 * `players.preferred_position` guarda codigo, entao nenhuma voltaria a casar.
 *
 * A metade que parecia ser "de codigo" tinha a chave do meia escrita `MEIA`,
 * que nao e codigo de nada. Era REDUNDANCIA, e nao um defeito que rodou: ate a
 * virada a coluna guardava a PALAVRA, entao o meia era pintado de emerald pela
 * chave `Meia` logo acima e nunca caiu no cinza do fallback. `MEIA` esta neste
 * arquivo desde 0393c95 (15/04/2026) sem nunca ter sido consultada.
 *
 * O custo dela nao foi tela errada — foi que ninguem tinha como saber se era
 * chave morta ou chave que importava, e por isso ela atravessou uma virada de
 * vocabulario inteira sem ninguem questionar. E o argumento contra deixar
 * entrada "por seguranca" num mapa: ela nao avisa quando para de fazer sentido,
 * e quem chega depois nao tem como distinguir reserva de lixo.
 */
const positionColors: Record<string, string> = {
  GOL: "bg-yellow-500/20 text-yellow-300",
  ZAG: "bg-blue-500/20 text-blue-300",
  MEI: "bg-emerald-500/20 text-emerald-300",
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
            {/*
              O prop segue chegando em CODIGO, e tem de seguir: e ele que
              escolhe a cor logo acima. Quem vira palavra e so o TEXTO.

              `PotPreviewTab` chama este card com a posicao do POTE quando o
              jogador nao esta no catalogo, e la existe `EXT`, que nao e posicao
              de ninguem. `positionLabel` devolve o bruto nesse caso, entao a
              etiqueta diz `EXT` — mesmo destino que a cor ja tinha, porque
              `positionColors` tambem nao tem essa entrada.
            */}
            {positionLabel(position)}
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
