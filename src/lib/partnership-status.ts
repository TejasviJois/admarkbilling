import { partnershipStatusLabel } from "./default-partnerships";
import type { PartnershipStatus } from "./types";

export function partnershipStatusBadgeClass(status: PartnershipStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25";
    case "prospect":
      return "bg-amber-500/15 text-amber-300 ring-amber-500/25";
    case "inactive":
      return "bg-rose-500/15 text-rose-300 ring-rose-500/25";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export { partnershipStatusLabel };

export function partnershipStatusPill(status: PartnershipStatus) {
  return {
    label: partnershipStatusLabel(status),
    className: partnershipStatusBadgeClass(status),
  };
}
