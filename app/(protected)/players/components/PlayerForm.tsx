"use client";

import { useState } from "react";
import { calculateOverall, Evaluation, SkillType } from "./OverallCalculator";
import { toast } from "sonner";
import {
  CANONICAL_POSITIONS,
  type CanonicalPosition,
} from "@/features/players/position";
import { POSITION_LABELS } from "@/lib/public/types";

const linha = [
  "visao",
  "controle",
  "finalizacao",
  "velocidade",
  "desarme",
  "drible",
] as const;

const goleiro = [
  "reposicao",
  "comunicacao",
  "posicionamento",
  "reflexo",
  "jogoAereo",
  "agilidade",
] as const;

export default function PlayerForm() {
  const [name, setName] = useState("");
  const [position, setPosition] = useState<CanonicalPosition>("MEI");

  const initialEvaluations = Object.fromEntries(
    [...linha, ...goleiro].map((skill) => [
      skill,
      { self: 0, org1: 0, org2: 0, org3: 0, org4: 0 },
    ]),
  );

  const [evaluations, setEvaluations] = useState<Record<SkillType, Evaluation>>(
    initialEvaluations as Record<SkillType, Evaluation>,
  );

  const overall = calculateOverall(evaluations);

  function updateSkill(
    skill: SkillType,
    field: keyof Evaluation,
    value: number,
  ) {
    setEvaluations((prev: Record<SkillType, Evaluation>) => ({
      ...prev,
      [skill]: {
        ...prev[skill as SkillType],
        [field]: value,
      },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const player = {
      name,
      position,
      overall,
      evaluations,
    };

    toast.success("Jogador salvo com sucesso");
  }

  // `GOL`, e nao `Goleiro`: o vocabulario da coluna virou codigo na
  // 20260821010000. Errar aqui nao quebra a tela — oferece as habilidades de
  // LINHA para quem escolheu goleiro, calado.
  const skillsToShow = position === "GOL" ? goleiro : linha;

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 bg-white p-6 rounded-xl shadow"
    >
      <div>
        <label className="block font-medium">Nome</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="block font-medium">Posição</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={position}
          onChange={(e) => setPosition(e.target.value as CanonicalPosition)}
        >
          {CANONICAL_POSITIONS.map((codigo) => (
            <option key={codigo} value={codigo}>
              {POSITION_LABELS[codigo]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Avaliações</h2>

        <div className="grid grid-cols-6 gap-2 text-sm font-semibold">
          <span>Habilidade</span>
          <span>Auto (1-5)</span>
          <span>Org 1</span>
          <span>Org 2</span>
          <span>Org 3</span>
          <span>Org 4</span>
        </div>

        {skillsToShow.map((skill) => (
          <div key={skill} className="grid grid-cols-6 gap-2 items-center mt-2">
            <span className="capitalize">{skill}</span>

            {["self", "org1", "org2", "org3", "org4"].map((field) => (
              <input
                key={field}
                type="number"
                min={field === "self" ? 1 : 5}
                max={field === "self" ? 5 : 10}
                className="border rounded px-2 py-1"
                value={
                  evaluations[skill as SkillType][field as keyof Evaluation]
                }
                onChange={(e) =>
                  updateSkill(
                    skill as SkillType,
                    field as keyof Evaluation,
                    Number(e.target.value),
                  )
                }
              />
            ))}
          </div>
        ))}
      </div>

      <div className="text-xl font-bold">Overall: {overall}</div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
      >
        Salvar Jogador
      </button>
    </form>
  );
}
