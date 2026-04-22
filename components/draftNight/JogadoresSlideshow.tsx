"use client";

import { useState } from "react";
import { useDraftPots, type DraftPot } from "@/features/hooks/useDraftPots";
import PotMenuSlide from "./PotMenuSlide";
import PotBidsSlide from "./PotBidsSlide";
import PotAuctionSlide from "./PotAuctionSlide";

type QualifiedManager = {
  championship_manager_id: string;
  manager_name: string;
  team_name: string | null;
};

type Screen =
  | { type: "menu" }
  | { type: "bids"; pot: DraftPot }
  | { type: "auction"; pot: DraftPot; qualified: QualifiedManager[] };

function MenuGridIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

type Props = {
  championshipId: string;
  onFinished?: () => void;
  onGoToMenu?: () => void;
};

export default function JogadoresSlideshow({
  championshipId,
  onFinished,
  onGoToMenu,
}: Props) {
  const { pots, loading, error } = useDraftPots(championshipId);
  const [screen, setScreen] = useState<Screen>({ type: "menu" });
  // Track which pots are done
  const [completedPots, setCompletedPots] = useState<Set<string>>(new Set());

  function potKey(pot: DraftPot) {
    return `${pot.pot_number}:${pot.position}`;
  }

  function markCompleted(pot: DraftPot) {
    setCompletedPots((prev) => new Set([...prev, potKey(pot)]));
  }

  const counterLabel = (() => {
    if (screen.type === "menu") return "Jogadores";
    if (screen.type === "bids") return `Pote ${screen.pot.pot_letter} — Lances`;
    if (screen.type === "auction")
      return `Pote ${screen.pot.pot_letter} — Leilão`;
    return "Jogadores";
  })();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&display=swap');
        .js-nav{position:fixed;bottom:16px;left:16px;display:flex;gap:8px;z-index:50}
        .js-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .js-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .js-counter{position:fixed;top:24px;right:32px;font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.3em;color:rgba(200,168,74,.5);z-index:50;text-transform:uppercase}
        .js-hint{position:fixed;bottom:20px;right:20px;font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.15em;color:rgba(200,168,74,.4);text-transform:uppercase;z-index:50}
      `}</style>

      <div className="js-counter">{counterLabel}</div>

      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {screen.type === "menu" && (
          <PotMenuSlide
            pots={pots}
            loading={loading}
            error={error}
            completedPots={completedPots}
            onSelectPot={(pot) => setScreen({ type: "bids", pot })}
          />
        )}

        {screen.type === "bids" && (
          <PotBidsSlide
            pot={screen.pot}
            championshipId={championshipId}
            onBack={() => setScreen({ type: "menu" })}
            onProceedToAuction={(qualified) =>
              setScreen({ type: "auction", pot: screen.pot, qualified })
            }
          />
        )}

        {screen.type === "auction" && (
          <PotAuctionSlide
            pot={screen.pot}
            championshipId={championshipId}
            qualifiedManagers={screen.qualified}
            onPotFinished={() => {
              markCompleted(screen.pot);
              setScreen({ type: "menu" });
            }}
          />
        )}
      </div>

      <div className="js-nav">
        {screen.type !== "menu" && (
          <button
            className="js-btn"
            onClick={(e) => {
              e.stopPropagation();
              setScreen({ type: "menu" });
            }}
            title="Voltar ao menu de potes"
          >
            ←
          </button>
        )}
        {screen.type === "menu" && (
          <button
            className="js-btn"
            onClick={(e) => {
              e.stopPropagation();
              onFinished?.();
            }}
            title="Finalizar"
          >
            ✓
          </button>
        )}
        <button
          className="js-btn"
          onClick={(e) => {
            e.stopPropagation();
            onGoToMenu?.();
          }}
          title="Menu principal"
        >
          <MenuGridIcon />
        </button>
      </div>

      {screen.type === "menu" && <p className="js-hint">Selecione um pote</p>}
    </>
  );
}
