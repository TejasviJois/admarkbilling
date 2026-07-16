import type { Lead, LeadStatus } from "@/lib/types";

export const LEAD_STATUSES: LeadStatus[] = [
  "new_lead",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
];

export function leadStatusLabel(status: LeadStatus): string {
  const labels: Record<LeadStatus, string> = {
    new_lead: "New Lead",
    contacted: "Contacted",
    meeting_scheduled: "Meeting Scheduled",
    proposal_sent: "Proposal Sent",
    negotiation: "Negotiation",
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
  return [...leads].sort((a, b) =>
    (a.company || a.name || "").localeCompare(b.company || b.name || "", undefined, { sensitivity: "base" })
  );
}
