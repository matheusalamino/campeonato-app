import { STATUS_LABELS, STATUS_COLORS, type ChampionshipStatus } from "@/types/championship";

export function StatusBadge({ status }: { status: ChampionshipStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
