"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { GroupOption } from "@/types/championship";
import { isValidCpf, formatCpf } from "@/lib/cpf";
import { groupRequiresInviteCode } from "@/features/registration/groups";
import { skillsFor, SKILL_LABELS } from "@/features/registration/skills";
import { computeTicketsTotal } from "@/features/registration/pricing";
import { isMinor } from "@/features/registration/minor";
import { lookupCpfAction, submitRegistrationAction } from "./actions";
import StepShell from "./steps/StepShell";
import SkillStars from "./steps/SkillStars";
import UploadCard from "./steps/UploadCard";

export type WizardChampionship = {
  id: string; name: string; slug: string;
  base_price: number | null; extra_ticket_price: number | null;
  max_players: number | null; registration_image_url: string | null;
  registration_group_options: GroupOption[];
};

const EMPTY = {
  cpf: "", name: "", shirt_name: "", email: "", whatsapp: "", birth_date: "",
  birth_state: "", instagram: "", preferred_position: "Meia",
  height: "", weight: "", group_affiliation: "", invite_code: "",
  extra_tickets_count: 0,
  skills: {} as Record<string, number>,
  profile_photo_link: "", payment_receipt_link: "", legal_authorization_link: "",
};

const input =
  "w-full rounded-xl px-3 py-3 text-base bg-white/5 border border-white/10 text-[var(--gala-ink)] outline-none focus:border-[var(--gala-gold-2)]";

