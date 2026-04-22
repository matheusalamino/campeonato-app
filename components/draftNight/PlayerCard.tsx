"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";
import type { AuctionPlayer } from "@/app/api/draft/pot-auction-players/route";

const POS_ABBR: Record<string, string> = {
  Atacante: "ATA",
  Zagueiro: "ZAG",
  Meia: "MEI",
  Goleiro: "GOL",
  Lateral: "LAT",
  Volante: "VOL",
};
function posAbbr(pos: string): string {
  return POS_ABBR[pos] ?? pos.slice(0, 3).toUpperCase();
}

export function PlayerRadar({
  attributes,
}: {
  attributes: AuctionPlayer["attributes"];
}) {
  if (attributes.length === 0) return null;
  const data = attributes.map((a) => ({ label: a.name, value: a.value }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="60%" data={data}>
        <PolarGrid stroke="rgba(200,168,74,0.25)" />
        <PolarAngleAxis
          dataKey="label"
          tick={{
            fill: "rgba(200,168,74,0.9)",
            fontSize: 13,
            fontFamily: "'Cinzel', serif",
            fontWeight: 700,
          }}
        />
        <PolarRadiusAxis domain={[60, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="value"
          stroke="#c8a84a"
          fill="#c8a84a"
          fillOpacity={0.35}
          strokeWidth={1.5}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export default function PlayerCard({ player }: { player: AuctionPlayer }) {
  const pos = posAbbr(player.position);
  const overall = player.overall ?? "—";
  const mid = Math.ceil(player.attributes.length / 2);
  const leftAttrs = player.attributes.slice(0, mid);
  const rightAttrs = player.attributes.slice(mid);
  const shirtName = player.name;
  const fullName = player.official_name ?? null;
  const showFull = fullName && fullName !== shirtName;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Oswald:wght@600;700&display=swap');

        /*
         * --cw = card width, drives ALL internal sizes so nothing breaks.
         * Increasing only --cw scales everything uniformly.
         * Target: ~360px on large screens, responsive on smaller.
         */
        .pc-card {
          --cw: clamp(280px, 28vw, 380px);

          position: relative;
          width: var(--cw);
          /* Fixed aspect ratio — 0.68 = classic card proportion */
          aspect-ratio: 0.68;
          border-radius: calc(var(--cw) * 0.045);
          overflow: hidden;
          background: linear-gradient(145deg, #1a1200 0%, #2d1e00 40%, #1a1200 100%);
          box-shadow:
            0 0 0 1px rgba(200,168,74,.5),
            0 0 0 calc(var(--cw) * 0.009) rgba(200,168,74,.15),
            0 0 calc(var(--cw) * 0.12) rgba(200,100,0,.28),
            inset 0 1px 0 rgba(255,220,100,.15);
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
        }

        /* Shimmer overlay */
        .pc-shimmer {
          position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 2;
          background: linear-gradient(
            125deg,
            transparent 30%, rgba(255,220,100,.06) 45%,
            rgba(255,200,50,.1) 50%, rgba(255,220,100,.06) 55%, transparent 70%
          );
        }

        /* Top gold line */
        .pc-top-border {
          position: absolute; top: 0; left: 0; right: 0;
          height: calc(var(--cw) * 0.009); z-index: 3;
          background: linear-gradient(90deg, transparent, #f5c842, rgba(255,200,50,.8), #f5c842, transparent);
        }

        /* Photo — 50% of card height, contain so face never crops */
        .pc-photo-wrap {
          position: relative; width: 100%; flex: 0 0 50%; overflow: hidden;
          background: radial-gradient(ellipse at 50% 30%, #2e1800 0%, #0e0800 100%);
          display: flex; align-items: center; justify-content: center;
        }
        .pc-photo {
          width: 100%; height: 100%;
          object-fit: contain; object-position: center top;
          mask-image: linear-gradient(to bottom, black 68%, transparent 100%);
          -webkit-mask-image: linear-gradient(to bottom, black 68%, transparent 100%);
        }
        .pc-photo-placeholder {
          font-family: 'Cinzel', serif; font-weight: 900;
          font-size: calc(var(--cw) * 0.14);
          background: linear-gradient(135deg, #c8a84a, #f5c842);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text; opacity: .6;
        }

        /* Overall + position badge */
        .pc-badge {
          position: absolute;
          top: calc(var(--cw) * 0.032);
          left: calc(var(--cw) * 0.042);
          display: flex; flex-direction: column; align-items: center; gap: 0;
          z-index: 4;
          filter: drop-shadow(0 2px 8px rgba(0,0,0,.9));
        }
        .pc-overall {
          font-family: 'Oswald', sans-serif; font-weight: 700;
          font-size: calc(var(--cw) * 0.155);
          line-height: 1;
          background: linear-gradient(180deg, #fffbe0 0%, #f5c842 50%, #c8860a 100%);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
          filter: drop-shadow(0 0 6px rgba(255,180,30,.6));
        }
        .pc-pos {
          font-family: 'Oswald', sans-serif; font-weight: 600;
          font-size: calc(var(--cw) * 0.058);
          letter-spacing: .12em;
          color: rgba(240,210,140,.85);
        }

        /* Info area */
        .pc-info {
          flex: 1; display: flex; flex-direction: column;
          background: linear-gradient(to bottom, rgba(0,0,0,.15), rgba(0,0,0,.55));
          overflow: hidden;
        }

        /* Name */
        .pc-name-wrap {
          text-align: center;
          border-bottom: 1px solid rgba(200,168,74,.2);
          padding: calc(var(--cw) * 0.025) calc(var(--cw) * 0.036) calc(var(--cw) * 0.022);
          flex-shrink: 0;
        }
        .pc-name {
          font-family: 'Oswald', sans-serif; font-weight: 700;
          font-size: calc(var(--cw) * 0.078);
          letter-spacing: .08em; text-transform: uppercase;
          color: rgba(240,210,140,.95);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;
        }
        .pc-full-name {
          font-family: 'Cinzel', serif;
          font-size: calc(var(--cw) * 0.042);
          letter-spacing: .06em; text-transform: uppercase;
          color: rgba(200,168,74,.45); display: block; margin-top: calc(var(--cw) * 0.01);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* Attributes fill remaining height */
        .pc-attrs-wrap {
          flex: 1; display: flex; align-items: stretch;
          padding: calc(var(--cw) * 0.02) calc(var(--cw) * 0.036) calc(var(--cw) * 0.032);
        }
        .pc-attrs {
          display: grid; grid-template-columns: 1fr 1px 1fr;
          gap: 0; width: 100%;
        }
        .pc-attrs-col {
          display: flex; flex-direction: column;
          justify-content: space-evenly;
        }
        .pc-attrs-col:first-child { padding-right: calc(var(--cw) * 0.026); }
        .pc-attrs-col:last-child  { padding-left:  calc(var(--cw) * 0.026); }
        .pc-divider-v { background: rgba(200,168,74,.2); }
        .pc-attr {
          display: flex; align-items: baseline;
          justify-content: space-between; gap: calc(var(--cw) * 0.015);
        }
        .pc-attr-val {
          font-family: 'Oswald', sans-serif; font-weight: 700;
          font-size: calc(var(--cw) * 0.076);
          color: rgba(240,210,140,.9);
        }
        .pc-attr-label {
          font-family: 'Oswald', sans-serif; font-weight: 600;
          font-size: calc(var(--cw) * 0.058);
          letter-spacing: .04em; color: rgba(200,168,74,.65);
        }
      `}</style>

      <div className="pc-card">
        <div className="pc-shimmer" />
        <div className="pc-top-border" />

        <div className="pc-photo-wrap">
          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              className="pc-photo"
            />
          ) : (
            <div className="pc-photo-placeholder">
              {shirtName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="pc-badge">
            <span className="pc-overall">{overall}</span>
            <span className="pc-pos">{pos}</span>
          </div>
        </div>

        <div className="pc-info">
          <div className="pc-name-wrap">
            <span className="pc-name">{shirtName}</span>
            {showFull && <span className="pc-full-name">{fullName}</span>}
          </div>

          {player.attributes.length > 0 && (
            <div className="pc-attrs-wrap">
              <div className="pc-attrs">
                <div className="pc-attrs-col">
                  {leftAttrs.map((a) => (
                    <div key={a.skill} className="pc-attr">
                      <span className="pc-attr-val">{a.value}</span>
                      <span className="pc-attr-label">{a.label}</span>
                    </div>
                  ))}
                </div>
                <div className="pc-divider-v" />
                <div className="pc-attrs-col">
                  {rightAttrs.map((a) => (
                    <div key={a.skill} className="pc-attr">
                      <span className="pc-attr-val">{a.value}</span>
                      <span className="pc-attr-label">{a.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
