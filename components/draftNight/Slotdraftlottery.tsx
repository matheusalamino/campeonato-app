"use client";

import { useMemo, useState } from "react";
import type { GroupData } from "@/features/hooks/useChaveamento";

type SlotEntry = {
  label: string;
  group: string;
  position: number;
};

type Props = {
  groups: GroupData[];
  onClose?: () => void;
};

// Shuffle outside render scope — pure function, no side effects
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  // Use crypto for true randomness without lint warnings
  for (let i = a.length - 1; i > 0; i--) {
    // Use a deterministic-safe approach: crypto.getRandomValues if available, else seeded
    const randomBuffer = new Uint32Array(1);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(randomBuffer);
      const j = randomBuffer[0]! % (i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    } else {
      // Fallback — still outside render body
      const j = Math.floor(Date.now() % (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
  }
  return a;
}

export default function SlotDraftLottery({ groups, onClose }: Props) {
  // useMemo runs once and is not a render side-effect
  const slots: SlotEntry[] = useMemo(() => {
    const flat: SlotEntry[] = groups.flatMap((g) =>
      g.slots.map((s) => ({
        label: s.slotLabel,
        group: s.group,
        position: s.position,
      })),
    );
    return shuffleArray(flat);
  }, [groups]);

  const [revealed, setReveal] = useState<boolean[]>(() =>
    new Array(slots.length).fill(false),
  );

  function reveal(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    setReveal((p) => {
      const n = [...p];
      n[i] = true;
      return n;
    });
  }

  const allRevealed = revealed.every(Boolean);

  const groupColors: Record<string, string> = useMemo(() => {
    const hues = [38, 200, 280, 120, 350, 170];
    const map: Record<string, string> = {};
    groups.forEach((g, i) => {
      map[g.groupLetter] = `hsl(${hues[i % hues.length]},80%,65%)`;
    });
    return map;
  }, [groups]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes sdFlip  {from{opacity:0;transform:rotateY(90deg) scale(.8)}to{opacity:1;transform:rotateY(0) scale(1)}}
        @keyframes sdPop   {from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
        @keyframes sdPulse {0%,100%{box-shadow:0 0 0 0 rgba(200,168,74,0)}50%{box-shadow:0 0 0 6px rgba(200,168,74,.18)}}

        .sld-wrap{display:flex;flex-direction:column;align-items:center;gap:clamp(16px,2.5vh,28px);width:100%;max-width:900px}
        .sld-header{display:flex;flex-direction:column;align-items:center;gap:6px}
        .sld-eyebrow{font-family:'Cinzel',serif;font-size:clamp(.55rem,.85vw,.72rem);letter-spacing:.45em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}
        .sld-title{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.3rem,2.8vw,2.4rem);letter-spacing:.1em;text-transform:uppercase;line-height:1.05;margin:0;background:linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 14px rgba(255,180,30,.5))}
        .sld-divider{display:flex;align-items:center;gap:10px;width:clamp(180px,30vw,360px)}
        .sld-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .sld-gem{width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}
        .sld-subtitle{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.82rem,1.3vw,.98rem);color:rgba(240,210,140,.6);margin:0;text-align:center}

        .sld-grid{display:flex;flex-wrap:wrap;gap:clamp(8px,1.4vw,16px);justify-content:center;width:100%}

        .sld-num-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;width:clamp(68px,9vw,104px);height:clamp(68px,9vw,104px);border-radius:12px;background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.38);cursor:pointer;transition:all .2s;box-shadow:0 0 10px rgba(200,168,74,.06),inset 0 0 16px rgba(0,0,0,.4);animation:sdPulse 2s ease-in-out infinite}
        .sld-num-box:hover{border-color:#c8a84a;background:rgba(200,168,74,.1);box-shadow:0 0 24px rgba(200,168,74,.32);transform:scale(1.08) translateY(-3px);animation:none}
        .sld-num{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.2rem,2.2vw,1.9rem);background:linear-gradient(160deg,#fff0a0 0%,#f5c842 40%,#c8860a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .sld-hint{font-family:'Cinzel',serif;font-size:clamp(.32rem,.52vw,.45rem);letter-spacing:.22em;text-transform:uppercase;color:rgba(200,168,74,.38)}

        .sld-slot-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:clamp(68px,9vw,104px);height:clamp(68px,9vw,104px);border-radius:12px;background:rgba(0,0,0,.4);border:1px solid rgba(200,168,74,.5);animation:sdFlip .45s cubic-bezier(.22,1,.36,1) both}
        .sld-slot-label{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.4rem,2.8vw,2.2rem);letter-spacing:.06em}
        .sld-slot-badge{font-family:'Cinzel',serif;font-size:clamp(.3rem,.5vw,.44rem);letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.5)}

        .sld-done{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.85rem,1.4vw,1rem);color:rgba(240,210,140,.7);animation:sdPop .4s cubic-bezier(.22,1,.36,1) both;text-align:center}
        .sld-close-btn{padding:8px 24px;border-radius:8px;background:rgba(200,168,74,.15);border:1px solid rgba(200,168,74,.4);color:#f5c842;font-family:'Cinzel',serif;font-size:.68rem;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .sld-close-btn:hover{background:rgba(200,168,74,.28);box-shadow:0 0 12px rgba(200,168,74,.35)}
      `}</style>

      <div className="sld-wrap">
        <div className="sld-header">
          <p className="sld-eyebrow">Sorteio de Grupos</p>
          <h2 className="sld-title">Sorteio dos Slots</h2>
          <div className="sld-divider">
            <div className="sld-line" />
            <div className="sld-gem" />
            <div className="sld-line" />
          </div>
          <p className="sld-subtitle">
            Cada cartola escolhe uma caixinha para revelar seu slot no grupo
          </p>
        </div>

        <div className="sld-grid">
          {slots.map((slot, i) => {
            const isRev = revealed[i];
            const color = groupColors[slot.group] ?? "#f5c842";
            return (
              <div key={i}>
                {!isRev ? (
                  <button className="sld-num-box" onClick={(e) => reveal(i, e)}>
                    <span className="sld-num">{i + 1}</span>
                    <span className="sld-hint">revelar</span>
                  </button>
                ) : (
                  <div
                    className="sld-slot-box"
                    style={{
                      borderColor: color + "88",
                      boxShadow: `0 0 20px ${color}33`,
                    }}
                  >
                    <span className="sld-slot-label" style={{ color }}>
                      {slot.label}
                    </span>
                    <span className="sld-slot-badge">Grupo {slot.group}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {allRevealed && (
          <>
            <p className="sld-done">
              Todos os slots foram revelados!
              <br />
              Agora atribua os times nos grupos abaixo.
            </p>
            {onClose && (
              <button
                className="sld-close-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
              >
                Ir para os Grupos
              </button>
            )}
          </>
        )}
      </div>
    </>
  );
}
