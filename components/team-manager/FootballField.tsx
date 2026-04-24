"use client";

import Image from "next/image";

type SquadPlayer = {
  id: string;
  name: string;
  position: string;
  overall: number | null;
  purchasePrice: number | null;
  photoUrl: string | null;
};

type FootballFieldProps = {
  players: SquadPlayer[];
};

const positionMap: Record<string, string> = {
  Goleiro: "GOL",
  Zagueiro: "ZAG",
  Meia: "MEI",
  Atacante: "ATA",
  GOL: "GOL",
  ZAG: "ZAG",
  MEIA: "MEI",
  MEI: "MEI",
  ATA: "ATA",
};

function formatCC(value: number) {
  return `CC$ ${value.toLocaleString("pt-BR")}`;
}

function PlayerSlot({ player }: { player?: SquadPlayer }) {
  if (!player) {
    return (
      <div className="flex flex-col items-center gap-1">
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full border-2 border-dashed border-yellow-400 flex items-center justify-center">
          <span className="text-yellow-400 text-lg">?</span>
        </div>
        <span className="text-[9px] text-yellow-400">Vazio</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 max-w-[72px]">
      <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
        {player.photoUrl ? (
          <Image
            src={player.photoUrl}
            alt={player.name}
            fill
            sizes="(max-width: 640px) 48px, 56px"
            unoptimized
            className="rounded-full object-cover border-2 border-amber-500/55 shadow-md shadow-black/40"
          />
        ) : (
          <div className="w-full h-full rounded-full border-2 border-amber-600/25 bg-zinc-800/90 flex items-center justify-center text-[11px] font-semibold text-zinc-500">
            ?
          </div>
        )}
        <span className="absolute -top-0.5 -right-0.5 min-w-[1.35rem] h-5 px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none border shadow-sm bg-zinc-950 border-amber-500/70 text-amber-200">
          {player.overall ?? "–"}
        </span>
      </div>
      <span className="text-[10px] font-medium text-center leading-tight truncate w-full">
        {player.name.split(" ")[0]}
      </span>
      {player.purchasePrice !== null && (
        <span className="text-[8px] font-semibold text-amber-300 tabular-nums">
          {formatCC(player.purchasePrice)}
        </span>
      )}
    </div>
  );
}

function PositionRow({
  players,
  slots,
}: {
  players: SquadPlayer[];
  slots: number;
}) {
  const items: (SquadPlayer | undefined)[] = [...players];
  while (items.length < slots) items.push(undefined);

  return (
    <div className="flex items-center justify-center gap-4 sm:gap-6">
      {items.map((p, i) => (
        <PlayerSlot key={p?.id ?? `empty-${i}`} player={p} />
      ))}
    </div>
  );
}

// Roster rules:
//   • 10 total slots: 1 goalkeeper + 9 line players (ATA/MEI/ZAG).
//   • Baseline layout: 3 ATA, 3 MEI, 3 ZAG, 1 GOL.
//   • If a position exceeds its baseline (e.g. 4 MEI), the extra slot(s) are
//     taken from other line positions that have not filled their baseline yet.
//   • If the real count exceeds the 9-line budget (data inconsistency), we
//     render every real player instead of truncating them away.
function computeLineSlots(
  ata: number,
  mei: number,
  zag: number,
): { ATA: number; MEI: number; ZAG: number } {
  const LINE_BUDGET = 9;
  const BASELINE = 3;

  const slots = { ATA: ata, MEI: mei, ZAG: zag };
  const totalReal = ata + mei + zag;

  if (totalReal >= LINE_BUDGET) return slots;

  let remaining = LINE_BUDGET - totalReal;
  const order: Array<"ZAG" | "MEI" | "ATA"> = ["ZAG", "MEI", "ATA"];

  // Round-robin fill until we either exhaust remaining slots or every position
  // has reached its baseline.
  while (remaining > 0) {
    let addedThisPass = false;
    for (const pos of order) {
      if (remaining === 0) break;
      if (slots[pos] < BASELINE) {
        slots[pos] += 1;
        remaining -= 1;
        addedThisPass = true;
      }
    }
    if (!addedThisPass) break;
  }

  return slots;
}

export function FootballField({ players }: FootballFieldProps) {
  const grouped: Record<string, SquadPlayer[]> = {
    GOL: [],
    ZAG: [],
    MEI: [],
    ATA: [],
  };

  for (const p of players) {
    const pos = positionMap[p.position] ?? "MEI";
    grouped[pos].push(p);
  }

  const lineSlots = computeLineSlots(
    grouped.ATA.length,
    grouped.MEI.length,
    grouped.ZAG.length,
  );
  const gkSlots = Math.max(1, grouped.GOL.length);

  return (
    <div className="relative w-full aspect-3/4 max-w-md mx-auto rounded-2xl overflow-hidden">
      {/* Pitch background */}
      <div className="absolute inset-0 bg-linear-to-b from-green-900 via-green-800 to-green-900">
        {/* Center circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border border-white/15" />
        {/* Center line */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/15" />
        {/* Penalty areas */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[60%] h-[18%] border border-white/15 border-b-0" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-[18%] border border-white/15 border-t-0" />
      </div>

      {/* Players overlay */}
      <div className="relative z-10 h-full flex flex-col justify-between py-6 px-2">
        <PositionRow players={grouped.ATA} slots={lineSlots.ATA} />
        <PositionRow players={grouped.MEI} slots={lineSlots.MEI} />
        <PositionRow players={grouped.ZAG} slots={lineSlots.ZAG} />
        <PositionRow players={grouped.GOL} slots={gkSlots} />
      </div>
    </div>
  );
}
