import { calendarMonthKey, toLocalISODate } from "@/lib/date-range-filter";
import { formatINRWhole } from "@/lib/invoice-calc";
import type {
  CompanyMember,
  CompanySettings,
  FixedMonthlyExpense,
  OperationsData,
  SalaryMonthPayment,
  SalaryPaymentMode,
  TeamMemberType,
} from "@/lib/types";
import { BUILTIN_MEMBER_TYPES, BUILTIN_TEAM_GROUPS } from "@/lib/types";

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const COMPANY_START_YEAR = 2026;
export const COMPANY_PAYROLL_EPOCH = "2026-06";

export const MEMBER_TYPE_SECTIONS: Array<{
  value: TeamMemberType;
  label: string;
  formLabel: string;
}> = [
  { value: "founder", label: "Founders", formLabel: "Founder" },
  { value: "employee", label: "Employees", formLabel: "Employee" },
  { value: "intern", label: "Interns", formLabel: "Intern" },
  { value: "contractor", label: "Contractors", formLabel: "Contractor" },
];

export const TEAM_GROUP_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "development", label: "Development" },
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
];

export const CUSTOM_TYPE_VALUE = "__custom__";

export function isBuiltinMemberType(value: string | undefined): boolean {
  return BUILTIN_MEMBER_TYPES.includes(value as (typeof BUILTIN_MEMBER_TYPES)[number]);
}

export function isBuiltinTeamGroup(value: string | undefined): boolean {
  return BUILTIN_TEAM_GROUPS.includes(value as (typeof BUILTIN_TEAM_GROUPS)[number]);
}

export function memberTypeLabel(value: string | undefined): string {
  if (!value) return "Team member";
  const builtin = MEMBER_TYPE_SECTIONS.find((section) => section.value === value);
  return builtin?.formLabel ?? value;
}

export function teamGroupLabel(value: string | undefined): string {
  if (!value) return "";
  const builtin = TEAM_GROUP_OPTIONS.find((option) => option.value === value);
  return builtin?.label ?? value;
}

function pushUniqueLabel(target: Map<string, string>, label: string | undefined) {
  const trimmed = label?.trim();
  if (!trimmed) return;
  const key = trimmed.toLowerCase();
  if (!target.has(key)) target.set(key, trimmed);
}

export function collectCustomMemberTypes(
  members: CompanyMember[],
  saved: string[] | undefined,
): string[] {
  const labels = new Map<string, string>();
  for (const label of saved ?? []) {
    if (!isBuiltinMemberType(label)) pushUniqueLabel(labels, label);
  }
  for (const member of members) {
    if (!isBuiltinMemberType(member.memberType)) pushUniqueLabel(labels, member.memberType);
  }
  return [...labels.values()];
}

export function collectCustomTeamGroups(
  members: CompanyMember[],
  saved: string[] | undefined,
): string[] {
  const labels = new Map<string, string>();
  for (const label of saved ?? []) {
    if (!isBuiltinTeamGroup(label)) pushUniqueLabel(labels, label);
  }
  for (const member of members) {
    if (!isBuiltinTeamGroup(member.teamGroup)) pushUniqueLabel(labels, member.teamGroup);
  }
  return [...labels.values()];
}

export function withDirectoryCatalogs(
  company: CompanySettings,
  members: CompanyMember[],
): Pick<CompanySettings, "customMemberTypes" | "customTeamGroups"> {
  return {
    customMemberTypes: collectCustomMemberTypes(members, company.customMemberTypes),
    customTeamGroups: collectCustomTeamGroups(members, company.customTeamGroups),
  };
}

