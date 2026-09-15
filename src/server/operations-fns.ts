import { createServerFn } from "@tanstack/react-start";
import type {
  AppNotification,
  Client,
  Contact,
  FinancialBaseline,
  FixedMonthlyExpense,
  Lead,
  LeadStatus,
  OperationsData,
  Payment,
  Transaction,
  Founder,
  TransactionType,
  Milestone,
  Project,
  ProjectStatus,
  ScheduleEvent,
  ValuationAuditEntry,
  ValuationSnapshot,
} from "@/lib/types";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { parseSalaryMonthPayments } from "@/lib/team-payroll";
import { normalizeValuationSettings } from "@/lib/valuation-engine";
import { requireServerSupabase } from "./supabase-admin";
import { assertRelationalMode } from "./env";
import { loadRelationalOperations } from "./relational-read-repository";
import { saveRelationalOperations } from "./relational-write-repository";
import { assertAppSession } from "./app-session";
import { CACHE_KEYS, cacheSet, cacheThrough } from "./data-cache";
import { applyProductionBillingRepairs } from "@/lib/ground-zero";
import { parseOpsExpenseNotes } from "@/lib/ops-costs";
import {
  applyOperationsMutation,
  isOperationsMutationEmpty,
  type OperationsEntityKey,
  type OperationsMutation,
} from "@/lib/operations-mutations";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

export type VersionedOperations = {
  data: OperationsData;
  version: string;
};

export type SaveOperationsMutationInput = {
  mutation: OperationsMutation;
  expectedVersion: string;
  /** Every ID listed in mutation.deletes must appear here unless allowAllDeletes. */
  allowedDeleteIds?: Partial<Record<OperationsEntityKey, string[]>>;
  /** Restore-only escape hatch — never set from ordinary UI saves. */
  allowAllDeletes?: boolean;
};

export type SaveOperationsMutationResult =
  | { ok: true; data: OperationsData; version: string }
  | {
      ok: false;
      conflict: true;
      data: OperationsData;
      version: string;
    };

export const EMPTY_OPERATIONS: OperationsData = {
  projects: [],
  partnerships: [],
  expenses: [],
  financialBaseline: DEFAULT_FINANCIAL_BASELINE,
};

function parseFinancialBaseline(raw: unknown): FinancialBaseline | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const b = raw as Partial<FinancialBaseline>;
  if (
    typeof b.asOfDate !== "string" ||
    typeof b.totalHandoutsTaken !== "number" ||
    typeof b.totalRevenueReceived !== "number"
  ) {
    return undefined;
  }
  return {
    periodLabel: b.periodLabel ?? DEFAULT_FINANCIAL_BASELINE.periodLabel,
    asOfDate: b.asOfDate,
    totalRevenueBooked: b.totalRevenueBooked ?? null,
    totalHandoutsTaken: b.totalHandoutsTaken,
    totalRevenueReceived: b.totalRevenueReceived,
    totalExternalPayouts: b.totalExternalPayouts ?? 0,
    totalCompanyExpenses: b.totalCompanyExpenses ?? 0,
    founderPayoutPool: b.founderPayoutPool ?? 0,
  };
}

