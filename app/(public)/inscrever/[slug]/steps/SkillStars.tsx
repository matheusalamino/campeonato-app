"use client";
export default function SkillStars({
  value, onChange, max = 5,
}: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => {
        const v = i + 1;
        return (
          <span key={i} onClick={() => onChange(v)}
                className={`text-2xl cursor-pointer transition ${v <= value ? "text-yellow-400" : "text-zinc-600"}`}>
            ★
          </span>
        );
      })}
    </div>
  );
}
