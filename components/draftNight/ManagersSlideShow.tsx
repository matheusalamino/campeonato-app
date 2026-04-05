"use client";

import { useEffect, useState } from "react";
import {
  useManagers,
  type ManagerPresentation,
} from "@/features/hooks/useManagers";

// ── ICONS ──────────────────────────────────────────────────
function TrophyIcon() {
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
      style={{ flexShrink: 0 }}
    >
      <path d="M8 21h8M12 17v4M7 4H5c0 4 2 7 5 8M17 4h2c0 4-2 7-5 8M7 4h10v6c0 3.3-2.7 6-6 6s-6-2.7-6-6V4z" />
    </svg>
  );
}

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

// ── TROPHY BADGE ───────────────────────────────────────────
// Always shows count (1×, 2×, …) so the user sees how many times participated
function TrophyBadge({ name, count }: { name: string; count: number }) {
  return (
    <div className="trophy-badge">
      <TrophyIcon />
      <span>
        <strong>{count}&times;</strong> {name}
      </span>
    </div>
  );
}

// ── PHOTO FRAME ────────────────────────────────────────────
function PhotoFrame({ src, name }: { src: string | null; name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="photo-frame-outer">
      <div className="photo-ring-rotate">
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="photo-ring-svg"
        >
          <circle
            cx="100"
            cy="100"
            r="94"
            stroke="url(#ringGrad)"
            strokeWidth="1.5"
            strokeDasharray="6 8"
          />
          {[0, 90, 180, 270].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x = 100 + 94 * Math.cos(rad);
            const y = 100 + 94 * Math.sin(rad);
            return (
              <rect
                key={deg}
                x={x - 4}
                y={y - 4}
                width={8}
                height={8}
                transform={`rotate(45 ${x} ${y})`}
                fill="#c8a84a"
                opacity="0.9"
              />
            );
          })}
          <defs>
            <linearGradient
              id="ringGrad"
              x1="0"
              y1="0"
              x2="200"
              y2="200"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#c8a84a" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#f5d76e" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#c8a84a" stopOpacity="0.3" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="photo-ring-static">
        <svg
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="100%"
          height="100%"
        >
          <circle
            cx="100"
            cy="100"
            r="86"
            stroke="url(#ringGrad2)"
            strokeWidth="2"
          />
          <defs>
            <linearGradient
              id="ringGrad2"
              x1="0"
              y1="0"
              x2="200"
              y2="200"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#8b6914" />
              <stop offset="40%" stopColor="#f5c842" />
              <stop offset="70%" stopColor="#8b6914" />
              <stop offset="100%" stopColor="#f5c842" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="photo-circle">
        {src ? (
          <img
            src={src}
            alt={name}
            className="photo-img"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="photo-initials">{initials}</span>
        )}
        <div className="photo-glow-overlay" />
      </div>
    </div>
  );
}