export default function RegistrationWizard({
  championship, liveCount,
}: { championship: WizardChampionship; liveCount: number }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [step, setStep] = useState(1);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [looking, setLooking] = useState(false);

  const isFull = championship.max_players != null && liveCount >= championship.max_players;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  const open = (n: number) => setStep((s) => (s === n ? 0 : n));
  const advance = (from: number) => { setDone((d) => ({ ...d, [from]: true })); setStep(from + 1); };

  async function onCpfContinue() {
    if (!isValidCpf(form.cpf)) { toast.error("CPF inválido"); return; }
    setLooking(true);
    try {
      const res = await lookupCpfAction(form.cpf);
      if (res.exists) {
        const p = res.player;
        setForm((prev) => ({
          ...prev,
          name: p.name ?? "", shirt_name: p.shirt_name ?? "", email: p.email ?? "",
          whatsapp: p.whatsapp ?? "", birth_date: (p.birth_date ?? "").slice(0, 10),
          birth_state: p.birth_state ?? "", instagram: p.instagram ?? "",
          preferred_position: p.preferred_position ?? "Meia",
          height: p.height != null ? String(p.height) : "",
          weight: p.weight != null ? String(p.weight) : "",
        }));
        toast.success("Encontramos você! Confira seus dados.");
      }
      advance(1);
    } catch {
      toast.error("Não foi possível verificar o CPF. Tente novamente.");
    } finally { setLooking(false); }
  }

  const needsInvite = groupRequiresInviteCode(championship.registration_group_options, form.group_affiliation);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; isWaitlist?: boolean } | null>(null);
  const activeSkills = skillsFor(form.preferred_position);
  const total = computeTicketsTotal({
    basePrice: championship.base_price,
    extraTicketPrice: championship.extra_ticket_price,
    extraTicketsCount: form.extra_tickets_count,
  });
  const minor = form.birth_date ? isMinor(form.birth_date) : false;

  function setSkill(skill: string, v: number) {
    setForm((p) => ({ ...p, skills: { ...p.skills, [skill]: v } }));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const payload = {
        championship_slug: championship.slug,
        cpf: form.cpf, name: form.name, shirt_name: form.shirt_name,
        email: form.email, whatsapp: form.whatsapp, birth_date: form.birth_date,
        birth_state: form.birth_state, instagram: form.instagram,
        preferred_position: form.preferred_position,
        height: form.height, weight: form.weight,
        group_affiliation: form.group_affiliation, invite_code: form.invite_code,
        skills: Object.fromEntries(activeSkills.map((s) => [s, form.skills[s] ?? 1])),
        extra_tickets_count: form.extra_tickets_count,
        profile_photo_link: form.profile_photo_link,
        payment_receipt_link: form.payment_receipt_link,
        legal_authorization_link: form.legal_authorization_link,
      };
      const res = await submitRegistrationAction(payload);
      if (res.ok) {
        setResult({ ok: true, isWaitlist: res.isWaitlist });
      } else {
        toast.error(res.error);
      }
    } catch {
      toast.error("Não foi possível concluir a inscrição. Tente novamente.");
    } finally { setSubmitting(false); }
  }

  if (result?.ok) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Inscrição concluída!</h1>
        <p className="text-sm text-[var(--gala-ink-dim)] max-w-sm">
          {result.isWaitlist
            ? "Você entrou na LISTA DE ESPERA. Avisaremos se uma vaga abrir."
            : "Sua inscrição foi registrada com sucesso. Nos vemos em campo!"}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pb-24 pt-6">
      {championship.registration_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={championship.registration_image_url} alt={championship.name}
             className="w-full h-40 object-cover rounded-2xl mb-4" />
      )}
      <h1 className="text-xl font-extrabold text-[var(--gala-gold-2)] mb-1">Inscrição</h1>
      <p className="text-sm text-[var(--gala-ink-dim)] mb-4">{championship.name}</p>

      {isFull && (
        <div className="mb-4 rounded-xl px-3 py-2 text-xs"
             style={{ background: "rgba(230,180,34,.1)", border: "1px solid rgba(230,180,34,.35)", color: "var(--gala-gold-2)" }}>
          ⚠︎ Vagas esgotadas — você entrará na LISTA DE ESPERA.
        </div>
      )}

      <div className="space-y-3">
        <StepShell index={1} title="CPF" open={step === 1} done={!!done[1]} onToggle={() => open(1)}>
          <input className={input} inputMode="numeric" placeholder="000.000.000-00"
                 value={form.cpf} onChange={(e) => set("cpf", formatCpf(e.target.value))} />
          <button onClick={onCpfContinue} disabled={looking}
                  className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            {looking ? "Buscando…" : "Continuar"}
          </button>
        </StepShell>

        <StepShell index={2} title="Dados pessoais" open={step === 2} done={!!done[2]} onToggle={() => open(2)}>
          <input className={input} placeholder="Nome completo" value={form.name} onChange={(e) => set("name", e.target.value)} />
          <input className={input} placeholder="Nome da camisa" value={form.shirt_name} onChange={(e) => set("shirt_name", e.target.value)} />
          <input className={input} placeholder="E-mail" value={form.email} onChange={(e) => set("email", e.target.value)} />
          <input className={input} placeholder="WhatsApp" value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} />
          <input className={input} type="date" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
          <input className={input} placeholder="Estado de nascimento" value={form.birth_state} onChange={(e) => set("birth_state", e.target.value)} />
          <input className={input} placeholder="Instagram (opcional)" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          <select className={input} value={form.group_affiliation} onChange={(e) => set("group_affiliation", e.target.value)}>
            <option value="">Selecione seu grupo…</option>
            {championship.registration_group_options.map((g) => (
              <option key={g.label} value={g.label}>{g.label}</option>
            ))}
          </select>
          {needsInvite && (
            <input className={input} placeholder="Código de convite" value={form.invite_code} onChange={(e) => set("invite_code", e.target.value)} />
          )}
          <button onClick={() => advance(2)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            Continuar
          </button>
        </StepShell>

        <StepShell index={3} title="Perfil de jogo" open={step === 3} done={!!done[3]} onToggle={() => open(3)}>
          <select className={input} value={form.preferred_position} onChange={(e) => set("preferred_position", e.target.value)}>
            <option>Zagueiro</option><option>Meia</option><option>Atacante</option><option>Goleiro</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <input className={input} inputMode="decimal" placeholder="Altura (m)" value={form.height} onChange={(e) => set("height", e.target.value)} />
            <input className={input} inputMode="decimal" placeholder="Peso (kg)" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
          </div>
          {activeSkills.map((s) => (
            <div key={s} className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="text-sm text-[var(--gala-ink)]">{SKILL_LABELS[s]}</span>
              <SkillStars value={form.skills[s] ?? 0} onChange={(v) => setSkill(s, v)} />
            </div>
          ))}
          <button onClick={() => advance(3)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>Continuar</button>
        </StepShell>

        <StepShell index={4} title="Ingressos & pagamento" open={step === 4} done={!!done[4]} onToggle={() => open(4)}>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3">
            <span className="text-sm">Ingressos extras (Noite de Gala)</span>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => set("extra_tickets_count", Math.max(0, form.extra_tickets_count - 1))}
                      className="w-8 h-8 rounded-lg font-bold text-[#050507]" style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>–</button>
              <b>{form.extra_tickets_count}</b>
              <button type="button" onClick={() => set("extra_tickets_count", form.extra_tickets_count + 1)}
                      className="w-8 h-8 rounded-lg font-bold text-[#050507]" style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>+</button>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3">
            <span className="text-sm text-[var(--gala-ink-dim)]">Total</span>
            <b className="text-[var(--gala-gold-2)]">R$ {total.toFixed(2)}</b>
          </div>
          <UploadCard icon="📷" label="Foto de perfil (3x4)" hint="Toque para enviar" required bucket="registration-photos"
                      value={form.profile_photo_link} onChange={(u) => set("profile_photo_link", u)} />
          {total > 0 && (
            <UploadCard icon="🧾" label="Comprovante de pagamento" hint="PIX / transferência" required bucket="registration-docs"
                        value={form.payment_receipt_link} onChange={(u) => set("payment_receipt_link", u)} />
          )}
          {minor && (
            <UploadCard icon="📝" label="Autorização do responsável" hint="Obrigatório para menores" required bucket="registration-docs"
                        value={form.legal_authorization_link} onChange={(u) => set("legal_authorization_link", u)} />
          )}
          <button onClick={() => advance(4)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>Revisar</button>
        </StepShell>

        <StepShell index={5} title="Revisão & envio" open={step === 5} done={false} onToggle={() => open(5)}>
          <div className="text-sm text-[var(--gala-ink-dim)] space-y-1">
            <div><b className="text-[var(--gala-ink)]">{form.name || "—"}</b> · {form.preferred_position}</div>
            <div>{form.group_affiliation || "—"}</div>
            <div>Total: R$ {total.toFixed(2)}{isFull ? " · Lista de espera" : ""}</div>
          </div>
          <button onClick={onSubmit} disabled={submitting}
                  className="w-full rounded-xl py-3 font-black uppercase tracking-wide text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            {submitting ? "Enviando…" : "Enviar inscrição"}
          </button>
        </StepShell>
      </div>
    </div>
  );
}
