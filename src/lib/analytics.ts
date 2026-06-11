import { formatINRWhole } from "./invoice-calc";
import { projectClientLabel } from "./project-status";
import {
  projectBillingRows,
  sumBookedProjectRevenue,
  sumActiveMrr,
  sumFutureMonthlyPipeline,
} from "./project-billing";
import {
  isVerifiedPayment,
  resolvePaymentProof,
  sumProjectPayments,
} from "./project-payments";
import type { OperationsData, Project, ProjectPayment } from "./types";

export type IncomeRow = {
  id: string;
  projectId: string;
  client: string;
  amount: number;
  date: string;
  note?: string;
  hasProof: boolean;
  proofImageUrl?: string;
};

export type RevenueRow = {
  project: Project;
  client: string;
  contract: number | null;
  contractLabel: string;
  received: number;
  pending: number | null;
  recurringStatus?: string;
  monthlyStartDate?: string;
};

export function sumAllProjectIncome(projects: Project[]): number {
  return projects.reduce((total, project) => total + sumProjectPayments(project.payments), 0);
}

/** Booked contract value — upfront + started fixed-term monthly only. Excludes unstarted retainers. */
export function sumOngoingProjectRevenue(projects: Project[]): number {
  return sumBookedProjectRevenue(projects);
}

export { sumActiveMrr, sumFutureMonthlyPipeline, projectBillingRows };

export function allProjectPaymentsByMonth(projects: Project[]): Map<string, number> {
  const months = new Map<string, number>();
  for (const project of projects) {
    for (const payment of project.payments ?? []) {
      const key = payment.date.slice(0, 7);
      if (key.length !== 7) continue;
      months.set(key, (months.get(key) ?? 0) + (payment.amount || 0));
    }
  }
  return months;
}

export function flattenProjectIncome(projects: Project[]): IncomeRow[] {
  const rows: IncomeRow[] = [];
  for (const project of projects) {
    const client = projectClientLabel(project);
    for (const payment of project.payments ?? []) {
      const proof = resolvePaymentProof(project, payment);
      const proofImageUrl = proof?.imageDataUrl;
      rows.push({
        id: payment.id,
        projectId: project.id,
        client,
        amount: payment.amount,
        date: payment.date,
        note: payment.note,
        hasProof: Boolean(proofImageUrl),
        proofImageUrl,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function ongoingRevenueRows(projects: Project[]): RevenueRow[] {
  return projectBillingRows(projects).map((row) => ({
    project: row.project,
    client: row.client,
    contract: row.bookedRevenue > 0 ? row.bookedRevenue : null,
    contractLabel: row.billingLabel,
    received: row.received,
    pending:
      row.bookedRevenue > 0 && row.received < row.bookedRevenue
        ? row.bookedRevenue - row.received
        : null,
    recurringStatus: row.recurringStatus,
    monthlyStartDate: row.monthlyStartDate,
  }));
}

export function buildMonthlyChart(ops: OperationsData) {
  const months = new Map<
    string,
    { month: string; income: number; expenses: number; sortKey: string }
  >();

  const ensure = (key: string) => {
    if (!months.has(key)) {
      months.set(key, { month: formatMonthLabel(key), income: 0, expenses: 0, sortKey: key });
    }
    return months.get(key)!;
  };

  for (const [key, amount] of allProjectPaymentsByMonth(ops.projects)) {
    ensure(key).income += amount;
  }

  for (const exp of ops.expenses) {
    const key = exp.date.slice(0, 7);
    if (key.length === 7) ensure(key).expenses += exp.amount;
  }

  return [...months.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

function formatMonthLabel(yyyyMm: string) {
  const [y, m] = yyyyMm.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export function paymentProofLabel(payment: ProjectPayment, project?: Project): string {
  return isVerifiedPayment(payment, project) ? "Proof attached" : "No proof";
}

export { formatINRWhole };
