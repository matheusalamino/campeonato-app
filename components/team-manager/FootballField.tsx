"use client";

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
          <img
            src={player.photoUrl}
            alt=""
            className="w-full h-full rounded-full object-cover border-2 border-amber-500/55 shadow-md shadow-black/40"
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

  return (
    <div className="relative w-full aspect-[3/4] max-w-md mx-auto rounded-2xl overflow-hidden">
      {/* Pitch background */}
      <div className="absolute inset-0 bg-gradient-to-b from-green-900 via-green-800 to-green-900">
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
        <PositionRow players={grouped.ATA} slots={Math.max(grouped.ATA.length, 3)} />
        <PositionRow players={grouped.MEI} slots={Math.max(grouped.MEI.length, 3)} />
        <PositionRow players={grouped.ZAG} slots={Math.max(grouped.ZAG.length, 3)} />
        <PositionRow players={grouped.GOL} slots={1} />
      </div>
    </div>
  );
}