// ── MANAGER CARD ───────────────────────────────────────────
function ManagerCard({
  manager,
  visible,
}: {
  manager: ManagerPresentation;
  visible: boolean;
}) {
  return (
    <div className={`cartola-card ${visible ? "card-visible" : "card-hidden"}`}>
      <div className="card-photo-side">
        <PhotoFrame src={manager.photo_url} name={manager.name} />
      </div>
      <div className="card-info-side">
        <p className="card-eyebrow">Manager</p>
        <h2 className="card-name gold-text">{manager.name}</h2>

        {manager.inspirational_phrase && (
          <p className="card-phrase">
            &ldquo;{manager.inspirational_phrase}&rdquo;
          </p>
        )}

        <div className="card-divider">
          <div className="div-line" />
          <div className="div-gem" />
          <div className="div-line" />
        </div>

        {manager.previous_titles.length > 0 ? (
          <div className="card-titles">
            <p className="titles-label">Histórico</p>
            <div className="titles-list">
              {manager.previous_titles.map((t) => (
                <TrophyBadge
                  key={t.championship_name}
                  name={t.championship_name}
                  count={t.count}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="card-titles">
            <p className="titles-label" style={{ opacity: 0.4 }}>
              Estreante no campeonato
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────
type Props = {
  championshipId: string;
  onFinished?: () => void;
  onGoToMenu?: () => void;
};

export default function ManagersSlideshow({
  championshipId,
  onFinished,
  onGoToMenu,
}: Props) {
  const { managers, loading, error } = useManagers(championshipId);
  const [index, setIndex] = useState(0);

  const current = managers[index] ?? null;
  const isLast = index === managers.length - 1;

  function advance(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isLast) onFinished?.();
    else setIndex((i) => i + 1);
  }

  function goBack(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (index > 0) setIndex((i) => i - 1);
  }

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goBack();
      if (e.key === "m" || e.key === "M") onGoToMenu?.();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [index, managers]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        .gold-text {
          background: linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
          filter:drop-shadow(0 0 20px rgba(255,180,30,.6));
        }

        @keyframes cardIn { from{opacity:0;transform:translateX(60px) scale(.96)} to{opacity:1;transform:translateX(0) scale(1)} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:.4} 50%{opacity:1} }

        .cartola-card {
          display:flex; align-items:center;
          gap:clamp(40px,6vw,90px);
          width:100%; max-width:1100px;
          padding:0 clamp(20px,5vw,60px);
        }
        .card-visible { animation:cardIn .65s cubic-bezier(.22,1,.36,1) both; }
        .card-hidden  { opacity:0; pointer-events:none; }

        .photo-frame-outer {
          position:relative;
          width:clamp(220px,28vw,340px);
          height:clamp(220px,28vw,340px);
          flex-shrink:0;
        }
        .photo-ring-rotate { position:absolute; inset:-8px; animation:spin 18s linear infinite; }
        .photo-ring-svg    { width:100%; height:100%; }
        .photo-ring-static { position:absolute; inset:4px; }
        .photo-circle {
          position:absolute; inset:18px; border-radius:50%; overflow:hidden;
          background:radial-gradient(circle at 35% 35%,#3d2200,#0a0400);
          box-shadow:0 0 40px rgba(200,168,74,.25),0 0 80px rgba(200,100,0,.15),inset 0 0 30px rgba(0,0,0,.6);
        }
        .photo-img { width:100%; height:100%; object-fit:cover; object-position:top center; }
        .photo-initials {
          position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
          font-family:'Cinzel',serif; font-size:clamp(3rem,6vw,5rem); font-weight:900;
          background:linear-gradient(135deg,#e8c84a,#f5d76e,#c9952a);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        }
        .photo-glow-overlay {
          position:absolute; inset:0; border-radius:50%;
          background:radial-gradient(circle at 30% 25%,rgba(255,220,100,.12) 0%,transparent 60%);
          pointer-events:none;
        }

        .card-info-side { display:flex; flex-direction:column; align-items:flex-start; gap:0; flex:1; min-width:0; }
        .card-eyebrow {
          font-family:'Cinzel',serif; font-size:clamp(.6rem,1vw,.78rem);
          letter-spacing:.45em; text-transform:uppercase; color:rgba(200,168,74,.55); margin-bottom:6px;
        }
        .card-name {
          font-family:'Cinzel',serif; font-weight:900;
          font-size:clamp(2rem,4.5vw,4rem); letter-spacing:.06em; line-height:1.05; margin:0 0 10px;
        }
        .card-phrase {
          font-family:'EB Garamond',serif; font-style:italic;
          font-size:clamp(.9rem,1.6vw,1.2rem); color:rgba(240,210,140,.72);
          letter-spacing:.02em; line-height:1.5; margin:0 0 22px; max-width:520px;
        }
        .card-divider { display:flex; align-items:center; gap:10px; width:100%; max-width:420px; margin-bottom:20px; }
        .div-line { flex:1; height:1px; background:linear-gradient(90deg,rgba(200,168,74,.6),transparent); }
        .div-gem  { width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0; }

        .card-titles { display:flex; flex-direction:column; gap:8px; }
        .titles-label {
          font-family:'Cinzel',serif; font-size:clamp(.58rem,.9vw,.72rem);
          letter-spacing:.35em; text-transform:uppercase; color:rgba(200,168,74,.5);
        }
        .titles-list { display:flex; flex-direction:column; gap:6px; }
        .trophy-badge {
          display:flex; align-items:center; gap:8px; color:rgba(240,210,140,.8);
          font-family:'Cinzel',serif; font-size:clamp(.78rem,1.2vw,.95rem); letter-spacing:.04em;
        }
        .trophy-badge strong { color:#f5c842; }

        .manager-counter {
          position:fixed; top:24px; right:32px;
          font-family:'Cinzel',serif; font-size:.72rem;
          letter-spacing:.3em; color:rgba(200,168,74,.5); z-index:50;
        }
        .progress-dots {
          position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
          display:flex; gap:8px; z-index:50;
        }
        .prog-dot {
          width:6px; height:6px; border-radius:50%;
          background:rgba(200,168,74,.25); border:1px solid rgba(200,168,74,.4);
          transition:all .3s; cursor:pointer;
        }
        .prog-dot.active { background:#c8a84a; box-shadow:0 0 8px rgba(200,168,74,.7); transform:scale(1.4); }

        .slide-nav { position:fixed; bottom:16px; left:16px; display:flex; gap:8px; z-index:50; }
        .slide-nav-btn {
          background:rgba(0,0,0,.45); border:1px solid rgba(200,168,74,.35); color:#c8a84a;
          width:44px; height:44px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:18px; cursor:pointer; transition:all .2s; backdrop-filter:blur(8px);
        }
        .slide-nav-btn:hover { background:rgba(200,168,74,.2); border-color:#c8a84a; box-shadow:0 0 16px rgba(200,168,74,.4); }
        .slide-nav-btn:disabled { opacity:.2; cursor:default; }

        .state-center { display:flex; flex-direction:column; align-items:center; gap:16px; }
        .loading-ring {
          width:48px; height:48px; border-radius:50%;
          border:2px solid rgba(200,168,74,.2); border-top-color:#c8a84a;
          animation:spin .9s linear infinite;
        }
        .loading-text {
          font-family:'Cinzel',serif; font-size:.72rem; letter-spacing:.35em;
          text-transform:uppercase; color:rgba(200,168,74,.5);
          animation:pulse 1.5s ease-in-out infinite;
        }
      `}</style>

      {!loading && !error && managers.length > 0 && (
        <div className="manager-counter">
          {index + 1} / {managers.length}
        </div>
      )}

      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {loading && (
          <div className="state-center">
            <div className="loading-ring" />
            <p className="loading-text">Carregando managers…</p>
          </div>
        )}
        {error && (
          <div className="state-center">
            <p
              style={{
                fontFamily: "'Cinzel',serif",
                color: "rgba(200,80,80,.8)",
                fontSize: ".85rem",
                letterSpacing: ".1em",
              }}
            >
              Erro: {error}
            </p>
          </div>
        )}
        {!loading && !error && managers.length === 0 && (
          <div className="state-center">
            <p
              style={{
                fontFamily: "'Cinzel',serif",
                color: "rgba(200,168,74,.5)",
                fontSize: ".85rem",
                letterSpacing: ".2em",
              }}
            >
              Nenhum manager encontrado
            </p>
          </div>
        )}
        {!loading && !error && current && (
          <ManagerCard key={current.id} manager={current} visible={true} />
        )}
      </div>

      {!loading && managers.length > 1 && (
        <div className="progress-dots">
          {managers.map((_, i) => (
            <div
              key={i}
              className={`prog-dot ${i === index ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
            />
          ))}
        </div>
      )}

      {!loading && managers.length > 0 && (
        <div className="slide-nav">
          <button
            className="slide-nav-btn"
            onClick={goBack}
            disabled={index === 0}
          >
            ←
          </button>
          <button className="slide-nav-btn" onClick={advance}>
            {isLast ? "✓" : "→"}
          </button>
          {/* Menu button — same style, always visible */}
          <button
            className="slide-nav-btn"
            onClick={(e) => {
              e.stopPropagation();
              onGoToMenu?.();
            }}
            title="Menu (M)"
          >
            <MenuGridIcon />
          </button>
        </div>
      )}
    </>
  );
}
