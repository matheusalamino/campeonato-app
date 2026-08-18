"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { GroupOption } from "@/types/championship";
import { isValidCpf, formatCpf } from "@/lib/cpf";
import { formatPhoneBR, formatHeightM, heightToMask } from "@/lib/masks";
import { BR_STATES } from "@/lib/br-states";
import { groupRequiresInviteCode } from "@/features/registration/groups";
import { skillsFor, SKILL_LABELS } from "@/features/registration/skills";
import { computeTicketsTotal } from "@/features/registration/pricing";
import { buildPixPayload, makePixTxid } from "@/lib/pix";
import { isMinor } from "@/features/registration/minor";
import { makeRegistrationSchema } from "@/features/registration/schema";
import { fieldErrorsFrom } from "@/features/registration/field-errors";
import { errorsForStep, firstStepWithError, stepNumber, AUTHORIZATION_STEP } from "@/features/registration/field-steps";
import { summarizeErrors } from "@/features/registration/error-summary";
import { lookupCpfAction, submitRegistrationAction } from "./actions";
import StepShell from "./steps/StepShell";
import SkillStars from "./steps/SkillStars";
import UploadCard from "./steps/UploadCard";
import PixPayment from "./steps/PixPayment";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from "@/lib/social";

export type WizardChampionship = {
  id: string; name: string; slug: string;
  base_price: number | null; extra_ticket_price: number | null;
  max_players: number | null; registration_image_url: string | null;
  registration_group_options: GroupOption[];
  pix_key: string | null;
  pix_merchant_name: string | null;
  pix_merchant_city: string | null;
};

const EMPTY = {
  cpf: "", name: "", shirt_name: "", email: "", whatsapp: "", birth_date: "",
  birth_state: "", instagram: "", preferred_position: "Meia",
  height: "", weight: "", group_affiliation: "", invite_code: "",
  extra_tickets_count: 0,
  skills: {} as Record<string, number>,
  profile_photo_link: "", payment_receipt_link: "", legal_authorization_link: "",
};

const inputBase =
  "w-full rounded-xl px-3 py-3 text-base bg-white/5 border text-[var(--gala-ink)] outline-none";
const inputOk = "border-white/10 focus:border-[var(--gala-gold-2)]";
const inputError = "border-red-400/70 focus:border-red-400";

