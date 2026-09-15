import { calendarMonthKey } from "@/lib/date-range-filter";
import type {
  FixedMonthlyExpense,
  FixedMonthlyExpenseKind,
  OperationsData,
  ProjectCommission,
  ProjectCommissionSplit,
  Transaction,
} from "@/lib/types";

export const OFFICE_BILL_KINDS: FixedMonthlyExpenseKind[] = ["rent", "utility", "other"];
export const RENEWAL_KINDS: FixedMonthlyExpenseKind[] = ["subscription", "emi"];

/** Stored in recurring_expenses.notes so installment fields survive without prefs-only extras. */
const OPS_META_START = "<!--admark-ops:";
const OPS_META_END = "-->";

export type OpsExpenseMeta = {
  totalAmount?: number;
  priorPaidAmount?: number;
  priorPaidInstallments?: number;
  nextDueDate?: string;
  billingCycle?: "monthly" | "yearly";
  vendor?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

export function parseOpsExpenseNotes(raw: string | null | undefined): {
  notes?: string;
  meta: OpsExpenseMeta;
} {
  if (!raw) return { meta: {} };
  const start = raw.lastIndexOf(OPS_META_START);
  if (start < 0) return { notes: raw.trim() || undefined, meta: {} };
  const end = raw.indexOf(OPS_META_END, start);
  if (end < 0) return { notes: raw.trim() || undefined, meta: {} };
  let meta: OpsExpenseMeta = {};
  try {
    const parsed: unknown = JSON.parse(raw.slice(start + OPS_META_START.length, end));
    if (isRecord(parsed)) {
      meta = {
        totalAmount: positiveNumber(parsed.totalAmount),
        priorPaidAmount: positiveNumber(parsed.priorPaidAmount),
        priorPaidInstallments: positiveNumber(parsed.priorPaidInstallments)
          ? Math.floor(positiveNumber(parsed.priorPaidInstallments)!)
          : undefined,
        nextDueDate:
          typeof parsed.nextDueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.nextDueDate)
            ? parsed.nextDueDate
            : undefined,
        billingCycle:
          parsed.billingCycle === "yearly" || parsed.billingCycle === "monthly"
            ? parsed.billingCycle
            : undefined,
        vendor: typeof parsed.vendor === "string" && parsed.vendor.trim() ? parsed.vendor.trim() : undefined,
      };
    }
  } catch {
    return { notes: raw.trim() || undefined, meta: {} };
  }
  const notes = raw.slice(0, start).trimEnd();
  return { notes: notes || undefined, meta };
}

export function formatOpsExpenseNotes(
  notes: string | undefined,
  meta: OpsExpenseMeta,
): string | undefined {
  const compact: Record<string, string | number> = {};
  if (meta.totalAmount != null) compact.totalAmount = meta.totalAmount;
  if (meta.priorPaidAmount != null) compact.priorPaidAmount = meta.priorPaidAmount;
  if (meta.priorPaidInstallments != null)
    compact.priorPaidInstallments = meta.priorPaidInstallments;
  if (meta.nextDueDate) compact.nextDueDate = meta.nextDueDate;
  if (meta.billingCycle) compact.billingCycle = meta.billingCycle;
  if (meta.vendor) compact.vendor = meta.vendor;
  if (Object.keys(compact).length === 0) return notes?.trim() || undefined;
  const block = `${OPS_META_START}${JSON.stringify(compact)}${OPS_META_END}`;
  const head = notes?.trim();
  return head ? `${head}\n${block}` : block;
}

export function metaFromFixed(item: FixedMonthlyExpense): OpsExpenseMeta {
  return {
    totalAmount: item.totalAmount,
    priorPaidAmount: item.priorPaidAmount,
    priorPaidInstallments: item.priorPaidInstallments,
    nextDueDate: item.nextDueDate,
    billingCycle: item.billingCycle,
    vendor: item.vendor,
  };
}

export function isSalarySchedule(item: FixedMonthlyExpense): boolean {
  return item.kind === "salary";
}

export function isOfficeBill(item: FixedMonthlyExpense): boolean {
  if (isSalarySchedule(item)) return false;
  const kind = item.kind ?? "other";
  return OFFICE_BILL_KINDS.includes(kind);
}

export function isRenewalItem(item: FixedMonthlyExpense): boolean {
  if (isSalarySchedule(item)) return false;
  return RENEWAL_KINDS.includes(item.kind ?? "other");
}

export function currentMonthKey(now = new Date()): string {
  return calendarMonthKey(now);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return calendarMonthKey(new Date(y, m - 1 + delta, 1));
}

