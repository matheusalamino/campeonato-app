import type { GroupOption } from "@/types/championship";

export function groupRequiresInviteCode(options: GroupOption[], label: string): boolean {
  return options.some((o) => o.label === label && o.requires_invite_code);
}
