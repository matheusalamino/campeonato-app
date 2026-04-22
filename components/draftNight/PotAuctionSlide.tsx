"use client";

import { useEffect, useRef, useState } from "react";
import PlayerCard, { PlayerRadar } from "./PlayerCard";
import type {
  AuctionPlayer,
  PotAuctionPlayersResponse,
} from "@/app/api/draft/pot-auction-players/route";
import type { DraftPot } from "@/features/hooks/useDraftPots";

type QualifiedManager = {
  championship_manager_id: string;
  manager_name: string;
  team_name: string | null;
};

type Props = {
  pot: DraftPot;
  championshipId: string;
  qualifiedManagers: QualifiedManager[];
  onPotFinished: () => void;
};

// ── Purchase form ──────────────────────────────────────────
function PurchaseForm({
  player,
  managers,
  championshipId,
  pot,
  onSaved,
}: {
  player: AuctionPlayer;
  managers: QualifiedManager[];
  championshipId: string;
  pot: DraftPot;
  onSaved: (registrationId: string, managerName: string, price: number) => void;
}) {
  const [selectedManager, setSelectedManager] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    const priceNum = parseInt(price.replace(/\D/g, ""), 10);
    if (!selectedManager || isNaN(priceNum) || priceNum < 0) {
      setError("Selecione um cartola e informe um valor válido.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/draft/purchase-player", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championshipId,
          championshipManagerId: selectedManager,
          registrationId: player.registration_id,
          potNumber: pot.pot_number,
          potPosition: pot.position,
          purchasePrice: priceNum,
          purchaseType: "open_auction",
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Erro ao salvar");
      }
      const mgr = managers.find(
        (m) => m.championship_manager_id === selectedManager,
      );
      onSaved(player.registration_id, mgr?.manager_name ?? "—", priceNum);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  const fmt = (val: string) => {
    const n = parseInt(val.replace(/\D/g, ""), 10);
    if (isNaN(n)) return "";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(n);
  };

  return (
    <div className="pf-wrap">
      <p className="pf-label">Cartola Comprador</p>
      <select
        className="pf-select"
        value={selectedManager}
        onChange={(e) => setSelectedManager(e.target.value)}
      >
        <option value="">— selecione —</option>
        {managers.map((m) => (
          <option
            key={m.championship_manager_id}
            value={m.championship_manager_id}
          >
            {m.manager_name}
            {m.team_name ? ` · ${m.team_name}` : ""}
          </option>
        ))}
      </select>

      <p className="pf-label">Valor Pago</p>
      <input
        className="pf-input"
        type="text"
        inputMode="numeric"
        placeholder="R$ 0"
        value={price ? fmt(price) : ""}
        onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
      />

      {error && <p className="pf-error">{error}</p>}

      <button
        className="pf-save-btn"
        onClick={handleSave}
        disabled={saving || !selectedManager || !price}
      >
        {saving ? "Salvando…" : "Confirmar Compra"}
      </button>
    </div>
  );
}

// ── Sold badge ─────────────────────────────────────────────
function SoldBadge({
  managerName,
  price,
}: {
  managerName: string;
  price: number;
}) {
  const fmt = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(price);
  return (
    <div className="sold-wrap">
      <div className="sold-check">✓</div>
      <p className="sold-manager">{managerName}</p>
      <p className="sold-price">{fmt}</p>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────
export default function PotAuctionSlide({
  pot,
  championshipId,
  qualifiedManagers,
  onPotFinished,
}: Props) {
  const [players, setPlayers] = useState<AuctionPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sales, setSales] = useState<
    Record<string, { managerName: string; price: number }>
  >({});
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    setLoading(true);
    setCurrentIdx(0);
    setSales({});

    fetch(
      `/api/draft/pot-auction-players?championshipId=${encodeURIComponent(championshipId)}&potNumber=${pot.pot_number}&potPosition=${encodeURIComponent(pot.position)}`,
    )
      .then(async (res) => {
        if (!res.ok) {
          const b = (await res.json()) as { error?: string };
          throw new Error(b.error ?? "Erro");
        }
        return res.json() as Promise<PotAuctionPlayersResponse>;
      })
      .then((data) => {
        if (!isMounted.current) return;
        setPlayers(data.players);
        const pre: Record<string, { managerName: string; price: number }> = {};
        data.players.forEach((p) => {
          if (p.already_purchased)
            pre[p.registration_id] = { managerName: "Já vendido", price: 0 };
        });
        setSales(pre);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted.current) return;
        setError(err instanceof Error ? err.message : "Erro");
        setLoading(false);
      });

    return () => {
      isMounted.current = false;
    };
  }, [championshipId, pot.pot_number, pot.position]);

  const current = players[currentIdx] ?? null;
  const isLast = currentIdx === players.length - 1;
  const currentSale = current ? sales[current.registration_id] : null;

  function advance(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isLast) onPotFinished();
    else setCurrentIdx((i) => i + 1);
  }
  function goBack(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentIdx, players.length]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&family=Oswald:wght@600;700&display=swap');

        @keyframes paIn  {from{opacity:0;transform:scale(.92) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes paSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes paPulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes paPop {from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}

        /* ── OUTER LAYOUT: card | right-panel ── */
        .pa-wrap{
          display:flex;align-items:center;justify-content:center;
          gap:clamp(24px,3.5vw,56px);
          width:100%;max-width:1340px;
          padding:0 clamp(16px,3vw,48px);
          animation:paIn .6s cubic-bezier(.22,1,.36,1) both;
        }

        /* LEFT: card + blind dots */
        .pa-left{display:flex;flex-direction:column;align-items:center;gap:14px;flex-shrink:0}
        .pa-counter-txt{
          font-family:'Cinzel',serif;font-size:clamp(.58rem,.9vw,.76rem);
          letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);
        }

        /* Blind thumbnail dots */
        .pa-dots{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:clamp(210px,22vw,285px)}
        .pa-dot{
          width:clamp(10px,1.4vw,16px);height:clamp(10px,1.4vw,16px);
          border-radius:50%;
          background:rgba(200,168,74,.2);border:1px solid rgba(200,168,74,.35);
          cursor:pointer;transition:all .2s;flex-shrink:0;
        }
        .pa-dot:hover{background:rgba(200,168,74,.4)}
        .pa-dot.active{background:#c8a84a;box-shadow:0 0 10px rgba(200,168,74,.7);transform:scale(1.25)}
        .pa-dot.sold-dot{background:rgba(74,222,128,.4);border-color:rgba(74,222,128,.6)}

        /* RIGHT panel: name | radar+form */
        .pa-right{
          display:flex;flex-direction:column;
          gap:clamp(10px,1.6vh,18px);
          flex:1;min-width:0;
        }

        /* Player name */
        .pa-name-block{display:flex;flex-direction:column;gap:4px}
        .pa-player-name{
          font-family:'Oswald',sans-serif;font-weight:700;
          font-size:clamp(1.6rem,3.5vw,3.2rem);letter-spacing:.06em;text-transform:uppercase;
          background:linear-gradient(160deg,#fff0a0 0%,#f5c842 20%,#c8860a 50%,#f5c842 80%,#ffe066 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          filter:drop-shadow(0 0 16px rgba(255,180,30,.5));
          line-height:1.05;margin:0;
        }
        .pa-player-official{
          font-family:'EB Garamond',serif;font-style:italic;
          font-size:clamp(.8rem,1.3vw,.98rem);color:rgba(240,210,140,.5);margin:0;
        }

        .pa-divider{display:flex;align-items:center;gap:10px;width:100%;max-width:500px}
        .pa-dline{flex:1;height:1px;background:linear-gradient(90deg,rgba(200,168,74,.6),transparent)}
        .pa-dgem{width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        /* Radar + form: side by side */
        .pa-body{
          display:flex;align-items:flex-start;
          gap:clamp(16px,2.5vw,36px);
        }
        .pa-radar-wrap{
          flex:1;
          height:clamp(240px,28vh,340px);
          min-width:0;
        }

        /* Purchase form beside radar */
        .pf-wrap{
          display:flex;flex-direction:column;gap:10px;
          width:clamp(200px,22vw,280px);flex-shrink:0;
        }
        .pf-label{
          font-family:'Cinzel',serif;font-size:clamp(.55rem,.85vw,.72rem);
          letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0;
        }
        .pf-select,.pf-input{
          width:100%;padding:10px 12px;
          background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.3);border-radius:10px;
          color:rgba(240,210,140,.9);font-family:'Cinzel',serif;font-size:clamp(.65rem,1vw,.82rem);
          outline:none;transition:border-color .2s;
        }
        .pf-select{
          appearance:none;cursor:pointer;padding-right:32px;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23c8a84a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat:no-repeat;background-position:right 10px center;
        }
        .pf-select:focus,.pf-input:focus{border-color:#c8a84a;box-shadow:0 0 10px rgba(200,168,74,.2)}
        .pf-select option{background:#1a0a00}
        .pf-input::placeholder{color:rgba(200,168,74,.3)}
        .pf-error{font-family:'Cinzel',serif;font-size:.62rem;color:rgba(220,80,80,.9);margin:0}
        .pf-save-btn{
          padding:12px;border-radius:12px;
          background:linear-gradient(135deg,rgba(200,168,74,.35),rgba(200,168,74,.2));
          border:1px solid rgba(200,168,74,.6);color:#f5c842;
          font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.68rem,1.1vw,.9rem);
          letter-spacing:.18em;text-transform:uppercase;cursor:pointer;transition:all .2s;
        }
        .pf-save-btn:hover:not(:disabled){background:rgba(200,168,74,.45);box-shadow:0 0 22px rgba(200,168,74,.4);transform:scale(1.02)}
        .pf-save-btn:disabled{opacity:.3;cursor:default}

        /* Sold */
        .sold-wrap{display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 20px;background:rgba(0,0,0,.5);border:1px solid rgba(74,222,128,.3);border-radius:14px;animation:paPop .4s cubic-bezier(.22,1,.36,1) both;width:clamp(200px,22vw,280px);flex-shrink:0}
        .sold-check{font-size:1.8rem;color:#4ade80;filter:drop-shadow(0 0 10px rgba(74,222,128,.5))}
        .sold-manager{font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.8rem,1.3vw,1rem);letter-spacing:.08em;text-transform:uppercase;color:rgba(240,210,140,.9);margin:0;text-align:center}
        .sold-price{font-family:'Oswald',sans-serif;font-weight:700;font-size:clamp(1.2rem,2.2vw,1.8rem);background:linear-gradient(135deg,#4ade80,#22c55e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 8px rgba(74,222,128,.4));margin:0}

        /* Nav */
        .pa-nav{position:fixed;bottom:16px;left:16px;display:flex;gap:8px;z-index:50}
        .pa-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .pa-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .pa-btn:disabled{opacity:.2;cursor:default}
        .pa-counter-fixed{position:fixed;top:24px;right:32px;font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.3em;color:rgba(200,168,74,.5);z-index:50;text-transform:uppercase}

        /* States */
        .pa-state{display:flex;flex-direction:column;align-items:center;gap:16px}
        .pa-spin{width:48px;height:48px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:paSpin .9s linear infinite}
        .pa-spin-txt{font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);animation:paPulse 1.5s ease-in-out infinite}
      `}</style>

      {!loading && players.length > 0 && (
        <div className="pa-counter-fixed">Pote {pot.pot_letter} — Leilão</div>
      )}

      {loading && (
        <div className="pa-state">
          <div className="pa-spin" />
          <p className="pa-spin-txt">Carregando jogadores…</p>
        </div>
      )}
      {error && !loading && (
        <div className="pa-state">
          <p
            style={{
              fontFamily: "'Cinzel',serif",
              color: "rgba(200,80,80,.8)",
              fontSize: ".85rem",
            }}
          >
            Erro: {error}
          </p>
        </div>
      )}
      {!loading && !error && players.length === 0 && (
        <div className="pa-state">
          <p
            style={{
              fontFamily: "'Cinzel',serif",
              color: "rgba(200,168,74,.5)",
              fontSize: ".85rem",
              letterSpacing: ".2em",
            }}
          >
            Nenhum jogador neste pote.
          </p>
        </div>
      )}

      {!loading && !error && current && (
        <div className="pa-wrap" key={current.registration_id}>
          {/* LEFT */}
          <div className="pa-left">
            <p className="pa-counter-txt">
              Jogador {currentIdx + 1} de {players.length}
            </p>
            <PlayerCard player={current} />

            {/* Blind dots — no photos, no names = surprise */}
            <div className="pa-dots">
              {players.map((p, i) => {
                const isSold = !!sales[p.registration_id];
                return (
                  <div
                    key={p.registration_id}
                    className={`pa-dot ${i === currentIdx ? "active" : ""} ${isSold ? "sold-dot" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrentIdx(i);
                    }}
                    title={`Jogador ${i + 1}${isSold ? " (vendido)" : ""}`}
                  />
                );
              })}
            </div>
          </div>

          {/* RIGHT */}
          <div className="pa-right">
            {/* Name: shirt name big, official name small — same as card */}
            <div className="pa-name-block">
              <h2 className="pa-player-name">{current.name}</h2>
              {current.official_name &&
                current.official_name !== current.name && (
                  <p className="pa-player-official">{current.official_name}</p>
                )}
            </div>

            <div className="pa-divider">
              <div className="pa-dline" />
              <div className="pa-dgem" />
            </div>

            {/* Radar + form side by side */}
            <div className="pa-body">
              {current.attributes.length > 0 && (
                <div className="pa-radar-wrap">
                  <PlayerRadar attributes={current.attributes} />
                </div>
              )}

              {currentSale ? (
                <SoldBadge
                  managerName={currentSale.managerName}
                  price={currentSale.price}
                />
              ) : (
                <PurchaseForm
                  player={current}
                  managers={qualifiedManagers}
                  championshipId={championshipId}
                  pot={pot}
                  onSaved={(regId, mgr, price) =>
                    setSales((prev) => ({
                      ...prev,
                      [regId]: { managerName: mgr, price },
                    }))
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}

      {!loading && players.length > 0 && (
        <div className="pa-nav">
          <button
            className="pa-btn"
            onClick={goBack}
            disabled={currentIdx === 0}
          >
            ←
          </button>
          <button className="pa-btn" onClick={advance}>
            {isLast ? "✓" : "→"}
          </button>
        </div>
      )}
    </>
  );
}
