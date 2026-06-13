import { flattenProjectIncome } from "./analytics";
import { entitySlug } from "./document-slug";
import { matchesAnyDateInPeriod, type PeriodKey } from "./date-range-filter";
import { normalizeCategory } from "./financial";
import { projectContractValue } from "./project-billing";
import { resolvePaymentProof } from "./project-payments";
import { projectClientLabel } from "./project-status";
import type { ExpenseEntry, OperationsData, Partnership, Project } from "./types";

function isExternalPayout(expense: ExpenseEntry): boolean {
  return normalizeCategory(expense.category) === "external_payout";
}

export type ClientPaymentSummary = {
  client: string;
  slug: string;
  paymentCount: number;
  proofCount: number;
  totalReceived: number;
  projectCount: number;
  lastPaymentDate?: string;
};

export type PartnerPaymentSummary = {
  partnershipId: string;
  name: string;
  status?: Partnership["status"];
  paymentCount: number;
  proofCount: number;
  totalPaid: number;
  lastPaymentDate?: string;
};

export type VendorPaymentSummary = {
  vendorKey: string;
  label: string;
  paymentCount: number;
  proofCount: number;
  totalPaid: number;
  lastPaymentDate?: string;
};

export type OutgoingPaymentRow = {
  id: string;
  label: string;
  amount: number;
  date: string;
  notes?: string;
  hasProof: boolean;
  proofImageUrl?: string;
  partnershipId?: string;
  partnershipName?: string;
};

function latestDate(dates: string[]): string | undefined {
  if (dates.length === 0) return undefined;
  return dates.sort((a, b) => b.localeCompare(a))[0];
}

export function summarizeClients(ops: OperationsData): ClientPaymentSummary[] {
  const byClient = new Map<
    string,
    { projects: Set<string>; payments: number; proofs: number; total: number; dates: string[] }
  >();

  for (const project of ops.projects) {
    const client = projectClientLabel(project);
    const entry = byClient.get(client) ?? {
      projects: new Set<string>(),
      payments: 0,
      proofs: 0,
      total: 0,
      dates: [],
    };
    entry.projects.add(project.id);
    for (const p of project.payments ?? []) {
      entry.payments += 1;
      entry.total += p.amount || 0;
      if (p.date) entry.dates.push(p.date);
      if (resolvePaymentProof(project, p)?.imageDataUrl) entry.proofs += 1;
    }
    byClient.set(client, entry);
  }

  return [...byClient.entries()]
    .map(([client, v]) => ({
      client,
      slug: entitySlug(client),
      paymentCount: v.payments,
      proofCount: v.proofs,
      totalReceived: v.total,
      projectCount: v.projects.size,
      lastPaymentDate: latestDate(v.dates),
    }))
    .sort((a, b) => a.client.localeCompare(b.client));
}

export function clientPaymentHistory(ops: OperationsData, clientName: string) {
  const rows = flattenProjectIncome(ops.projects).filter((r) => r.client === clientName);
  const projects = ops.projects.filter((p) => projectClientLabel(p) === clientName);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const totalContractValue = projects.reduce((s, p) => s + projectContractValue(p), 0);
  return { rows, projects, total, totalContractValue };
}