function parseFixedMonthlyExpense(raw: unknown): FixedMonthlyExpense | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Partial<FixedMonthlyExpense>;
  if (
    typeof e.id !== "string" ||
    typeof e.label !== "string" ||
    typeof e.amountPerMonth !== "number"
  ) {
    return null;
  }
  const fromNotes = parseOpsExpenseNotes(typeof e.notes === "string" ? e.notes : undefined);
  const totalAmount =
    typeof e.totalAmount === "number" && Number.isFinite(e.totalAmount) && e.totalAmount > 0
      ? e.totalAmount
      : typeof e.totalAmount === "string" && Number(e.totalAmount) > 0
        ? Number(e.totalAmount)
        : fromNotes.meta.totalAmount;
  const priorPaidAmount =
    typeof e.priorPaidAmount === "number" &&
    Number.isFinite(e.priorPaidAmount) &&
    e.priorPaidAmount > 0
      ? e.priorPaidAmount
      : typeof e.priorPaidAmount === "string" && Number(e.priorPaidAmount) > 0
        ? Number(e.priorPaidAmount)
        : fromNotes.meta.priorPaidAmount;
  const priorPaidInstallments =
    typeof e.priorPaidInstallments === "number" &&
    Number.isFinite(e.priorPaidInstallments) &&
    e.priorPaidInstallments > 0
      ? Math.floor(e.priorPaidInstallments)
      : typeof e.priorPaidInstallments === "string" && Number(e.priorPaidInstallments) > 0
        ? Math.floor(Number(e.priorPaidInstallments))
        : fromNotes.meta.priorPaidInstallments;
  return {
    id: e.id,
    label: e.label,
    payee: typeof e.payee === "string" ? e.payee : undefined,
    teamMemberId: typeof e.teamMemberId === "string" ? e.teamMemberId : undefined,
    amountPerMonth: e.amountPerMonth,
    kind: typeof e.kind === "string" ? e.kind : undefined,
    startDate: typeof e.startDate === "string" ? e.startDate : "2026-01-01",
    totalMonths:
      typeof e.totalMonths === "number" && e.totalMonths > 0
        ? Math.floor(e.totalMonths)
        : undefined,
    totalAmount,
    priorPaidInstallments,
    priorPaidAmount,
    reminderDay:
      typeof e.reminderDay === "number" && e.reminderDay >= 1 && e.reminderDay <= 31
        ? Math.floor(e.reminderDay)
        : undefined,
    paidMonths: Array.isArray(e.paidMonths)
      ? e.paidMonths.filter(
          (month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month),
        )
      : undefined,
    monthPayments: parseSalaryMonthPayments(e.monthPayments),
    status:
      e.status === "paused" || e.status === "completed" || e.status === "active"
        ? e.status
        : e.active === false
          ? "paused"
          : "active",
    notes: fromNotes.notes,
    active: e.status === "completed" || e.status === "paused" ? false : e.active !== false,
    nextDueDate:
      typeof e.nextDueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.nextDueDate)
        ? e.nextDueDate
        : fromNotes.meta.nextDueDate,
    billingCycle:
      e.billingCycle === "yearly" || e.billingCycle === "monthly"
        ? e.billingCycle
        : fromNotes.meta.billingCycle,
    vendor:
      typeof e.vendor === "string" && e.vendor.trim()
        ? e.vendor.trim()
        : fromNotes.meta.vendor,
  };
}

function parseScheduleEvent(raw: unknown): ScheduleEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Partial<ScheduleEvent>;
  if (
    typeof event.id !== "string" ||
    typeof event.title !== "string" ||
    typeof event.date !== "string" ||
    typeof event.startTime !== "string"
  ) {
    return null;
  }
  return {
    id: event.id,
    title: event.title,
    type: event.type === "call" ? "call" : event.type === "reminder" ? "reminder" : "meeting",
    date: event.date,
    startTime: event.startTime,
    durationMinutes:
      typeof event.durationMinutes === "number" && event.durationMinutes > 0
        ? event.durationMinutes
        : 30,
    contact: event.contact,
    location: event.location,
    meetingUrl: event.meetingUrl,
    notes: event.notes,
    reminderMinutes:
      typeof event.reminderMinutes === "number" && event.reminderMinutes >= 0
        ? event.reminderMinutes
        : 30,
    status:
      event.status === "completed" || event.status === "cancelled" ? event.status : "scheduled",
    createdAt: typeof event.createdAt === "number" ? event.createdAt : Date.now(),
    updatedAt: typeof event.updatedAt === "number" ? event.updatedAt : Date.now(),
  };
}

function parseValuationSnapshot(raw: unknown): ValuationSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ValuationSnapshot>;
  if (
    typeof item.id !== "string" ||
    typeof item.date !== "string" ||
    typeof item.calculatedValuation !== "number"
  ) {
    return null;
  }
  return {
    id: item.id,
    date: item.date,
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
    calculatedValuation: item.calculatedValuation,
    manualAdjustment: typeof item.manualAdjustment === "number" ? item.manualAdjustment : 0,
    reason: typeof item.reason === "string" ? item.reason : "Monthly valuation snapshot",
    revenue: typeof item.revenue === "number" ? item.revenue : 0,
    assets: typeof item.assets === "number" ? item.assets : 0,
    profit: typeof item.profit === "number" ? item.profit : 0,
    growth: typeof item.growth === "number" ? item.growth : 0,
    netWorth: typeof item.netWorth === "number" ? item.netWorth : 0,
    enterpriseValue: typeof item.enterpriseValue === "number" ? item.enterpriseValue : 0,
    assumptionsHash: typeof item.assumptionsHash === "string" ? item.assumptionsHash : "",
  };
}

