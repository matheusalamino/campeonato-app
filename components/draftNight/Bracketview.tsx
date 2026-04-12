"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PhaseWithGroups } from "@/features/hooks/useChaveamento";

const supabase = createClient();

// ── Gold text style ────────────────────────────────────────
const GT: React.CSSProperties = {
  background:
    "linear-gradient(160deg,#fff0a0 0%,#f5c842 18%,#c8860a 36%,#f5c842 52%,#ffe066 68%,#b8720a 84%,#f5c842 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  backgroundClip: "text",
  filter: "drop-shadow(0 0 12px rgba(255,180,30,.5))",
};

// ── Types ──────────────────────────────────────────────────
type MatchSource = {
  id: string;
  knockout_match_id: string;
  source_type: string;
  source_phase_id: string | null;
  source_group: string | null;
  source_position: number | null;
  source_match_code: string | null;
  is_home: boolean;
  slot_order: number;
};

type KnockoutMatch = {
  id: string;
  phase_id: string;
  name: string | null;
  round_number: number | null;
  code: string | null;
  group_label: string | null;
  sources: MatchSource[];
};

type KnockoutPhaseData = {
  phaseId: string;
  phaseName: string;
  abbreviation: string | null;
  orderNumber: number;
  matches: KnockoutMatch[];
};

// ── Fetch knockout data ────────────────────────────────────
async function fetchKnockoutData(
  phases: PhaseWithGroups[],
): Promise<KnockoutPhaseData[]> {
  const knockoutPhases = phases.filter((p) => p.type === "knockout");
  if (knockoutPhases.length === 0) return [];

  const phaseIds = knockoutPhases.map((p) => p.id);

  // All knockout matches for these phases
  const { data: matches } = await supabase
    .from("knockout_matches")
    .select("id, phase_id, name, round_number, code, group_label")
    .in("phase_id", phaseIds)
    .order("round_number");

  if (!matches || matches.length === 0) return [];

  const matchIds = matches.map((m) => m.id as string);

  // All sources
  const { data: sources } = await supabase
    .from("knockout_match_sources")
    .select(
      "id, knockout_match_id, source_type, source_phase_id, source_group, source_position, source_match_code, is_home, slot_order",
    )
    .in("knockout_match_id", matchIds)
    .order("slot_order");

  const sourcesByMatch: Record<string, MatchSource[]> = {};
  (sources ?? []).forEach((s) => {
    const row = s as MatchSource;
    if (!sourcesByMatch[row.knockout_match_id])
      sourcesByMatch[row.knockout_match_id] = [];
    sourcesByMatch[row.knockout_match_id]!.push(row);
  });

  return knockoutPhases
    .sort((a, b) => a.order_number - b.order_number)
    .map((phase) => ({
      phaseId: phase.id,
      phaseName: phase.name,
      abbreviation: phase.abbreviation ?? null,
      orderNumber: phase.order_number,
      matches: matches
        .filter((m) => m.phase_id === phase.id)
        .sort((a, b) => (a.round_number ?? 0) - (b.round_number ?? 0))
        .map((m) => ({
          id: m.id as string,
          phase_id: m.phase_id as string,
          name: m.name as string | null,
          round_number: m.round_number as number | null,
          code: m.code as string | null,
          group_label: m.group_label as string | null,
          sources: sourcesByMatch[m.id as string] ?? [],
        })),
    }));
}

// ── Resolve a source label ─────────────────────────────────
function resolveSourceLabel(
  source: MatchSource,
  phases: PhaseWithGroups[],
): { primary: string; secondary: string | null } {
  if (source.source_type === "group_position") {
    const group = source.source_group ?? "?";
    const pos = source.source_position ?? "?";
    // Try to find the actual team name from the filled group data
    const phase = phases.find((p) => p.id === source.source_phase_id);
    const teamName =
      phase?.groups
        .find((g) => g.groupLetter === group)
        ?.slots.find((s) => s.position === source.source_position)?.teamName ??
      null;

    const ordinal = (n: number | string) => {
      const num = typeof n === "number" ? n : parseInt(String(n));
      const suffix = num === 1 ? "º" : num === 2 ? "º" : num === 3 ? "º" : "º";
      return `${num}${suffix}`;
    };

    return {
      primary: teamName ?? `${ordinal(pos)} Grupo ${group}`,
      secondary: teamName ? `${ordinal(pos)} Grupo ${group}` : null,
    };
  }

  if (source.source_type === "match_winner") {
    return {
      primary: `Vencedor ${source.source_match_code ?? "?"}`,
      secondary: null,
    };
  }
  if (source.source_type === "match_loser") {
    return {
      primary: `Perdedor ${source.source_match_code ?? "?"}`,
      secondary: null,
    };
  }

  return { primary: "A definir", secondary: null };
}

