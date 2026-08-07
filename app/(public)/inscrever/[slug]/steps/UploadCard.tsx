"use client";
import { useState } from "react";
import { toast } from "sonner";
import { uploadRegistrationFile } from "../upload";

export default function UploadCard({
  icon, label, hint, required, bucket, value, onChange,
}: {
  icon: string; label: string; hint: string; required?: boolean;
  bucket: "registration-photos" | "registration-docs";
  value: string; onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadRegistrationFile(file, bucket);
      onChange(url);
      toast.success(`${label} enviado`);
    } catch (err) {
      toast.error(`Falha ao enviar: ${(err as Error).message}`);
    } finally { setBusy(false); }
  }
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 cursor-pointer">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
           style={{ background: "rgba(230,180,34,.12)" }}>{value ? "✓" : icon}</div>
      <div className="flex-1">
        <div className="text-sm">{label}</div>
        <div className="text-[11px] text-[var(--gala-ink-dim)]">{busy ? "Enviando…" : value ? "Arquivo enviado" : hint}</div>
      </div>
      {required && <span className="text-[9px] text-[var(--gala-gold-2)] border border-[rgba(230,180,34,.4)] rounded px-1.5 py-0.5">OBRIG.</span>}
      <input type="file" accept={bucket === "registration-photos" ? "image/*" : "image/*,application/pdf"} className="hidden" onChange={pick} />
    </label>
  );
}
