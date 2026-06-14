"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { MonitorPlay, Save, RotateCcw, ChevronUp, ChevronDown, Eye, EyeOff } from "lucide-react";
import {
  CAROUSEL_CARD_CATALOG,
  CARD_DURATION_MIN_MS,
  CARD_DURATION_MAX_MS,
  resolveCarouselConfig,
  type CarouselCardConfig,
  type SavedCarouselCard,
} from "@/lib/public/carousel";

const supabase = createClient();

// Map com chave string para lookup por card.id (que é string em CarouselCardConfig)
const LABELS = new Map<string, string>(CAROUSEL_CARD_CATALOG.map((c) => [c.id, c.label]));
const MIN_S = CARD_DURATION_MIN_MS / 1000;
const MAX_S = CARD_DURATION_MAX_MS / 1000;

// Seção de configuração do carrossel do telão (área protegida)
export default function CarouselConfigSection({ championshipId }: { championshipId: string }) {
  // Inicia no padrão (sem flash de lista vazia enquanto carrega); o fetch sobrescreve
  const [cards, setCards] = useState<CarouselCardConfig[]>(() => resolveCarouselConfig(null));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("championships").select("carousel_config").eq("id", championshipId).maybeSingle();
      if (cancelled) return;
      setCards(resolveCarouselConfig((data?.carousel_config ?? null) as SavedCarouselCard[] | null));
    })();
    return () => { cancelled = true; };
  }, [championshipId]);

  function toggleEnabled(i: number) {
    setCards((cs) => cs.map((c, idx) => (idx === i ? { ...c, enabled: !c.enabled } : c)));
  }

  // Durante a digitação aceita o valor livremente (guarda só NaN)
  function setSeconds(i: number, raw: string) {
    const sec = parseInt(raw, 10);
    setCards((cs) =>
      cs.map((c, idx) => (idx === i ? { ...c, durationMs: Number.isNaN(sec) ? c.durationMs : sec * 1000 } : c)),
    );
  }

  // Ao sair do campo, fixa a duração na faixa permitida (3–120s)
  function clampSeconds(i: number) {
    setCards((cs) =>
      cs.map((c, idx) =>
        idx === i
          ? { ...c, durationMs: Math.min(CARD_DURATION_MAX_MS, Math.max(CARD_DURATION_MIN_MS, c.durationMs)) }
          : c,
      ),
    );
  }

  function move(i: number, dir: "up" | "down") {
    const target = dir === "up" ? i - 1 : i + 1;
    if (target < 0 || target >= cards.length) return;
    setCards((cs) => {
      const next = [...cs];
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    // Clampa a duração antes de salvar (a UI pode ter valores fora da faixa)
    const payload = cards.map((c) => ({
      id: c.id,
      durationMs: Math.min(CARD_DURATION_MAX_MS, Math.max(CARD_DURATION_MIN_MS, c.durationMs)),
      enabled: c.enabled,
    }));
    const { error } = await supabase
      .from("championships").update({ carousel_config: payload }).eq("id", championshipId);
    setSaving(false);
    if (error) toast.error("Erro ao salvar o carrossel");
    else toast.success("Carrossel salvo com sucesso");
  }

  async function handleRestore() {
    setSaving(true);
    const { error } = await supabase
      .from("championships").update({ carousel_config: null }).eq("id", championshipId);
    setSaving(false);
    if (error) { toast.error("Erro ao restaurar o padrão"); return; }
    setCards(resolveCarouselConfig(null));
    toast.success("Carrossel restaurado para o padrão");
  }

  const noneVisible = cards.length > 0 && cards.every((c) => !c.enabled);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="p-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/30">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-600/10 rounded-lg">
            <MonitorPlay className="h-5 w-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Carrossel do Telão</h2>
            <p className="text-xs text-zinc-500">Ordem, duração e visibilidade dos cards da tela ao vivo.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestore}
            disabled={saving}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 px-3 py-2 rounded-xl text-xs font-bold text-zinc-200 border border-zinc-700 transition-all"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-purple-900/20"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-2">
        {noneVisible ? (
          <p className="mb-3 rounded-lg border border-yellow-700/40 bg-yellow-900/20 px-3 py-2 text-xs text-yellow-300">
            Nenhum card visível — o telão ficará vazio.
          </p>
        ) : null}

        {cards.map((card, i) => (
          <div
            key={card.id}
            className={`flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 ${card.enabled ? "" : "opacity-50"}`}
          >
            <div className="flex flex-col">
              <button
                onClick={() => move(i, "up")}
                disabled={i === 0}
                className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-30"
                title="Subir"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                onClick={() => move(i, "down")}
                disabled={i === cards.length - 1}
                className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-30"
                title="Descer"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>

            <span className="w-5 text-center text-xs font-bold text-zinc-600">{i + 1}</span>
            <span className="flex-1 text-sm font-semibold text-white">{LABELS.get(card.id) ?? card.id}</span>

            <label className="flex items-center gap-2 text-xs text-zinc-400">
              Duração (s)
              <input
                type="number"
                min={MIN_S}
                max={MAX_S}
                value={Math.round(card.durationMs / 1000)}
                onChange={(e) => setSeconds(i, e.target.value)}
                onBlur={() => clampSeconds(i)}
                className="w-16 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-purple-500"
              />
            </label>

            <button
              onClick={() => toggleEnabled(i)}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                card.enabled ? "bg-emerald-600/20 text-emerald-300" : "bg-zinc-800 text-zinc-400"
              }`}
              title={card.enabled ? "Visível" : "Oculto"}
            >
              {card.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {card.enabled ? "Visível" : "Oculto"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