export function summarizePartners(ops: OperationsData): PartnerPaymentSummary[] {
  const payouts = ops.expenses.filter((e) => !e.isBaseline && isExternalPayout(e) && Boolean(e.partnershipId));

  const byPartner = new Map<string, { count: number; proofs: number; total: number; dates: string[] }>();
  for (const e of payouts) {
    const id = e.partnershipId!;
    const entry = byPartner.get(id) ?? { count: 0, proofs: 0, total: 0, dates: [] };
    entry.count += 1;
    entry.total += e.amount || 0;
    if (e.date) entry.dates.push(e.date);
    if (e.proof?.imageDataUrl) entry.proofs += 1;
    byPartner.set(id, entry);
  }

  const summaries: PartnerPaymentSummary[] = ops.partnerships.map((p) => {
    const stats = byPartner.get(p.id) ?? { count: 0, proofs: 0, total: 0, dates: [] };
    return {
      partnershipId: p.id,
      name: p.name,
      status: p.status,
      paymentCount: stats.count,
      proofCount: stats.proofs,
      totalPaid: stats.total,
      lastPaymentDate: latestDate(stats.dates),
    };
  });

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export function partnerPaymentHistory(ops: OperationsData, partnershipId: string) {
  const partnership = ops.partnerships.find((p) => p.id === partnershipId);
  const rows = outgoingRowsFromExpenses(
    ops.expenses.filter(
      (e) => !e.isBaseline && isExternalPayout(e) && e.partnershipId === partnershipId,
    ),
    ops.partnerships,
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { partnership, rows, total };
}

export function summarizeVendors(ops: OperationsData): VendorPaymentSummary[] {
  const payouts = ops.expenses.filter((e) => !e.isBaseline && isExternalPayout(e) && !e.partnershipId);

  const byLabel = new Map<string, { count: number; proofs: number; total: number; dates: string[] }>();
  for (const e of payouts) {
    const label = e.label.trim() || "Unnamed vendor";
    const entry = byLabel.get(label) ?? { count: 0, proofs: 0, total: 0, dates: [] };
    entry.count += 1;
    entry.total += e.amount || 0;
    if (e.date) entry.dates.push(e.date);
    if (e.proof?.imageDataUrl) entry.proofs += 1;
    byLabel.set(label, entry);
  }

  return [...byLabel.entries()]
    .map(([label, v]) => ({
      vendorKey: entitySlug(label),
      label,
      paymentCount: v.count,
      proofCount: v.proofs,
      totalPaid: v.total,
      lastPaymentDate: latestDate(v.dates),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function vendorPaymentHistory(ops: OperationsData, vendorLabel: string) {
  const rows = outgoingRowsFromExpenses(
    ops.expenses.filter(
      (e) =>
        !e.isBaseline &&
        isExternalPayout(e) &&
        !e.partnershipId &&
        (e.label.trim() || "Unnamed vendor") === vendorLabel,
    ),
    ops.partnerships,
  );
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return { label: vendorLabel, rows, total };
}

function outgoingRowsFromExpenses(expenses: ExpenseEntry[], partnerships: Partnership[]): OutgoingPaymentRow[] {
  const partnerName = (id?: string) => partnerships.find((p) => p.id === id)?.name;
  return expenses
    .map((e) => ({
      id: e.id,
      label: e.label,
      amount: e.amount,
      date: e.date,
      notes: e.notes,
      hasProof: Boolean(e.proof?.imageDataUrl),
      proofImageUrl: e.proof?.imageDataUrl,
      partnershipId: e.partnershipId,
      partnershipName: e.partnershipId ? partnerName(e.partnershipId) : undefined,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function projectsForClient(projects: Project[], clientName: string): Project[] {
  return projects.filter((p) => projectClientLabel(p) === clientName);
}

export function clientMatchesPeriod(
  ops: OperationsData,
  clientName: string,
  period: PeriodKey,
): boolean {
  if (period === "all") return true;
  const dates = flattenProjectIncome(ops.projects)
    .filter((row) => row.client === clientName)
    .map((row) => row.date);
  return matchesAnyDateInPeriod(dates, period);
}

export function partnerMatchesPeriod(
  ops: OperationsData,
  partnershipId: string,
  period: PeriodKey,
): boolean {
  if (period === "all") return true;
  const dates = ops.expenses
    .filter((e) => !e.isBaseline && isExternalPayout(e) && e.partnershipId === partnershipId)
    .map((e) => e.date);
  return matchesAnyDateInPeriod(dates, period);
}

export function vendorMatchesPeriod(
  ops: OperationsData,
  vendorLabel: string,
  period: PeriodKey,
): boolean {
  if (period === "all") return true;
  const dates = ops.expenses
    .filter(
      (e) =>
        !e.isBaseline &&
        isExternalPayout(e) &&
        !e.partnershipId &&
        (e.label.trim() || "Unnamed vendor") === vendorLabel,
    )
    .map((e) => e.date);
  return matchesAnyDateInPeriod(dates, period);
}