function parseValuationAudit(raw: unknown): ValuationAuditEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Partial<ValuationAuditEntry>;
  if (
    typeof item.id !== "string" ||
    typeof item.timestamp !== "number" ||
    typeof item.field !== "string"
  ) {
    return null;
  }
  return {
    id: item.id,
    timestamp: item.timestamp,
    actor: typeof item.actor === "string" ? item.actor : "Admin (shared session)",
    reason: typeof item.reason === "string" ? item.reason : "No reason recorded",
    field: item.field,
    oldValue: typeof item.oldValue === "string" ? item.oldValue : "",
    newValue: typeof item.newValue === "string" ? item.newValue : "",
  };
}

function parseLead(raw: unknown): Lead | null {
  if (!raw || typeof raw !== "object") return null;
  const l = raw as Partial<Lead>;
  if (typeof l.id !== "string") return null;

  // Legacy fallback mapping
  const company = l.company ? l.company : l.business || "General Inquiries";
  const contactPerson = l.contactPerson ? l.contactPerson : l.name;

  let status: LeadStatus = "new_lead";
  const rawStatus = String(l.status);
  if (rawStatus === "new" || rawStatus === "new_lead") status = "new_lead";
  else if (rawStatus === "qualified") status = "proposal_sent";
  else if (
    rawStatus === "contacted" ||
    rawStatus === "meeting_scheduled" ||
    rawStatus === "proposal_sent" ||
    rawStatus === "negotiation" ||
    rawStatus === "won" ||
    rawStatus === "lost"
  ) {
    status = rawStatus as LeadStatus;
  }

  return {
    id: l.id,
    organizationId: l.organizationId ?? DEFAULT_ORG_ID,
    name: l.name,
    business: l.business,
    company,
    contactPerson,
    email: l.email,
    phone: l.phone,
    notes: l.notes,
    status,
    source: l.source ?? "organic",
    expectedRevenue: typeof l.expectedRevenue === "number" ? l.expectedRevenue : undefined,
    probability: typeof l.probability === "number" ? l.probability : undefined,
    expectedClosingDate: l.expectedClosingDate,
    assignedSalesperson: l.assignedSalesperson,
    convertedClientId: typeof l.convertedClientId === "string" ? l.convertedClientId : undefined,
    createdAt: l.createdAt ?? new Date().toISOString().slice(0, 10),
    archivedAt:
      typeof l.archivedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(l.archivedAt.trim())
        ? l.archivedAt.trim().slice(0, 10)
        : undefined,
  };
}

function parseClient(raw: unknown): Client | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<Client>;
  if (typeof c.id !== "string" || typeof c.companyName !== "string") return null;
  return {
    id: c.id,
    organizationId: c.organizationId ?? DEFAULT_ORG_ID,
    parentClientId: typeof c.parentClientId === "string" ? c.parentClientId : undefined,
    companyName: c.companyName,
    contactPerson: c.contactPerson ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    gstNumber: c.gstNumber,
    pan: c.pan,
    billingAddress: c.billingAddress ?? "",
    shippingAddress: c.shippingAddress,
    website: c.website,
    industry: c.industry,
    clientSince: c.clientSince ?? new Date().toISOString().slice(0, 10),
    status: c.status === "inactive" ? "inactive" : "active",
    notes: c.notes,
  };
}

function parseContact(raw: unknown): Contact | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<Contact>;
  if (typeof c.id !== "string" || typeof c.personName !== "string") return null;
  return {
    id: c.id,
    organizationId: c.organizationId ?? DEFAULT_ORG_ID,
    personName: c.personName,
    companyName: typeof c.companyName === "string" ? c.companyName : undefined,
    phone: typeof c.phone === "string" ? c.phone : undefined,
    contactVia: typeof c.contactVia === "string" ? c.contactVia : undefined,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : undefined,
  };
}

function parsePayment(raw: unknown): Payment | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Payment>;
  if (
    typeof p.id !== "string" ||
    typeof p.amount !== "number" ||
    typeof p.date !== "string" ||
    typeof p.method !== "string"
  ) {
    return null;
  }
  return {
    id: p.id,
    organizationId: p.organizationId ?? DEFAULT_ORG_ID,
    invoiceId: p.invoiceId,
    projectId: p.projectId,
    amount: p.amount,
    date: p.date,
    method: p.method,
    referenceNumber: p.referenceNumber,
    transactionId: p.transactionId,
    screenshotDataUrl: p.screenshotDataUrl,
    notes: p.notes,
  };
}

