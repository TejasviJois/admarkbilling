import type { Lead, LeadStatus } from "@/lib/types";

export const LEAD_STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export function leadStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    new: "New",
    contacted: "Contacted",
    qualified: "Qualified",
    won: "Won",
    lost: "Lost",
  };
  return labels[status];
}

export function formatLeadPhone(phone: string | undefined): string {
  if (!phone?.trim()) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone.trim();
}

export function leadTelHref(phone: string | undefined): string | undefined {
  if (!phone?.trim()) return undefined;
  const digits = phone.replace(/\D/g, "");
  if (digits.length >= 10) return `tel:+91${digits.slice(-10)}`;
  return undefined;
}

export function sortLeads(leads: Lead[]): Lead[] {
  return [...leads].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
