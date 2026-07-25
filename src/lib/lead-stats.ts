import type { Lead } from "./types";

const ARCHIVED_NOTES_MARKER = /^\[archivedAt:(\d{4}-\d{2}-\d{2})\]\s*/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeArchivedAt(value: string | undefined | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim().slice(0, 10);
  if (!ISO_DATE.test(trimmed)) return undefined;
  const [y, m, d] = trimmed.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return undefined;
  }
  return trimmed;
}

export function isLeadArchived(lead: Pick<Lead, "archivedAt">): boolean {
  return Boolean(normalizeArchivedAt(lead.archivedAt));
}

export function visibleLeadsForBoard(leads: Lead[]): Lead[] {
  return leads.filter((lead) => !isLeadArchived(lead));
}

/** Encode archivedAt into notes for relational dual-write (no dedicated column yet). */
export function encodeLeadNotesForStorage(
  notes: string | undefined,
  archivedAt: string | undefined,
): string | null {
  const when = normalizeArchivedAt(archivedAt);
  const body = (notes ?? "").replace(ARCHIVED_NOTES_MARKER, "").trim();
  if (!when) return body.length > 0 ? body : null;
  return body.length > 0 ? `[archivedAt:${when}] ${body}` : `[archivedAt:${when}]`;
}

/** Decode archivedAt marker from relational notes back onto the Lead model. */
export function decodeLeadNotesFromStorage(notes: string | null | undefined): {
  notes?: string;
  archivedAt?: string;
} {
  if (!notes?.trim()) return {};
  const match = notes.match(ARCHIVED_NOTES_MARKER);
  if (!match) return { notes };
  const rest = notes.slice(match[0].length).trim();
  return {
    archivedAt: normalizeArchivedAt(match[1]),
    notes: rest.length > 0 ? rest : undefined,
  };
}

export type LeadCrmStats = {
  pipelineValue: number;
  expectedRevenue: number;
  conversionRate: number;
  lostDeals: number;
  averageDealSize: number;
  activeCount: number;
  wonCount: number;
};

/**
 * CRM summary cards.
 * - Pipeline / expected: open non-archived funnel only
 * - Win rate / lost / won: all closed deals including archived
 * - Average deal size: all deals with revenue including archived
 */
export function computeLeadCrmStats(leads: Lead[]): LeadCrmStats {
  const visibleOpen = leads.filter(
    (l) => !isLeadArchived(l) && l.status !== "won" && l.status !== "lost",
  );
  const pipelineValue = visibleOpen.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);
  const expectedRevenue = visibleOpen.reduce((sum, l) => {
    const prob = l.probability != null ? l.probability : 50;
    return sum + (l.expectedRevenue || 0) * (prob / 100);
  }, 0);

  const wonCount = leads.filter((l) => l.status === "won").length;
  const lostDeals = leads.filter((l) => l.status === "lost").length;
  const closedCount = wonCount + lostDeals;
  const conversionRate = closedCount > 0 ? (wonCount / closedCount) * 100 : 0;

  const revenueDeals = leads.filter((l) => l.expectedRevenue != null && l.expectedRevenue > 0);
  const averageDealSize =
    revenueDeals.length > 0
      ? revenueDeals.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0) / revenueDeals.length
      : 0;

  return {
    pipelineValue,
    expectedRevenue,
    conversionRate,
    lostDeals,
    averageDealSize,
    activeCount: visibleOpen.length,
    wonCount,
  };
}

export function archiveLead(lead: Lead, archivedAt: string): Lead {
  const when = normalizeArchivedAt(archivedAt);
  if (!when) return lead;
  return { ...lead, archivedAt: when };
}
