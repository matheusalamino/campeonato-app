"use client";
import { useState } from "react";
import { toast } from "sonner";
import { uploadRegistrationFile } from "../upload";
import { deleteRegistrationFileAction } from "../actions";

export default function UploadCard({
  icon, label, hint, required, bucket, value, onChange,
}: {
  icon: string; label: string; hint: string; required?: boolean;
  bucket: "registration-photos" | "registration-docs";
  value: string; onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const isPhoto = bucket === "registration-photos";
  const hasImagePreview = isPhoto && !!value;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const previous = value;
    try {
      const url = await uploadRegistrationFile(file, bucket);
      onChange(url);
      // Replace-in-place: drop the previously stored file so we don't orphan it.
      if (previous && previous !== url) {
        deleteRegistrationFileAction(previous, bucket).catch(() => {});
      }
      toast.success(`${label} enviado`);
    } catch (err) {
      toast.error(`Falha ao enviar: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.03] px-3 py-3 cursor-pointer">
      {hasImagePreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt={label}
          className="w-16 h-16 shrink-0 rounded-xl object-cover border border-[rgba(230,180,34,.4)]"
        />
      ) : (
        <div
          className="w-14 h-14 shrink-0 rounded-xl flex items-center justify-center text-2xl"
          style={{ background: "rgba(230,180,34,.12)" }}
        >
          {value ? "✓" : icon}
        </div>
      )}
      <div className="flex-1">
        <div className="text-sm">{label}</div>
        <div className="text-[11px] text-[var(--gala-ink-dim)]">
          {busy ? "Enviando…" : value ? (hasImagePreview ? "Toque para trocar a foto" : "Arquivo enviado") : hint}
        </div>
      </div>
      {required && <span className="text-[9px] text-[var(--gala-gold-2)] border border-[rgba(230,180,34,.4)] rounded px-1.5 py-0.5">OBRIG.</span>}
      <input type="file" accept={isPhoto ? "image/*" : "image/*,application/pdf"} className="hidden" onChange={pick} />
    </label>
  );
}
