"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  X, Save, GripVertical, Trophy, Clock, Target, 
  Settings2, ChevronRight, AlertCircle 
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Phase, TieBreakerCriterion } from "@/types/championship";

const supabase = createClient();

type Props = {
  phase: Phase;
  onClose: () => void;
};

const CRITERIA_OPTIONS: { value: TieBreakerCriterion; label: string; description: string }[] = [
  { value: "points", label: "Pontos", description: "Maior número de pontos conquistados." },
  { value: "goal_diff", label: "Saldo de Gols", description: "Gols marcados menos gols sofridos." },
  { value: "goals_for", label: "Gols Pró", description: "Maior número de gols marcados." },
  { value: "wins", label: "Vitórias", description: "Maior número de vitórias." },
  { value: "head_to_head", label: "Confronto Direto", description: "Resultado entre as equipes empatadas." },
  { value: "goals_against", label: "Gols Contra", description: "Menor número de gols sofridos." },
];

export function PhaseConfigDrawer({ phase, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Group rules state
  const [rules, setRules] = useState<{ id?: string; rule: TieBreakerCriterion; priority: number }[]>([]);
  
  // Knockout settings state
  const [knockoutSettings, setKnockoutSettings] = useState({
    has_extra_time: false,
    has_penalties: true
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      if (phase.type === "group") {
        const { data } = await supabase
          .from("tie_breaker_rules")
          .select("*")
          .eq("phase_id", phase.id)
          .order("priority");
        
        if (data && data.length > 0) {
          setRules(data.map(r => ({ id: r.id, rule: r.rule as TieBreakerCriterion, priority: r.priority })));
        } else {
          // Default rules if none exist
          setRules([
            { rule: "points", priority: 1 },
            { rule: "goal_diff", priority: 2 },
            { rule: "goals_for", priority: 3 },
          ]);
        }
      } else {
        const { data } = await supabase
          .from("phase_knockout_settings")
          .select("has_extra_time, has_penalties")
          .eq("phase_id", phase.id)
          .single();
        
        if (data) {
          setKnockoutSettings({
            has_extra_time: !!data.has_extra_time,
            has_penalties: !!data.has_penalties
          });
        }
      }
      setLoading(false);
    }
    load();
  }, [phase]);

  async function handleSave() {
    setSaving(true);
    try {
      if (phase.type === "group") {
        // Delete old rules and insert new ones (simpler than update)
        await supabase.from("tie_breaker_rules").delete().eq("phase_id", phase.id);
        const { error } = await supabase.from("tie_breaker_rules").insert(
          rules.map((r, idx) => ({
            phase_id: phase.id,
            rule: r.rule,
            priority: idx + 1
          }))
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("phase_knockout_settings")
          .update(knockoutSettings)
          .eq("phase_id", phase.id);
        if (error) throw error;
      }
      toast.success("Configurações aplicadas com sucesso");
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function moveRule(index: number, direction: 'up' | 'down') {
    const newRules = [...rules];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rules.length) return;
    
    [newRules[index], newRules[targetIndex]] = [newRules[targetIndex], newRules[index]];
    setRules(newRules);
  }

  function addRule(rule: TieBreakerCriterion) {
    if (rules.some(r => r.rule === rule)) return;
    setRules([...rules, { rule, priority: rules.length + 1 }]);
  }

  function removeRule(rule: TieBreakerCriterion) {
    setRules(rules.filter(r => r.rule !== rule));
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative h-full w-full max-w-md bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/10 rounded-lg">
              <Settings2 className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white uppercase tracking-tight">{phase.name}</h2>
              <p className="text-xs text-zinc-500">Configurações avançadas da fase.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-zinc-600">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <p className="text-xs font-medium">Carregando...</p>
            </div>
          ) : phase.type === "group" ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5" /> Critérios de Desempate
                </h3>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Defina a ordem de prioridade para classificar os times em caso de empate na pontuação.
                </p>
              </div>

              <div className="space-y-2">
                {rules.map((rule, idx) => (
                  <div key={rule.rule} className="group flex items-center gap-3 bg-zinc-900 border border-zinc-800 p-3 rounded-xl hover:border-zinc-700 transition-all">
                    <div className="flex flex-col gap-1">
                      <button onClick={() => moveRule(idx, 'up')} disabled={idx === 0} className="text-zinc-600 hover:text-blue-500 disabled:opacity-0 transition-all">
                        <ChevronRight className="h-3 w-3 -rotate-90" />
                      </button>
                      <button onClick={() => moveRule(idx, 'down')} disabled={idx === rules.length - 1} className="text-zinc-600 hover:text-blue-500 disabled:opacity-0 transition-all">
                        <ChevronRight className="h-3 w-3 rotate-90" />
                      </button>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white">{CRITERIA_OPTIONS.find(o => o.value === rule.rule)?.label}</p>
                      <p className="text-[10px] text-zinc-500">{CRITERIA_OPTIONS.find(o => o.value === rule.rule)?.description}</p>
                    </div>
                    <button onClick={() => removeRule(rule.rule)} className="p-2 text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              {rules.length < CRITERIA_OPTIONS.length && (
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-[10px] font-bold text-zinc-600 uppercase mb-3">Adicionar Critério</p>
                  <div className="flex flex-wrap gap-2">
                    {CRITERIA_OPTIONS.filter(opt => !rules.some(r => r.rule === opt.value)).map(opt => (
                      <button key={opt.value} onClick={() => addRule(opt.value)}
                        className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-[11px] font-medium text-zinc-400 hover:text-white hover:border-blue-500 transition-all">
                        + {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" /> Empate no Mata-Mata
                </h3>
                
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-all">
                    <input type="checkbox" className="mt-1" checked={knockoutSettings.has_extra_time}
                      onChange={e => setKnockoutSettings({...knockoutSettings, has_extra_time: e.target.checked})} />
                    <div>
                      <p className="text-sm font-bold text-white">Prorrogação</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">Se ativado, haverá 2 tempos extras antes dos pênaltis.</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 rounded-2xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-all">
                    <input type="checkbox" className="mt-1" checked={knockoutSettings.has_penalties}
                      onChange={e => setKnockoutSettings({...knockoutSettings, has_penalties: e.target.checked})} />
                    <div>
                      <p className="text-sm font-bold text-white">Disputa de Pênaltis</p>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">Define se o jogo pode ser decidido nos pênaltis em caso de empate persistente.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-600/5 border border-blue-600/20 flex gap-3">
                <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-blue-200/70 leading-relaxed">
                  As configurações de empate afetam o fluxo da súmula ao vivo, adicionando novos períodos automaticamente.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-zinc-800 bg-zinc-900/30">
          <button onClick={handleSave} disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 py-3 rounded-xl text-sm font-black text-white uppercase tracking-widest transition-all shadow-lg shadow-blue-900/20">
            {saving ? "Salvando..." : (
              <>
                <Save className="h-4 w-4" />
                Salvar Configurações
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