// ── Match card ─────────────────────────────────────────────
function MatchCard({
  match,
  phases,
  isLast = false,
}: {
  match: KnockoutMatch;
  phases: PhaseWithGroups[];
  isLast?: boolean;
}) {
  const home = match.sources.find((s) => s.is_home) ?? match.sources[0];
  const away = match.sources.find((s) => !s.is_home) ?? match.sources[1];

  const homeLabel = home
    ? resolveSourceLabel(home, phases)
    : { primary: "A definir", secondary: null };
  const awayLabel = away
    ? resolveSourceLabel(away, phases)
    : { primary: "A definir", secondary: null };

  const matchTitle = match.name ?? match.group_label ?? match.code ?? null;

  return (
    <div className={`bk-match ${isLast ? "bk-match-final" : ""}`}>
      {matchTitle && <p className="bk-match-name">{matchTitle}</p>}
      <div className="bk-match-slot bk-slot-home">
        <span className="bk-team-name">{homeLabel.primary}</span>
        {homeLabel.secondary && (
          <span className="bk-team-sub">{homeLabel.secondary}</span>
        )}
      </div>
      <div className="bk-match-vs">×</div>
      <div className="bk-match-slot bk-slot-away">
        <span className="bk-team-name">{awayLabel.primary}</span>
        {awayLabel.secondary && (
          <span className="bk-team-sub">{awayLabel.secondary}</span>
        )}
      </div>
    </div>
  );
}