export default function RegistrationWizard({
  championship, liveCount,
}: { championship: WizardChampionship; liveCount: number }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...EMPTY });
  const [step, setStep] = useState(1);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [looking, setLooking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isFull = championship.max_players != null && liveCount >= championship.max_players;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  const open = (n: number) => setStep((s) => (s === n ? 0 : n));

  const minor = form.birth_date ? isMinor(form.birth_date) : false;


  // Um txid por inscricao, estavel enquanto o formulario estiver aberto: e ele
  // que permitira casar o recebimento com esta inscricao no extrato depois.
  const [pixTxid] = useState(makePixTxid);

  function buildPayload() {
    return {
      championship_slug: championship.slug,
      cpf: form.cpf, name: form.name, shirt_name: form.shirt_name,
      email: form.email, whatsapp: form.whatsapp, birth_date: form.birth_date,
      birth_state: form.birth_state, instagram: form.instagram,
      preferred_position: form.preferred_position,
      // O schema aceita virgula, entao o valor vai como o jogador digitou.
      height: form.height, weight: form.weight,
      group_affiliation: form.group_affiliation, invite_code: form.invite_code,
      // So o que foi realmente avaliado: preencher o que falta com 1 tornaria
      // "nao avaliei" indistinguivel de "me dei 1" no banco.
      skills: Object.fromEntries(
        activeSkills.filter((s) => form.skills[s] != null).map((s) => [s, form.skills[s]]),
      ),
      extra_tickets_count: form.extra_tickets_count,
      profile_photo_link: form.profile_photo_link,
      payment_receipt_link: form.payment_receipt_link,
      legal_authorization_link: form.legal_authorization_link,
      pix_txid: pixTxid,
    };
  }

  /** Roda o schema completo e recorta so o que pertence ao passo pedido. */
  function stepErrors(from: number) {
    const parsed = makeRegistrationSchema(championship.registration_group_options)
      .safeParse(buildPayload());
    return parsed.success ? {} : errorsForStep(from, fieldErrorsFrom(parsed.error));
  }

  function advance(from: number) {
    const found = stepErrors(from);
    if (Object.keys(found).length) {
      setErrors((prev) => ({ ...prev, ...found }));
      // Sem o aviso, o botao parece nao responder quando o campo com erro esta
      // fora da area visivel — o formulario e longo no celular.
      toast.error(summarizeErrors(found));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(errorsForStep(from, prev))) delete next[key];
      return next;
    });
    setDone((d) => ({ ...d, [from]: true }));
    // Sem menor de idade, o passo da carta nao existe e e pulado.
    const next = from + 1 === AUTHORIZATION_STEP && !minor ? from + 2 : from + 1;
    setStep(next);
  }

  /** Mensagem de erro sob o campo, quando houver. */
  /** Classe, estado e ligacao com a mensagem — para o campo invalido se anunciar. */
  function fieldProps(field: string) {
    const invalid = !!errors[field];
    return {
      className: `${inputBase} ${invalid ? inputError : inputOk}`,
      "aria-invalid": invalid || undefined,
      "aria-describedby": invalid ? `${field}-error` : undefined,
    };
  }

  function err(field: string) {
    if (!errors[field]) return null;
    return (
      <p id={`${field}-error`} className="text-xs -mt-1" style={{ color: "#fca5a5" }}>
        {errors[field]}
      </p>
    );
  }

  async function onCpfContinue() {
    if (!isValidCpf(form.cpf)) { toast.error("CPF inválido"); return; }
    setLooking(true);
    try {
      const res = await lookupCpfAction(form.cpf);
      if ("throttled" in res) {
        toast.error("Muitas tentativas. Aguarde um momento e tente novamente.");
        return;
      }
      if (res.exists) {
        const p = res.player;
        setForm((prev) => ({
          ...prev,
          name: p.name ?? "", shirt_name: p.shirt_name ?? "", email: p.email ?? "",
          whatsapp: p.whatsapp ? formatPhoneBR(p.whatsapp) : "", birth_date: (p.birth_date ?? "").slice(0, 10),
          birth_state: p.birth_state ?? "", instagram: p.instagram ?? "",
          preferred_position: p.preferred_position ?? "Meia",
          height: p.height != null ? heightToMask(p.height) : "",
          weight: p.weight != null ? String(p.weight) : "",
          group_affiliation: p.group_affiliation ?? "",
          profile_photo_link: p.profile_photo_link ?? "",
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
  const [result, setResult] = useState<{ ok: boolean; isWaitlist?: boolean; already?: boolean } | null>(null);

  // On any terminal outcome (success / already-registered), send the player
  // back to the home screen after a few seconds.
  useEffect(() => {
    if (!result) return;
    const t = setTimeout(() => router.push("/"), 6000);
    return () => clearTimeout(t);
  }, [result, router]);
  const activeSkills = skillsFor(form.preferred_position);
  const total = computeTicketsTotal({
    basePrice: championship.base_price,
    extraTicketPrice: championship.extra_ticket_price,
    extraTicketsCount: form.extra_tickets_count,
  });
  // Sem chave configurada no admin nao ha o que cobrar por aqui.
  const pixPayload =
    championship.pix_key && total > 0
      ? buildPixPayload({
          key: championship.pix_key,
          merchantName: championship.pix_merchant_name || championship.name,
          merchantCity: championship.pix_merchant_city || "Brasil",
          // Sem corte aqui: quanto cabe depende do tamanho da chave, e so o
          // `buildPixPayload` sabe disso. Um `.slice` fixo daqui cortava
          // "Sorocaba" em "Sor" mesmo quando havia folga de sobra no campo.
          description: `Inscricao ${championship.name}`,
          amount: total,
          txid: pixTxid,
        })
      : null;
  function setSkill(skill: string, v: number) {
    setForm((p) => ({ ...p, skills: { ...p.skills, [skill]: v } }));
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const res = await submitRegistrationAction(buildPayload());
      if (res.ok) {
        setResult({ ok: true, isWaitlist: res.isWaitlist });
      } else if (res.alreadyRegistered) {
        setResult({ ok: false, already: true });
      } else {
        // O servidor ja disse qual campo falhou: mostra no campo e abre o passo.
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          const target = firstStepWithError(res.fieldErrors);
          if (target) setStep(target);
        }
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
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
           className="text-sm font-bold text-[var(--gala-gold-2)] underline underline-offset-4">
          Siga {INSTAGRAM_HANDLE}
        </a>
        <p className="text-xs text-[var(--gala-ink-dim)]">Redirecionando para o início…</p>
      </div>
    );
  }

  if (result?.already) {
    return (
      <div className="max-w-md mx-auto min-h-screen flex flex-col items-center justify-center text-center px-6 gap-4">
        <div className="text-5xl">✅</div>
        <h1 className="text-2xl font-extrabold text-[var(--gala-gold-2)]">Você já está inscrito!</h1>
        <p className="text-sm text-[var(--gala-ink-dim)] max-w-sm">
          Encontramos uma inscrição sua para {championship.name}. Não é necessário se inscrever novamente.
        </p>
        <p className="text-xs text-[var(--gala-ink-dim)]">Redirecionando para o início…</p>
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
        <StepShell index={stepNumber(1, minor)} title="CPF" open={step === 1} done={!!done[1]} onToggle={() => open(1)}>
          <input {...fieldProps("cpf")} inputMode="numeric" placeholder="000.000.000-00" aria-label="CPF"
                 value={form.cpf} onChange={(e) => set("cpf", formatCpf(e.target.value))} />
          {err("cpf")}
          <button onClick={onCpfContinue} disabled={looking}
                  className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            {looking ? "Buscando…" : "Continuar"}
          </button>
        </StepShell>

        <StepShell index={stepNumber(2, minor)} title="Dados pessoais" open={step === 2} done={!!done[2]} onToggle={() => open(2)}>
          <input {...fieldProps("name")} placeholder="Nome completo" aria-label="Nome completo" value={form.name} onChange={(e) => set("name", e.target.value)} />
          {err("name")}
          <input {...fieldProps("shirt_name")} placeholder="Nome da camisa" aria-label="Nome da camisa" value={form.shirt_name} onChange={(e) => set("shirt_name", e.target.value)} />
          {err("shirt_name")}
          <input {...fieldProps("email")} placeholder="E-mail" aria-label="E-mail" value={form.email} onChange={(e) => set("email", e.target.value)} />
          {err("email")}
          <input {...fieldProps("whatsapp")} type="tel" inputMode="numeric" placeholder="WhatsApp — (11) 99999-9999" aria-label="WhatsApp"
                 value={form.whatsapp} onChange={(e) => set("whatsapp", formatPhoneBR(e.target.value))} />
          {err("whatsapp")}
          <input {...fieldProps("birth_date")} type="date" aria-label="Data de nascimento" value={form.birth_date} onChange={(e) => set("birth_date", e.target.value)} />
          {err("birth_date")}
          <select {...fieldProps("birth_state")} aria-label="Estado de nascimento" value={form.birth_state} onChange={(e) => set("birth_state", e.target.value)}>
            <option value="">Estado de nascimento…</option>
            {BR_STATES.map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>
          {err("birth_state")}
          <input {...fieldProps("instagram")} placeholder="Instagram (opcional)" aria-label="Instagram (opcional)" value={form.instagram} onChange={(e) => set("instagram", e.target.value)} />
          {/* Sempre visivel: o grupo do jogador muda entre edicoes, e esconder o
              seletor quando veio do preenchimento automatico o prendia ao anterior. */}
          <select {...fieldProps("group_affiliation")} aria-label="Grupo" value={form.group_affiliation} onChange={(e) => set("group_affiliation", e.target.value)}>
            <option value="">Selecione seu grupo…</option>
            {championship.registration_group_options.map((g) => (
              <option key={g.label} value={g.label}>{g.label}</option>
            ))}
          </select>
          {err("group_affiliation")}
          {needsInvite && (
            <>
              <input {...fieldProps("invite_code")} placeholder="Código de convite" aria-label="Código de convite" value={form.invite_code} onChange={(e) => set("invite_code", e.target.value)} />
              {err("invite_code")}
            </>
          )}
          <button onClick={() => advance(2)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
            Continuar
          </button>
        </StepShell>

        {minor && (
          <StepShell index={stepNumber(AUTHORIZATION_STEP, minor)} title="Autorização do responsável"
                     open={step === AUTHORIZATION_STEP} done={!!done[AUTHORIZATION_STEP]} onToggle={() => open(AUTHORIZATION_STEP)}>
            <p className="text-sm text-[var(--gala-ink-dim)]">
              Como você é menor de 18 anos, precisamos da autorização do seu responsável legal para
              você entrar em campo. O documento também autoriza atendimento médico em caso de emergência.
            </p>
            <a href="/carta-autorizacao.pdf" download
               className="w-full rounded-xl py-3 font-bold text-center text-[#050507] block"
               style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>
              ⬇ Baixar a carta
            </a>
            <p className="text-xs text-[var(--gala-ink-dim)]">
              Imprima, peça para o responsável preencher e assinar, e envie a foto ou o PDF abaixo.
            </p>
            <UploadCard icon="📝" label="Carta assinada pelo responsável" hint="Foto ou PDF" required bucket="registration-docs"
                        value={form.legal_authorization_link} onChange={(u) => set("legal_authorization_link", u)} />
            {err("legal_authorization_link")}
            <button onClick={() => advance(AUTHORIZATION_STEP)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                    style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>Continuar</button>
          </StepShell>
        )}

        <StepShell index={stepNumber(4, minor)} title="Perfil de jogo" open={step === 4} done={!!done[4]} onToggle={() => open(4)}>
          <select {...fieldProps("preferred_position")} aria-label="Posição preferida" value={form.preferred_position} onChange={(e) => set("preferred_position", e.target.value)}>
            <option>Zagueiro</option><option>Meia</option><option>Atacante</option><option>Goleiro</option>
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input {...fieldProps("height")} inputMode="numeric" placeholder="Altura — 1,80 m" aria-label="Altura em metros" value={form.height} onChange={(e) => set("height", formatHeightM(e.target.value))} />
              {err("height")}
            </div>
            <div>
              <input {...fieldProps("weight")} inputMode="decimal" placeholder="Peso (kg)" aria-label="Peso em quilos" value={form.weight} onChange={(e) => set("weight", e.target.value)} />
              {err("weight")}
            </div>
          </div>
          {activeSkills.map((s) => (
            <div key={s} className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="text-sm text-[var(--gala-ink)]">{SKILL_LABELS[s]}</span>
              <SkillStars label={SKILL_LABELS[s]} value={form.skills[s] ?? 0} onChange={(v) => setSkill(s, v)} />
            </div>
          ))}
          {activeSkills.some((s) => errors[`skills.${s}`]) && (
            <p className="text-xs" style={{ color: "#fca5a5" }}>Avalie todas as habilidades para continuar.</p>
          )}
          <button onClick={() => advance(4)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>Continuar</button>
        </StepShell>

        <StepShell index={stepNumber(5, minor)} title="Ingressos & pagamento" open={step === 5} done={!!done[5]} onToggle={() => open(5)}>
          <div className="rounded-2xl px-3 py-3 text-xs leading-relaxed"
               style={{ background: "rgba(230,180,34,.08)", border: "1px solid rgba(230,180,34,.25)", color: "var(--gala-ink)" }}>
            Sua inscrição já inclui <b>2 ingressos</b> para a Noite de Gala: o seu e o de um
            acompanhante. Precisa de mais? Cada ingresso adicional é cobrado à parte abaixo.
          </div>
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
          {err("profile_photo_link")}
          {pixPayload && <PixPayment payload={pixPayload} amount={total} />}
          {total > 0 && (
            <UploadCard icon="🧾" label="Comprovante de pagamento" hint="PIX / transferência" required bucket="registration-docs"
                        value={form.payment_receipt_link} onChange={(u) => set("payment_receipt_link", u)} />
          )}
          {err("payment_receipt_link")}
          <button onClick={() => advance(5)} className="w-full rounded-xl py-3 font-bold text-[#050507]"
                  style={{ background: "linear-gradient(135deg,#f0c94a,#d4a017)" }}>Revisar</button>
        </StepShell>

        <StepShell index={stepNumber(6, minor)} title="Revisão & envio" open={step === 6} done={false} onToggle={() => open(6)}>
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