export function formatOpsMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function isActiveOpsExpense(item: FixedMonthlyExpense): boolean {
  return (item.status ?? (item.active ? "active" : "paused")) === "active";
}

export function isPaidForMonth(item: FixedMonthlyExpense, month: string): boolean {
  return (item.paidMonths ?? []).includes(month);
}

export function togglePaidMonth(item: FixedMonthlyExpense, month: string): FixedMonthlyExpense {
  const paid = new Set(item.paidMonths ?? []);
  if (paid.has(month)) paid.delete(month);
  else paid.add(month);
  return { ...item, paidMonths: [...paid].sort() };
}

export function recurrenceLabel(item: FixedMonthlyExpense): string {
  if (isRenewalItem(item)) {
    return item.billingCycle === "yearly" ? "Yearly" : "Monthly";
  }
  return "Monthly";
}

/** Due date shown for a selected ops month (YYYY-MM-DD when known). */
export function dueDateForOpsMonth(item: FixedMonthlyExpense, month: string): string | undefined {
  if (item.nextDueDate && /^\d{4}-\d{2}-\d{2}$/.test(item.nextDueDate)) {
    if (item.nextDueDate.startsWith(month) || isRenewalItem(item)) return item.nextDueDate;
  }
  if (item.reminderDay == null) return undefined;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return undefined;
  const lastDay = new Date(y, m, 0).getDate();
  const day = Math.min(Math.max(1, item.reminderDay), lastDay);
  return `${month}-${String(day).padStart(2, "0")}`;
}

export function officeBillsDueTotal(items: FixedMonthlyExpense[], month: string): {
  due: number;
  unpaid: number;
  unpaidCount: number;
} {
  return monthObligationTotals(items.filter(isOfficeBill), month);
}

/** Active office + software obligations for the selected month. */
export function monthObligationTotals(
  items: FixedMonthlyExpense[],
  month: string,
): {
  due: number;
  unpaid: number;
  unpaidCount: number;
} {
  const active = items.filter(
    (item) =>
      !isSalarySchedule(item) &&
      isActiveOpsExpense(item) &&
      (isOfficeBill(item) || isRenewalItem(item)),
  );
  let due = 0;
  let unpaid = 0;
  let unpaidCount = 0;
  for (const item of active) {
    const progress = installmentProgress(item);
    // Unpaid EMI/loan rows use nextPaymentAmount (may be a final differential).
    const monthAmount =
      !isPaidForMonth(item, month) && progress?.nextPaymentAmount != null
        ? progress.nextPaymentAmount
        : item.amountPerMonth;
    due += monthAmount;
    if (!isPaidForMonth(item, month)) {
      unpaid += monthAmount;
      unpaidCount += 1;
    }
  }
  return { due, unpaid, unpaidCount };
}

export function next30DaysRenewalTotal(
  items: FixedMonthlyExpense[],
  now = new Date(),
): number {
  return upcomingRenewals(items, 30, now).reduce((sum, item) => sum + item.amountPerMonth, 0);
}

export function openCommissionsTotal(commissions: ProjectCommission[]): number {
  return commissions
    .filter((c) => c.status !== "paid")
    .reduce((sum, c) => sum + commissionTotal(c), 0);
}

/** Optional Accounts expense — never called from Mark paid. */
export function buildFixedExpensePaymentTransaction(
  item: FixedMonthlyExpense,
  month: string,
  date: string,
): Transaction {
  const now = Date.now();
  const progress = installmentProgress(item);
  const amount =
    !isPaidForMonth(item, month) && progress?.nextPaymentAmount != null
      ? progress.nextPaymentAmount
      : item.amountPerMonth;
  const category = isOfficeBill(item)
    ? item.kind === "rent"
      ? "Rent"
      : item.kind === "utility"
        ? "Utilities"
        : "Office"
    : "Software";
  return {
    id: `tx-ops-${item.id}-${month}`,
    type: "expense",
    date,
    amount,
    description: `${item.label} · ${month}`,
    category,
    paymentMethod: "bank_transfer",
    vendor: item.vendor || item.payee,
    fixedMonthlyExpenseId: item.id,
    notes: item.notes,
    createdAt: now,
    updatedAt: now,
  };
}