function parseFounder(raw: unknown): Founder | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<Founder>;
  if (
    typeof f.id !== "string" ||
    typeof f.name !== "string" ||
    typeof f.sharePercentage !== "number"
  )
    return null;
  return {
    id: f.id,
    name: f.name,
    sharePercentage: f.sharePercentage,
    notes: f.notes,
  };
}

function parseTransaction(raw: unknown): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Transaction>;
  if (
    typeof t.id !== "string" ||
    typeof t.type !== "string" ||
    typeof t.date !== "string" ||
    typeof t.amount !== "number" ||
    typeof t.description !== "string"
  ) {
    return null;
  }
  return {
    id: t.id,
    organizationId: t.organizationId ?? DEFAULT_ORG_ID,
    type: t.type as TransactionType,
    date: t.date,
    amount: t.amount,
    description: t.description,
    category: t.category ?? "",
    paymentMethod: t.paymentMethod ?? "",
    vendor: t.vendor,
    gst: typeof t.gst === "number" ? t.gst : undefined,
    relatedClientId: t.relatedClientId,
    relatedProjectId: t.relatedProjectId,
    relatedInvoiceId: t.relatedInvoiceId,
    relatedFounderId: t.relatedFounderId,
    relatedTeamMemberId:
      typeof t.relatedTeamMemberId === "string" ? t.relatedTeamMemberId : undefined,
    payrollMonth:
      typeof t.payrollMonth === "string" && /^\d{4}-\d{2}$/.test(t.payrollMonth)
        ? t.payrollMonth
        : undefined,
    salaryBaseAmount: typeof t.salaryBaseAmount === "number" ? t.salaryBaseAmount : undefined,
    salaryBonusAmount: typeof t.salaryBonusAmount === "number" ? t.salaryBonusAmount : undefined,
    fixedMonthlyExpenseId:
      typeof t.fixedMonthlyExpenseId === "string" ? t.fixedMonthlyExpenseId : undefined,
    relatedVendorId: t.relatedVendorId,
    notes: t.notes,
    attachmentDataUrl: t.attachmentDataUrl,
    createdBy: t.createdBy,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    historical: t.historical === true,
  };
}

const DEFAULT_ORG_ID = "org-admark-digitals";

const DEFAULT_FOUNDERS: Founder[] = [
  { id: "member-harshith", name: "Harshith V Malipatil", sharePercentage: 25 },
  { id: "member-prajwal", name: "Prajwal BP", sharePercentage: 25 },
  { id: "member-tejasvi", name: "Tejasvi Jois", sharePercentage: 25 },
  { id: "member-revanth", name: "Revanth Kumar S", sharePercentage: 25 },
];

function injectTenantIntoOperations(data: OperationsData): OperationsData {
  return {
    ...data,
    projects: data.projects.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
    partnerships: data.partnerships.map((p) => ({ ...p, organizationId: DEFAULT_ORG_ID })),
    expenses: data.expenses.map((e) => ({ ...e, organizationId: DEFAULT_ORG_ID })),
    leads: data.leads?.map((l) => ({ ...l, organizationId: DEFAULT_ORG_ID })),
    assets: data.assets?.map((a) => ({ ...a, organizationId: DEFAULT_ORG_ID })),
    clients: data.clients?.map((c) => ({ ...c, organizationId: DEFAULT_ORG_ID })),
    contacts: data.contacts?.map((c) => ({ ...c, organizationId: DEFAULT_ORG_ID })),
    payments: data.payments?.map((pay) => ({ ...pay, organizationId: DEFAULT_ORG_ID })),
    transactions: data.transactions?.map((t) => ({ ...t, organizationId: DEFAULT_ORG_ID })),
  };
}

function parseNotification(raw: unknown): AppNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Partial<AppNotification>;
  if (
    typeof n.id !== "string" ||
    typeof n.title !== "string" ||
    typeof n.message !== "string" ||
    typeof n.timestamp !== "string"
  ) {
    return null;
  }
  const priority =
    n.priority === "low" || n.priority === "medium" || n.priority === "high"
      ? n.priority
      : "medium";
  const relatedModule =
    n.relatedModule === "invoices" ||
    n.relatedModule === "payments" ||
    n.relatedModule === "accounts" ||
    n.relatedModule === "projects" ||
    n.relatedModule === "leads" ||
    n.relatedModule === "documents" ||
    n.relatedModule === "calendar" ||
    n.relatedModule === "system"
      ? n.relatedModule
      : "system";
  return {
    id: n.id,
    title: n.title,
    message: n.message,
    priority,
    read: n.read === true,
    timestamp: n.timestamp,
    relatedModule,
    actionUrl: typeof n.actionUrl === "string" ? n.actionUrl : undefined,
    actionLabel: typeof n.actionLabel === "string" ? n.actionLabel : undefined,
  };
}

