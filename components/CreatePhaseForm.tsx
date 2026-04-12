"use client";

import { useState } from "react";
import { useChampionship } from "@/components/ChampionshipContext";
import { usePhases } from "@/features/hooks/usePhases";
import { createClient } from "@/lib/supabase/client";
import type {
  CreatePhaseDTO,
  Phase,
  PhaseType,
  RoundType,
  SlotConfig,
} from "@/types/championship";
import {
  generateGroupMatches,
  generateKnockoutMatches,
  generateSlots,
} from "@/features/helpers/matchGenerators";

type Props = {
  onClose: () => void;
  phase?: Phase | null;
};

export function CreatePhaseForm({ onClose, phase }: Props) {
  const supabase = createClient();
  const { championship } = useChampionship();
  const { createPhase, updatePhase } = usePhases(championship?.id ?? null);

  const isEditing = !!phase;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // ✅ STATE INICIAL BASEADO NA PHASE (SEM useEffect)
  const [name, setName] = useState(phase?.name ?? "");
  const [abbreviation, setAbbreviation] = useState(phase?.abbreviation ?? "");
  const [type, setType] = useState<PhaseType>(phase?.type ?? "group");
  const [order, setOrder] = useState(phase?.order_number ?? 1);
  const [homeAway, setHomeAway] = useState(phase?.is_home_away ?? false);

  // group
  const [numberOfGroups, setNumberOfGroups] = useState(2);
  const [teamsPerGroup, setTeamsPerGroup] = useState(4);
  const [roundType, setRoundType] = useState<RoundType>("all_vs_all");

  // knockout
  const [numberOfMatches, setNumberOfMatches] = useState(2);
  const [autoFill, setAutoFill] = useState(false);
  const [matchesConfig, setMatchesConfig] = useState<{ slots: SlotConfig[] }[]>(
    () =>
      Array.from({ length: numberOfMatches }).map(() => ({
        slots: [
          { slot_order: 1, mode: "manual" },
          { slot_order: 2, mode: "manual" },
        ],
      })),
  );

  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!championship) return;

    setLoading(true);

    let currentPhase: Phase | null = null;

    // ✅ EDITAR
    if (isEditing && phase) {
      currentPhase = await updatePhase({
        id: phase.id,
        name,
        type,
        order_number: order,
        abbreviation,
        is_home_away: homeAway,
      });
    }

    // ✅ CRIAR
    else {
      const dto: CreatePhaseDTO = {
        name,
        type,
        order_number: order,
        championship_id: championship.id,
        abbreviation,
        is_home_away: homeAway,
      };

      currentPhase = await createPhase(dto);
    }

    if (!currentPhase) {
      setLoading(false);
      return;
    }

    // ⚠️ Só cria estrutura se for criação (evita duplicar)
    if (!isEditing) {
      // =========================
      // GROUP
      // =========================
      if (type === "group") {
        await supabase.from("phase_group_settings").insert({
          phase_id: currentPhase.id,
          teams_per_group: teamsPerGroup,
          round_type: roundType,
          matches_per_pair: homeAway ? 2 : 1,
          number_of_groups: numberOfGroups,
        });

        const groups = Array.from({ length: numberOfGroups }).map((_, i) => ({
          name: alphabet[i],
          phase_id: currentPhase.id,
        }));

        await supabase.from("groups").insert(groups);

        // 🔥 GERAR JOGOS
        const matches = generateGroupMatches(
          currentPhase.id,
          numberOfGroups,
          teamsPerGroup,
          abbreviation,
        );

        const { data: createdMatches } = await supabase
          .from("knockout_matches")
          .insert(matches)
          .select();

        // 🔥 GERAR SLOTS (A1, A2...)
        if (createdMatches) {
          const slots = createdMatches.flatMap((match, i) =>
            generateSlots(match.id, i),
          );

          await supabase.from("match_slots").insert(slots);
        }
      }

      // =========================
      // KNOCKOUT
      // =========================
      if (type === "knockout") {
        await supabase.from("phase_knockout_settings").insert({
          phase_id: currentPhase.id,
          number_of_matches: numberOfMatches,
          is_home_away: homeAway,
          auto_fill: autoFill,
        });

        const matches = generateKnockoutMatches(
          currentPhase.id,
          numberOfMatches,
          abbreviation,
        );

        const { data: createdMatches } = await supabase
          .from("knockout_matches")
          .insert(matches)
          .select();

        if (createdMatches) {
          const slots = createdMatches.flatMap((match, i) =>
            generateSlots(match.id, i),
          );

          await supabase.from("match_slots").insert(slots);

          // 🔥🔥🔥 AQUI ENTRA O AUTO FILL 🔥🔥🔥
          if (autoFill) {
            const sources = createdMatches.flatMap((match, matchIndex) => {
              const config = matchesConfig[matchIndex];

              return config.slots
                .filter((s) => s.mode === "auto")
                .map((slot) => ({
                  knockout_match_id: match.id,
                  slot_order: slot.slot_order,
                  is_home: slot.slot_order === 1, // ✅ CORREÇÃO
                  source_type: slot.source_type,
                  source_phase_id: slot.source_phase_id,
                  source_group: slot.source_group,
                  source_position: slot.source_position,
                  source_match_code: slot.source_match_code,
                }));
            });

            if (sources.length > 0) {
              await supabase.from("knockout_match_sources").insert(sources);
            }
          }
        }
      }
    }
  }

  function renderSlot(matchIndex: number, slotIndex: number, slot: SlotConfig) {
    function updateSlot(field: keyof SlotConfig, value: unknown) {
      setMatchesConfig((prev) => {
        const updated = [...prev];
        const match = { ...updated[matchIndex] };
        const slots = [...match.slots];

        slots[slotIndex] = {
          ...slots[slotIndex],
          [field]: value,
        };

        match.slots = slots;
        updated[matchIndex] = match;

        return updated;
      });
    }

    return (
      <div
        key={`match-${matchIndex}-slot-${slot.slot_order}`}
        className="bg-zinc-800 p-3 rounded space-y-2"
      >
        <p className="text-xs text-zinc-400">Slot {slot.slot_order}</p>

        {/* MODE */}
        <select
          value={slot.mode}
          onChange={(e) =>
            updateSlot("mode", e.target.value as "manual" | "auto")
          }
          className="w-full p-2 rounded bg-zinc-700"
        >
          <option value="manual">Manual</option>
          <option value="auto">Automático</option>
        </select>

        {/* ========================= */}
        {/* MANUAL */}
        {/* ========================= */}
        {slot.mode === "manual" && (
          <input
            placeholder="Selecionar time (ID)"
            value={slot.championship_team_id ?? ""}
            onChange={(e) => updateSlot("championship_team_id", e.target.value)}
            className="w-full p-2 rounded bg-zinc-700"
          />
        )}

        {/* ========================= */}
        {/* AUTO */}
        {/* ========================= */}
        {slot.mode === "auto" && (
          <>
            <select
              value={slot.source_type ?? ""}
              onChange={(e) => updateSlot("source_type", e.target.value)}
              className="w-full p-2 rounded bg-zinc-700"
            >
              <option value="">Selecione</option>
              <option value="group_position">Grupo</option>
              <option value="match_winner">Vencedor</option>
              <option value="match_loser">Perdedor</option>
            </select>

            {/* GRUPO */}
            {slot.source_type === "group_position" && (
              <>
                <input
                  placeholder="Grupo (A, B...)"
                  value={slot.source_group ?? ""}
                  onChange={(e) => updateSlot("source_group", e.target.value)}
                  className="w-full p-2 rounded bg-zinc-700"
                />

                <input
                  type="number"
                  placeholder="Posição"
                  value={slot.source_position ?? ""}
                  onChange={(e) =>
                    updateSlot("source_position", Number(e.target.value))
                  }
                  className="w-full p-2 rounded bg-zinc-700"
                />
              </>
            )}

            {/* KNOCKOUT */}
            {(slot.source_type === "match_winner" ||
              slot.source_type === "match_loser") && (
              <input
                placeholder="Código do confronto (REP1)"
                value={slot.source_match_code ?? ""}
                onChange={(e) =>
                  updateSlot("source_match_code", e.target.value)
                }
                className="w-full p-2 rounded bg-zinc-700"
              />
            )}
          </>
        )}
      </div>
    );
  }

  function handleChangeMatches(value: number) {
    setNumberOfMatches(value);

    setMatchesConfig((prev) =>
      Array.from({ length: value }).map((_, i) => {
        return (
          prev[i] ?? {
            slots: [
              { slot_order: 1, mode: autoFill ? "auto" : "manual" },
              { slot_order: 2, mode: autoFill ? "auto" : "manual" },
            ],
          }
        );
      }),
    );
  }

  function handleToggleAutoFill(checked: boolean) {
    setAutoFill(checked);

    setMatchesConfig((prev) =>
      prev.map((match) => ({
        slots: match.slots.map((slot) => ({
          ...slot,
          mode: checked ? "auto" : "manual",
        })),
      })),
    );
  }

  function handleChangeType(newType: PhaseType) {
    setType(newType);

    if (newType === "group") {
      setNumberOfGroups(2);
      setTeamsPerGroup(4);
    }

    if (newType === "knockout") {
      handleChangeMatches(2);
    }
  }

  return (
    <form
      id="create-phase-form"
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      <div>
        <label className="text-sm text-zinc-400">Nome da fase</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          required
        />
      </div>

      <div>
        <label className="text-sm text-zinc-400">Abreviação</label>
        <input
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          required
        />
      </div>

      <div>
        <label className="text-sm text-zinc-400">Tipo</label>
        <select
          value={type}
          onChange={(e) => handleChangeType(e.target.value as PhaseType)}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
        >
          <option value="group">Grupos</option>
          <option value="knockout">Mata-mata</option>
        </select>
      </div>

      {type === "group" && (
        <div className="col-span-2 space-y-4">
          <h3 className="text-md font-semibold">Configuração dos Grupos</h3>

          {/* Número de grupos */}
          <div>
            <label>Número de grupos</label>
            <input
              type="number"
              value={numberOfGroups}
              onChange={(e) => setNumberOfGroups(Number(e.target.value))}
              className="w-full p-2 bg-zinc-800 rounded"
              min={1}
            />
          </div>

          {/* Times por grupo */}
          <div>
            <label>Times por grupo</label>
            <input
              type="number"
              value={teamsPerGroup}
              onChange={(e) => setTeamsPerGroup(Number(e.target.value))}
              className="w-full p-2 bg-zinc-800 rounded"
              min={2}
            />
          </div>

          {/* Tipo de rodada */}
          <div>
            <label>Formato</label>
            <select
              value={roundType}
              onChange={(e) => setRoundType(e.target.value as RoundType)}
              className="w-full p-2 bg-zinc-800 rounded"
            >
              <option value="all_vs_all">Todos contra todos</option>
              <option value="champions">Modelo Champions</option>
            </select>
          </div>
        </div>
      )}

      {type === "knockout" && (
        <div className="col-span-2 space-y-4">
          <h3 className="text-md font-semibold">Configuração dos Confrontos</h3>

          <div>
            <label>Número de confrontos</label>
            <input
              type="number"
              value={numberOfMatches}
              onChange={(e) => handleChangeMatches(Number(e.target.value))}
              className="w-full p-2 bg-zinc-800 rounded"
            />
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoFill}
              onChange={(e) => handleToggleAutoFill(e.target.checked)}
            />
            Preenchimento automático
          </label>

          {matchesConfig.map((match, matchIndex) => (
            <div
              key={matchIndex}
              className="border border-zinc-700 p-4 rounded space-y-3"
            >
              <p className="font-semibold">
                Confronto {matchIndex + 1} ({abbreviation}
                {matchIndex + 1})
              </p>

              <div className="grid grid-cols-2 gap-3">
                {match.slots.map((slot, slotIndex) =>
                  renderSlot(matchIndex, slotIndex, slot),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 mt-6">
          <input
            type="checkbox"
            checked={homeAway}
            onChange={(e) => setHomeAway(e.target.checked)}
          />
          Ida e volta
        </label>
      </div>

      <div>
        <label className="text-sm text-zinc-400">Ordem</label>
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
        />
      </div>
    </form>
  );
}