/** Days until nextDueDate; negative if overdue. */
export function daysUntilDue(nextDueDate: string | undefined, now = new Date()): number | null {
  if (!nextDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) return null;
  const due = new Date(`${nextDueDate}T12:00:00`);
  const today = new Date(now);
  today.setHours(12, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

export function upcomingRenewals(
  items: FixedMonthlyExpense[],
  withinDays = 60,
  now = new Date(),
): Array<FixedMonthlyExpense & { daysLeft: number }> {
  return items
    .filter((item) => isRenewalItem(item) && (item.status ?? "active") === "active")
    .map((item) => {
      const daysLeft = daysUntilDue(item.nextDueDate, now);
      return daysLeft == null ? null : { ...item, daysLeft };
    })
    .filter((item): item is FixedMonthlyExpense & { daysLeft: number } => item != null)
    .filter((item) => item.daysLeft <= withinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export function commissionTotal(commission: ProjectCommission): number {
  return commission.splits.reduce((sum, split) => sum + (split.amount || 0), 0);
}

export function parseProjectCommission(raw: unknown): ProjectCommission | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Partial<ProjectCommission>;
  if (typeof c.id !== "string" || typeof c.projectId !== "string") return null;
  const splits = Array.isArray(c.splits)
    ? c.splits
        .map((split): ProjectCommissionSplit | null => {
          if (!split || typeof split !== "object") return null;
          const s = split as Partial<ProjectCommissionSplit>;
          if (typeof s.id !== "string" || typeof s.personName !== "string") return null;
          if (typeof s.amount !== "number" || !Number.isFinite(s.amount)) return null;
          return {
            id: s.id,
            personName: s.personName,
            teamMemberId: typeof s.teamMemberId === "string" ? s.teamMemberId : undefined,
            amount: s.amount,
            notes: typeof s.notes === "string" ? s.notes : undefined,
          };
        })
        .filter((s): s is ProjectCommissionSplit => s != null)
    : [];
  const status: ProjectCommission["status"] =
    c.status === "paid" || c.status === "partial" || c.status === "planned" ? c.status : "planned";
  const now = Date.now();
  return {
    id: c.id,
    projectId: c.projectId,
    label: typeof c.label === "string" ? c.label : undefined,
    splits,
    status,
    paidAt: typeof c.paidAt === "string" ? c.paidAt : undefined,
    notes: typeof c.notes === "string" ? c.notes : undefined,
    createdAt: typeof c.createdAt === "number" ? c.createdAt : now,
    updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now,
  };
}

export function buildCommissionPayoutTransactions(
  commission: ProjectCommission,
  projectName: string,
  date: string,
): Transaction[] {
  const now = Date.now();
  return commission.splits
    .filter((split) => split.amount > 0)
    .map((split) => ({
      id: `tx-comm-${commission.id}-${split.id}`,
      type: "expense" as const,
      date,
      amount: split.amount,
      description: `Commission: ${split.personName} — ${projectName}`,
      category: "Commission",
      paymentMethod: "bank_transfer",
      relatedProjectId: commission.projectId,
      relatedTeamMemberId: split.teamMemberId,
      notes: split.notes || commission.label || undefined,
      createdAt: now,
      updatedAt: now,
    }));
}

export function upsertFixedExpense(
  ops: OperationsData,
  saved: FixedMonthlyExpense,
): OperationsData {
  const list = ops.fixedMonthlyExpenses ?? [];
  const exists = list.some((item) => item.id === saved.id);
  return {
    ...ops,
    fixedMonthlyExpenses: exists
      ? list.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...list],
  };
}

export function removeFixedExpense(ops: OperationsData, id: string): OperationsData {
  return {
    ...ops,
    fixedMonthlyExpenses: (ops.fixedMonthlyExpenses ?? []).filter((item) => item.id !== id),
  };
}

export function upsertProjectCommission(
  ops: OperationsData,
  saved: ProjectCommission,
): OperationsData {
  const list = ops.projectCommissions ?? [];
  const exists = list.some((item) => item.id === saved.id);
  return {
    ...ops,
    projectCommissions: exists
      ? list.map((item) => (item.id === saved.id ? saved : item))
      : [saved, ...list],
  };
}

export function removeProjectCommission(ops: OperationsData, id: string): OperationsData {
  return {
    ...ops,
    projectCommissions: (ops.projectCommissions ?? []).filter((item) => item.id !== id),
  };
}

export type RecurringExpenseExtras = Pick<
  FixedMonthlyExpense,
  | "nextDueDate"
  | "billingCycle"
  | "vendor"
  | "totalAmount"
  | "priorPaidInstallments"
  | "priorPaidAmount"
>;

export function extrasFromFixed(item: FixedMonthlyExpense): RecurringExpenseExtras | null {
  if (
    !item.nextDueDate &&
    !item.billingCycle &&
    !item.vendor &&
    item.totalAmount == null &&
    item.priorPaidInstallments == null &&
    item.priorPaidAmount == null
  ) {
    return null;
  }
  return {
    nextDueDate: item.nextDueDate,
    billingCycle: item.billingCycle,
    vendor: item.vendor,
    totalAmount: item.totalAmount,
    priorPaidInstallments: item.priorPaidInstallments,
    priorPaidAmount: item.priorPaidAmount,
  };
}

export function applyExtrasMap(
  items: FixedMonthlyExpense[],
  extras: Record<string, RecurringExpenseExtras> | undefined,
): FixedMonthlyExpense[] {
  if (!extras) return items;
  return items.map((item) => {
    const extra = extras[item.id];
    if (!extra) return item;
    return {
      ...item,
      nextDueDate: extra.nextDueDate ?? item.nextDueDate,
      billingCycle: extra.billingCycle ?? item.billingCycle,
      vendor: extra.vendor ?? item.vendor,
      totalAmount: extra.totalAmount ?? item.totalAmount,
      priorPaidInstallments: extra.priorPaidInstallments ?? item.priorPaidInstallments,
      priorPaidAmount: extra.priorPaidAmount ?? item.priorPaidAmount,
    };
  });
}

/** Progress for EMI / fixed-term obligations. Null when not an installment plan. */
export type InstallmentProgress = {
  paidCount: number;
  totalCount: number | null;
  paidAmount: number;
  totalAmount: number | null;
  remainingAmount: number | null;
  remainingCount: number | null;
  complete: boolean;
  installmentAmount: number;
  /** Amount due on the next Mark as paid (may be a smaller final differential). */
  nextPaymentAmount: number | null;
  /** Last payment size when it differs from the regular installment; else null. */
  finalPaymentAmount: number | null;
};

export function installmentProgress(item: FixedMonthlyExpense): InstallmentProgress | null {
  const installment = item.amountPerMonth;
  const marked = (item.paidMonths ?? []).length;
  const markedAmount = marked * installment;

  const priorFromAmount = positiveNumber(item.priorPaidAmount) ?? 0;
  const priorFromCount = Math.max(0, Math.floor(item.priorPaidInstallments ?? 0)) * installment;
  // Prefer explicit rupees already paid; fall back to installment count × rate.
  const priorAmount = priorFromAmount > 0 ? priorFromAmount : priorFromCount;

  // Only use an explicit total obligation — never invent ₹ from months × rate.
  const totalAmount = positiveNumber(item.totalAmount) ?? null;

  const finalPaymentAmount =
    totalAmount != null && installment > 0
      ? (() => {
          const rem = totalAmount % installment;
          // Floating-safe: treat near-zero remainder as exact full installments.
          if (rem < 1e-6 || Math.abs(rem - installment) < 1e-6) return null;
          return rem;
        })()
      : null;

  // When totalAmount is set, derive payment-event count from amount + optional final
  // differential — ignore stale totalMonths that assumed equal ceil() installments.
  const totalCount =
    totalAmount != null && installment > 0
      ? Math.floor(totalAmount / installment + 1e-9) + (finalPaymentAmount != null ? 1 : 0)
      : item.totalMonths != null && item.totalMonths > 0
        ? Math.floor(item.totalMonths)
        : null;

  if (totalAmount == null && totalCount == null && priorAmount <= 0 && marked <= 0) {
    return null;
  }
  if (totalAmount == null && totalCount == null) return null;

  const paidAmountRaw = priorAmount + markedAmount;
  const paidAmount =
    totalAmount != null ? Math.min(totalAmount, Math.max(0, paidAmountRaw)) : Math.max(0, paidAmountRaw);

  const paidCount =
    installment > 0
      ? Math.min(
          totalCount ?? Number.POSITIVE_INFINITY,
          Math.floor(paidAmount / installment + 1e-9),
        )
      : marked;

  const remainingAmount =
    totalAmount != null ? Math.max(0, totalAmount - paidAmount) : null;

  const remainingCount =
    totalCount != null
      ? Math.max(0, totalCount - paidCount)
      : remainingAmount != null && installment > 0
        ? Math.ceil(remainingAmount / installment - 1e-9)
        : null;

  const nextPaymentAmount =
    remainingAmount != null && remainingAmount > 0 && installment > 0
      ? Math.min(installment, remainingAmount)
      : null;

  const complete =
    (remainingAmount != null && remainingAmount <= 0) ||
    (remainingCount != null && remainingCount <= 0 && totalCount != null);

  return {
    paidCount: Number.isFinite(paidCount) ? paidCount : marked,
    totalCount,
    paidAmount,
    totalAmount,
    remainingAmount,
    remainingCount,
    complete,
    installmentAmount: installment,
    nextPaymentAmount,
    finalPaymentAmount,
  };
}
