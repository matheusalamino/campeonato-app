"use client";

import { useEffect, useState, useRef } from "react";
import { useTeams, type Team } from "@/features/hooks/useTeams";
import {
  useManagers,
  type ManagerPresentation,
} from "@/features/hooks/useManagers";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

// ── ICONS ──────────────────────────────────────────────────
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

// ── SHIELD FALLBACK ────────────────────────────────────────
function ShieldFallback({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <div className="shield-fallback">
      <svg viewBox="0 0 100 110" fill="none" className="shield-svg">
        <path
          d="M50 4L6 20v30c0 28 20 46 44 54 24-8 44-26 44-54V20L50 4z"
          fill="url(#sfGrad)"
          stroke="url(#sfStroke)"
          strokeWidth="1.5"
        />
        <defs>
          <linearGradient
            id="sfGrad"
            x1="0"
            y1="0"
            x2="100"
            y2="110"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#3d2200" />
            <stop offset="100%" stopColor="#1a0a00" />
          </linearGradient>
          <linearGradient
            id="sfStroke"
            x1="0"
            y1="0"
            x2="100"
            y2="110"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#8b6914" />
            <stop offset="50%" stopColor="#f5c842" />
            <stop offset="100%" stopColor="#8b6914" />
          </linearGradient>
        </defs>
      </svg>
      <span
        className="shield-initials"
        style={small ? { fontSize: "clamp(.55rem,1.1vw,.85rem)" } : undefined}
      >
        {initials}
      </span>
    </div>
  );
}

// ── LOGO CIRCLE ────────────────────────────────────────────
// minWidth/minHeight prevent flexbox from squishing the circle
function LogoCircle({ team, sizePx }: { team: Team; sizePx: string }) {
  const [err, setErr] = useState(false);
  return (
    <div
      className="lc-wrap"
      style={{
        width: sizePx,
        height: sizePx,
        minWidth: sizePx,
        minHeight: sizePx,
      }}
    >
      {team.logo_url && !err ? (
        <img
          src={team.logo_url}
          alt={team.name}
          className="lc-img"
          onError={() => setErr(true)}
        />
      ) : (
        <ShieldFallback name={team.name} small />
      )}
    </div>
  );
}

// ── LARGE LOGO (individual slide) ─────────────────────────
function TeamLogoLarge({ team }: { team: Team }) {
  const [err, setErr] = useState(false);
  return (
    <div className="team-logo-wrap">
      <div className="logo-ring-outer">
        <svg viewBox="0 0 260 260" fill="none" width="100%" height="100%">
          <circle
            cx="130"
            cy="130"
            r="122"
            stroke="url(#lrg1)"
            strokeWidth="1"
            strokeDasharray="4 10"
          />
          {[0, 60, 120, 180, 240, 300].map((d) => {
            const r = (d * Math.PI) / 180;
            return (
              <circle
                key={d}
                cx={130 + 122 * Math.cos(r)}
                cy={130 + 122 * Math.sin(r)}
                r="3"
                fill="#c8a84a"
                opacity="0.7"
              />
            );
          })}
          <defs>
            <linearGradient
              id="lrg1"
              x1="0"
              y1="0"
              x2="260"
              y2="260"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#c8a84a" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#f5d76e" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#c8a84a" stopOpacity="0.2" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="logo-ring-inner">
        <svg viewBox="0 0 260 260" fill="none" width="100%" height="100%">
          <circle
            cx="130"
            cy="130"
            r="108"
            stroke="url(#lrg2)"
            strokeWidth="1.5"
          />
          <defs>
            <linearGradient
              id="lrg2"
              x1="0"
              y1="0"
              x2="260"
              y2="260"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="#8b6914" stopOpacity="0.6" />
              <stop offset="50%" stopColor="#f5c842" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8b6914" stopOpacity="0.6" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div className="logo-circle-large">
        {team.logo_url && !err ? (
          <img
            src={team.logo_url}
            alt={team.name}
            className="logo-img-large"
            onError={() => setErr(true)}
          />
        ) : (
          <ShieldFallback name={team.name} />
        )}
        <div className="logo-glow" />
      </div>
    </div>
  );
}