function parseMilestone(raw: unknown): Milestone | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Partial<Milestone>;
  if (typeof m.id !== "string" || typeof m.name !== "string") return null;
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    dueDate: m.dueDate,
    status:
      m.status === "in_progress" || m.status === "completed" || m.status === "delayed"
        ? m.status
        : "pending",
    paymentTrigger: m.paymentTrigger === true,
    assignedUser: m.assignedUser,
    completedDate: m.completedDate,
  };
}

function parseProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Project>;
  if (typeof p.id !== "string" || typeof p.client !== "string") return null;

  const milestones = Array.isArray(p.milestones)
    ? p.milestones.map(parseMilestone).filter((m): m is Milestone => m != null)
    : undefined;

  return {
    id: p.id,
    organizationId: p.organizationId ?? DEFAULT_ORG_ID,
    clientId: p.clientId,
    leadId: typeof p.leadId === "string" ? p.leadId : undefined,
    client: p.client,
    name: p.name ?? p.client,
    projectType: p.projectType,
    status: p.status as ProjectStatus,
    revenueValue: p.revenueValue,
    billing: p.billing,
    paymentStatus: p.paymentStatus,
    paymentProofs: p.paymentProofs,
    historicalReceived: typeof p.historicalReceived === "number" ? p.historicalReceived : undefined,
    historicalOutstanding:
      typeof p.historicalOutstanding === "number" || p.historicalOutstanding === null
        ? p.historicalOutstanding
        : undefined,
    payments: p.payments,
    startDate: p.startDate,
    endDate: p.endDate,
    deadline: p.deadline,
    budget: typeof p.budget === "number" ? p.budget : undefined,
    estimatedCost: typeof p.estimatedCost === "number" ? p.estimatedCost : undefined,
    priority:
      p.priority === "low" || p.priority === "medium" || p.priority === "high"
        ? p.priority
        : undefined,
    assignedPartner: typeof p.assignedPartner === "string" ? p.assignedPartner : undefined,
    assignedMembers: Array.isArray(p.assignedMembers)
      ? p.assignedMembers.filter((id): id is string => typeof id === "string")
      : undefined,
    notes: p.notes,
    milestones,
    phone: p.phone,
    email: p.email,
  };
}

