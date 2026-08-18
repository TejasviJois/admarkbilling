import { financialYear } from "./invoice-number";
import { monthsThrough, normalizeDateString, toLocalISODate } from "./date-range-filter";
import { totalReceived } from "./project-payments";
import { isRevenueProject, projectClientLabel } from "./project-status";
import {
  computeBookedRevenue,
  recurringStatus,
  resolveProjectBilling,
} from "./project-billing";
import type { Client, Project } from "./types";

export function financialYearBounds(asOf: string): { start: string; end: string; label: string } {
  const normalized = normalizeDateString(asOf) ?? toLocalISODate();
  const d = new Date(`${normalized}T12:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth();
  const startYear = m >= 3 ? y : y - 1;
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
    label: financialYear(normalized),
  };
}

function monthKey(date: string): string {
  return date.slice(0, 7);
}

function maxMonth(a: string, b: string): string {
  return a >= b ? a : b;
}

function minMonth(a: string, b: string): string {
  return a <= b ? a : b;
}

function addMonthsToDate(date: string, months: number): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return toLocalISODate(d);
}

function retainerLastMonth(
  billing: ReturnType<typeof resolveProjectBilling>,
  asOfDate: string,
): string | null {
  void asOfDate;
  if (billing.monthlyEndDate) return monthKey(billing.monthlyEndDate);
  if (billing.monthlyMonths != null && billing.monthlyStartDate) {
    return monthKey(addMonthsToDate(billing.monthlyStartDate, billing.monthlyMonths - 1));
  }
  return null;
}

/** Calendar months a retainer runs within the current Indian financial year. */
export function retainerMonthsInFinancialYear(project: Project, asOfDate: string): number {
  if (!isRevenueProject(project.status)) return 0;
  const billing = resolveProjectBilling(project);
  if (!billing.monthlyAmount) return 0;

  const status = recurringStatus(billing, asOfDate);
  if (status === "ended" || status === "none") return 0;
  if (!billing.monthlyStartDate) return 0;

  const fy = financialYearBounds(asOfDate);
  const fyStartMonth = monthKey(fy.start);
  const fyEndMonth = monthKey(fy.end);
  const retainerStartMonth = monthKey(billing.monthlyStartDate);

  let retainerEndMonthVal = fyEndMonth;
  const fixedEnd = retainerLastMonth(billing, asOfDate);
  if (fixedEnd) retainerEndMonthVal = minMonth(retainerEndMonthVal, fixedEnd);

  const fromMonth = maxMonth(fyStartMonth, retainerStartMonth);
  if (fromMonth > retainerEndMonthVal) return 0;

  return monthsThrough(fromMonth, retainerEndMonthVal).length;
}

function recurringReceivedAmount(project: Project): number {
  const billing = resolveProjectBilling(project);
  if (!billing.monthlyAmount) return 0;

  const received = totalReceived(project);
  let oneTime = 0;
  if (project.historicalOutstanding != null) {
    oneTime = (project.historicalReceived ?? 0) + project.historicalOutstanding;
  } else {
    oneTime = billing.upfrontAmount ?? 0;
    if ((billing.maintenanceAmount ?? 0) > 0 && !(billing.upfrontAmount ?? 0)) {
      oneTime += billing.maintenanceAmount ?? 0;
    }
  }
  return Math.max(0, received - oneTime);
}

/** Retainer revenue still expected in the current FY (monthly rate × remaining FY months). */
export function fyRetainerRemainingRevenue(project: Project, asOfDate: string): number {
  const billing = resolveProjectBilling(project);
  if (!billing.monthlyAmount) return 0;

  const months = retainerMonthsInFinancialYear(project, asOfDate);
  if (months === 0) return 0;

  const fyTotal = billing.monthlyAmount * months;
  const recurringBooked = recurringReceivedAmount(project);
  return Math.max(0, fyTotal - recurringBooked);
}

/** Booked revenue plus FY retainer outlook for one project. */
export function projectTotalRevenueOutlook(project: Project, asOfDate: string): number {
  const booked = computeBookedRevenue(project, asOfDate);
  const fyRemaining = fyRetainerRemainingRevenue(project, asOfDate);
  if (fyRemaining > 0 || retainerMonthsInFinancialYear(project, asOfDate) > 0) {
    return booked + fyRemaining;
  }
  return booked;
}

export type ClientRevenueProjectRow = {
  id: string;
  name: string;
  company?: string;
  projectType?: string;
  status: Project["status"];
  booked: number;
  fyRemaining: number;
  total: number;
};

export type ClientRevenueRow = {
  id: string;
  client: string;
  projectCount: number;
  activeCount: number;
  completedCount: number;
  booked: number;
  fyRemaining: number;
  total: number;
  projects: ClientRevenueProjectRow[];
};

export type ClientRevenueSummary = {
  financialYear: string;
  asOf: string;
  totalBooked: number;
  totalFyRemaining: number;
  totalRevenue: number;
  clients: ClientRevenueRow[];
};

function squash(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const MIN_PREFIX_LENGTH = 6;

function namesLooselyMatch(a: string, b: string): boolean {
  const left = squash(a);
  const right = squash(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return (
    left.length >= MIN_PREFIX_LENGTH &&
    right.length >= MIN_PREFIX_LENGTH &&
    (left.startsWith(right) || right.startsWith(left))
  );
}

function rootClient(client: Client, byId: Map<string, Client>): Client {
  let current = client;
  const seen = new Set<string>();
  while (current.parentClientId) {
    if (seen.has(current.id)) break;
    seen.add(current.id);
    const parent = byId.get(current.parentClientId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

function findLinkedClient(
  project: Project,
  clients: Client[],
  byId: Map<string, Client>,
): Client | undefined {
  if (project.clientId) {
    const linked = byId.get(project.clientId);
    if (linked) return rootClient(linked, byId);
  }

  const label = projectClientLabel(project);
  if (!label || label === "—") return undefined;

  const exact = clients.find((client) => squash(client.companyName) === squash(label));
  if (exact) return rootClient(exact, byId);

  const fuzzy = clients.find((client) => namesLooselyMatch(client.companyName, label));
  if (fuzzy) return rootClient(fuzzy, byId);
  return undefined;
}

function clusterLabel(labels: string[]): string {
  const unique = [...new Set(labels.map((label) => label.trim()).filter(Boolean))];
  if (unique.length === 0) return "Unknown client";
  const shortestPrefix = unique
    .slice()
    .sort((a, b) => squash(a).length - squash(b).length)
    .find((candidate) => unique.every((label) => namesLooselyMatch(candidate, label)));
  return shortestPrefix ?? unique[0];
}

function projectDisplayName(project: Project, groupLabel: string): string {
  const name = project.name?.trim() ?? "";
  const client = project.client?.trim() ?? "";
  const type = project.projectType?.trim() ?? "";
  if (name && name !== client && name !== groupLabel) return name;
  if (type) return type;
  if (name && name !== groupLabel) return name;
  if (client && client !== groupLabel) return client;
  return name || client || "Project";
}

function toProjectRow(project: Project, groupLabel: string, asOf: string): ClientRevenueProjectRow {
  const company = project.client?.trim();
  return {
    id: project.id,
    name: projectDisplayName(project, groupLabel),
    company: company && company !== groupLabel ? company : undefined,
    projectType: project.projectType,
    status: project.status,
    booked: computeBookedRevenue(project, asOf),
    fyRemaining: fyRetainerRemainingRevenue(project, asOf),
    total: projectTotalRevenueOutlook(project, asOf),
  };
}

function buildRow(
  id: string,
  client: string,
  projects: Project[],
  asOf: string,
): ClientRevenueRow | null {
  const rows = projects
    .map((project) => toProjectRow(project, client, asOf))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  const booked = rows.reduce((sum, row) => sum + row.booked, 0);
  const fyRemaining = rows.reduce((sum, row) => sum + row.fyRemaining, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (booked <= 0 && fyRemaining <= 0 && total <= 0) return null;
  return {
    id,
    client,
    projectCount: rows.length,
    activeCount: projects.filter((project) => project.status === "active").length,
    completedCount: projects.filter((project) => project.status === "completed").length,
    booked,
    fyRemaining,
    total,
    projects: rows,
  };
}

export function buildClientRevenueBreakdown(
  projects: Project[],
  asOfDate?: string,
  clients: Client[] = [],
): ClientRevenueSummary {
  const asOf = normalizeDateString(asOfDate) ?? toLocalISODate();
  const fy = financialYearBounds(asOf);
  const directory = clients ?? [];
  const byId = new Map(directory.map((client) => [client.id, client]));

  const grouped = new Map<string, { id: string; client: string; projects: Project[] }>();
  const unmatched: Project[] = [];

  for (const project of projects) {
    if (!isRevenueProject(project.status)) continue;
    const linked = findLinkedClient(project, directory, byId);
    if (!linked) {
      unmatched.push(project);
      continue;
    }
    const existing = grouped.get(linked.id);
    if (existing) {
      existing.projects.push(project);
    } else {
      grouped.set(linked.id, { id: linked.id, client: linked.companyName, projects: [project] });
    }
  }

  const clusters: Project[][] = [];
  for (const project of unmatched) {
    const label = projectClientLabel(project);
    const cluster = clusters.find((group) =>
      group.some((entry) => namesLooselyMatch(projectClientLabel(entry), label)),
    );
    if (cluster) cluster.push(project);
    else clusters.push([project]);
  }

  for (const cluster of clusters) {
    const label = clusterLabel(cluster.map((project) => projectClientLabel(project)));
    const id = `name:${squash(label) || cluster[0]?.id}`;
    grouped.set(id, { id, client: label, projects: cluster });
  }

  const merged: { id: string; client: string; projects: Project[] }[] = [];
  for (const entry of grouped.values()) {
    const target = merged.find((group) => namesLooselyMatch(group.client, entry.client));
    if (target) {
      target.projects.push(...entry.projects);
      target.client = clusterLabel([target.client, entry.client]);
      continue;
    }
    merged.push({ ...entry, projects: [...entry.projects] });
  }

  const rows = merged
    .map((group) => buildRow(group.id, group.client, group.projects, asOf))
    .filter((row): row is ClientRevenueRow => row != null)
    .sort((a, b) => b.total - a.total || a.client.localeCompare(b.client));

  return {
    financialYear: fy.label,
    asOf,
    totalBooked: rows.reduce((sum, row) => sum + row.booked, 0),
    totalFyRemaining: rows.reduce((sum, row) => sum + row.fyRemaining, 0),
    totalRevenue: rows.reduce((sum, row) => sum + row.total, 0),
    clients: rows,
  };
}
