"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { baseChampionshipObject, championshipFormSchema } from "@/features/championships/schema";
import { derivedCapacity } from "@/features/championships/capacity";
import { createChampionship, updateChampionship } from "../actions";
import {
  CHAMPIONSHIP_STATUS,
  STATUS_LABELS,
  type Championship,
  type ChampionshipStatus,
} from "@/types/championship";
import { brasiliaInputToIso, isoToBrasiliaInput } from "@/lib/datetime-br";
import { MAX_PIX_KEY } from "@/lib/pix";

type FieldErrors = Record<string, string>;

function FieldError({ errors, name }: { errors: FieldErrors; name: string }) {
  if (!errors[name]) return null;
  return <p className="mt-1 text-xs text-red-400">{errors[name]}</p>;
}

/**
 * Os cinco campos do formato, recortados do MESMO schema que o servidor usa.
 *
 * Serve para o resumo mostrar o numero que sera GRAVADO, e nao o que esta
 * digitado. A diferenca e real e cabe num campo so: limpar "Goleiros por time"
 * manda `undefined`, o `.default(1)` do Zod repoe 1, e `toRow` grava 1 — mas
 * `Number("")` e 0. Sem passar pelo recorte, a tela diria "0 de goleiro" num
 * campeonato que salva 8.
 *
 * E recorte, e nao copia dos defaults: `goalkeepers_per_team` ja tem duas
 * fontes (o `.default(1)` do Zod e o `DEFAULT 1` da DDL), e uma terceira escrita
 * a mao aqui seria a que ninguem lembraria de atualizar.
 */
const CAPACITY_FIELDS = baseChampionshipObject.pick({
  teams_count: true,
  players_per_team: true,
  goalkeepers_per_team: true,
  waitlist_goalkeepers: true,
  waitlist_outfield: true,
});

/**
 * O formato que o resumo assume quando o recorte NAO passa.
 *
 * So ha um jeito de chegar aqui: numero negativo, que o `.min(0)` recusa
 * (`type="number"` com `min={0}` nao impede digitar "-5", so marca o campo como
 * invalido). O desfecho e o mesmo que os numeros crus dariam, porque o
 * `boundedInt` de `derivedCapacity` tambem leva negativo a zero — e o admin ve
 * a recusa do campo ao salvar, com a mensagem do proprio Zod.
 */
