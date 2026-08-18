"use client";

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts";

type Evaluation = {
  skill: string;
  label: string;
  value: number;
};

/**
 * `heightClass` existe para o radar da inscricao, que fica preso no topo do
 * passo enquanto as estrelas rolam por baixo e precisa ser mais baixo. O
 * default repete o valor antigo, entao quem ja usava o componente nao muda.
 */
export default function PlayerRadar({
  data,
  heightClass = "h-[300px] sm:h-[340px] md:h-[380px]",
}: {
  data: Evaluation[];
  heightClass?: string;
}) {
  return (
    <div className={`w-full ${heightClass}`}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid stroke="#444" />

          <PolarAngleAxis
            dataKey="label"
            tick={{ fill: "#d4d4d8", fontSize: 12 }}
          />

          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />

          <Radar
            dataKey="value"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
