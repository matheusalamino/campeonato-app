"use client";

import { useState } from "react";
import type {
  GroupData,
  GroupSlot,
  PhaseWithGroups,
} from "@/features/hooks/useChaveamento";
import {
  assignTeamToSlot,
  getChampionshipTeamId,
} from "@/features/hooks/useChaveamento";
import type { Team } from "@/features/hooks/useTeams";

const goldText: React.CSSProperties = {
  background:
    "linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  filter: "drop-shadow(0 0 10px rgba(255,180,30,.45))",
};

// ── Slot row ───────────────────────────────────────────────
function SlotRow({
  slot,
  onClick,
}: {
  slot: GroupSlot;
  onClick: (s: GroupSlot) => void;
}) {
  const filled = !!slot.teamName;
  return (
    <button
      className={`slot-row ${filled ? "slot-filled" : "slot-empty"}`}
      onClick={() => onClick(slot)}
    >
      <span className="slot-label">{slot.slotLabel}</span>
      <span className="slot-dot" />
      <span className={`slot-name ${!filled ? "slot-placeholder" : ""}`}>
        {filled ? slot.teamName : "— clique para atribuir —"}
      </span>
      {filled && (
        <span className="slot-edit-icon">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ── Group card ─────────────────────────────────────────────
function GroupCard({
  group,
  onSlotClick,
}: {
  group: GroupData;
  onSlotClick: (s: GroupSlot) => void;
}) {
  return (
    <div className="group-card">
      <div className="group-header">
        <span className="group-letter" style={goldText}>
          Grupo {group.groupLetter}
        </span>
      </div>
      <div className="group-slots">
        {group.slots.map((slot) => (
          <SlotRow key={slot.slotLabel} slot={slot} onClick={onSlotClick} />
        ))}
      </div>
    </div>
  );
}

// ── Assign modal ───────────────────────────────────────────
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
      setErr("Time não encontrado no campeonato");
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

  return (
    <div
      className="modal-bg"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <p className="modal-eyebrow">Slot</p>
        <p className="modal-slot-label" style={goldText}>
          {slot.slotLabel}
        </p>
        <p className="modal-instruction">Selecione o time para este slot</p>
        <select
          className="modal-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">— escolha o time —</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.cartola_name ? `${t.name} · ${t.cartola_name}` : t.name}
            </option>
          ))}
        </select>
        {err && <p className="modal-error">{err}</p>}
        <div className="modal-actions">
          <button
            className="btn-cancel"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            className="btn-save"
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

// ── Main ───────────────────────────────────────────────────
type Props = { phase: PhaseWithGroups; teams: Team[]; championshipId: string };

export default function GroupTable({ phase, teams, championshipId }: Props) {
  const [groups, setGroups] = useState<GroupData[]>(phase.groups);
  const [activeSlot, setActiveSlot] = useState<GroupSlot | null>(null);

  function handleSaved(label: string, team: Team) {
    setGroups((prev) =>
      prev.map((g) => ({
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
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        .group-table-wrap{display:flex;flex-direction:column;align-items:center;gap:clamp(16px,3vh,32px);width:100%;max-width:900px}
        .phase-title{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.4rem,3vw,2.6rem);letter-spacing:.1em;text-transform:uppercase;text-align:center;margin:0}
        .phase-subtitle{font-family:'Cinzel',serif;font-size:clamp(.55rem,.9vw,.75rem);letter-spacing:.4em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}

        .groups-grid{display:flex;flex-wrap:wrap;gap:clamp(12px,2vw,24px);justify-content:center;width:100%}
        .group-card{background:rgba(0,0,0,.35);border:1px solid rgba(200,168,74,.2);border-radius:16px;overflow:hidden;min-width:260px;flex:1;max-width:380px;backdrop-filter:blur(4px)}
        .group-header{padding:12px 20px;border-bottom:1px solid rgba(200,168,74,.15);background:rgba(0,0,0,.2)}
        .group-letter{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1rem,1.8vw,1.4rem);letter-spacing:.12em;text-transform:uppercase}
        .group-slots{display:flex;flex-direction:column}

        .slot-row{display:flex;align-items:center;gap:12px;padding:11px 20px;background:transparent;border:none;border-bottom:1px solid rgba(200,168,74,.08);cursor:pointer;transition:background .18s;width:100%;text-align:left}
        .slot-row:last-child{border-bottom:none}
        .slot-row:hover{background:rgba(200,168,74,.07)}
        .slot-label{font-family:'Cinzel',serif;font-weight:700;font-size:clamp(.65rem,1vw,.82rem);letter-spacing:.15em;color:#c8a84a;flex-shrink:0;min-width:26px}
        .slot-dot{width:4px;height:4px;border-radius:50%;background:rgba(200,168,74,.3);flex-shrink:0}
        .slot-name{font-family:'Cinzel',serif;font-size:clamp(.65rem,1vw,.82rem);letter-spacing:.06em;text-transform:uppercase;color:rgba(240,210,140,.9);flex:1}
        .slot-placeholder{color:rgba(200,168,74,.3);font-style:italic;text-transform:none;font-family:'EB Garamond',serif;font-size:clamp(.7rem,1vw,.85rem);letter-spacing:.02em}
        .slot-edit-icon{color:rgba(200,168,74,.4);flex-shrink:0;display:flex;align-items:center}
        .slot-row:hover .slot-edit-icon{color:rgba(200,168,74,.8)}

        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.75);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:200}
        .modal-box{display:flex;flex-direction:column;align-items:center;gap:12px;background:radial-gradient(ellipse at 40% 0%,#2a1200,#0e0600);border:1px solid rgba(200,168,74,.4);border-radius:20px;padding:28px 32px;box-shadow:0 0 60px rgba(200,100,0,.25),0 30px 60px rgba(0,0,0,.6);min-width:280px;max-width:360px;width:90%}
        .modal-eyebrow{font-family:'Cinzel',serif;font-size:.6rem;letter-spacing:.4em;text-transform:uppercase;color:rgba(200,168,74,.5);margin:0}
        .modal-slot-label{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(2rem,4vw,3rem);letter-spacing:.1em;margin:0}
        .modal-instruction{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.85rem,1.4vw,1rem);color:rgba(240,210,140,.65);margin:0;text-align:center}
        .modal-select{width:100%;padding:10px 32px 10px 12px;background:rgba(0,0,0,.5);border:1px solid rgba(200,168,74,.35);border-radius:8px;color:rgba(240,210,140,.9);font-family:'Cinzel',serif;font-size:.76rem;letter-spacing:.04em;outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23c8a84a' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
        .modal-select:focus{border-color:#c8a84a}
        .modal-select option{background:#1a0a00}
        .modal-error{font-family:'Cinzel',serif;font-size:.65rem;color:rgba(220,80,80,.9);margin:0;text-align:center}
        .modal-actions{display:flex;gap:10px;width:100%}
        .btn-cancel{flex:1;padding:10px;border-radius:8px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:rgba(240,210,140,.6);font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .btn-cancel:hover{background:rgba(255,255,255,.1)}
        .btn-save{flex:2;padding:10px;border-radius:8px;background:linear-gradient(135deg,rgba(200,168,74,.25),rgba(200,168,74,.15));border:1px solid rgba(200,168,74,.5);color:#f5c842;font-family:'Cinzel',serif;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;transition:all .2s}
        .btn-save:hover:not(:disabled){background:rgba(200,168,74,.3);box-shadow:0 0 14px rgba(200,168,74,.4)}
        .btn-save:disabled{opacity:.32;cursor:default}

        .tdivider{display:flex;align-items:center;gap:10px;width:100%;max-width:400px}
        .tdiv-line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .tdiv-gem{width:6px;height:6px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}
      `}</style>

      <div className="group-table-wrap">
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
          }}
        >
          <p className="phase-subtitle">Fase</p>
          <h2 className="phase-title" style={goldText}>
            {phase.name}
          </h2>
          <div className="tdivider">
            <div className="tdiv-line" />
            <div className="tdiv-gem" />
            <div className="tdiv-line" />
          </div>
        </div>
        <div className="groups-grid">
          {groups.map((g) => (
            <GroupCard
              key={g.groupLetter}
              group={g}
              onSlotClick={setActiveSlot}
            />
          ))}
        </div>
      </div>

      {activeSlot && (
        <AssignModal
          slot={activeSlot}
          teams={teams}
          championshipId={championshipId}
          phaseId={phase.id}
          onClose={() => setActiveSlot(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}
