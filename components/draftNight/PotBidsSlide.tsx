"use client";

import { useEffect, useRef, useState } from "react";
import { usePotBidsStatus } from "@/features/hooks/usePotBidsStatus";
import type { ManagerBidStatus } from "@/app/api/draft/pot-bids-status/route";
import type { DraftPot } from "@/features/hooks/useDraftPots";

// ── Helpers ────────────────────────────────────────────────
function computeRanking(
  managers: ManagerBidStatus[],
): (ManagerBidStatus & { rank: number })[] {
  const eligible = managers.filter((m) => m.is_eligible && m.has_bid);
  return [...eligible]
    .sort((a, b) => {
      const diff = (b.bid_amount ?? 0) - (a.bid_amount ?? 0);
      if (diff !== 0) return diff;
      const ta = a.submitted_at ? new Date(a.submitted_at).getTime() : Infinity;
      const tb = b.submitted_at ? new Date(b.submitted_at).getTime() : Infinity;
      return ta - tb;
    })
    .map((m, i) => ({ ...m, rank: i + 1 }));
}

function formatCurrency(val: number | null): string {
  if (val === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(val);
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// ── Icons ──────────────────────────────────────────────────
function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#4ade80"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "rgba(200,168,74,.35)" }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "rgba(200,168,74,.35)" }}
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ── Manager row ────────────────────────────────────────────
function ManagerRow({
  mgr,
  rank,
  maxManagers,
  revealed,
  isGoalkeeper,
}: {
  mgr: ManagerBidStatus;
  rank: number | null;
  maxManagers: number;
  revealed: boolean;
  isGoalkeeper: boolean;
}) {
  const isQualified = rank !== null && rank <= maxManagers;
  const hasBid = mgr.has_bid && mgr.is_eligible;

  return (
    <div
      className={`pb-row ${isQualified && revealed ? "pb-row-qualified" : ""} ${!mgr.is_eligible ? "pb-row-ineligible" : ""}`}
    >
      <div className="pb-rank">
        {revealed && rank !== null ? (
          <span
            className={`pb-rank-num ${isQualified ? "pb-rank-gold" : "pb-rank-dim"}`}
          >
            {rank}º
          </span>
        ) : (
          <span className="pb-rank-dot">—</span>
        )}
      </div>
      <div className="pb-mgr-info">
        <span className="pb-mgr-name">
          {mgr.manager_name}
          {mgr.team_name && (
            <span className="pb-team-name"> — {mgr.team_name}</span>
          )}
        </span>
        {!mgr.is_eligible && (
          <span className="pb-ineligible-label">Time completo</span>
        )}
      </div>
      <div className="pb-bid-status">
        {!mgr.is_eligible ? (
          <span className="pb-ineligible-icon">
            <LockIcon />
          </span>
        ) : isGoalkeeper ? (
          <span className="pb-gk-label">Auto</span>
        ) : hasBid ? (
          <div className="pb-has-bid">
            <CheckIcon />
            {revealed ? (
              <span className="pb-bid-amount">
                {formatCurrency(mgr.bid_amount)}
              </span>
            ) : (
              <span className="pb-bid-hidden">Lance enviado</span>
            )}
            {revealed && (
              <span className="pb-bid-time">
                {formatTime(mgr.submitted_at)}
              </span>
            )}
          </div>
        ) : (
          <div className="pb-no-bid">
            <ClockIcon />
            <span className="pb-waiting">Aguardando…</span>
          </div>
        )}
      </div>
      {revealed && isQualified && (
        <div className="pb-qualified-badge">✓ Classificado</div>
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────
type QualifiedManager = {
  championship_manager_id: string;
  manager_name: string;
  team_name: string | null;
};

type Props = {
  pot: DraftPot;
  championshipId: string;
  onBack: () => void;
  onProceedToAuction: (qualifiedManagers: QualifiedManager[]) => void;
};

export default function PotBidsSlide({
  pot,
  championshipId,
  onBack,
  onProceedToAuction,
}: Props) {
  const isGoalkeeper = pot.position.toLowerCase().includes("goleiro");
  const [windowOpened, setWindowOpened] = useState(false);
  const [windowError, setWindowError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!isGoalkeeper) {
      fetch("/api/draft/qualification-window", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId,
          open: true,
          potNumber: pot.pot_number,
          potPosition: pot.position,
        }),
      })
        .then(async (res) => {
          if (!isMounted.current) return;
          if (!res.ok) {
            const body = (await res.json()) as { error?: string };
            setWindowError(body.error ?? "Erro ao abrir janela");
          } else {
            setWindowOpened(true);
          }
        })
        .catch((err: unknown) => {
          if (!isMounted.current) return;
          setWindowError(err instanceof Error ? err.message : "Erro de rede");
        });
    } else {
      setTimeout(() => {
        setWindowOpened(true);
      }, 0);
    }
    return () => {
      isMounted.current = false;
      if (!isGoalkeeper) {
        void fetch("/api/draft/qualification-window", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ championshipId, open: false }),
        }).catch(() => undefined);
      }
    };
  }, [championshipId, isGoalkeeper, pot.pot_number, pot.position]);

  useEffect(() => {
    setTimeout(() => {
      setRevealed(false);
    }, 0);
  }, [pot.pot_number, pot.position]);

  const { data, loading } = usePotBidsStatus({
    championshipId,
    potNumber: pot.pot_number,
    potPosition: pot.position,
    enabled: windowOpened && !revealed,
    intervalMs: 3000,
  });

  const managers = data?.managers ?? [];
  const eligibleManagers = managers.filter((m) => m.is_eligible);
  const submittedCount = eligibleManagers.filter((m) => m.has_bid).length;
  const totalEligible = eligibleManagers.length;

  const rankedManagers = revealed ? computeRanking(managers) : [];
  const rankMap = new Map<string, number>(
    rankedManagers.map((r) => [r.championship_manager_id, r.rank]),
  );

  const displayManagers: ManagerBidStatus[] = revealed
    ? [...rankedManagers, ...managers.filter((m) => !m.is_eligible)]
    : [
        ...managers.filter((m) => m.is_eligible),
        ...managers.filter((m) => !m.is_eligible),
      ];

  // Build qualified managers list for auction screen
  function buildQualified(): QualifiedManager[] {
    if (isGoalkeeper) {
      return managers
        .filter((m) => m.is_eligible)
        .map((m) => ({
          championship_manager_id: m.championship_manager_id,
          manager_name: m.manager_name,
          team_name: m.team_name,
        }));
    }
    return rankedManagers
      .filter((r) => r.rank <= (data?.max_managers ?? 0))
      .map((r) => ({
        championship_manager_id: r.championship_manager_id,
        manager_name: r.manager_name,
        team_name: r.team_name,
      }));
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes pbIn   {from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pbPop  {from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        @keyframes pbSpin {from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes pbPulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes pbGlow {0%,100%{box-shadow:0 0 12px rgba(200,168,74,.2)}50%{box-shadow:0 0 28px rgba(200,168,74,.5)}}
        @keyframes pbSlide{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}

        .pb-wrap{display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2vh,24px);width:100%;max-width:1100px;padding:0 clamp(16px,3vw,48px);animation:pbIn .5s cubic-bezier(.22,1,.36,1) both}

        .pb-header{display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;width:100%}
        .pb-back-btn{position:absolute;left:0;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.4);border:1px solid rgba(200,168,74,.3);border-radius:8px;padding:7px 14px;cursor:pointer;transition:all .2s;font-family:'Cinzel',serif;font-size:clamp(.55rem,.85vw,.72rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.7);backdrop-filter:blur(6px)}
        .pb-back-btn:hover{background:rgba(200,168,74,.12);border-color:#c8a84a;color:#c8a84a}
        .pb-pot-letter{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(2.5rem,5vw,5rem);letter-spacing:.08em;text-transform:uppercase;margin:0;background:linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 20px rgba(255,180,30,.55))}
        .pb-position{font-family:'Cinzel',serif;font-size:clamp(.7rem,1.2vw,.95rem);letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.65);margin:0}
        .pb-divider{display:flex;align-items:center;gap:10px;width:clamp(180px,28vw,380px)}
        .pb-dline{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .pb-dgem{width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        .pb-progress{display:flex;align-items:center;gap:12px;background:rgba(0,0,0,.35);border:1px solid rgba(200,168,74,.18);border-radius:10px;padding:8px 20px}
        .pb-progress-text{font-family:'Cinzel',serif;font-size:clamp(.6rem,.9vw,.78rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.6)}
        .pb-progress-count{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(.85rem,1.4vw,1.1rem);background:linear-gradient(135deg,#f5c842,#c8860a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .pb-progress-bar{height:4px;border-radius:2px;background:rgba(200,168,74,.15);overflow:hidden;flex:1;min-width:80px}
        .pb-progress-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#c8a84a,#f5c842);transition:width .5s ease}

        .pb-list{display:flex;flex-direction:column;gap:clamp(6px,1vh,10px);width:100%}
        .pb-row{display:flex;align-items:center;gap:clamp(10px,1.5vw,18px);padding:clamp(12px,1.6vh,18px) clamp(14px,2vw,22px);background:rgba(0,0,0,.38);border:1px solid rgba(200,168,74,.14);border-radius:12px;transition:all .25s;animation:pbSlide .4s cubic-bezier(.22,1,.36,1) both}
        .pb-row-qualified{border-color:rgba(200,168,74,.5);background:rgba(200,168,74,.08);box-shadow:0 0 20px rgba(200,168,74,.15);animation:pbGlow 2.5s ease-in-out infinite}
        .pb-row-ineligible{opacity:.45}

        .pb-rank{min-width:clamp(28px,3vw,40px);flex-shrink:0;text-align:center}
        .pb-rank-num{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(.85rem,1.4vw,1.2rem)}
        .pb-rank-gold{background:linear-gradient(135deg,#fff0a0,#f5c842,#c8860a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 6px rgba(255,180,30,.4))}
        .pb-rank-dim{color:rgba(200,168,74,.3)}
        .pb-rank-dot{font-family:'Cinzel',serif;color:rgba(200,168,74,.2);font-size:.9rem}

        .pb-mgr-info{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
        .pb-mgr-name{font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.75rem,1.2vw,1rem);letter-spacing:.07em;text-transform:uppercase;color:rgba(240,210,140,.92);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .pb-team-name{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.65rem,.95vw,.8rem);color:rgba(200,168,74,.5)}
        .pb-ineligible-label{font-family:'Cinzel',serif;font-size:clamp(.5rem,.75vw,.62rem);letter-spacing:.15em;text-transform:uppercase;color:rgba(148,163,184,.5)}

        .pb-bid-status{display:flex;align-items:center;gap:8px;flex-shrink:0}
        .pb-has-bid{display:flex;align-items:center;gap:8px}
        .pb-no-bid{display:flex;align-items:center;gap:6px}
        .pb-bid-amount{font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.8rem,1.2vw,1rem);background:linear-gradient(135deg,#fff0a0,#f5c842,#c8860a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:pbPop .4s cubic-bezier(.22,1,.36,1) both}
        .pb-bid-hidden{font-family:'Cinzel',serif;font-size:clamp(.6rem,.9vw,.76rem);letter-spacing:.1em;text-transform:uppercase;color:rgba(200,168,74,.5)}
        .pb-bid-time{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.6rem,.88vw,.75rem);color:rgba(200,168,74,.4)}
        .pb-waiting{font-family:'Cinzel',serif;font-size:clamp(.58rem,.85vw,.72rem);letter-spacing:.12em;text-transform:uppercase;color:rgba(200,168,74,.3)}
        .pb-gk-label{font-family:'Cinzel',serif;font-size:clamp(.55rem,.82vw,.68rem);letter-spacing:.15em;text-transform:uppercase;color:rgba(148,163,184,.5)}
        .pb-ineligible-icon{display:flex;align-items:center}

        .pb-qualified-badge{font-family:'Cinzel',serif;font-size:clamp(.45rem,.68vw,.58rem);letter-spacing:.18em;text-transform:uppercase;background:linear-gradient(135deg,#f5c842,#c8860a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;flex-shrink:0;animation:pbPop .3s .1s cubic-bezier(.22,1,.36,1) both;filter:drop-shadow(0 0 6px rgba(255,180,30,.4))}

        .pb-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:center}
        .pb-reveal-btn{padding:clamp(12px,1.6vh,16px) clamp(24px,4vw,40px);border-radius:12px;background:linear-gradient(135deg,rgba(200,168,74,.3),rgba(200,168,74,.15));border:1px solid rgba(200,168,74,.6);color:#f5c842;font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.75rem,1.2vw,1rem);letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .25s;animation:pbGlow 2s ease-in-out infinite}
        .pb-reveal-btn:hover{background:rgba(200,168,74,.35);box-shadow:0 0 28px rgba(200,168,74,.5);transform:scale(1.03);animation:none}
        .pb-proceed-btn{padding:clamp(12px,1.6vh,16px) clamp(24px,4vw,40px);border-radius:12px;background:linear-gradient(135deg,rgba(74,222,128,.25),rgba(34,197,94,.15));border:1px solid rgba(74,222,128,.5);color:#4ade80;font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.75rem,1.2vw,1rem);letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .25s}
        .pb-proceed-btn:hover{background:rgba(74,222,128,.3);box-shadow:0 0 24px rgba(74,222,128,.35);transform:scale(1.02)}
        .pb-waiting-msg{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.82rem,1.3vw,.98rem);color:rgba(240,210,140,.5);margin:0;animation:pbPulse 2s ease-in-out infinite}
        .pb-revealed-label{font-family:'Cinzel',serif;font-size:clamp(.6rem,.9vw,.78rem);letter-spacing:.3em;text-transform:uppercase;color:rgba(200,168,74,.5)}
        .pb-gk-note{background:rgba(148,163,184,.06);border:1px solid rgba(148,163,184,.15);border-radius:10px;padding:12px 20px;font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.82rem,1.2vw,.95rem);color:rgba(148,163,184,.6);text-align:center}
        .pb-window-err{font-family:'Cinzel',serif;font-size:.75rem;letter-spacing:.08em;color:rgba(200,80,80,.8);text-align:center}
        .pb-spin{width:40px;height:40px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:pbSpin .9s linear infinite}
      `}</style>

      <div className="pb-wrap">
        <div className="pb-header">
          <button
            className="pb-back-btn"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
          >
            ← Potes
          </button>
          <p className="pb-pot-letter">Pote {pot.pot_letter}</p>
          <p className="pb-position">{pot.position}</p>
          <div className="pb-divider">
            <div className="pb-dline" />
            <div className="pb-dgem" />
            <div className="pb-dline" />
          </div>
        </div>

        {windowError && (
          <p className="pb-window-err">Erro ao abrir janela: {windowError}</p>
        )}
        {isGoalkeeper && (
          <p className="pb-gk-note">
            Goleiros não participam do processo de habilitação.
          </p>
        )}

        {!isGoalkeeper && !loading && (
          <div className="pb-progress">
            <span className="pb-progress-text">Lances recebidos</span>
            <span className="pb-progress-count">
              {submittedCount}/{totalEligible}
            </span>
            <div className="pb-progress-bar">
              <div
                className="pb-progress-fill"
                style={{
                  width:
                    totalEligible > 0
                      ? `${(submittedCount / totalEligible) * 100}%`
                      : "0%",
                }}
              />
            </div>
          </div>
        )}

        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0",
            }}
          >
            <div className="pb-spin" />
          </div>
        )}

        {!loading && (
          <div className="pb-list">
            {displayManagers.map((mgr, i) => (
              <div
                key={mgr.championship_manager_id}
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <ManagerRow
                  mgr={mgr}
                  rank={rankMap.get(mgr.championship_manager_id) ?? null}
                  maxManagers={data?.max_managers ?? 0}
                  revealed={revealed}
                  isGoalkeeper={isGoalkeeper}
                />
              </div>
            ))}
          </div>
        )}

        <div className="pb-actions">
          {!revealed ? (
            // ── Reveal always available ──
            <button
              className="pb-reveal-btn"
              onClick={(e) => {
                e.stopPropagation();
                setRevealed(true);
              }}
            >
              {submittedCount < totalEligible && !isGoalkeeper
                ? `Revelar Mesmo Assim (${submittedCount}/${totalEligible})`
                : "Revelar Lances"}
            </button>
          ) : (
            <>
              <p className="pb-revealed-label">Resultado revelado</p>
              {/* Proceed to auction */}
              <button
                className="pb-proceed-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onProceedToAuction(buildQualified());
                }}
              >
                Iniciar Leilão →
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
