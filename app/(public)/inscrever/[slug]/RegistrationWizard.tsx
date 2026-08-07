"use client";
import { useState } from "react";
import { toast } from "sonner";
import type { GroupOption } from "@/types/championship";
import { isValidCpf, formatCpf } from "@/lib/cpf";
import { groupRequiresInviteCode } from "@/features/registration/groups";
import { lookupCpfAction } from "./actions";
import StepShell from "./steps/StepShell";

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

        {/* Steps 3 (Perfil de jogo), 4 (Ingressos & pagamento), 5 (Revisão) are added in Task 11,
            reusing StepShell, `form`/`set`, `advance`, `input`, `isFull`, and championship props. */}
      </div>
    </div>
  );
}
