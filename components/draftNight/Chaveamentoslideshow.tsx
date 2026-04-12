"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useChaveamento,
  assignTeamToSlot,
  getChampionshipTeamId,
} from "@/features/hooks/useChaveamento";
import BracketView from "./Bracketview";
import type {
  GroupData,
  GroupSlot,
  PhaseWithGroups,
} from "@/features/hooks/useChaveamento";
import type { Team } from "@/features/hooks/useTeams";

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

// ── SHUFFLE (pure, outside render) ─────────────────────────
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0]! % (i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

// ── ASSIGN MODAL ───────────────────────────────────────────
function AssignModal({
  slot,
  teams,
  championshipId,
  phaseId,
  onClose,
  onSaved,
}: {
  slot: GroupSlot;
  teams: Team[];
  championshipId: string;
  phaseId: string;
  onClose: () => void;
  onSaved: (label: string, team: Team) => void;
}) {
  const [selected, setSelected] = useState(slot.teamId ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation();
    if (!selected) return;
    setSaving(true);
    setErr(null);
    const ctId = await getChampionshipTeamId(selected, championshipId);
    if (!ctId) {
      setErr("Time não encontrado");
      setSaving(false);
      return;
    }
    const { error } = await assignTeamToSlot(slot.slotLabel, ctId, phaseId);
    if (error) {
      setErr(error);
      setSaving(false);
      return;
    }
    const team = teams.find((t) => t.id === selected)!;
    onSaved(slot.slotLabel, team);
    onClose();
    setSaving(false);
  }

  const goldText: React.CSSProperties = {
    background:
      "linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    filter: "drop-shadow(0 0 10px rgba(255,180,30,.45))",
  };

  return (
    <div
      className="am-bg"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="am-box" onClick={(e) => e.stopPropagation()}>
        <p className="am-eyebrow">Atribuir Time</p>
        <p className="am-label" style={goldText}>
          {slot.slotLabel}
        </p>
        <select
          className="am-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— escolha o time —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {err && <p className="am-error">{err}</p>}
        <div className="am-actions">
          <button
            className="am-cancel"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            className="am-save"
            onClick={handleSave}
            disabled={!selected || saving}
          >
            {saving ? "Salvando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── UNIFIED LOTTERY + GROUPS VIEW ─────────────────────────
type SlotEntry = { label: string; group: string; index: number };
type GroupState = { [phaseId: string]: GroupData[] };

function LotteryGroupsView({
  groupPhases,
  teams,
  championshipId,
}: {
  groupPhases: PhaseWithGroups[];
  teams: Team[];
  championshipId: string;
}) {
  // All slots across all group phases, shuffled once
  const shuffledSlots: SlotEntry[] = useMemo(() => {
    const flat: SlotEntry[] = groupPhases.flatMap((phase) =>
      phase.groups.flatMap((g) =>
        g.slots.map((s, si) => ({
          label: s.slotLabel,
          group: s.group,
          index: si,
        })),
      ),
    );
    return shuffleArray(flat);
  }, [groupPhases]);

  const totalSlots = shuffledSlots.length;

  // Revealed state: box index → true/false
  const [revealed, setReveal] = useState<boolean[]>(() =>
    new Array(totalSlots).fill(false),
  );

  // Groups state per phase (for live update after modal save)
  const [groupState, setGroupState] = useState<GroupState>(() => {
    const init: GroupState = {};
    groupPhases.forEach((p) => {
      init[p.id] = p.groups;
    });
    return init;
  });

  // Modal
  const [modalSlot, setModalSlot] = useState<{
    slot: GroupSlot;
    phaseId: string;
  } | null>(null);

  // Group colors per letter
  const groupColors = useMemo(() => {
    const letters = [...new Set(shuffledSlots.map((s) => s.group))];
    const hues = [42, 195, 275, 125, 345, 165, 60, 310];
    const map: Record<string, string> = {};
    letters.forEach((l, i) => {
      map[l] = `hsl(${hues[i % hues.length]},75%,62%)`;
    });
    return map;
  }, [shuffledSlots]);

  function reveal(i: number, e: React.MouseEvent) {
    e.stopPropagation();
    setReveal((p) => {
      const n = [...p];
      n[i] = true;
      return n;
    });
  }

  function openModal(slot: GroupSlot, phaseId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (slot.teamId) return; // already assigned, could allow re-assign optionally
    setModalSlot({ slot, phaseId });
  }

  function handleSaved(label: string, team: Team, phaseId: string) {
    setGroupState((prev) => ({
      ...prev,
      [phaseId]: (prev[phaseId] ?? []).map((g) => ({
        ...g,
        slots: g.slots.map((s) =>
          s.slotLabel === label
            ? {
                ...s,
                teamId: team.id,
                teamName: team.name,
                teamLogoUrl: team.logo_url,
              }
            : s,
        ),
      })),
    }));
  }

  // How many columns for the lottery boxes — always fills evenly
  // e.g. 8 slots → 4 cols, 2 rows;  6 → 3 cols, 2 rows;  4 → 4 cols, 1 row
  const lotteryColumns = useMemo(() => {
    if (totalSlots <= 4) return totalSlots;
    if (totalSlots <= 6) return 3;
    if (totalSlots <= 8) return 4;
    return Math.ceil(Math.sqrt(totalSlots));
  }, [totalSlots]);

  return (
    <>
      <div className="lgv-wrap">
        {/* ── TOP: Lottery boxes ── */}
        <div className="lgv-lottery-section">
          <p className="lgv-section-label">Sorteio dos Slots</p>
          <div
            className="lgv-lottery-grid"
            style={{ gridTemplateColumns: `repeat(${lotteryColumns}, 1fr)` }}
          >
            {shuffledSlots.map((slot, i) => {
              const isRev = revealed[i];
              const color = groupColors[slot.group] ?? "#f5c842";
              return (
                <div key={i} className="lgv-box-wrap">
                  {!isRev ? (
                    <button
                      className="lgv-num-box"
                      onClick={(e) => reveal(i, e)}
                    >
                      <span className="lgv-num">{i + 1}</span>
                      <span className="lgv-hint">revelar</span>
                    </button>
                  ) : (
                    <div
                      className="lgv-slot-box"
                      style={{
                        borderColor: color + "99",
                        boxShadow: `0 0 18px ${color}44`,
                      }}
                    >
                      <span className="lgv-slot-label" style={{ color }}>
                        {slot.label}
                      </span>
                      <span className="lgv-slot-group">Grupo {slot.group}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DIVIDER ── */}
        <div className="lgv-divider">
          <div className="lgv-div-line" />
          <div className="lgv-div-gem" />
          <div className="lgv-div-line" />
        </div>

        {/* ── BOTTOM: Groups ── */}
        <div className="lgv-groups-section">
          <p className="lgv-section-label">Atribuição de Times</p>
          <div className="lgv-groups-grid">
            {groupPhases.map((phase) => {
              const currentGroups = groupState[phase.id] ?? phase.groups;
              return currentGroups.map((group) => (
                <div
                  key={`${phase.id}-${group.groupLetter}`}
                  className="lgv-group-card"
                >
                  <div className="lgv-group-header">
                    <span className="lgv-group-title">
                      Grupo {group.groupLetter}
                    </span>
                    {phase.name && groupPhases.length > 1 && (
                      <span className="lgv-group-phase">{phase.name}</span>
                    )}
                  </div>
                  <div className="lgv-group-slots">
                    {group.slots.map((slot) => {
                      const filled = !!slot.teamName;
                      return (
                        <button
                          key={slot.slotLabel}
                          className={`lgv-slot-row ${filled ? "lgv-slot-filled" : "lgv-slot-empty"}`}
                          onClick={(e) => openModal(slot, phase.id, e)}
                        >
                          <span className="lgv-slot-tag">{slot.slotLabel}</span>
                          <span className="lgv-slot-dot" />
                          <span
                            className={`lgv-slot-name ${!filled ? "lgv-placeholder" : ""}`}
                          >
                            {filled ? slot.teamName : "— atribuir time —"}
                          </span>
                          {filled ? (
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              style={{
                                flexShrink: 0,
                                color: "rgba(200,168,74,.45)",
                              }}
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          ) : (
                            <svg
                              width="11"
                              height="11"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              style={{
                                flexShrink: 0,
                                color: "rgba(200,168,74,.3)",
                              }}
                            >
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalSlot && (
        <AssignModal
          slot={modalSlot.slot}
          teams={teams}
          championshipId={championshipId}
          phaseId={modalSlot.phaseId}
          onClose={() => setModalSlot(null)}
          onSaved={(label, team) => {
            handleSaved(label, team, modalSlot.phaseId);
            setModalSlot(null);
          }}
        />
      )}
    </>
  );
}

// ── MAIN SLIDESHOW ─────────────────────────────────────────
type Props = {
  championshipId: string;
  onFinished?: () => void;
  onGoToMenu?: () => void;
};

export default function ChaveamentoSlideshow({
  championshipId,
  onFinished,
  onGoToMenu,
}: Props) {
  const { data, loading, error, reload } = useChaveamento(championshipId);

  const groupPhases = data.phases.filter((p) => p.type === "group");

  // 2 slides: "grupos" (lottery+groups) and "bracket"
  type SlideId = "grupos" | "bracket";
  const slides: SlideId[] = ["grupos", "bracket"];
  const [slideIdx, setSlideIdx] = useState(0);
  const current = slides[slideIdx] ?? "grupos";
  const isFirst = slideIdx === 0;
  const isLast = slideIdx === slides.length - 1;

  function advance(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (isLast) onFinished?.();
    else setSlideIdx((i) => i + 1);
  }
  function goBack(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!isFirst) setSlideIdx((i) => i - 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") advance();
      if (e.key === "ArrowLeft") goBack();
      if (e.key === "m" || e.key === "M") onGoToMenu?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slideIdx]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes chIn   {from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes flipIn {from{opacity:0;transform:rotateY(80deg) scale(.85)}to{opacity:1;transform:rotateY(0) scale(1)}}
        @keyframes pulse  {0%,100%{box-shadow:0 0 0 0 rgba(200,168,74,0)}50%{box-shadow:0 0 0 5px rgba(200,168,74,.15)}}
        @keyframes spin   {from{transform:rotate(0)}to{transform:rotate(360deg)}}
        @keyframes blink  {0%,100%{opacity:.4}50%{opacity:1}}

        /* ── WRAPPER ── */
        .lgv-wrap{
          display:flex;flex-direction:column;align-items:center;
          gap:clamp(14px,2vh,24px);
          width:100%;max-width:1280px;
          padding:0 clamp(16px,3vw,48px);
          animation:chIn .5s cubic-bezier(.22,1,.36,1) both;
        }

        /* ── SECTION LABELS ── */
        .lgv-section-label{
          font-family:'Cinzel',serif;
          font-size:clamp(.6rem,1vw,.82rem);
          letter-spacing:.4em;text-transform:uppercase;
          color:rgba(200,168,74,.55);
          margin:0;text-align:center;
        }

        /* ── LOTTERY GRID ──
           Uses CSS grid with explicit columns passed via inline style.
           gap is fixed so boxes never crowd or spread weirdly. */
        .lgv-lottery-section{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}
        .lgv-lottery-grid{
          display:grid;
          gap:clamp(8px,1.2vw,14px);
          /* columns set inline per slot count */
          justify-content:center;
          width:100%;
        }
        .lgv-box-wrap{display:flex;justify-content:center}

        /* Hidden number tile */
        .lgv-num-box{
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
          width:clamp(72px,8vw,100px);height:clamp(72px,8vw,100px);
          border-radius:12px;
          background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.4);
          cursor:pointer;transition:all .2s;
          animation:pulse 2.2s ease-in-out infinite;
        }
        .lgv-num-box:hover{
          border-color:#c8a84a;background:rgba(200,168,74,.12);
          box-shadow:0 0 22px rgba(200,168,74,.35);
          transform:scale(1.08) translateY(-3px);
          animation:none;
        }
        .lgv-num{
          font-family:'Cinzel',serif;font-weight:900;
          font-size:clamp(1.2rem,2vw,1.8rem);
          background:linear-gradient(160deg,#fff0a0 0%,#f5c842 40%,#c8860a 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
        }
        .lgv-hint{
          font-family:'Cinzel',serif;font-size:clamp(.3rem,.5vw,.44rem);
          letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.38);
        }

        /* Revealed slot tile */
        .lgv-slot-box{
          display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;
          width:clamp(72px,8vw,100px);height:clamp(72px,8vw,100px);
          border-radius:12px;background:rgba(0,0,0,.4);
          border:1px solid rgba(200,168,74,.5);
          animation:flipIn .45s cubic-bezier(.22,1,.36,1) both;
        }
        .lgv-slot-label{
          font-family:'Cinzel',serif;font-weight:900;
          font-size:clamp(1.3rem,2.2vw,1.9rem);letter-spacing:.05em;
        }
        .lgv-slot-group{
          font-family:'Cinzel',serif;font-size:clamp(.28rem,.45vw,.42rem);
          letter-spacing:.18em;text-transform:uppercase;color:rgba(200,168,74,.45);
        }

        /* ── DIVIDER ── */
        .lgv-divider{display:flex;align-items:center;gap:12px;width:100%;max-width:600px}
        .lgv-div-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .lgv-div-gem{width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        /* ── GROUPS GRID ──
           Always 2 columns (one per group) for a 2-group championship.
           flex-wrap handles more groups gracefully. */
        .lgv-groups-section{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}
        .lgv-groups-grid{
          display:flex;flex-wrap:wrap;gap:clamp(10px,1.8vw,20px);
          justify-content:center;width:100%;
        }

        .lgv-group-card{
          background:rgba(0,0,0,.38);
          border:1px solid rgba(200,168,74,.2);
          border-radius:14px;overflow:hidden;
          flex:1;min-width:clamp(220px,28vw,340px);max-width:420px;
          backdrop-filter:blur(4px);
        }
        .lgv-group-header{
          display:flex;align-items:baseline;gap:10px;
          padding:clamp(10px,1.4vh,16px) clamp(14px,2vw,22px);
          border-bottom:1px solid rgba(200,168,74,.12);
          background:rgba(0,0,0,.18);
        }
        .lgv-group-title{
          font-family:'Cinzel',serif;font-weight:900;
          font-size:clamp(.95rem,1.6vw,1.3rem);letter-spacing:.12em;text-transform:uppercase;
          background:linear-gradient(160deg,#fff0a0 0%,#f5c842 25%,#c8860a 60%,#f5c842 100%);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          filter:drop-shadow(0 0 8px rgba(255,180,30,.4));
        }
        .lgv-group-phase{
          font-family:'Cinzel',serif;font-size:clamp(.5rem,.75vw,.62rem);
          letter-spacing:.2em;text-transform:uppercase;color:rgba(200,168,74,.4);
        }

        .lgv-group-slots{display:flex;flex-direction:column}
        .lgv-slot-row{
          display:flex;align-items:center;gap:10px;
          padding:clamp(10px,1.4vh,14px) clamp(14px,2vw,22px);
          background:transparent;border:none;
          border-bottom:1px solid rgba(200,168,74,.07);
          cursor:pointer;transition:background .16s;width:100%;text-align:left;
        }
        .lgv-slot-row:last-child{border-bottom:none}
        .lgv-slot-row:hover{background:rgba(200,168,74,.07)}
        .lgv-slot-row.lgv-slot-filled:hover{background:rgba(200,168,74,.1)}

        .lgv-slot-tag{
          font-family:'Cinzel',serif;font-weight:700;
          font-size:clamp(.7rem,1.1vw,.9rem);letter-spacing:.14em;
          color:#c8a84a;flex-shrink:0;min-width:30px;
        }
        .lgv-slot-dot{
          width:4px;height:4px;border-radius:50%;
          background:rgba(200,168,74,.28);flex-shrink:0;
        }
        .lgv-slot-name{
          font-family:'Cinzel',serif;
          font-size:clamp(.7rem,1.1vw,.9rem);letter-spacing:.05em;text-transform:uppercase;
          color:rgba(240,210,140,.9);flex:1;
        }
        .lgv-placeholder{
          color:rgba(200,168,74,.28);font-style:italic;text-transform:none;
          font-family:'EB Garamond',serif;
          font-size:clamp(.72rem,1.1vw,.88rem);letter-spacing:.02em;
        }

        /* ── MODAL ── */
        .am-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:200}
        .am-box{display:flex;flex-direction:column;align-items:center;gap:14px;background:radial-gradient(ellipse at 40% 0%,#2a1200,#0e0600);border:1px solid rgba(200,168,74,.4);border-radius:20px;padding:30px 36px;box-shadow:0 0 60px rgba(200,100,0,.25),0 30px 60px rgba(0,0,0,.6);min-width:300px;max-width:380px;width:90%}
        .am-eyebrow{font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.4em;text-transform:uppercase;color:rgba(200,168,74,.5);margin:0}
        .am-label{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(2.2rem,4vw,3.2rem);letter-spacing:.1em;margin:0}
        .am-select{width:100%;padding:11px 32px 11px 14px;background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.35);border-radius:8px;color:rgba(240,210,140,.9);font-family:'Cinzel',serif;font-size:.8rem;letter-spacing:.04em;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23c8a84a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
        .am-select:focus{border-color:#c8a84a}
        .am-select option{background:#1a0a00}
        .am-error{font-family:'Cinzel',serif;font-size:.65rem;color:rgba(220,80,80,.9);margin:0}
        .am-actions{display:flex;gap:10px;width:100%}
        .am-cancel{flex:1;padding:11px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(240,210,140,.6);font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .am-cancel:hover{background:rgba(255,255,255,.1)}
        .am-save{flex:2;padding:11px;border-radius:8px;background:linear-gradient(135deg,rgba(200,168,74,.25),rgba(200,168,74,.15));border:1px solid rgba(200,168,74,.5);color:#f5c842;font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .am-save:hover:not(:disabled){background:rgba(200,168,74,.3);box-shadow:0 0 14px rgba(200,168,74,.4)}
        .am-save:disabled{opacity:.32;cursor:default}

        /* ── NAV ── */
        .ch-counter{position:fixed;top:24px;right:32px;font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.3em;color:rgba(200,168,74,.5);z-index:50;text-transform:uppercase}
        .ch-dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:50}
        .ch-dot{width:7px;height:7px;border-radius:50%;background:rgba(200,168,74,.25);border:1px solid rgba(200,168,74,.4);transition:all .3s;cursor:pointer}
        .ch-dot.on{background:#c8a84a;box-shadow:0 0 8px rgba(200,168,74,.7);transform:scale(1.35)}
        .ch-dot.dia{border-radius:0;transform:rotate(45deg)}
        .ch-dot.dia.on{transform:rotate(45deg) scale(1.3)}
        .ch-nav{position:fixed;bottom:16px;left:16px;display:flex;gap:8px;z-index:50}
        .ch-btn{background:rgba(0,0,0,.45);border:1px solid rgba(200,168,74,.35);color:#c8a84a;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;cursor:pointer;transition:all .2s;backdrop-filter:blur(8px)}
        .ch-btn:hover{background:rgba(200,168,74,.2);border-color:#c8a84a;box-shadow:0 0 16px rgba(200,168,74,.4)}
        .ch-btn:disabled{opacity:.2;cursor:default}
        .ch-state{display:flex;flex-direction:column;align-items:center;gap:16px}
        .ch-spin{width:48px;height:48px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:spin .9s linear infinite}
        .ch-txt{font-family:'Cinzel',serif;font-size:.72rem;letter-spacing:.35em;text-transform:uppercase;color:rgba(200,168,74,.5);animation:blink 1.5s ease-in-out infinite}
      `}</style>

      {/* Counter */}
      {!loading && (
        <div className="ch-counter">
          {current === "grupos" ? "Grupos" : "Chaveamento"}
        </div>
      )}

      {/* Content */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        key={current}
      >
        {loading && (
          <div className="ch-state">
            <div className="ch-spin" />
            <p className="ch-txt">Carregando…</p>
          </div>
        )}
        {error && !loading && (
          <div className="ch-state">
            <p
              style={{
                fontFamily: "'Cinzel',serif",
                color: "rgba(200,80,80,.8)",
                fontSize: ".85rem",
              }}
            >
              Erro: {error}
            </p>
            <button
              className="ch-btn"
              style={{
                width: "auto",
                padding: "0 16px",
                fontSize: ".7rem",
                borderRadius: 8,
              }}
              onClick={(e) => {
                e.stopPropagation();
                reload();
              }}
            >
              Tentar novamente
            </button>
          </div>
        )}

        {!loading && !error && current === "grupos" && (
          <LotteryGroupsView
            groupPhases={groupPhases}
            teams={data.teams}
            championshipId={championshipId}
          />
        )}

        {!loading && !error && current === "bracket" && (
          <BracketView phases={data.phases} />
        )}
      </div>

      {/* Dots */}
      {!loading && (
        <div className="ch-dots">
          <div
            className={`ch-dot ${current === "grupos" ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setSlideIdx(0);
            }}
          />
          <div
            className={`ch-dot dia ${current === "bracket" ? "on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setSlideIdx(1);
            }}
          />
        </div>
      )}

      {/* Nav */}
      {!loading && (
        <div className="ch-nav">
          <button className="ch-btn" onClick={goBack} disabled={isFirst}>
            ←
          </button>
          <button className="ch-btn" onClick={advance}>
            {isLast ? "✓" : "→"}
          </button>
          <button
            className="ch-btn"
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
