"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { championshipFormSchema } from "@/features/championships/schema";
import { createChampionship, updateChampionship } from "../actions";
import {
  CHAMPIONSHIP_STATUS,
  STATUS_LABELS,
  type Championship,
  type ChampionshipStatus,
} from "@/types/championship";

type FieldErrors = Record<string, string>;

/** ISO timestamp -> "YYYY-MM-DD" for <input type="date">. */
function toDateInput(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  if (!errors[name]) return null;
  return <p className="mt-1 text-xs text-red-400">{errors[name]}</p>;
}

export function ChampionshipForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: Championship;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});

  const [form, setForm] = useState({
    name: initial?.name ?? "",
    season: initial?.season ?? "",
    description: initial?.description ?? "",
    registration_start_date: toDateInput(initial?.registration_start_date),
    registration_end_date: toDateInput(initial?.registration_end_date),
    gala_night_date: toDateInput(initial?.gala_night_date),
    tournament_start_date: toDateInput(initial?.tournament_start_date),
    max_players: initial?.max_players != null ? String(initial.max_players) : "",
    max_waitlist_players:
      initial?.max_waitlist_players != null ? String(initial.max_waitlist_players) : "0",
    status: (initial?.status as ChampionshipStatus) ?? "draft",
    registration_image_url: initial?.registration_image_url ?? "",
    base_price: initial?.base_price != null ? String(initial.base_price) : "",
    extra_ticket_price: initial?.extra_ticket_price != null ? String(initial.extra_ticket_price) : "",
    groups: (initial?.registration_group_options ?? []) as { label: string; requires_invite_code: boolean }[],
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload() {
    const emptyToUndef = (v: string) => (v.trim() === "" ? undefined : v);
    return {
      name: form.name,
      season: emptyToUndef(form.season),
      description: emptyToUndef(form.description),
      registration_start_date: emptyToUndef(form.registration_start_date),
      registration_end_date: emptyToUndef(form.registration_end_date),
      gala_night_date: emptyToUndef(form.gala_night_date),
      tournament_start_date: emptyToUndef(form.tournament_start_date),
      max_players: emptyToUndef(form.max_players),
      max_waitlist_players: form.max_waitlist_players,
      status: form.status,
      registration_image_url: emptyToUndef(form.registration_image_url),
      base_price: emptyToUndef(form.base_price),
      extra_ticket_price: emptyToUndef(form.extra_ticket_price),
      registration_group_options: form.groups,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = buildPayload();
    const parsed = championshipFormSchema.safeParse(payload);
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "form";
        if (!next[key]) next[key] = issue.message;
      }
      setErrors(next);
      toast.error("Corrija os campos destacados");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "create"
          ? await createChampionship(payload)
          : await updateChampionship({ ...payload, id: initial!.id });

      if (result.ok) {
        toast.success(mode === "create" ? "Campeonato criado" : "Campeonato atualizado");
        router.push("/championships");
        router.refresh();
      } else {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast.error(result.error);
      }
    });
  }

  function addGroup() {
    set("groups", [...form.groups, { label: "", requires_invite_code: false }] as typeof form.groups);
  }
  function updateGroup(i: number, patch: Partial<{ label: string; requires_invite_code: boolean }>) {
    set("groups", form.groups.map((g, idx) => (idx === i ? { ...g, ...patch } : g)) as typeof form.groups);
  }
  function removeGroup(i: number) {
    set("groups", form.groups.filter((_, idx) => idx !== i) as typeof form.groups);
  }

  const inputClass =
    "w-full rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600";
  const labelClass = "mb-1 block text-sm text-zinc-300";

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-8">
      {/* Basic */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Informações básicas</h2>
        <div>
          <label className={labelClass}>Nome</label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
          <FieldError errors={errors} name="name" />
        </div>
        <div>
          <label className={labelClass}>Temporada (ex.: 2026)</label>
          <input
            className={inputClass}
            value={form.season}
            onChange={(e) => set("season", e.target.value)}
          />
          <FieldError errors={errors} name="season" />
        </div>
        <div>
          <label className={labelClass}>Descrição / Regulamento</label>
          <textarea
            className={`${inputClass} min-h-24`}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
          <FieldError errors={errors} name="description" />
        </div>
      </section>

      {/* Dates */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Datas importantes</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Abertura Inscrições</label>
            <input
              type="date"
              className={inputClass}
              value={form.registration_start_date}
              onChange={(e) => set("registration_start_date", e.target.value)}
            />
            <FieldError errors={errors} name="registration_start_date" />
          </div>
          <div>
            <label className={labelClass}>Finalização Inscrições</label>
            <input
              type="date"
              className={inputClass}
              value={form.registration_end_date}
              onChange={(e) => set("registration_end_date", e.target.value)}
            />
            <FieldError errors={errors} name="registration_end_date" />
          </div>
          <div>
            <label className={labelClass}>Noite de Gala</label>
            <input
              type="date"
              className={inputClass}
              value={form.gala_night_date}
              onChange={(e) => set("gala_night_date", e.target.value)}
            />
            <FieldError errors={errors} name="gala_night_date" />
          </div>
          <div>
            <label className={labelClass}>Jogos (início do torneio)</label>
            <input
              type="date"
              className={inputClass}
              value={form.tournament_start_date}
              onChange={(e) => set("tournament_start_date", e.target.value)}
            />
            <FieldError errors={errors} name="tournament_start_date" />
          </div>
        </div>
      </section>

      {/* Capacity */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Capacidade</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Máx. de jogadores</label>
            <input
              type="number"
              min={1}
              className={inputClass}
              value={form.max_players}
              onChange={(e) => set("max_players", e.target.value)}
            />
            <FieldError errors={errors} name="max_players" />
          </div>
          <div>
            <label className={labelClass}>Máx. lista de espera</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.max_waitlist_players}
              onChange={(e) => set("max_waitlist_players", e.target.value)}
            />
            <FieldError errors={errors} name="max_waitlist_players" />
          </div>
        </div>
      </section>

      {/* Status */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Status</h2>
        <select
          className={inputClass}
          value={form.status}
          onChange={(e) => set("status", e.target.value as ChampionshipStatus)}
        >
          {CHAMPIONSHIP_STATUS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <FieldError errors={errors} name="status" />
      </section>

      {/* Inscrição */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Inscrição</h2>

        <div>
          <label className={labelClass}>Imagem da inscrição (URL)</label>
          <input
            className={inputClass}
            value={form.registration_image_url}
            onChange={(e) => set("registration_image_url", e.target.value)}
          />
          <FieldError errors={errors} name="registration_image_url" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Valor base (R$)</label>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.base_price}
              onChange={(e) => set("base_price", e.target.value)}
            />
            <FieldError errors={errors} name="base_price" />
          </div>
          <div>
            <label className={labelClass}>Valor ingresso extra (R$)</label>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={form.extra_ticket_price}
              onChange={(e) => set("extra_ticket_price", e.target.value)}
            />
            <FieldError errors={errors} name="extra_ticket_price" />
          </div>
        </div>

        <div className="space-y-2">
          <label className={labelClass}>Grupos / afiliações</label>
          {form.groups.map((g, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                className={inputClass}
                placeholder="Ex.: IASD Campolim"
                value={g.label}
                onChange={(e) => updateGroup(i, { label: e.target.value })}
              />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={g.requires_invite_code}
                  onChange={(e) => updateGroup(i, { requires_invite_code: e.target.checked })}
                />
                exige código
              </label>
              <button type="button" onClick={() => removeGroup(i)} className="px-2 text-red-400">
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addGroup} className="text-xs text-emerald-400">
            + adicionar grupo
          </button>
          <FieldError errors={errors} name="registration_group_options" />
        </div>
      </section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-green-600 px-6 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/championships")}
          className="rounded-xl bg-zinc-700 px-6 py-2 font-medium hover:bg-zinc-600"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