// ── Group panel ────────────────────────────────────────────
function GroupPanel({ phase }: { phase: PhaseWithGroups }) {
  return (
    <div className="bk-group-phase">
      <p className="bk-phase-label">{phase.name}</p>
      <div className="bk-groups-row">
        {phase.groups.map((group) => (
          <div key={group.groupLetter} className="bk-group-card">
            <p className="bk-group-letter">Grupo {group.groupLetter}</p>
            <div className="bk-group-slots">
              {group.slots.map((slot) => (
                <div
                  key={slot.slotLabel}
                  className={`bk-group-slot ${slot.teamName ? "bk-gslot-filled" : "bk-gslot-empty"}`}
                >
                  <span className="bk-gslot-tag">{slot.slotLabel}</span>
                  <span className="bk-gslot-name">{slot.teamName ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Knockout phase column ──────────────────────────────────
function KnockoutColumn({
  phaseData,
  phases,
  isFinal = false,
}: {
  phaseData: KnockoutPhaseData;
  phases: PhaseWithGroups[];
  isFinal?: boolean;
}) {
  return (
    <div className={`bk-ko-col ${isFinal ? "bk-ko-final" : ""}`}>
      <p className="bk-phase-label" style={isFinal ? GT : undefined}>
        {phaseData.phaseName}
      </p>
      <div className="bk-ko-matches">
        {phaseData.matches.map((match, i) => (
          <MatchCard
            key={match.id}
            match={match}
            phases={phases}
            isLast={isFinal}
          />
        ))}
      </div>
    </div>
  );
}

// ── Connector ──────────────────────────────────────────────
function Connector() {
  return (
    <div className="bk-connector">
      <svg width="40" height="4" viewBox="0 0 40 4">
        <line
          x1="0"
          y1="2"
          x2="40"
          y2="2"
          stroke="rgba(200,168,74,0.35)"
          strokeWidth="1.5"
          strokeDasharray="5 3"
        />
      </svg>
    </div>
  );
}

// ── Main BracketView ───────────────────────────────────────
type Props = { phases: PhaseWithGroups[] };

export default function BracketView({ phases }: Props) {
  const [knockoutData, setKnockoutData] = useState<KnockoutPhaseData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKnockoutData(phases).then((d) => {
      setKnockoutData(d);
      setLoading(false);
    });
  }, [phases]);

  const groupPhases = phases.filter((p) => p.type === "group");
  const midPhases = knockoutData.slice(0, -1);
  const finalPhase = knockoutData[knockoutData.length - 1] ?? null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=EB+Garamond:ital,wght@0,400;0,600;1,400&display=swap');

        @keyframes bkIn {from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bkSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

        /* ── WRAPPER ── */
        .bk-wrap{
          display:flex;flex-direction:column;align-items:center;
          gap:clamp(18px,2.5vh,32px);
          width:100%;max-width:1360px;
          padding:0 clamp(16px,3vw,48px);
          animation:bkIn .5s cubic-bezier(.22,1,.36,1) both;
        }

        /* ── HEADER ── */
        .bk-header{display:flex;flex-direction:column;align-items:center;gap:6px}
        .bk-main-title{
          font-family:'Cinzel',serif;font-weight:900;
          font-size:clamp(1.6rem,3.2vw,3rem);letter-spacing:.12em;text-transform:uppercase;margin:0;
        }
        .bk-eyebrow{font-family:'Cinzel',serif;font-size:clamp(.58rem,.9vw,.76rem);letter-spacing:.45em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0}
        .bk-divider{display:flex;align-items:center;gap:12px;width:clamp(200px,35vw,440px)}
        .bk-dline{flex:1;height:1px;background:linear-gradient(90deg,transparent,#c8a84a,transparent)}
        .bk-dgem{width:7px;height:7px;background:#c8a84a;transform:rotate(45deg);flex-shrink:0}

        /* ── GROUPS ── */
        .bk-group-phase{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}
        .bk-phase-label{
          font-family:'Cinzel',serif;font-size:clamp(.58rem,.9vw,.76rem);
          letter-spacing:.38em;text-transform:uppercase;color:rgba(200,168,74,.55);margin:0;text-align:center;
        }
        .bk-groups-row{display:flex;gap:clamp(12px,2vw,24px);justify-content:center;flex-wrap:wrap;width:100%}

        .bk-group-card{
          background:rgba(0,0,0,.4);border:1px solid rgba(200,168,74,.2);border-radius:14px;
          overflow:hidden;flex:1;min-width:clamp(200px,22vw,300px);max-width:340px;
          backdrop-filter:blur(4px);
        }
        .bk-group-letter{
          font-family:'Cinzel',serif;font-weight:900;
          font-size:clamp(.9rem,1.5vw,1.2rem);letter-spacing:.14em;text-transform:uppercase;
          background:linear-gradient(135deg,#e8c84a,#f5d76e,#c9952a);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          padding:clamp(10px,1.4vh,14px) clamp(14px,2vw,20px);
          border-bottom:1px solid rgba(200,168,74,.12);
          background-color:rgba(0,0,0,.18);margin:0;
        }
        .bk-group-slots{display:flex;flex-direction:column}
        .bk-group-slot{
          display:flex;align-items:center;gap:10px;
          padding:clamp(9px,1.3vh,13px) clamp(14px,2vw,20px);
          border-bottom:1px solid rgba(200,168,74,.07);
        }
        .bk-group-slot:last-child{border-bottom:none}
        .bk-gslot-tag{
          font-family:'Cinzel',serif;font-weight:700;
          font-size:clamp(.68rem,1.05vw,.88rem);letter-spacing:.12em;color:#c8a84a;
          flex-shrink:0;min-width:28px;
        }
        .bk-gslot-name{
          font-family:'Cinzel',serif;font-size:clamp(.68rem,1.05vw,.88rem);
          letter-spacing:.05em;text-transform:uppercase;
        }
        .bk-gslot-filled .bk-gslot-name{color:rgba(240,210,140,.92)}
        .bk-gslot-empty  .bk-gslot-name{color:rgba(200,168,74,.28);font-style:italic;text-transform:none;font-family:'EB Garamond',serif}

        /* ── BRACKET FLOW ── */
        .bk-flow{
          display:flex;align-items:center;justify-content:center;
          gap:0;width:100%;overflow-x:auto;padding:4px 0;
        }

        /* ── KNOCKOUT COLUMN ── */
        .bk-ko-col{
          display:flex;flex-direction:column;align-items:center;
          gap:clamp(8px,1.4vh,14px);
          min-width:clamp(180px,20vw,260px);flex-shrink:0;
        }
        .bk-ko-final{min-width:clamp(200px,22vw,280px)}

        .bk-ko-matches{display:flex;flex-direction:column;gap:clamp(8px,1.2vh,14px);width:100%}

        /* ── MATCH CARD ── */
        .bk-match{
          background:rgba(0,0,0,.42);
          border:1px solid rgba(200,168,74,.22);
          border-radius:12px;overflow:hidden;
          transition:border-color .2s,box-shadow .2s;
          width:100%;
        }
        .bk-match:hover{border-color:rgba(200,168,74,.45);box-shadow:0 0 16px rgba(200,168,74,.12)}
        .bk-match-final{
          border-color:rgba(200,168,74,.45);
          box-shadow:0 0 24px rgba(200,168,74,.18);
        }

        .bk-match-name{
          font-family:'Cinzel',serif;font-size:clamp(.5rem,.78vw,.65rem);
          letter-spacing:.3em;text-transform:uppercase;color:rgba(200,168,74,.5);
          padding:6px 14px 0;margin:0;text-align:center;
        }

        .bk-match-slot{
          display:flex;flex-direction:column;padding:clamp(9px,1.3vh,13px) clamp(14px,2vw,18px);
          gap:2px;
        }
        .bk-slot-home{border-bottom:1px solid rgba(200,168,74,.1)}
        .bk-slot-away{}

        .bk-team-name{
          font-family:'Cinzel',serif;font-weight:700;
          font-size:clamp(.72rem,1.1vw,.92rem);letter-spacing:.06em;text-transform:uppercase;
          color:rgba(240,210,140,.92);
          /* single line truncate */
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        }
        .bk-match-final .bk-team-name{
          background:linear-gradient(135deg,#fff0a0,#f5c842,#c8860a);
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
          font-size:clamp(.78rem,1.2vw,1rem);
        }
        .bk-team-sub{
          font-family:'EB Garamond',serif;font-style:italic;
          font-size:clamp(.55rem,.82vw,.7rem);color:rgba(200,168,74,.45);
        }

        .bk-match-vs{
          text-align:center;
          font-family:'Cinzel',serif;font-size:clamp(.55rem,.85vw,.72rem);
          letter-spacing:.2em;color:rgba(200,168,74,.35);
          padding:2px 0;
          border-top:1px dashed rgba(200,168,74,.08);
          border-bottom:1px dashed rgba(200,168,74,.08);
        }

        /* ── CONNECTOR ── */
        .bk-connector{
          display:flex;align-items:center;padding:0 8px;flex-shrink:0;
          align-self:center;
        }

        /* ── TROPHY ── */
        .bk-trophy{
          display:flex;justify-content:center;
          filter:drop-shadow(0 0 12px rgba(200,168,74,.5));
          animation:bkIn .6s .3s both;
        }

        /* ── LOADING ── */
        .bk-spin{width:40px;height:40px;border-radius:50%;border:2px solid rgba(200,168,74,.2);border-top-color:#c8a84a;animation:bkSpin .9s linear infinite}
        .bk-note{font-family:'EB Garamond',serif;font-style:italic;font-size:clamp(.8rem,1.2vw,.95rem);color:rgba(240,210,140,.5);text-align:center;margin:0}
      `}</style>

      <div className="bk-wrap">
        {/* Header */}
        <div className="bk-header">
          <p className="bk-eyebrow">Chaveamento</p>
          <h2 className="bk-main-title" style={GT}>
            Tabela de Jogos
          </h2>
          <div className="bk-divider">
            <div className="bk-dline" />
            <div className="bk-dgem" />
            <div className="bk-dline" />
          </div>
        </div>

        {/* Group phases */}
        {groupPhases.map((gp) => (
          <GroupPanel key={gp.id} phase={gp} />
        ))}

        {/* Loading knockout */}
        {loading && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "16px 0",
            }}
          >
            <div className="bk-spin" />
          </div>
        )}

        {/* Knockout bracket flow */}
        {!loading && knockoutData.length > 0 && (
          <div className="bk-flow">
            {midPhases.map((phaseData, i) => (
              <div
                key={phaseData.phaseId}
                style={{ display: "flex", alignItems: "center" }}
              >
                <KnockoutColumn phaseData={phaseData} phases={phases} />
                <Connector />
              </div>
            ))}
            {finalPhase && (
              <KnockoutColumn phaseData={finalPhase} phases={phases} isFinal />
            )}
          </div>
        )}

        {!loading && knockoutData.length === 0 && (
          <p className="bk-note">
            Configure as fases eliminatórias para ver o chaveamento completo.
          </p>
        )}
      </div>
    </>
  );
}