const KNOWN_EMPLOYEE_CODES: Array<{ ids: string[]; name: RegExp; code: string }> = [
  { ids: ["member-tejasvi"], name: /\btejasvi\b/i, code: "ADM-001" },
  { ids: ["member-harshith"], name: /\bharshith\b/i, code: "ADM-002" },
  { ids: ["member-revanth"], name: /\brevanth\b/i, code: "ADM-003" },
  { ids: ["member-prajwal"], name: /\bprajwal\b/i, code: "ADM-004" },
  { ids: ["member-chetan"], name: /\bcheth?an\b/i, code: "ADM-005" },
  { ids: ["member-supreeth"], name: /\bsupreeth\b/i, code: "ADM-006" },
];

const PAYROLL_STARTED_MEMBER_IDS = new Set([
  "member-tejasvi",
  "member-revanth",
  "member-chetan",
  "member-supreeth",
]);

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** YYYY-MM keys for every month in a calendar year. */
export function monthsForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

/** Months shown on the payroll tracker — the company only pays salaries from June 2026. */
export function trackerMonthsForYear(year: number): string[] {
  return monthsForYear(year).filter((month) => month >= COMPANY_PAYROLL_EPOCH);
}

export function shortMonthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return MONTH_LABELS[index] ?? month;
}

export function currentMonthKey(): string {
  return calendarMonthKey();
}

export function currentYear(): number {
  return Number(currentMonthKey().slice(0, 4));
}

export function payrollYearOptions(selectedYear?: number): number[] {
  const latest = Math.max(
    currentYear() + 1,
    COMPANY_START_YEAR,
    selectedYear ?? COMPANY_START_YEAR,
  );
  const years: number[] = [];
  for (let year = COMPANY_START_YEAR; year <= latest; year += 1) years.push(year);
  return years;
}

export function monthKeyFromDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const month = iso.slice(0, 7);
  return MONTH_PATTERN.test(month) ? month : undefined;
}

export function firstDayOfMonth(month: string): string {
  return MONTH_PATTERN.test(month) ? `${month}-01` : toLocalISODate();
}

export function isPayrollStarted(member: CompanyMember): boolean {
  return Boolean(monthKeyFromDate(member.salaryStartDate));
}

export function isMonthEligible(member: CompanyMember, month: string): boolean {
  if (!MONTH_PATTERN.test(month)) return false;
  if (month < COMPANY_PAYROLL_EPOCH) return false;
  const start = monthKeyFromDate(member.salaryStartDate);
  if (!start) return false;
  return month >= start;
}

export function salaryScheduleForMember(
  ops: OperationsData,
  memberId: string,
): FixedMonthlyExpense | undefined {
  return (ops.fixedMonthlyExpenses ?? []).find(
    (item) => item.kind === "salary" && item.teamMemberId === memberId,
  );
}

export function parseSalaryMonthPayment(raw: unknown): SalaryMonthPayment | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const month = typeof value.month === "string" ? value.month : "";
  if (!MONTH_PATTERN.test(month)) return null;
  const salaryAmount = Number(value.salaryAmount);
  if (!Number.isFinite(salaryAmount) || salaryAmount < 0) return null;
  const bonusRaw = value.bonusAmount;
  const bonusAmount =
    bonusRaw === undefined || bonusRaw === null || bonusRaw === "" ? 0 : Number(bonusRaw);
  if (!Number.isFinite(bonusAmount) || bonusAmount < 0) return null;
  const mode: SalaryPaymentMode =
    value.mode === "partial" || value.mode === "extra" || value.mode === "full"
      ? value.mode
      : bonusAmount > 0
        ? "extra"
        : "full";
  const note = typeof value.note === "string" && value.note.trim() ? value.note.trim() : undefined;
  return {
    month,
    mode,
    salaryAmount,
    bonusAmount: bonusAmount > 0 ? bonusAmount : undefined,
    note,
  };
}

export function parseSalaryMonthPayments(raw: unknown): SalaryMonthPayment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const parsed = raw
    .map(parseSalaryMonthPayment)
    .filter((item): item is SalaryMonthPayment => item != null);
  return parsed.length ? parsed : undefined;
}