// ── SINGLE TEAM CARD ───────────────────────────────────────
function TeamCard({ team }: { team: Team }) {
  return (
    <div className="team-card team-card-in">
      <TeamLogoLarge team={team} />
      <div className="team-name-wrap">
        <div className="tdivider">
          <div className="tdiv-line" />
          <div className="tdiv-gem" />
          <div className="tdiv-line" />
        </div>
        <h2 className="team-name gold-text">{team.name}</h2>
        <p className="team-eyebrow">Time</p>
      </div>
    </div>
  );
}

// ── ALL TEAMS GRID ─────────────────────────────────────────
function AllTeamsGrid({ teams }: { teams: Team[] }) {
  const row1 = teams.slice(0, 4);
  const row2 = teams.slice(4, 8);
  const rest = teams.slice(8);
  const rows = rest.length > 0 ? [row1, row2, rest] : [row1, row2];

  return (
    <div className="all-teams-wrap anim-grid">
      <div className="slide-header">
        <p className="eyebrow">Todos os Times</p>
        <h2 className="slide-h2 gold-text">Os Participantes</h2>
        <div className="tdivider" style={{ maxWidth: 360 }}>
          <div className="tdiv-line" />
          <div className="tdiv-gem" />
          <div className="tdiv-line" />
        </div>
      </div>
      <div className="teams-rows">
        {rows.map((row, ri) => (
          <div key={ri} className="teams-row">
            {row.map((team, ci) => (
              <div
                key={team.id}
                className="grid-item anim-item"
                style={{ animationDelay: `${(ri * 4 + ci) * 0.07}s` }}
              >
                <div className="grid-logo">
                  <LogoCircle team={team} sizePx="clamp(72px,9vw,108px)" />
                </div>
                <p className="grid-name">{team.name}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DRAFT LOTTERY ──────────────────────────────────────────
type Assignment = { managerId: string; managerName: string };

function DraftLottery({
  teams,
  managers,
  championshipId,
}: {
  teams: Team[];
  managers: ManagerPresentation[];
  championshipId: string;
}) {
  const shuffled = useRef<Team[]>([]);
  if (shuffled.current.length === 0) {
    const a = [...teams];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    shuffled.current = a;
  }

  const [revealed, setRevealed] = useState<boolean[]>(() =>
    new Array(teams.length).fill(false),
  );
  const [assignments, setAssignments] = useState<Record<string, Assignment>>(
    {},
  );
  const [modalTeam, setModalTeam] = useState<Team | null>(null);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);

  const assignedIds = Object.values(assignments).map((a) => a.managerId);
  const available = managers.filter((m) => !assignedIds.includes(m.id));
  const allAssigned =
    teams.length > 0 && Object.keys(assignments).length === teams.length;

  const rows = [
    shuffled.current.slice(0, 4),
    shuffled.current.slice(4, 8),
    ...(shuffled.current.length > 8 ? [shuffled.current.slice(8)] : []),
  ];

  function reveal(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    setRevealed((p) => {
      const n = [...p];
      n[i] = true;
      return n;
    });
  }

  function openModal(e: React.MouseEvent, team: Team, i: number) {
    e.stopPropagation();
    if (!revealed[i] || assignments[team.id]) return;
    setModalTeam(team);
    setSelected("");
  }

  async function save(e: React.MouseEvent) {
    e.stopPropagation();
    if (!modalTeam || !selected) return;
    setSaving(true);
    const mgr = managers.find((m) => m.id === selected);
    try {
      const { error } = await supabase
        .from("championship_managers")
        .update({ team_id: modalTeam.id })
        .eq("championship_id", championshipId)
        .eq("manager_id", selected);
      if (error) throw error;
      setAssignments((p) => ({
        ...p,
        [modalTeam.id]: {
          managerId: selected,
          managerName: mgr?.name ?? "",
        },
      }));
      setModalTeam(null);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="all-teams-wrap anim-grid">
        <div className="slide-header">
          <p className="eyebrow">Sorteio</p>
          <h2 className="slide-h2 gold-text">Escolha dos Times</h2>
          <div className="tdivider" style={{ maxWidth: 360 }}>
            <div className="tdiv-line" />
            <div className="tdiv-gem" />
            <div className="tdiv-line" />
          </div>
          {allAssigned && (
            <p
              style={{
                fontFamily: "'EB Garamond',serif",
                fontStyle: "italic",
                color: "rgba(240,210,140,.7)",
                fontSize: "clamp(.85rem,1.4vw,1rem)",
                marginTop: 6,
              }}
            >
              Todos os times foram designados!
            </p>
          )}
        </div>

        <div className="teams-rows">
          {rows.map((row, ri) => (
            <div key={ri} className="teams-row">
              {row.map((team, ci) => {
                const idx = ri * 4 + ci;
                const isRev = revealed[idx];
                const asgn = assignments[team.id];
                return (
                  <div
                    key={team.id}
                    className="anim-item"
                    style={{ animationDelay: `${idx * 0.05}s` }}
                  >
                    {!isRev ? (
                      <button
                        className="num-tile"
                        onClick={(e) => reveal(idx, e)}
                      >
                        <span className="num-val">{idx + 1}</span>
                        <span className="num-hint">revelar</span>
                      </button>
                    ) : (
                      <div
                        className={`logo-tile ${asgn ? "assigned" : "unassigned"}`}
                        onClick={(e) => openModal(e, team, idx)}
                      >
                        <div className="logo-tile-circle">
                          <LogoCircle
                            team={team}
                            sizePx="clamp(72px,9vw,108px)"
                          />
                        </div>
                        <p className="tile-name">{team.name}</p>
                        {asgn ? (
                          <p className="tile-manager anim-pop">
                            {asgn.managerName}
                          </p>
                        ) : (
                          <p className="tile-hint">+ cartola</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {modalTeam && (
        <div
          className="modal-bg"
          onClick={(e) => {
            e.stopPropagation();
            setModalTeam(null);
          }}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <div className="modal-logo">
                <LogoCircle team={modalTeam} sizePx="64px" />
              </div>
            </div>
            <p className="modal-team gold-text">{modalTeam.name}</p>
            <p className="modal-label">Selecione o Cartola</p>
            <select
              className="modal-select"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">— escolha —</option>
              {available.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={(e) => {
                  e.stopPropagation();
                  setModalTeam(null);
                }}
              >
                Cancelar
              </button>
              <button
                className="btn-save"
                onClick={save}
                disabled={!selected || saving}
              >
                {saving ? "Salvando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── MAIN ───────────────────────────────────────────────────
type Props = {
  championshipId: string;
  onFinished?: () => void;
  onGoToMenu?: () => void;
};

export default function TeamsSlideshow({
  championshipId,
  onFinished,
  onGoToMenu,
}: Props) {
  const { teams, loading: tLoad, error: tErr } = useTeams(championshipId);
  const { managers, loading: mLoad } = useManagers(championshipId);
  const [index, setIndex] = useState(0);
  const [displayTeam, setDisplayTeam] = useState<Team | null>(null);
  const pendingRef = useRef<Team | null>(null);

  const loading = tLoad || mLoad;
  const GRID = teams.length;
  const DRAFT = teams.length + 1;
  const isGrid = !loading && index === GRID;
  const isDraft = !loading && index === DRAFT;
  const isLast = isDraft;

  // Use rAF to avoid setState directly in effect body (no cascading renders)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (loading || isGrid || isDraft) {
        setDisplayTeam(null);
        return;
      }
      const t = teams[index] ?? null;
      pendingRef.current = t;
      setDisplayTeam(t);
    });
    return () => cancelAnimationFrame(id);
  }, [index, loading, isGrid, isDraft, teams]);

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
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goBack();
      if (e.key === "m" || e.key === "M") onGoToMenu?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, teams]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        .gold-text{background:linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;filter:drop-shadow(0 0 20px rgba(255,180,30,.6))}

        @keyframes teamIn   {from{opacity:0;transform:scale(.9) translateY(22px)}to{opacity:1;transform:scale(1) translateY(0)}}
        @keyframes gridAnim {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes itemAnim {from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
        @keyframes flipIn   {from{opacity:0;transform:rotateY(80deg) scale(.85)}to{opacity:1;transform:rotateY(0) scale(1)}}
        @keyframes popIn    {from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}
        @keyframes floatL   {0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes spinSlow {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes spin     {from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes pulse    {0%,100%{opacity:.4}50%{opacity:1}}

        /* ── Individual card ── */
        .team-card{display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2.2vh,28px);width:100%}
        .team-card-in{animation:teamIn .65s cubic-bezier(.22,1,.36,1) both}

        .team-logo-wrap{position:relative;width:clamp(160px,23vw,270px);height:clamp(160px,23vw,270px);animation:floatL 4s ease-in-out infinite}
        .logo-ring-outer{position:absolute;inset:-16px;animation:spinSlow 24s linear infinite}
        .logo-ring-inner{position:absolute;inset:8px}
        .logo-circle-large{position:absolute;inset:22px;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 35% 35%,#2a1400,#0a0400);box-shadow:0 0 50px rgba(200,168,74,.2),inset 0 0 40px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center}
        .logo-img-large{width:72%;height:72%;object-fit:contain;filter:drop-shadow(0 4px 16px rgba(0,0,0,.6))}
        .logo-glow{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 30% 25%,rgba(255,220,100,.08) 0%,transparent 60%);pointer-events:none}

        /* ── LogoCircle — fixed so flex can't squish it ── */
        .lc-wrap{border-radius:50%;overflow:hidden;background:radial-gradient(circle at 35% 35%,#2a1400,#0a0400);display:flex;align-items:center;justify-content:center;width:100%;height:100%;flex-shrink:0}
        .lc-img{width:80%;height:80%;object-fit:contain;display:block;flex-shrink:0}

        /* ── Shield fallback ── */
        .shield-fallback{position:relative;width:65%;height:65%;display:flex;align-items:center;justify-content:center}
        .shield-svg{position:absolute;inset:0;width:100%;height:100%}
        .shield-initials{position:relative;font-family:'Cinzel',serif;font-weight:900;font-size:clamp(.9rem,1.8vw,1.6rem);background:linear-gradient(135deg,#e8c84a,#f5d76e,#c9952a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;z-index:1;margin-top:4%}

        /* ── Team name ── */
        .team-name-wrap{display:flex;flex-direction:column;align-items:center;gap:6px}
        .tdivider{display:flex;align-items:center;gap:12px;width:100%;margin-bottom:4px}
        .tdiv-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .tdiv-gem{width:7px;height:7px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}
        .team-name{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.5rem,3.8vw,3.5rem);letter-spacing:.1em;text-transform:uppercase;line-height:1.05;text-align:center;margin:0}
        .team-eyebrow{font-family:'Cinzel',serif;font-size:clamp(.5rem,.85vw,.68rem);letter-spacing:.45em;text-transform:uppercase;color:rgba(200,168,74,.45);margin:0}

        /* ── Shared grid/draft layout ── */
        .all-teams-wrap{display:flex;flex-direction:column;align-items:center;gap:clamp(12px,2.2vh,24px);width:100%;max-width:980px;padding:0 clamp(10px,2.5vw,36px)}
        .anim-grid{animation:gridAnim .6s ease both}
        .slide-header{display:flex;flex-direction:column;align-items:center;gap:6px}
        .eyebrow{font-family:'Cinzel',serif;font-size:clamp(.55rem,.85vw,.72rem);letter-spacing:.45em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}
        .slide-h2{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.3rem,2.8vw,2.4rem);letter-spacing:.1em;text-transform:uppercase;line-height:1.05;margin:0}
        .teams-rows{display:flex;flex-direction:column;gap:clamp(10px,1.6vh,18px);width:100%}
        .teams-row{display:flex;justify-content:center;gap:clamp(10px,1.8vw,20px)}

        /* ── All teams grid items ── */
        .anim-item{animation:itemAnim .5s cubic-bezier(.22,1,.36,1) both}
        .grid-item{display:flex;flex-direction:column;align-items:center;gap:7px}
        .grid-logo{width:clamp(72px,9vw,108px);height:clamp(72px,9vw,108px);min-width:clamp(72px,9vw,108px);min-height:clamp(72px,9vw,108px);border-radius:50%;border:1px solid rgba(200,168,74,.35);box-shadow:0 0 14px rgba(200,168,74,.1),inset 0 0 10px rgba(0,0,0,.5);overflow:hidden;flex-shrink:0;transition:border-color .2s,box-shadow .2s}
        .grid-logo:hover{border-color:rgba(200,168,74,.7);box-shadow:0 0 22px rgba(200,168,74,.3)}
        .grid-name{font-family:'Cinzel',serif;font-size:clamp(.46rem,.74vw,.64rem);letter-spacing:.05em;text-transform:uppercase;color:rgba(240,210,140,.75);text-align:center;max-width:clamp(72px,9vw,108px);line-height:1.3;margin:0}

        /* ── Draft number tiles ── */
        .num-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:clamp(72px,9vw,108px);height:clamp(72px,9vw,108px);border-radius:12px;background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.38);cursor:pointer;transition:all .22s;box-shadow:0 0 10px rgba(200,168,74,.08),inset 0 0 18px rgba(0,0,0,.4)}
        .num-tile:hover{border-color:#c8a84a;background:rgba(200,168,74,.1);box-shadow:0 0 26px rgba(200,168,74,.33);transform:scale(1.07) translateY(-3px)}
        .num-val{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.3rem,2.3vw,2rem);background:linear-gradient(160deg,#fff0a0 0%,#f5c842 40%,#c8860a 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .num-hint{font-family:'Cinzel',serif;font-size:clamp(.35rem,.55vw,.48rem);letter-spacing:.22em;text-transform:uppercase;color:rgba(200,168,74,.38)}

        /* ── Draft logo tiles (revealed) ── */
        .logo-tile{display:flex;flex-direction:column;align-items:center;gap:4px;animation:flipIn .48s cubic-bezier(.22,1,.36,1) both}
        .logo-tile.unassigned{cursor:pointer}
        .logo-tile.assigned{cursor:default}
        .logo-tile-circle{width:clamp(72px,9vw,108px);height:clamp(72px,9vw,108px);min-width:clamp(72px,9vw,108px);min-height:clamp(72px,9vw,108px);border-radius:50%;border:1px solid rgba(200,168,74,.3);overflow:hidden;transition:all .2s;box-shadow:0 0 14px rgba(200,168,74,.1);flex-shrink:0}
        .logo-tile.unassigned:hover .logo-tile-circle{border-color:#c8a84a;box-shadow:0 0 28px rgba(200,168,74,.4);transform:scale(1.06)}
        .logo-tile.assigned .logo-tile-circle{border-color:rgba(200,168,74,.55);box-shadow:0 0 20px rgba(200,168,74,.2)}
        .tile-name{font-family:'Cinzel',serif;font-size:clamp(.44rem,.7vw,.62rem);letter-spacing:.04em;text-transform:uppercase;color:rgba(240,210,140,.7);text-align:center;max-width:clamp(72px,9vw,108px);line-height:1.3;margin:0}
        .tile-manager{font-family:'Cinzel',serif;font-size:clamp(.4rem,.65vw,.58rem);letter-spacing:.04em;text-transform:uppercase;color:#f5c842;text-align:center;max-width:clamp(72px,9vw,108px);line-height:1.3;margin:0;filter:drop-shadow(0 0 5px rgba(255,180,30,.5))}
        .anim-pop{animation:popIn .35s cubic-bezier(.22,1,.36,1) both}
        .tile-hint{font-family:'Cinzel',serif;font-size:clamp(.35rem,.56vw,.5rem);letter-spacing:.18em;text-transform:uppercase;color:rgba(200,168,74,.33);margin:0}

        /* ── Modal ── */
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:100;animation:gridAnim .2s ease both}
        .modal-box{display:flex;flex-direction:column;align-items:center;gap:14px;background:radial-gradient(ellipse at 40% 0%,#2a1200,#0e0600);border:1px solid rgba(200,168,74,.4);border-radius:20px;padding:30px 34px;box-shadow:0 0 60px rgba(200,100,0,.25),0 30px 60px rgba(0,0,0,.6);min-width:270px;max-width:340px;animation:popIn .3s cubic-bezier(.22,1,.36,1) both}
        .modal-logo{width:64px;height:64px;min-width:64px;min-height:64px;border-radius:50%;border:1px solid rgba(200,168,74,.4);overflow:hidden;flex-shrink:0}
        .modal-team{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1rem,1.8vw,1.45rem);letter-spacing:.08em;text-transform:uppercase;text-align:center;margin:0}
        .modal-label{font-family:'Cinzel',serif;font-size:.62rem;letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}
        .modal-select{width:100%;padding:10px 32px 10px 12px;background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.35);border-radius:8px;color:rgba(240,210,140,.9);font-family:'Cinzel',serif;font-size:.76rem;letter-spacing:.04em;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23c8a84a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
        .modal-select:focus{border-color:#c8a84a;box-shadow:0 0 10px rgba(200,168,74,.3)}
        .modal-select option{background:#1a0a00;color:rgba(240,210,140,.9)}
        .modal-actions{display:flex;gap:10px;width:100%}
        .btn-cancel{flex:1;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(240,210,140,.6);font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .btn-cancel:hover{background:rgba(255,255,255,.1)}
        .btn-save{flex:2;padding:10px;border-radius:8px;background:linear-gradient(135deg,rgba(200,168,74,.25),rgba(200,168,74,.15));border:1px solid rgba(200,168,74,.5);color:#f5c842;font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .btn-save:hover:not(:disabled){background:rgba(200,168,74,.3);box-shadow:0 0 14px rgba(200,168,74,.4)}
        .btn-save:disabled{opacity:.32;cursor:default}

        /* ── Nav ── */
        .t-counter{position:fixed;top:24px;right:32px;font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.3em;color:rgba(200,168,74,.5);z-index:50}
        .t-dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:6px;z-index:50;flex-wrap:wrap;justify-content:center;max-width:80vw}
        .t-dot{width:6px;height:6px;border-radius:50%;background:rgba(200,168,74,.25);border:1px solid rgba(200,168,74,.4);transition:all .3s;cursor:pointer;flex-shrink:0}
        .t-dot.on{background:#c8a84a;box-shadow:0 0 8px rgba(200,168,74,.7);transform:scale(1.4)}
        .t-dot.dia{border-radius:0;transform:rotate(45deg);width:7px;height:7px}
        .t-dot.dia.on{transform:rotate(45deg) scale(1.3)}
        .t-nav{position:fixed;bottom:16px;left:16px;display:flex;gap:8px;z-index:50}
        .t-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .t-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .t-btn:disabled{opacity:.2;cursor:default}
        .state-c{display:flex;flex-direction:column;align-items:center;gap:16px}
        .spin-ring{width:48px;height:48px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:spin .9s linear infinite}
        .spin-txt{font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);animation:pulse 1.5s ease-in-out infinite}
      `}</style>

      {!loading && teams.length > 0 && (
        <div className="t-counter">
          {isDraft
            ? "Sorteio"
            : isGrid
              ? "Todos"
              : `${index + 1} / ${teams.length}`}
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
          <div className="state-c">
            <div className="spin-ring" />
            <p className="spin-txt">Carregando…</p>
          </div>
        )}
        {tErr && (
          <div className="state-c">
            <p
              style={{
                fontFamily: "'Cinzel',serif",
                color: "rgba(200,80,80,.8)",
                fontSize: ".85rem",
              }}
            >
              Erro: {tErr}
            </p>
          </div>
        )}
        {!loading && !tErr && teams.length === 0 && (
          <div className="state-c">
            <p
              style={{
                fontFamily: "'Cinzel',serif",
                color: "rgba(200,168,74,.5)",
                fontSize: ".85rem",
                letterSpacing: ".2em",
              }}
            >
              Nenhum time encontrado
            </p>
          </div>
        )}
        {!loading && !tErr && displayTeam && !isGrid && !isDraft && (
          <TeamCard key={displayTeam.id} team={displayTeam} />
        )}
        {!loading && !tErr && isGrid && teams.length > 0 && (
          <AllTeamsGrid teams={teams} />
        )}
        {!loading && !tErr && isDraft && teams.length > 0 && (
          <DraftLottery
            teams={teams}
            managers={managers}
            championshipId={championshipId}
          />
        )}
      </div>

      {!loading && teams.length > 0 && (
        <div className="t-dots">
          {teams.map((_, i) => (
            <div
              key={i}
              className={`t-dot ${i === index && !isGrid && !isDraft ? "on" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setIndex(i);
              }}
            />
          ))}
          <div
            className={`t-dot dia ${isGrid ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(GRID);
            }}
          />
          <div
            className={`t-dot dia ${isDraft ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setIndex(DRAFT);
            }}
          />
        </div>
      )}

      {!loading && teams.length > 0 && (
        <div className="t-nav">
          <button className="t-btn" onClick={goBack} disabled={index === 0}>
            ←
          </button>
          <button className="t-btn" onClick={advance}>
            {isLast ? "✓" : "→"}
          </button>
          <button
            className="t-btn"
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
