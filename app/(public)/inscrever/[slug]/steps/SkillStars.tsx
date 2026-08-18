"use client";

/**
 * Nota de 1 a 5 em estrelas.
 *
 * Cada estrela e um <button>, nao um <span> com onClick: as habilidades sao
 * obrigatorias para concluir a inscricao, entao um controle inalcancavel por
 * teclado deixaria o formulario intransponivel para quem nao usa mouse.
 */
export default function SkillStars({
  value, onChange, max = 5, label,
}: { value: number; onChange: (v: number) => void; max?: number; label: string }) {
  return (
    <div className="flex gap-1" role="group" aria-label={label}>
      {Array.from({ length: max }).map((_, i) => {
        const v = i + 1;
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(v)}
            aria-label={`${v} de ${max}`}
            aria-pressed={v <= value}
            className={`text-2xl leading-none cursor-pointer transition rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--gala-gold-2)] ${v <= value ? "text-yellow-400" : "text-zinc-600"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}