function parseOperationsPayload(
  payload: unknown,
  options: { applyBillingRepairs?: boolean } = {},
): OperationsData {
  const applyBillingRepairs = options.applyBillingRepairs !== false;
  if (!payload || typeof payload !== "object") return EMPTY_OPERATIONS;
  const raw = payload as Partial<OperationsData>;
  const fixedMonthlyExpenses = Array.isArray(raw.fixedMonthlyExpenses)
    ? raw.fixedMonthlyExpenses
        .map(parseFixedMonthlyExpense)
        .filter((e): e is FixedMonthlyExpense => e != null)
    : undefined;
  const assets = Array.isArray(raw.assets) ? raw.assets : [];
  const leads = Array.isArray(raw.leads)
    ? raw.leads.map(parseLead).filter((l): l is Lead => l != null)
    : undefined;
  const clients = Array.isArray(raw.clients)
    ? raw.clients.map(parseClient).filter((c): c is Client => c != null)
    : undefined;
  const contacts = Array.isArray(raw.contacts)
    ? raw.contacts.map(parseContact).filter((c): c is Contact => c != null)
    : undefined;
  const payments = Array.isArray(raw.payments)
    ? raw.payments.map(parsePayment).filter((pay): pay is Payment => pay != null)
    : undefined;
  const transactions = Array.isArray(raw.transactions)
    ? raw.transactions.map(parseTransaction).filter((t): t is Transaction => t != null)
    : undefined;
  const founders = Array.isArray(raw.founders)
    ? raw.founders.map(parseFounder).filter((f): f is Founder => f != null)
    : DEFAULT_FOUNDERS;
  const scheduleEvents = Array.isArray(raw.scheduleEvents)
    ? raw.scheduleEvents
        .map(parseScheduleEvent)
        .filter((event): event is ScheduleEvent => event != null)
    : [];
  const valuationSettings = raw.valuationSettings
    ? normalizeValuationSettings(raw.valuationSettings)
    : undefined;
  const valuationSnapshots = Array.isArray(raw.valuationSnapshots)
    ? raw.valuationSnapshots
        .map(parseValuationSnapshot)
        .filter((item): item is ValuationSnapshot => item != null)
    : [];
  const valuationAudit = Array.isArray(raw.valuationAudit)
    ? raw.valuationAudit
        .map(parseValuationAudit)
        .filter((item): item is ValuationAuditEntry => item != null)
    : [];
  const notifications = Array.isArray(raw.notifications)
    ? raw.notifications.map(parseNotification).filter((n): n is AppNotification => n != null)
    : undefined;
  const parsed = injectTenantIntoOperations({
    projects: Array.isArray(raw.projects)
      ? raw.projects.map(parseProject).filter((p): p is Project => p != null)
      : [],
    partnerships: Array.isArray(raw.partnerships) ? raw.partnerships : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
    leads,
    assets,
    financialBaseline: parseFinancialBaseline(raw.financialBaseline) ?? DEFAULT_FINANCIAL_BASELINE,
    fixedMonthlyExpenses,
    clients,
    contacts,
    payments,
    transactions,
    founders,
    notifications,
    scheduleEvents,
    valuationSettings,
    valuationSnapshots,
    valuationAudit,
    dismissedNotificationIds: Array.isArray(raw.dismissedNotificationIds)
      ? raw.dismissedNotificationIds.filter((id): id is string => typeof id === "string")
      : undefined,
    migrationApplied: raw.migrationApplied === true,
    migrationDate: typeof raw.migrationDate === "string" ? raw.migrationDate : undefined,
    groundZeroApplied: raw.groundZeroApplied === true,
    blxRepairApplied: raw.blxRepairApplied === true,
    neRepairApplied: raw.neRepairApplied === true,
    kapilaRetainerRepairApplied: raw.kapilaRetainerRepairApplied === true,
    rentManagementContractRepairApplied: raw.rentManagementContractRepairApplied === true,
    historicalExpenseReconciliationApplied: raw.historicalExpenseReconciliationApplied === true,
  });
  return applyBillingRepairs ? applyProductionBillingRepairs(parsed) : parsed;
}

export const getOperationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<VersionedOperations> => {
    await assertAppSession();
    assertRelationalMode();
    const sb = requireServerSupabase();
    const [{ data: versionRow, error }, operations] = await Promise.all([
      sb.from("operations_data").select("updated_at").eq("id", "default").maybeSingle(),
      cacheThrough(CACHE_KEYS.operations, loadRelationalOperations),
    ]);
    if (error) throw error;
    if (!versionRow?.updated_at) {
      throw new Error("operations_data/default is missing a concurrency version.");
    }
    return { data: operations, version: versionRow.updated_at };
  },
);

function assertDeletesAuthorized(input: SaveOperationsMutationInput): void {
  if (input.allowAllDeletes) return;
  for (const [rawKey, ids] of Object.entries(input.mutation.deletes)) {
    if (!ids?.length) continue;
    const key = rawKey as OperationsEntityKey;
    const allowed = new Set(input.allowedDeleteIds?.[key] ?? []);
    const unauthorized = ids.filter((id) => !allowed.has(id));
    if (unauthorized.length > 0) {
      throw new Error(`Refused unauthorized ${key} delete(s). Explicit delete intent is required.`);
    }
  }
}

export const saveOperationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveOperationsMutationInput) => data)
  .handler(async ({ data }): Promise<SaveOperationsMutationResult> => {
    await assertAppSession();
    assertRelationalMode();
    assertDeletesAuthorized(data);

    const version = await readLegacyVersionToken("default");
    if (version !== data.expectedVersion) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return { ok: false, conflict: true, data: latest, version };
    }
    if (isOperationsMutationEmpty(data.mutation)) {
      const cached = await cacheThrough(CACHE_KEYS.operations, loadRelationalOperations);
      return { ok: true, data: cached, version };
    }

    const current = await loadRelationalOperations();
    const finalized = applyProductionBillingRepairs(
      applyOperationsMutation(current, data.mutation),
    );
    await saveRelationalOperations(finalized);

    const bumped = await bumpLegacyVersionToken("default", data.expectedVersion);
    if (!bumped.ok) {
      const latest = await loadRelationalOperations();
      cacheSet(CACHE_KEYS.operations, latest);
      return { ok: false, conflict: true, data: latest, version: bumped.version };
    }

    cacheSet(CACHE_KEYS.operations, finalized);
    return { ok: true, data: finalized, version: bumped.version };
  });