const ZERO_FORMAT = {
  teams_count: 0,
  players_per_team: 0,
  goalkeepers_per_team: 0,
  waitlist_goalkeepers: 0,
  waitlist_outfield: 0,
};

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
    registration_start_date: isoToBrasiliaInput(initial?.registration_start_date),
    registration_end_date: isoToBrasiliaInput(initial?.registration_end_date),
    gala_night_date: isoToBrasiliaInput(initial?.gala_night_date),
    tournament_start_date: isoToBrasiliaInput(initial?.tournament_start_date),
    // O formato, e nao o total: `max_players` e `max_waitlist_players` saem do
    // estado porque `toRow` os DERIVA daqui. Um input para eles criaria duas
    // fontes para a mesma coluna, e a que perde e a que o admin digitou.
    //
    // Os defaults sao os do seed, e nao os do Zod (que traz a espera em 0/0):
    // campeonato novo ja nasce com um formato plausivel em vez de zero vaga.
    teams_count: initial?.teams_count != null ? String(initial.teams_count) : "8",
    players_per_team:
      initial?.players_per_team != null ? String(initial.players_per_team) : "10",
    goalkeepers_per_team:
      initial?.goalkeepers_per_team != null ? String(initial.goalkeepers_per_team) : "1",
    waitlist_goalkeepers:
      initial?.waitlist_goalkeepers != null ? String(initial.waitlist_goalkeepers) : "1",
    waitlist_outfield:
      initial?.waitlist_outfield != null ? String(initial.waitlist_outfield) : "4",
    max_extra_tickets:
      initial?.max_extra_tickets != null ? String(initial.max_extra_tickets) : "4",
    status: (initial?.status as ChampionshipStatus) ?? "draft",
    registration_image_url: initial?.registration_image_url ?? "",
    base_price: initial?.base_price != null ? String(initial.base_price) : "",
    extra_ticket_price: initial?.extra_ticket_price != null ? String(initial.extra_ticket_price) : "",
    pix_key: initial?.pix_key ?? "",
    pix_merchant_name: initial?.pix_merchant_name ?? "",
    pix_merchant_city: initial?.pix_merchant_city ?? "",
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
      registration_start_date: brasiliaInputToIso(form.registration_start_date),
      registration_end_date: brasiliaInputToIso(form.registration_end_date),
      gala_night_date: brasiliaInputToIso(form.gala_night_date),
      tournament_start_date: brasiliaInputToIso(form.tournament_start_date),
      teams_count: emptyToUndef(form.teams_count),
      players_per_team: emptyToUndef(form.players_per_team),
      goalkeepers_per_team: emptyToUndef(form.goalkeepers_per_team),
      waitlist_goalkeepers: emptyToUndef(form.waitlist_goalkeepers),
      waitlist_outfield: emptyToUndef(form.waitlist_outfield),
      max_extra_tickets: emptyToUndef(form.max_extra_tickets),
      status: form.status,
      registration_image_url: emptyToUndef(form.registration_image_url),
      base_price: emptyToUndef(form.base_price),
      extra_ticket_price: emptyToUndef(form.extra_ticket_price),
      pix_key: emptyToUndef(form.pix_key),
      pix_merchant_name: emptyToUndef(form.pix_merchant_name),
      pix_merchant_city: emptyToUndef(form.pix_merchant_city),
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

  // A capacidade do resumo sai da MESMA funcao que `toRow` chama para gravar as
  // colunas, alimentada pelo MESMO payload que vai para o servidor. Refazer a
  // conta aqui (`times * jogadores`) daria outro numero assim que o formato
  // saisse da faixa: `boundedInt` tem piso e teto, e `goalkeepers` passa por um
  // `Math.min` com o total.
  const parsedFormat = CAPACITY_FIELDS.safeParse(buildPayload());
  const format = parsedFormat.success ? parsedFormat.data : ZERO_FORMAT;
  const capacity = derivedCapacity({
    // `?? 0` pelo mesmo motivo de `toRow`: as duas colunas sao nulaveis, e
    // formato nao configurado vale zero vaga.
    teamsCount: format.teams_count ?? 0,
    playersPerTeam: format.players_per_team ?? 0,
    goalkeepersPerTeam: format.goalkeepers_per_team,
    waitlistGoalkeepers: format.waitlist_goalkeepers,
    waitlistOutfield: format.waitlist_outfield,
  });

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
              type="datetime-local"
              className={inputClass}
              value={form.registration_start_date}
              onChange={(e) => set("registration_start_date", e.target.value)}
            />
            <FieldError errors={errors} name="registration_start_date" />
          </div>
          <div>
            <label className={labelClass}>Finalização Inscrições</label>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.registration_end_date}
              onChange={(e) => set("registration_end_date", e.target.value)}
            />
            <FieldError errors={errors} name="registration_end_date" />
          </div>
          <div>
            <label className={labelClass}>Noite de Gala</label>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.gala_night_date}
              onChange={(e) => set("gala_night_date", e.target.value)}
            />
            <FieldError errors={errors} name="gala_night_date" />
          </div>
          <div>
            <label className={labelClass}>Jogos (início do torneio)</label>
            <input
              type="datetime-local"
              className={inputClass}
              value={form.tournament_start_date}
              onChange={(e) => set("tournament_start_date", e.target.value)}
            />
            <FieldError errors={errors} name="tournament_start_date" />
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Horário de Brasília. A hora conta: para encerrar no fim do dia, use 23:59.
        </p>
      </section>

      {/* Capacity */}
      <section className="space-y-4 rounded-2xl bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Capacidade</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelClass}>Times</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.teams_count}
              onChange={(e) => set("teams_count", e.target.value)}
            />
            <FieldError errors={errors} name="teams_count" />
          </div>
          <div>
            <label className={labelClass}>Jogadores por time</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.players_per_team}
              onChange={(e) => set("players_per_team", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">O goleiro conta.</p>
            <FieldError errors={errors} name="players_per_team" />
          </div>
          <div>
            <label className={labelClass}>Goleiros por time</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.goalkeepers_per_team}
              onChange={(e) => set("goalkeepers_per_team", e.target.value)}
            />
            <FieldError errors={errors} name="goalkeepers_per_team" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Espera — goleiros</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.waitlist_goalkeepers}
              onChange={(e) => set("waitlist_goalkeepers", e.target.value)}
            />
            <FieldError errors={errors} name="waitlist_goalkeepers" />
          </div>
          <div>
            <label className={labelClass}>Espera — linha</label>
            <input
              type="number"
              min={0}
              className={inputClass}
              value={form.waitlist_outfield}
              onChange={(e) => set("waitlist_outfield", e.target.value)}
            />
            <FieldError errors={errors} name="waitlist_outfield" />
          </div>
        </div>

        {/* O resumo. Só leitura: o total e a lista de espera são derivados, e um
            campo para eles criaria duas fontes para a mesma coluna. */}
        <div className="rounded-xl bg-zinc-800/60 px-4 py-3 text-sm">
          {capacity.total === 0 ? (
            <p className="text-zinc-400">
              Sem vagas: do jeito que está, o campeonato fica fechado para inscrição — e a
              lista de espera fica vazia junto.
            </p>
          ) : (
            <>
              <p className="text-zinc-100">
                {capacity.total} {capacity.total === 1 ? "vaga" : "vagas"} —{" "}
                {capacity.goalkeepers} de goleiro e {capacity.outfield} de linha
              </p>
              <p className="text-zinc-400">{capacity.waitlistTotal} na lista de espera</p>
            </>
          )}
        </div>

        <div>
          <label className={labelClass}>Máximo de ingressos extras por inscrição</label>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.max_extra_tickets}
            onChange={(e) => set("max_extra_tickets", e.target.value)}
          />
          <FieldError errors={errors} name="max_extra_tickets" />
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

        <div>
          <label className={labelClass}>Chave PIX do recebedor</label>
          <input
            className={inputClass}
            placeholder="e-mail, CPF, telefone ou chave aleatória"
            value={form.pix_key}
            onChange={(e) => set("pix_key", e.target.value)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Usada para montar o QR Code do PIX na inscrição, já com o valor total calculado.
            Máximo de {MAX_PIX_KEY} caracteres.
          </p>
          <FieldError errors={errors} name="pix_key" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Nome do recebedor</label>
            <input
              className={inputClass}
              maxLength={25}
              placeholder="como aparece no PIX"
              value={form.pix_merchant_name}
              onChange={(e) => set("pix_merchant_name", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">Máximo de 25 caracteres.</p>
            <FieldError errors={errors} name="pix_merchant_name" />
          </div>
          <div>
            <label className={labelClass}>Cidade do recebedor</label>
            <input
              className={inputClass}
              maxLength={15}
              placeholder="Sorocaba"
              value={form.pix_merchant_city}
              onChange={(e) => set("pix_merchant_city", e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">Máximo de 15 caracteres.</p>
            <FieldError errors={errors} name="pix_merchant_city" />
          </div>
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
            <div key={i}>
              <div className="flex items-center gap-2">
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
              <FieldError errors={errors} name={`registration_group_options.${i}.label`} />
            </div>
          ))}
          <button type="button" onClick={addGroup} className="text-xs text-emerald-400">
            + adicionar grupo
          </button>
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
