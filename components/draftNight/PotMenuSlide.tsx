"use client";

import { useState } from "react";
import type { DraftPot } from "@/features/hooks/useDraftPots";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

function PositionIcon({ position }: { position: string }) {
  const pos = position.toLowerCase();
  if (pos.includes("goleiro")) {
    return (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    );
  }
  if (
    pos.includes("zagueiro") ||
    pos.includes("defensor") ||
    pos.includes("lateral")
  ) {
    return (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2z" />
      </svg>
    );
  }
  if (pos.includes("meia") || pos.includes("meio")) {
    return (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M3 12h18" />
      </svg>
    );
  }
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L8 8H2l5 4-2 7 7-4 7 4-2-7 5-4h-6L12 2z" />
    </svg>
  );
}

function PotCard({
  pot,
  onClick,
  onReset,
  delay,
  completed,
}: {
  pot: DraftPot;
  onClick: () => void;
  onReset: () => void;
  delay: number;
  completed: boolean;
}) {
  const pos = pot.position.toLowerCase();
  const isGoalkeeper = pos === "gol" || pos.includes("goleiro");
  const isExtra = pos === "extra" || pos.includes("adicional");
  const locked = completed || pot.is_finalized;

  return (
    <div
      className={`pm-card ${locked ? "pm-card-done" : ""} ${locked ? "pm-card-locked" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!locked) onClick();
      }}
      role="button"
      tabIndex={locked ? -1 : 0}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="pm-gem pm-gem-tl" />
      <div className="pm-gem pm-gem-tr" />
      <div className="pm-gem pm-gem-bl" />
      <div className="pm-gem pm-gem-br" />

      {/* Completed overlay */}
      {completed && (
        <div className="pm-done-overlay">
          <span className="pm-done-check">✓</span>
          <span className="pm-done-label">Finalizado</span>
        </div>
      )}
      {locked && (
        <button
          type="button"
          className="pm-reset-btn"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
        >
          Resetar Pote
        </button>
      )}

      <div
        className="pm-icon"
        style={{
          color: completed
            ? "rgba(74,222,128,.7)"
            : isGoalkeeper
              ? "#94a3b8"
              : "#c8a84a",
        }}
      >
        <PositionIcon position={pot.position} />
      </div>

      <div className="pm-info">
        <p className="pm-pot-label" style={{ whiteSpace: "nowrap" }}>
          Pote {pot.pot_letter}
        </p>
        <p className="pm-position">{pot.position}</p>
        {(isGoalkeeper || isExtra) && (
          <p className="pm-gk-note">Sem habilitação</p>
        )}
      </div>

      <div className="pm-stats-row">
        <div className="pm-max-badge">
          <span className="pm-max-num">
            {isGoalkeeper ? 8 : pot.max_managers}
          </span>
          <span className="pm-max-label">vagas</span>
        </div>

        <div className="pm-max-badge">
          <span className="pm-max-num">{pot.player_count}</span>
          <span className="pm-max-label">jogadores</span>
        </div>
      </div>
    </div>
  );
}
export default function PotMenuSlide({
  pots,
  loading,
  error,
  completedPots,
  onSelectPot,
  onResetPot,
}: {
  pots: DraftPot[];
  loading: boolean;
  error: string | null;
  completedPots: Set<string>;
  onSelectPot: (pot: DraftPot) => void;
  onResetPot: (pot: DraftPot) => Promise<void>;
}) {
  const potKey = (p: DraftPot) => `${p.pot_number}:${p.position}`;
  const [resetTarget, setResetTarget] = useState<DraftPot | null>(null);
  const [resetting, setResetting] = useState(false);

  const allDone =
    pots.length > 0 && pots.every((p) => completedPots.has(potKey(p)));

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes pmIn  {from{opacity:0;transform:scale(.88) translateY(24px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes pmSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pmPulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes pmPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}

        .pm-wrap{
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:clamp(20px,3vh,36px);
          width:100%;
          max-width:1200px;
          max-height:calc(100vh - 92px);
          overflow-y:auto;
          overscroll-behavior:contain;
          padding:clamp(14px,2.2vh,24px) clamp(16px,3vw,48px) clamp(84px,10vh,120px);
          scrollbar-width:none;
          -ms-overflow-style:none;
        }
        .pm-wrap::-webkit-scrollbar{width:0;height:0;display:none}

        .pm-header{display:flex;flex-direction:column;align-items:center;gap:8px}
        .pm-eyebrow{font-family:'Cinzel',serif;font-size:clamp(.6rem,.95vw,.8rem);letter-spacing:.45em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}
        .pm-title{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.8rem,4vw,3.5rem);letter-spacing:.1em;text-transform:uppercase;margin:0;background:linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 18px rgba(255,180,30,.55))}
        .pm-divider{display:flex;align-items:center;gap:12px;width:clamp(200px,35vw,440px)}
        .pm-dline{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .pm-dgem{width:7px;height:7px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        .pm-all-done{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.85rem,1.3vw,1rem);color:rgba(74,222,128,.75);animation:pmPop .4s both}

        .pm-grid{
          --pm-gap: clamp(12px,2vw,20px);
          display:flex;
          flex-wrap:wrap;
          justify-content:center;
          gap:var(--pm-gap);
          width:100%;
        }
        .pm-card-slot{
          width:calc((100% - (var(--pm-gap) * 3)) / 4);
          min-width:0;
        }

        .pm-card{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:clamp(10px,1.5vh,16px);padding:clamp(20px,3vh,32px) clamp(16px,2.5vw,28px) clamp(62px,7vh,78px);background:rgba(0,0,0,.4);border:1px solid rgba(200,168,74,.25);border-radius:20px;cursor:pointer;transition:all .25s cubic-bezier(.22,1,.36,1);backdrop-filter:blur(6px);overflow:hidden;animation:pmIn .55s cubic-bezier(.22,1,.36,1) both;min-height:clamp(160px,20vh,240px)}
        .pm-card::before{content:'';position:absolute;inset:0;border-radius:20px;background:radial-gradient(ellipse at 50% 0%,rgba(200,168,74,.1) 0%,transparent 65%);opacity:0;transition:opacity .25s}
        .pm-card:hover{border-color:rgba(200,168,74,.7);background:rgba(0,0,0,.55);transform:translateY(-6px) scale(1.02);box-shadow:0 0 32px rgba(200,168,74,.22),0 20px 40px rgba(0,0,0,.4)}
        .pm-card:hover::before{opacity:1}
        .pm-card-done{border-color:rgba(74,222,128,.35);background:rgba(74,222,128,.04)}
        .pm-card-done:hover{border-color:rgba(74,222,128,.6);box-shadow:0 0 24px rgba(74,222,128,.18)}
        .pm-card-locked{cursor:default}
        .pm-card-locked:hover{transform:none}

        /* Done overlay */
        .pm-done-overlay{position:absolute;top:10px;right:12px;display:flex;flex-direction:column;align-items:center;gap:2px;animation:pmPop .4s both}
        .pm-done-check{font-size:1rem;color:#4ade80;filter:drop-shadow(0 0 6px rgba(74,222,128,.5))}
        .pm-done-label{font-family:'Cinzel',serif;font-size:clamp(.38rem,.55vw,.48rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(74,222,128,.7)}
        .pm-reset-btn{
          position:absolute;bottom:10px;left:50%;transform:translateX(-50%);
          border:1px solid rgba(255,255,255,.18);
          background:rgba(0,0,0,.5);
          border-radius:8px;
          padding:6px 10px;
          font-family:'Cinzel',serif;
          font-size:clamp(.38rem,.55vw,.5rem);
          letter-spacing:.15em;
          text-transform:uppercase;
          color:rgba(244,244,245,.8);
          cursor:pointer;
        }
        .pm-reset-btn:hover{border-color:rgba(200,168,74,.6);color:#f5c842}

        .pm-gem{position:absolute;width:7px;height:7px;background:rgba(200,168,74,.4);transform:rotate(45deg);transition:background .25s}
        .pm-gem-tl{top:12px;left:12px}.pm-gem-tr{top:12px;right:12px}
        .pm-gem-bl{bottom:12px;left:12px}.pm-gem-br{bottom:12px;right:12px}
        .pm-card:hover .pm-gem{background:rgba(200,168,74,.85)}

        .pm-letter-badge{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(200,168,74,.12);border:1px solid rgba(200,168,74,.3);border-radius:6px;padding:2px 10px}
        .pm-letter{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(.58rem,.85vw,.72rem);letter-spacing:.3em;text-transform:uppercase;color:rgba(200,168,74,.7);white-space:nowrap}

        .pm-icon{margin-top:clamp(8px,1.5vh,16px);filter:drop-shadow(0 0 8px rgba(200,168,74,.3));transition:filter .25s,transform .25s}
        .pm-card:hover .pm-icon{filter:drop-shadow(0 0 16px rgba(255,180,30,.7));transform:scale(1.1)}

        .pm-info{display:flex;flex-direction:column;align-items:center;gap:4px}
        .pm-pot-label{font-family:'Cinzel',serif;font-size:clamp(.6rem,.9vw,.76rem);letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);margin:0}
        .pm-position{font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.9rem,1.6vw,1.4rem);letter-spacing:.08em;text-transform:uppercase;color:rgba(240,210,140,.92);margin:0;text-align:center;background:linear-gradient(135deg,#e8c84a,#f5d76e,#c9952a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .pm-gk-note{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.65rem,.95vw,.78rem);color:rgba(148,163,184,.6);margin:0}
        .pm-stats-row {
          display: flex;
          gap: 8px; /* espaço entre os badges */
          justify-content: center; /* opcional: centraliza */
          align-items: center; /* opcional: alinha verticalmente */
        }
        .pm-max-badge{display:flex;flex-direction:column;align-items:center;gap:1px;background:rgba(0,0,0,.3);border:1px solid rgba(200,168,74,.18);border-radius:8px;padding:5px 12px}
        .pm-max-num{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1rem,1.8vw,1.5rem);background:linear-gradient(135deg,#fff0a0,#f5c842,#c8860a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .pm-max-label{font-family:'Cinzel',serif;font-size:clamp(.38rem,.55vw,.48rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.4)}

        .pm-state{display:flex;flex-direction:column;align-items:center;gap:16px}
        .pm-spin{width:48px;height:48px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:pmSpin .9s linear infinite}
        .pm-spin-txt{font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);animation:pmPulse 1.5s ease-in-out infinite}
        .pm-err{font-family:'Cinzel',serif;color:rgba(200,80,80,.8);font-size:.85rem;letter-spacing:.08em}
        .pm-empty{font-family:'EB Garamond',serif;font-style:italic;color:rgba(240,210,140,.5);font-size:1rem}

        @media (max-width: 1100px) {
          .pm-card-slot{width:calc((100% - var(--pm-gap)) / 2)}
          .pm-wrap{padding-bottom:96px}
        }
        @media (max-width: 680px) {
          .pm-card-slot{width:100%}
          .pm-wrap{max-height:calc(100vh - 84px);padding:10px 10px 96px}
          .pm-card{padding-bottom:64px}
        }
      `}</style>

      <div className="pm-wrap">
        <div className="pm-header">
          <p className="pm-eyebrow">Noite do Leilão</p>
          <h2 className="pm-title">Potes</h2>
          <div className="pm-divider">
            <div className="pm-dline" />
            <div className="pm-dgem" />
            <div className="pm-dline" />
          </div>
          {allDone && (
            <p className="pm-all-done">✓ Todos os potes finalizados!</p>
          )}
        </div>

        {loading && (
          <div className="pm-state">
            <div className="pm-spin" />
            <p className="pm-spin-txt">Carregando potes…</p>
          </div>
        )}
        {error && !loading && <p className="pm-err">Erro: {error}</p>}
        {!loading && !error && pots.length === 0 && (
          <p className="pm-empty">Nenhum pote configurado.</p>
        )}

        {!loading && !error && pots.length > 0 && (
          <div className="pm-grid">
            {pots.map((pot, i) => (
              <div
                key={`${pot.pot_number}-${pot.position}`}
                className="pm-card-slot"
              >
                <PotCard
                  pot={pot}
                  onClick={() => onSelectPot(pot)}
                  onReset={() => setResetTarget(pot)}
                  delay={i * 0.07}
                  completed={completedPots.has(potKey(pot)) || pot.is_finalized}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100">
          <DialogHeader>
            <DialogTitle>Resetar pote</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Isso remove lances, compras e multas deste pote e recalcula os saldos dos cartolas.
            </DialogDescription>
          </DialogHeader>
          {resetTarget && (
            <p className="text-sm text-zinc-300">
              Confirmar reset do <span className="font-medium">Pote {resetTarget.pot_letter} ({resetTarget.position})</span>?
            </p>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              className="rounded-lg border border-zinc-600 px-3 py-2 text-sm"
              onClick={() => setResetTarget(null)}
              disabled={resetting}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium hover:bg-amber-600 disabled:opacity-40"
              disabled={!resetTarget || resetting}
              onClick={() => {
                if (!resetTarget) return;
                setResetting(true);
                void onResetPot(resetTarget)
                  .then(() => {
                    toast.success("Pote resetado com sucesso.");
                    setResetTarget(null);
                  })
                  .catch((err: unknown) => {
                    const message =
                      err instanceof Error ? err.message : "Falha ao resetar pote";
                    toast.error(message);
                  })
                  .finally(() => setResetting(false));
              }}
            >
              {resetting ? "Resetando..." : "Sim, resetar pote"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
