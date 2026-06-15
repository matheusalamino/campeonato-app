interface Chip {
  value: number;
  label: string;
}

export default function StatsChips({ chips }: { chips: Chip[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="rounded-xl p-5 text-center"
          style={{
            background: "linear-gradient(180deg, var(--gala-panel), var(--gala-panel-2))",
            border: "1px solid var(--gala-line)",
          }}
        >
          <p
            className="font-serif text-4xl font-black"
            style={{
              background: "linear-gradient(180deg, var(--gala-gold-1) 10%, var(--gala-gold-2) 45%, var(--gala-gold-3) 90%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {chip.value.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[3px] text-[var(--gala-ink-dim)]">
            {chip.label}
          </p>
        </div>
      ))}
    </div>
  );
}