export function monthPaymentsFromSchedule(
  schedule: FixedMonthlyExpense | undefined,
): SalaryMonthPayment[] {
  if (!schedule) return [];
  if (schedule.monthPayments?.length) {
    return [...schedule.monthPayments].sort((a, b) => a.month.localeCompare(b.month));
  }
  const amount = schedule.amountPerMonth ?? 0;
  return (schedule.paidMonths ?? [])
    .filter((month) => MONTH_PATTERN.test(month))
    .map((month) => ({
      month,
      mode: "full" as const,
      salaryAmount: amount,
    }));
}

export function paymentForMonth(
  ops: OperationsData,
  memberId: string,
  month: string,
): SalaryMonthPayment | undefined {
  return monthPaymentsFromSchedule(salaryScheduleForMember(ops, memberId)).find(
    (item) => item.month === month,
  );
}

export function isMonthPaid(ops: OperationsData, memberId: string, month: string): boolean {
  return paymentForMonth(ops, memberId, month) != null;
}

export function paymentTotal(payment: SalaryMonthPayment): number {
  return payment.salaryAmount + (payment.bonusAmount ?? 0);
}

/** Sum of recorded payroll through the current month. Grows as months are marked paid. */
export function totalSalaryPaidUntilToday(ops: OperationsData, memberId: string): number {
  const through = currentMonthKey();
  return monthPaymentsFromSchedule(salaryScheduleForMember(ops, memberId))
    .filter((item) => item.month <= through)
    .reduce((sum, item) => sum + paymentTotal(item), 0);
}

