"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { User, Star, ChevronRight, Check, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchPlayer } from "@/features/hooks/useMatchDetail";
import type { VoterRole, ExistingVote } from "@/types/best-player";

const supabase = createClient();

type Team = { championshipTeamId: string; name: string };

type Props = {
  matchId: string;
  championshipId: string;
  homeTeam: Team;
  awayTeam: Team;
  homePlayers: MatchPlayer[];
  awayPlayers: MatchPlayer[];
  voteWeight: number;
  existingVotes: ExistingVote[];
  existingManagerVote: string | null; // championship_team_id of existing vote, null if none
  onClose: () => void;
  onSaved: () => void;
};

const VOTER_LABELS: Record<VoterRole, string> = {
  home_manager: "Cartola da Casa",
  away_manager: "Cartola Visitante",
  referee: "Árbitro",
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

function PlayerPicker({
  players,
  selected,
  onSelect,
}: {
  players: MatchPlayer[];
  selected: MatchPlayer | null;
  onSelect: (p: MatchPlayer) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="🔍 Buscar jogador..."
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-blue-500"
      />
      <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {filtered.map(p => (
          <button
            key={p.registrationId}
            onClick={() => onSelect(p)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all text-left group",
              selected?.registrationId === p.registrationId
                ? "bg-yellow-500/10 border border-yellow-500/30"
                : "hover:bg-zinc-800"
            )}
          >
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden">
              {p.photoUrl ? (
                <img src={p.photoUrl} alt={p.name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-5 w-5 text-zinc-600" />
              )}
              {selected?.registrationId === p.registrationId && (
                <div className="absolute inset-0 flex items-center justify-center bg-yellow-500/20">
                  <Check className="h-4 w-4 text-yellow-400" />
                </div>
              )}
            </div>
            <div>
              <p className={cn(
                "font-bold text-sm",
                selected?.registrationId === p.registrationId ? "text-yellow-400" : "text-white"
              )}>
                {p.name}
              </p>
              {p.position && (
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{p.position}</p>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">Nenhum jogador encontrado.</p>
        )}
      </div>
    </div>
  );
}

function findExisting(existingVotes: ExistingVote[], role: VoterRole, allPlayers: MatchPlayer[]): MatchPlayer | null {
  const vote = existingVotes.find(v => v.voterRole === role);
  if (!vote) return null;
  return allPlayers.find(p => p.registrationId === vote.registrationId) ?? null;
}

export function BestPlayerVoteModal({
  matchId,
  championshipId,
  homeTeam,
  awayTeam,
  homePlayers,
  awayPlayers,
  voteWeight,
  existingVotes,
  existingManagerVote,
  onClose,
  onSaved,
}: Props) {
  const allPlayers = [...homePlayers, ...awayPlayers];

  const [step, setStep] = useState<Step>(1);
  const [homeManagerPick, setHomeManagerPick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "home_manager", awayPlayers)
  );
  const [awayManagerPick, setAwayManagerPick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "away_manager", homePlayers)
  );
  const [refereePick, setRefereePick] = useState<MatchPlayer | null>(
    findExisting(existingVotes, "referee", allPlayers)
  );
  const [managerPick, setManagerPick] = useState<string | null>(existingManagerVote);
  const [saving, setSaving] = useState(false);

  async function handleSubmitPlayers() {
    const votes: { voter_role: VoterRole; registration_id: string }[] = [];
    if (homeManagerPick) votes.push({ voter_role: "home_manager", registration_id: homeManagerPick.registrationId });
    if (awayManagerPick) votes.push({ voter_role: "away_manager", registration_id: awayManagerPick.registrationId });
    if (refereePick) votes.push({ voter_role: "referee", registration_id: refereePick.registrationId });

    if (votes.length === 0) {
      setStep(5);
      return;
    }

    setSaving(true);
    try {
      const rows = votes.map(v => ({
        match_id: matchId,
        championship_id: championshipId,
        registration_id: v.registration_id,
        voter_role: v.voter_role,
        points: voteWeight,
      }));

      const { error } = await supabase
        .from("best_player_votes")
        .upsert(rows, { onConflict: "match_id,voter_role" });

      if (error) throw error;

      toast.success(`${votes.length} voto${votes.length > 1 ? "s" : ""} de craque registrado${votes.length > 1 ? "s" : ""}!`);
      onSaved();
      setStep(5);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar votos");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitManager() {
    if (!managerPick) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("best_manager_votes")
        .upsert(
          [{
            match_id: matchId,
            championship_id: championshipId,
            championship_team_id: managerPick,
            points: voteWeight,
          }],
          { onConflict: "match_id" }
        );

      if (error) throw error;

      toast.success("Voto de cartola registrado!");
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar voto de cartola");
    } finally {
      setSaving(false);
    }
  }

  const STEPS: { step: Step; role: VoterRole; label: string; players: MatchPlayer[]; pick: MatchPlayer | null; setPick: (p: MatchPlayer | null) => void }[] = [
    { step: 1, role: "home_manager", label: `Cartola da Casa (${homeTeam.name})`, players: awayPlayers, pick: homeManagerPick, setPick: setHomeManagerPick },
    { step: 2, role: "away_manager", label: `Cartola Visitante (${awayTeam.name})`, players: homePlayers, pick: awayManagerPick, setPick: setAwayManagerPick },
    { step: 3, role: "referee", label: "Árbitro", players: allPlayers, pick: refereePick, setPick: setRefereePick },
  ];

  const currentStepData = STEPS.find(s => s.step === step);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl md:rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-yellow-500" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Craque da Partida</h3>
            </div>
            <span className="text-[10px] font-bold text-zinc-500 bg-zinc-800 px-2 py-1 rounded-full">
              {voteWeight} pt{voteWeight > 1 ? "s" : ""} por voto
            </span>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1 mb-4">
            {([1, 2, 3, 4, 5, 6] as Step[]).map(s => (
              <div key={s} className={cn(
                "h-1 flex-1 rounded-full transition-all",
                s < step ? "bg-yellow-500" :
                s === step ? "bg-yellow-500/60" : "bg-zinc-800"
              )} />
            ))}
          </div>

          {/* Steps 1-3: Player picker */}
          {step < 4 && currentStepData && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                <span className="text-yellow-500">Voto do {VOTER_LABELS[currentStepData.role]}</span>
                <br />
                <span className="text-xs text-zinc-500">{currentStepData.label} — escolha o destaque</span>
              </p>

              {currentStepData.pick && (
                <div className="mb-2 flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2">
                  <Check className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                  <p className="text-xs font-bold text-yellow-400">{currentStepData.pick.name} selecionado</p>
                </div>
              )}

              <PlayerPicker
                players={currentStepData.players}
                selected={currentStepData.pick}
                onSelect={p => { currentStepData.setPick(p); }}
              />

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => { currentStepData.setPick(null); setStep((step + 1) as Step); }}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Pular
                </button>
                <button
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={!currentStepData.pick}
                  className="flex-[2] rounded-xl bg-yellow-600 py-2.5 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-40 uppercase tracking-wider shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2"
                >
                  Próximo <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Summary + confirm */}
          {step === 4 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar votos</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 divide-y divide-zinc-700/50 mb-5">
                {STEPS.map(s => (
                  <div key={s.role} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{VOTER_LABELS[s.role]}</p>
                      <p className={cn("text-sm font-bold mt-0.5", s.pick ? "text-white" : "text-zinc-600 italic")}>
                        {s.pick ? s.pick.name : "Pulado"}
                      </p>
                    </div>
                    {s.pick && (
                      <span className="text-xs font-black text-yellow-500">+{voteWeight}pt{voteWeight > 1 ? "s" : ""}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSubmitPlayers}
                  disabled={saving}
                  className="flex-[2] rounded-xl bg-yellow-600 py-3 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-yellow-900/20"
                >
                  {saving ? "Salvando..." : "Próximo →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Best Manager pick */}
          {step === 5 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-zinc-300">
                <span className="text-yellow-500 flex items-center gap-1.5">
                  <Briefcase className="h-4 w-4" /> Melhor Cartola
                </span>
                <span className="text-xs text-zinc-500 mt-0.5 block">Escolha o melhor cartola da partida</span>
              </p>

              <div className="space-y-2 mb-4">
                {[
                  { id: homeTeam.championshipTeamId, name: homeTeam.name, label: "Casa" },
                  { id: awayTeam.championshipTeamId, name: awayTeam.name, label: "Visitante" },
                ].map(team => (
                  <button
                    key={team.id}
                    onClick={() => setManagerPick(team.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
                      managerPick === team.id
                        ? "border-yellow-500/50 bg-yellow-500/10"
                        : "border-zinc-800 bg-zinc-900 hover:border-zinc-600"
                    )}
                  >
                    <div className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border",
                      managerPick === team.id ? "border-yellow-500/50 bg-yellow-500/10" : "border-zinc-700 bg-zinc-800"
                    )}>
                      {managerPick === team.id
                        ? <Check className="h-5 w-5 text-yellow-400" />
                        : <Briefcase className="h-5 w-5 text-zinc-500" />
                      }
                    </div>
                    <div>
                      <p className={cn("font-bold text-sm", managerPick === team.id ? "text-yellow-400" : "text-white")}>
                        {team.name}
                      </p>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{team.label}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setManagerPick(null); setStep(6); }}
                  className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Pular
                </button>
                <button
                  onClick={() => setStep(6)}
                  disabled={!managerPick}
                  className="flex-[2] rounded-xl bg-yellow-600 py-2.5 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-40 uppercase tracking-wider shadow-lg shadow-yellow-900/20 flex items-center justify-center gap-2"
                >
                  Próximo <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Best Manager confirm */}
          {step === 6 && (
            <div>
              <p className="mb-4 text-sm font-semibold text-zinc-300">Confirmar Melhor Cartola</p>
              <div className="rounded-2xl border border-zinc-700 bg-zinc-800/50 mb-5">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Melhor Cartola</p>
                    <p className={cn("text-sm font-bold mt-0.5", managerPick ? "text-white" : "text-zinc-600 italic")}>
                      {managerPick
                        ? (managerPick === homeTeam.championshipTeamId ? homeTeam.name : awayTeam.name)
                        : "Pulado"}
                    </p>
                  </div>
                  {managerPick && (
                    <span className="text-xs font-black text-yellow-500">+{voteWeight}pt{voteWeight > 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(5)}
                  className="flex-1 rounded-xl border border-zinc-700 py-3 text-sm font-bold text-zinc-400 hover:bg-zinc-800 transition-all uppercase tracking-wider"
                >
                  Voltar
                </button>
                <button
                  onClick={handleSubmitManager}
                  disabled={saving}
                  className="flex-[2] rounded-xl bg-yellow-600 py-3 text-sm font-black text-white hover:bg-yellow-500 transition-all disabled:opacity-50 uppercase tracking-wider shadow-lg shadow-yellow-900/20"
                >
                  {saving ? "Salvando..." : "✅ Confirmar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
