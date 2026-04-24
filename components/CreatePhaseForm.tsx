"use client";

import { useState, useEffect } from "react";
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
  generateGroupSlots,
  generateKnockoutMatches,
  generateMatchSlots,
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

  // ── Form state ─────────────────────────────────────────────────────────────
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
          { slot_order: 1 as const, mode: "manual" as const },
          { slot_order: 2 as const, mode: "manual" as const },
        ],
      })),
  );

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Extra data for dropdowns and edit mode ─────────────────────────────────
  const [allPhases, setAllPhases] = useState<Phase[]>([]);
  const [allKnockoutMatches, setAllKnockoutMatches] = useState<any[]>([]);

  // 1. Fetch other phases and matches for the championship
  useEffect(() => {
    if (!championship?.id) return;
    async function loadExtra() {
      const { data: phasesData } = await supabase
        .from("phases")
        .select("*")
        .eq("championship_id", championship!.id)
        .order("order_number");
      setAllPhases(phasesData ?? []);

      if (phasesData && phasesData.length > 0) {
        const { data: matchesData } = await supabase
          .from("knockout_matches")
          .select("id, code, name, phase_id")
          .in("phase_id", phasesData.map((p) => p.id));
        setAllKnockoutMatches(matchesData ?? []);
      }
    }
    loadExtra();
  }, [championship]);

  // 2. Fetch existing settings if editing
  useEffect(() => {
    if (!isEditing || !phase) return;
    async function loadEditingData() {
      if (phase!.type === "knockout") {
        const { data: settings } = await supabase
          .from("phase_knockout_settings")
          .select("*")
          .eq("phase_id", phase!.id)
          .single();
        if (settings) {
          setNumberOfMatches(settings.number_of_matches);
          setAutoFill(settings.auto_fill);
          setHomeAway(settings.is_home_away);

          const { data: matches } = await supabase
            .from("knockout_matches")
            .select("id")
            .eq("phase_id", phase!.id)
            .order("round_number");

          if (matches && matches.length > 0) {
            const { data: sources } = await supabase
              .from("knockout_match_sources")
              .select("*")
              .in("knockout_match_id", matches.map((m) => m.id))
              .order("slot_order");
            
            const newConfig = matches.map((m) => {
              const mSources = (sources ?? []).filter((s) => s.knockout_match_id === m.id);
              return {
                slots: [1, 2].map((order) => {
                  const s = mSources.find((src) => src.slot_order === order);
                  if (s) {
                    return {
                      slot_order: order as 1 | 2,
                      mode: "auto" as const,
                      source_type: s.source_type,
                      source_phase_id: s.source_phase_id,
                      source_group: s.source_group,
                      source_position: s.source_position,
                      source_match_code: s.source_match_code,
                    };
                  }
                  return { slot_order: order as 1 | 2, mode: "manual" as const };
                })
              };
            });
            setMatchesConfig(newConfig);
          }
        }
      } else if (phase!.type === "group") {
        const { data: settings } = await supabase
          .from("phase_group_settings")
          .select("*")
          .eq("phase_id", phase!.id)
          .single();
        if (settings) {
          setNumberOfGroups(settings.number_of_groups);
          setTeamsPerGroup(settings.teams_per_group);
          setRoundType(settings.round_type);
          setHomeAway(settings.matches_per_pair > 1);
        }
      }
    }
    loadEditingData();
  }, [isEditing, phase]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!championship) return;

    setLoading(true);
    setError(null);

    let currentPhase: Phase | null = null;

    // ── EDIT ──────────────────────────────────────────────────────────────────
    if (isEditing && phase) {
      currentPhase = await updatePhase({
        id: phase.id,
        name,
        type,
        order_number: order,
        abbreviation,
        is_home_away: homeAway,
        // Settings are updated but structure (matches/slots) is NOT recreated.
        // For structural changes the user must delete + recreate the phase.
        ...(type === "group"
          ? {
              groupSettings: {
                number_of_groups: numberOfGroups,
                teams_per_group: teamsPerGroup,
                round_type: roundType,
                matches_per_pair: homeAway ? 2 : 1,
              },
            }
          : {
              knockoutSettings: {
                number_of_matches: numberOfMatches,
                is_home_away: homeAway,
                auto_fill: autoFill,
              },
            }),
      });

      if (!currentPhase) {
        setError("Erro ao atualizar fase.");
        setLoading(false);
        return;
      }

      setLoading(false);
      onClose();
      return;
    }

    // ── CREATE ────────────────────────────────────────────────────────────────
    const dto: CreatePhaseDTO = {
      name,
      type,
      order_number: order,
      championship_id: championship.id,
      abbreviation,
      is_home_away: homeAway,
    };

    currentPhase = await createPhase(dto);

    if (!currentPhase) {
      setError("Erro ao criar fase.");
      setLoading(false);
      return;
    }

    const phaseId = currentPhase.id;

    // ── GROUP structure ───────────────────────────────────────────────────────
    if (type === "group") {
      // 1. Settings
      const { error: settingsErr } = await supabase
        .from("phase_group_settings")
        .insert({
          phase_id: phaseId,
          teams_per_group: teamsPerGroup,
          round_type: roundType,
          matches_per_pair: homeAway ? 2 : 1,
          number_of_groups: numberOfGroups,
        });

      if (settingsErr) {
        setError(`Erro ao criar configurações: ${settingsErr.message}`);
        setLoading(false);
        return;
      }

      // 2. Groups (A, B, C...)
      const groups = Array.from({ length: numberOfGroups }).map((_, i) => ({
        name: alphabet[i],
        phase_id: phaseId,
      }));

      const { error: groupsErr } = await supabase.from("groups").insert(groups);
      if (groupsErr) {
        setError(`Erro ao criar grupos: ${groupsErr.message}`);
        setLoading(false);
        return;
      }

      // 3. Group slots (A1, A2, A3, A4, B1, B2, B3, B4...)
      //    This is the source of truth for team positions in groups.
      const groupSlots = generateGroupSlots(phaseId, numberOfGroups, teamsPerGroup);
      const { error: gsErr } = await supabase.from("group_slots").insert(groupSlots);
      if (gsErr) {
        setError(`Erro ao criar slots de grupo: ${gsErr.message}`);
        setLoading(false);
        return;
      }

      // 4. Match records (round-robin)
      const matches = generateGroupMatches(
        phaseId,
        numberOfGroups,
        teamsPerGroup,
        abbreviation,
      );

      const { data: createdMatches, error: matchErr } = await supabase
        .from("knockout_matches")
        .insert(matches)
        .select();

      if (matchErr) {
        setError(`Erro ao criar partidas: ${matchErr.message}`);
        setLoading(false);
        return;
      }

      // 5. Match slots (home/away) — descriptive only, not used for group position lookup
      if (createdMatches && createdMatches.length > 0) {
        const matchSlots = createdMatches.flatMap((m) => generateMatchSlots(m.id));
        const { error: msErr } = await supabase.from("match_slots").insert(matchSlots);
        if (msErr) {
          setError(`Erro ao criar match slots: ${msErr.message}`);
          setLoading(false);
          return;
        }
      }
    }

    // ── KNOCKOUT structure ────────────────────────────────────────────────────
    if (type === "knockout") {
      // 1. Settings
      const { error: settingsErr } = await supabase
        .from("phase_knockout_settings")
        .insert({
          phase_id: phaseId,
          number_of_matches: numberOfMatches,
          is_home_away: homeAway,
          auto_fill: autoFill,
        });

      if (settingsErr) {
        setError(`Erro ao criar configurações: ${settingsErr.message}`);
        setLoading(false);
        return;
      }

      // 2. Match records
      const matches = generateKnockoutMatches(phaseId, numberOfMatches, abbreviation);

      const { data: createdMatches, error: matchErr } = await supabase
        .from("knockout_matches")
        .insert(matches)
        .select();

      if (matchErr) {
        setError(`Erro ao criar confrontos: ${matchErr.message}`);
        setLoading(false);
        return;
      }

      if (createdMatches && createdMatches.length > 0) {
        // 3. Match slots (home/away)
        const matchSlots = createdMatches.flatMap((m) => generateMatchSlots(m.id));
        const { error: msErr } = await supabase.from("match_slots").insert(matchSlots);
        if (msErr) {
          setError(`Erro ao criar match slots: ${msErr.message}`);
          setLoading(false);
          return;
        }

        // 4. Auto-fill sources
        if (autoFill) {
          const sources = createdMatches.flatMap((match, matchIndex) => {
            const config = matchesConfig[matchIndex];
            return (config?.slots ?? [])
              .filter((s) => s.mode === "auto")
              .map((slot) => ({
                knockout_match_id: match.id,
                slot_order: slot.slot_order,
                is_home: slot.slot_order === 1,
                source_type: slot.source_type,
                source_phase_id: slot.source_phase_id,
                source_group: slot.source_group,
                source_position: slot.source_position,
                source_match_code: slot.source_match_code,
              }));
          });

          if (sources.length > 0) {
            const { error: srcErr } = await supabase
              .from("knockout_match_sources")
              .insert(sources);
            if (srcErr) {
              setError(`Erro ao criar fontes de preenchimento: ${srcErr.message}`);
              setLoading(false);
              return;
            }
          }
        }
      }
    }

    setLoading(false);
    onClose();
  }

  // ── Slot config helpers ────────────────────────────────────────────────────
  function renderSlot(matchIndex: number, slotIndex: number, slot: SlotConfig) {
    function updateSlot(field: keyof SlotConfig, value: unknown) {
      setMatchesConfig((prev) => {
        const updated = [...prev];
        const match = { ...updated[matchIndex] };
        const slots = [...match.slots];
        slots[slotIndex] = { ...slots[slotIndex], [field]: value };
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

        <select
          value={slot.mode}
          onChange={(e) => updateSlot("mode", e.target.value as "manual" | "auto")}
          className="w-full p-2 rounded bg-zinc-700"
        >
          <option value="manual">Manual</option>
          <option value="auto">Automático</option>
        </select>

        {slot.mode === "manual" && (
          <input
            placeholder="Selecionar time (ID)"
            value={slot.championship_team_id ?? ""}
            onChange={(e) => updateSlot("championship_team_id", e.target.value)}
            className="w-full p-2 rounded bg-zinc-700"
          />
        )}

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

            {slot.source_type === "group_position" && (
              <>
                <select
                  value={slot.source_phase_id ?? ""}
                  onChange={(e) => updateSlot("source_phase_id", e.target.value)}
                  className="w-full p-2 rounded bg-zinc-700"
                >
                  <option value="">Fase de origem...</option>
                  {allPhases.filter(p => p.type === "group").map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  placeholder="Grupo (A, B...)"
                  value={slot.source_group ?? ""}
                  onChange={(e) => updateSlot("source_group", e.target.value.toUpperCase())}
                  className="w-full p-2 rounded bg-zinc-700"
                />
                <input
                  type="number"
                  placeholder="Posição (1, 2...)"
                  value={slot.source_position ?? ""}
                  onChange={(e) =>
                    updateSlot("source_position", Number(e.target.value))
                  }
                  className="w-full p-2 rounded bg-zinc-700"
                />
              </>
            )}

            {(slot.source_type === "match_winner" ||
              slot.source_type === "match_loser") && (
              <>
                <select
                  value={slot.source_phase_id ?? ""}
                  onChange={(e) => updateSlot("source_phase_id", e.target.value)}
                  className="w-full p-2 rounded bg-zinc-700"
                >
                  <option value="">Fase de origem...</option>
                  {allPhases.filter(p => p.type === "knockout" && p.id !== phase?.id).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <select
                  value={slot.source_match_code ?? ""}
                  onChange={(e) => updateSlot("source_match_code", e.target.value)}
                  className="w-full p-2 rounded bg-zinc-700"
                  disabled={!slot.source_phase_id}
                >
                  <option value="">Confronto...</option>
                  {allKnockoutMatches.filter(m => m.phase_id === slot.source_phase_id).map(m => (
                    <option key={m.code} value={m.code}>{m.code} - {m.name}</option>
                  ))}
                </select>
              </>
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
              { slot_order: 1 as const, mode: autoFill ? ("auto" as const) : ("manual" as const) },
              { slot_order: 2 as const, mode: autoFill ? ("auto" as const) : ("manual" as const) },
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
          mode: checked ? ("auto" as const) : ("manual" as const),
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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <form
      id="create-phase-form"
      onSubmit={handleSubmit}
      className="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      {/* Name */}
      <div>
        <label className="text-sm text-zinc-400">Nome da fase</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          required
        />
      </div>

      {/* Abbreviation */}
      <div>
        <label className="text-sm text-zinc-400">Abreviação</label>
        <input
          value={abbreviation}
          onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          required
        />
      </div>

      {/* Type */}
      <div>
        <label className="text-sm text-zinc-400">Tipo</label>
        <select
          value={type}
          onChange={(e) => handleChangeType(e.target.value as PhaseType)}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
          disabled={isEditing}
        >
          <option value="group">Grupos</option>
          <option value="knockout">Mata-mata</option>
        </select>
        {isEditing && (
          <p className="text-xs text-zinc-500 mt-1">
            O tipo não pode ser alterado após a criação. Delete e recrie a fase para mudar.
          </p>
        )}
      </div>

      {/* Order */}
      <div>
        <label className="text-sm text-zinc-400">Ordem</label>
        <input
          type="number"
          value={order}
          onChange={(e) => setOrder(Number(e.target.value))}
          className="w-full mt-1 p-2 rounded bg-zinc-800"
        />
      </div>

      {/* Home/Away */}
      <div className="col-span-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={homeAway}
            onChange={(e) => setHomeAway(e.target.checked)}
          />
          Ida e volta
        </label>
      </div>

      {/* ── Group config ────────────────────────────────────────────────────── */}
      {type === "group" && (
        <div className="col-span-2 space-y-4">
          <h3 className="text-md font-semibold">Configuração dos Grupos</h3>

          {isEditing && (
            <p className="text-xs text-amber-400 bg-amber-900/30 rounded p-2">
              ⚠️ Alterar número de grupos ou times não recria partidas e slots existentes.
              Para reestruturar, delete e recrie a fase.
            </p>
          )}

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

      {/* ── Knockout config ─────────────────────────────────────────────────── */}
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

      {/* Error */}
      {error && (
        <div className="col-span-2 text-red-400 text-sm bg-red-900/20 rounded p-2">
          {error}
        </div>
      )}

      {/* Submit */}
      <div className="col-span-2">
        <button
          type="submit"
          disabled={loading}
          className="w-full p-3 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold"
        >
          {loading
            ? "Salvando..."
            : isEditing
              ? "Salvar Alterações"
              : "Criar Fase"}
        </button>
      </div>
    </form>
  );
}
