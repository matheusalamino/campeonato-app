"use client";

import { useState, useEffect } from "react";
import { useChampionship } from "@/components/ChampionshipContext";
import { usePhases } from "@/features/hooks/usePhases";
import { CreatePhaseForm } from "@/components/CreatePhaseForm";
import { PhaseConfigDrawer } from "@/components/PhaseConfigDrawer";
import CarouselConfigSection from "@/components/CarouselConfigSection";
import type { Phase } from "@/types/championship";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Settings, Save, LayoutGrid, Trophy, Clock, Settings2 } from "lucide-react";

const supabase = createClient();

type ChampTeamOption = { id: string; name: string };

type GlobalSettings = {
  points_win: number;
  points_draw: number;
  points_loss: number;
  periods_count: number;
  period_duration: number;
};

function settingsFromChampionship(
  championship: NonNullable<ReturnType<typeof useChampionship>["championship"]>,
): GlobalSettings {
  return {
    points_win: championship.points_win ?? 3,
    points_draw: championship.points_draw ?? 1,
    points_loss: championship.points_loss ?? 0,
    periods_count: championship.periods_count ?? 2,
    period_duration: championship.period_duration ?? 7,
  };
}

export default function SettingsPage() {
  const { championship } = useChampionship();

  const [isOpen, setIsOpen] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);
  const [configPhase, setConfigPhase] = useState<Phase | null>(null);

  const [champTeams, setChampTeams] = useState<ChampTeamOption[]>([]);
  const [podium, setPodium] = useState({ champion: "", runnerUp: "", thirdPlace: "" });
  const [savingPodium, setSavingPodium] = useState(false);

  const { phases, loading, deletePhase, reload } = usePhases(championship?.id || null);

  const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({
    points_win: 3,
    points_draw: 1,
    points_loss: 0,
    periods_count: 2,
    period_duration: 7
  });
  const [savingGlobal, setSavingGlobal] = useState(false);

  useEffect(() => {
    if (!championship) return;
    const nextSettings = settingsFromChampionship(championship);
    queueMicrotask(() => setGlobalSettings(nextSettings));
  }, [championship]);

  useEffect(() => {
    if (!championship?.id) return;
    void (async () => {
      const [teamsRes, champRes] = await Promise.all([
        supabase
          .from("championship_teams")
          .select("id, teams ( name )")
          .eq("championship_id", championship.id),
        supabase
          .from("championships")
          .select("champion_team_id, runner_up_team_id, third_place_team_id")
          .eq("id", championship.id)
          .maybeSingle(),
      ]);
      const teams: ChampTeamOption[] = (teamsRes.data ?? []).map((r: any) => ({
        id: r.id,
        name: r.teams?.name ?? r.id,
      })).sort((a: ChampTeamOption, b: ChampTeamOption) => a.name.localeCompare(b.name, "pt-BR"));
      setChampTeams(teams);
      if (champRes.data) {
        setPodium({
          champion: champRes.data.champion_team_id ?? "",
          runnerUp: champRes.data.runner_up_team_id ?? "",
          thirdPlace: champRes.data.third_place_team_id ?? "",
        });
      }
    })();
  }, [championship?.id]);

  async function handleSaveGlobal() {
    if (!championship) return;
    setSavingGlobal(true);
    const { error } = await supabase
      .from("championships")
      .update(globalSettings)
      .eq("id", championship.id);

    setSavingGlobal(false);
    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações salvas com sucesso");
    }
  }

  async function handleSavePodium() {
    if (!championship?.id) return;
    setSavingPodium(true);
    const { error } = await supabase
      .from("championships")
      .update({
        champion_team_id: podium.champion || null,
        runner_up_team_id: podium.runnerUp || null,
        third_place_team_id: podium.thirdPlace || null,
      })
      .eq("id", championship.id);
    setSavingPodium(false);
    if (error) toast.error("Erro ao salvar pódio");
    else toast.success("Pódio salvo com sucesso");
  }

  async function handleSaveTournamentType(type: string) {
    if (!championship?.id) return;
    const { error } = await supabase
      .from("championships")
      .update({ tournament_type: type || null })
      .eq("id", championship.id);
    if (error) toast.error("Erro ao salvar tipo de torneio");
    else toast.success("Tipo de torneio salvo");
  }

  if (!championship) {
    return <div className="p-6 text-zinc-400">Selecione um campeonato</div>;
  }

  function handleCloseModal() {
    setIsOpen(false);
    setSelectedPhase(null);
    // Reload phases so any creates/edits are reflected immediately
    reload();
  }

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="space-y-1">
        <h1 className="text-3xl font-black text-white uppercase tracking-tight">Configurações</h1>
        <p className="text-sm text-zinc-500">Gerencie as regras e a estrutura do seu campeonato.</p>
      </div>

      {/* GLOBAL SETTINGS CARD */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-lg">
              <Settings className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Configurações Globais</h2>
              <p className="text-xs text-zinc-500">Regras de pontuação e formato de partida.</p>
            </div>
          </div>
          <button 
            onClick={handleSaveGlobal}
            disabled={savingGlobal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-blue-900/20"
          >
            <Save className="h-4 w-4" />
            {savingGlobal ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>

        <div className="p-6 grid gap-8 md:grid-cols-2">
          {/* PONTUAÇÃO */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5" /> Pontuação
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Vitória</label>
                <input 
                  type="number" 
                  value={globalSettings.points_win} 
                  onChange={e => setGlobalSettings({...globalSettings, points_win: parseInt(e.target.value)})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Empate</label>
                <input 
                  type="number" 
                  value={globalSettings.points_draw} 
                  onChange={e => setGlobalSettings({...globalSettings, points_draw: parseInt(e.target.value)})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Derrota</label>
                <input 
                  type="number" 
                  value={globalSettings.points_loss} 
                  onChange={e => setGlobalSettings({...globalSettings, points_loss: parseInt(e.target.value)})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {/* TEMPO DE JOGO */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Formato da Partida
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Nº de Tempos</label>
                <input 
                  type="number" 
                  value={globalSettings.periods_count} 
                  onChange={e => setGlobalSettings({...globalSettings, periods_count: parseInt(e.target.value)})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Duração do Tempo (min)</label>
                <input 
                  type="number" 
                  value={globalSettings.period_duration} 
                  onChange={e => setGlobalSettings({...globalSettings, period_duration: parseInt(e.target.value)})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD ESTRUTURA */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        {/* HEADER */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/10 rounded-lg">
              <LayoutGrid className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Estrutura do Campeonato</h2>
              <p className="text-xs text-zinc-500">Gerencie as fases e o chaveamento.</p>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedPhase(null);
              setIsOpen(true);
            }}
            className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-xl text-sm font-bold text-white border border-zinc-700 transition-all"
          >
            + Criar Fase
          </button>
        </div>

        {/* LOADING */}
        {loading && <p>Carregando...</p>}

        {/* EMPTY */}
        {!loading && phases.length === 0 && (
          <p className="text-zinc-500">Nenhuma fase criada</p>
        )}

        {/* LISTA */}
        <div className="space-y-2">
          {phases.map((phase) => (
            <div
              key={phase.id}
              className="flex justify-between items-center bg-zinc-800 p-3 rounded"
            >
              <div>
                <p className="font-medium">{phase.name}</p>
                <p className="text-xs text-zinc-400">
                  {phase.abbreviation} • {phase.type} • Ordem:{" "}
                  {phase.order_number}
                </p>
              </div>

              {/* AÇÕES */}
              <div className="flex gap-2">
                <button
                  onClick={() => setConfigPhase(phase)}
                  className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-lg transition-all"
                  title="Configurações avançadas"
                >
                  <Settings2 className="h-4 w-4" />
                </button>

                <button
                  onClick={() => {
                    setSelectedPhase(phase);
                    setIsOpen(true);
                  }}
                  className="px-3 py-1 text-xs bg-yellow-600 rounded hover:bg-yellow-500"
                >
                  Editar
                </button>

                <button
                  onClick={() => {
                    const confirmDelete = confirm(
                      "Tem certeza que deseja remover esta fase?",
                    );
                    if (confirmDelete) {
                      deletePhase(phase.id);
                    }
                  }}
                  className="px-3 py-1 text-xs bg-red-600 rounded hover:bg-red-500"
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TIPO DE TORNEIO */}
      <section className="rounded-xl border border-[var(--gala-line)] bg-[var(--gala-panel)] p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-black">
          <Trophy className="h-4 w-4 text-[var(--gala-gold-2)]" />
          Tipo de Torneio
        </h3>
        <p className="mb-4 text-xs text-[var(--gala-ink-dim)]">
          Classifica este campeonato para as páginas públicas (Copa do Mundo ou Champions League).
        </p>
        <select
          className="w-full rounded-lg border border-[var(--gala-line)] bg-[var(--gala-bg-0)] px-3 py-2 text-sm"
          defaultValue={(championship as { tournament_type?: string | null }).tournament_type ?? ""}
          onChange={async (e) => { await handleSaveTournamentType(e.target.value); }}
        >
          <option value="">— Sem classificação —</option>
          <option value="champions_league">🏆 Champions League Sorocaba</option>
          <option value="copa_do_mundo">🌍 Copa do Mundo Sorocaba</option>
        </select>
      </section>

      {/* RESULTADO FINAL / PÓDIO */}
      <section className="rounded-xl border border-[var(--gala-line)] bg-[var(--gala-panel)] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-black">
            <Trophy className="h-4 w-4 text-[var(--gala-gold-2)]" />
            Resultado Final / Pódio
          </h3>
          <button
            onClick={handleSavePodium}
            disabled={savingPodium}
            className="flex items-center gap-2 rounded-lg bg-[rgba(212,160,23,0.15)] border border-[var(--gala-gold-3)] px-3 py-1.5 text-xs font-bold text-[var(--gala-gold-1)] transition-all hover:bg-[rgba(212,160,23,0.25)] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {savingPodium ? "Salvando..." : "Salvar Pódio"}
          </button>
        </div>
        <p className="mb-4 text-xs text-[var(--gala-ink-dim)]">
          Define o pódio exibido na página pública do campeonato.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(
            [
              { label: "🏆 Campeão", key: "champion" },
              { label: "🥈 Vice-Campeão", key: "runnerUp" },
              { label: "🥉 3º Lugar", key: "thirdPlace" },
            ] as const
          ).map(({ label, key }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[2px] text-[var(--gala-gold-2)]">{label}</label>
              <select
                className="w-full rounded-lg border border-[var(--gala-line)] bg-[var(--gala-bg-0)] px-3 py-2 text-sm"
                value={podium[key]}
                onChange={(e) => setPodium((p) => ({ ...p, [key]: e.target.value }))}
              >
                <option value="">— Não definido —</option>
                {champTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* CARROSSEL DO TELÃO */}
      <CarouselConfigSection championshipId={championship.id} />

      {/* MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* OVERLAY */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleCloseModal}
          />

          {/* MODAL CONTENT */}
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* OVERLAY */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={handleCloseModal}
            />

            {/* MODAL */}
            <div className="relative bg-zinc-900 rounded-xl w-full max-w-5xl h-[90vh] border border-zinc-800 shadow-xl flex flex-col">
              {/* HEADER */}
              <div className="p-6 border-b border-zinc-800">
                <h2 className="text-lg font-semibold">
                  {selectedPhase ? "Editar Fase" : "Criar Fase"}
                </h2>
              </div>

              {/* BODY (SCROLL) */}
              <div className="flex-1 overflow-y-auto p-6">
                <CreatePhaseForm
                  onClose={handleCloseModal}
                  phase={selectedPhase}
                />
              </div>
              {/* FOOTER — only Cancel; the form has its own submit button */}
              <div className="p-4 border-t border-zinc-800 flex justify-end">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-zinc-700 rounded"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* CONFIG DRAWER */}
      {configPhase && (
        <PhaseConfigDrawer 
          phase={configPhase} 
          onClose={() => setConfigPhase(null)} 
        />
      )}
    </div>
  );
}