export function formatINRCompact(amount: number): string {
  if (amount >= 100_000) {
    const lakhs = amount / 100_000;
    return `₹${Number.isInteger(lakhs) ? lakhs.toFixed(0) : lakhs.toFixed(1)}L`;
  }
  if (amount >= 1_000) {
    const thousands = amount / 1_000;
    return `₹${Number.isInteger(thousands) ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
  }
  return `₹${Math.round(amount)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function formatSalary(amount: number | undefined): string {
  return amount != null && amount > 0 ? formatINRWhole(amount) : "—";
}

export function countPaidInYear(ops: OperationsData, memberId: string, year: number): number {
  const prefix = `${year}-`;
  return monthPaymentsFromSchedule(salaryScheduleForMember(ops, memberId)).filter((item) =>
    item.month.startsWith(prefix),
  ).length;
}

function withSyncedMonths(schedule: FixedMonthlyExpense): FixedMonthlyExpense {
  const monthPayments = monthPaymentsFromSchedule(schedule);
  return {
    ...schedule,
    monthPayments,
    paidMonths: monthPayments.map((item) => item.month),
  };
}

/** Upsert a tracking schedule only when payroll has started. Does not touch Accounts. */
export function upsertSalarySchedule(ops: OperationsData, member: CompanyMember): OperationsData {
  if (!isPayrollStarted(member)) return ops;

  const schedules = ops.fixedMonthlyExpenses ?? [];
  const scheduleIndex = schedules.findIndex(
    (item) => item.kind === "salary" && item.teamMemberId === member.id,
  );
  const existing = scheduleIndex >= 0 ? schedules[scheduleIndex] : undefined;
  const startDate = member.salaryStartDate || existing?.startDate || `${COMPANY_PAYROLL_EPOCH}-01`;
  const amount = member.baseMonthlySalary ?? existing?.amountPerMonth ?? 0;
  const reminderDay =
    member.salaryDueDay ?? existing?.reminderDay ?? (Number(startDate.slice(8, 10)) || 1);

  const salarySchedule = withSyncedMonths({
    ...(existing ?? {}),
    id: existing?.id ?? `fx_salary_${member.id}`,
    label: `${member.name} salary`,
    payee: member.name,
    teamMemberId: member.id,
    amountPerMonth: amount,
    kind: "salary",
    startDate,
    reminderDay,
    paidMonths: existing?.paidMonths ?? [],
    monthPayments: existing?.monthPayments,
    status: member.status === "inactive" ? "paused" : (existing?.status ?? "active"),
    active: member.status !== "inactive",
    notes: existing?.notes,
  });

  const nextSchedules =
    scheduleIndex >= 0
      ? schedules.map((item, index) => (index === scheduleIndex ? salarySchedule : item))
      : [...schedules, salarySchedule];

  return { ...ops, fixedMonthlyExpenses: nextSchedules };
}

export function recordSalaryPayment(
  ops: OperationsData,
  member: CompanyMember,
  payment: SalaryMonthPayment,
): OperationsData {
  if (!MONTH_PATTERN.test(payment.month) || !isMonthEligible(member, payment.month)) return ops;

  const withSchedule = salaryScheduleForMember(ops, member.id)
    ? ops
    : upsertSalarySchedule(ops, member);
  const schedules = withSchedule.fixedMonthlyExpenses ?? [];
  const nextSchedules = schedules.map((item) => {
    if (item.kind !== "salary" || item.teamMemberId !== member.id) return item;
    const nextPayments = monthPaymentsFromSchedule(item).filter(
      (candidate) => candidate.month !== payment.month,
    );
    nextPayments.push({
      month: payment.month,
      mode: payment.mode,
      salaryAmount: payment.salaryAmount,
      bonusAmount: payment.bonusAmount && payment.bonusAmount > 0 ? payment.bonusAmount : undefined,
      note: payment.note,
    });
    return withSyncedMonths({ ...item, monthPayments: nextPayments });
  });
  return { ...withSchedule, fixedMonthlyExpenses: nextSchedules };
}

export function clearSalaryPayment(
  ops: OperationsData,
  member: CompanyMember,
  month: string,
): OperationsData {
  const schedules = ops.fixedMonthlyExpenses ?? [];
  const nextSchedules = schedules.map((item) => {
    if (item.kind !== "salary" || item.teamMemberId !== member.id) return item;
    return withSyncedMonths({
      ...item,
      monthPayments: monthPaymentsFromSchedule(item).filter(
        (candidate) => candidate.month !== month,
      ),
    });
  });
  return { ...ops, fixedMonthlyExpenses: nextSchedules };
}

/** Ensure started members have a salary tracking schedule. Skip people not on payroll. */
export function ensureSalarySchedules(
  ops: OperationsData,
  members: CompanyMember[],
): OperationsData {
  return members
    .filter(isPayrollStarted)
    .reduce((current, member) => upsertSalarySchedule(current, member), ops);
}

export function startPayroll(member: CompanyMember, month: string): CompanyMember {
  const startMonth = month >= COMPANY_PAYROLL_EPOCH ? month : COMPANY_PAYROLL_EPOCH;
  return {
    ...member,
    salaryStartDate: firstDayOfMonth(startMonth),
  };
}

export function compareMembersByPayroll(a: CompanyMember, b: CompanyMember): number {
  const idDiff = (a.employeeId || "\uffff").localeCompare(b.employeeId || "\uffff", undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (idDiff) return idDiff;
  return a.name.localeCompare(b.name);
}

export function groupMembersByType(
  members: CompanyMember[],
  extraTypes: string[] = [],
): Array<{ type: TeamMemberType; label: string; members: CompanyMember[] }> {
  const sorted = [...members].sort(compareMembersByPayroll);
  const builtins = MEMBER_TYPE_SECTIONS.map((section) => ({
    type: section.value,
    label: section.label,
    members: sorted.filter((member) => (member.memberType ?? "employee") === section.value),
  }));
  const custom = collectCustomMemberTypes(members, extraTypes).map((label) => ({
    type: label,
    label,
    members: sorted.filter(
      (member) => (member.memberType ?? "").toLowerCase() === label.toLowerCase(),
    ),
  }));
  return [...builtins, ...custom];
}

export function formatEmployeeCode(sequence: number): string {
  return `ADM-${String(sequence).padStart(3, "0")}`;
}

export function nextEmployeeId(members: CompanyMember[]): string {
  const used = new Set(
    members.map((member) => member.employeeId).filter((code): code is string => Boolean(code)),
  );
  let sequence = 1;
  while (used.has(formatEmployeeCode(sequence))) sequence += 1;
  return formatEmployeeCode(sequence);
}

export function knownEmployeeCodeFor(
  member: Pick<CompanyMember, "id" | "name">,
): string | undefined {
  const match = KNOWN_EMPLOYEE_CODES.find(
    (entry) => entry.ids.includes(member.id) || entry.name.test(member.name),
  );
  return match?.code;
}

export function applyKnownEmployeeIds(members: CompanyMember[]): CompanyMember[] {
  const used = new Set(
    members.map((member) => member.employeeId).filter((code): code is string => Boolean(code)),
  );
  return members.map((member) => {
    if (member.employeeId) return member;
    const known = knownEmployeeCodeFor(member);
    if (known && !used.has(known)) {
      used.add(known);
      return { ...member, employeeId: known };
    }
    let sequence = 1;
    while (used.has(formatEmployeeCode(sequence))) sequence += 1;
    const code = formatEmployeeCode(sequence);
    used.add(code);
    return { ...member, employeeId: code };
  });
}

export function applyKnownPayrollStarts(members: CompanyMember[]): CompanyMember[] {
  return members.map((member) => {
    if (member.salaryStartDate) return member;
    const isKnownStarted =
      PAYROLL_STARTED_MEMBER_IDS.has(member.id) ||
      (/\b(tejasvi|revanth|cheth?an|supreeth)\b/i.test(member.name) &&
        !/\b(harshith|prajwal)\b/i.test(member.name));
    if (!isKnownStarted) return member;
    return { ...member, salaryStartDate: `${COMPANY_PAYROLL_EPOCH}-01` };
  });
}

export function applyTeamDirectoryDefaults(members: CompanyMember[]): CompanyMember[] {
  return applyKnownEmployeeIds(applyKnownPayrollStarts(members));
}

export function removeSalarySchedule(
  ops: OperationsData,
  memberId: string,
): { nextOps: OperationsData; removedScheduleIds: string[] } {
  const schedules = ops.fixedMonthlyExpenses ?? [];
  const removedScheduleIds: string[] = [];
  const nextSchedules = schedules.filter((item) => {
    if (item.kind === "salary" && item.teamMemberId === memberId) {
      if (item.id) removedScheduleIds.push(item.id);
      return false;
    }
    return true;
  });
  const nextProjects = (ops.projects ?? []).map((project) => {
    const assigned = project.assignedMembers ?? [];
    if (!assigned.includes(memberId) && project.assignedPartner !== memberId) return project;
    const filteredAssigned = assigned.filter((id) => id !== memberId);
    return {
      ...project,
      assignedMembers: filteredAssigned,
      assignedPartner:
        project.assignedPartner === memberId ? filteredAssigned[0] : project.assignedPartner,
    };
  });
  return {
    nextOps: {
      ...ops,
      fixedMonthlyExpenses: nextSchedules,
      projects: nextProjects,
    },
    removedScheduleIds,
  };
}

export function deleteCompanyMember(
  company: CompanySettings,
  memberId: string,
): { nextCompany: CompanySettings; removedMember?: CompanyMember } {
  const members = company.companyMembers ?? [];
  const removedMember = members.find((m) => m.id === memberId);
  const nextMembers = members.filter((m) => m.id !== memberId);
  const nextDeletedIds = Array.from(new Set([...(company.deletedMemberIds ?? []), memberId]));
  const nextCompany: CompanySettings = {
    ...company,
    companyMembers: nextMembers,
    deletedMemberIds: nextDeletedIds,
    ...withDirectoryCatalogs(company, nextMembers),
  };
  return { nextCompany, removedMember };
}

