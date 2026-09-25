/**
 * Server-only read adapters over the `admark` relational schema.
 *
 * Each loader reconstructs the legacy UI models (see `src/lib/types.ts`) from the
 * normalized rows written by `scripts/migrate-json-to-relational.mjs`, so the app can
 * read from the relational store without any UI changes. Legacy string ids are
 * preserved through the `legacy_id` columns and fall back to the row UUID for records
 * created after the migration. These adapters never write data.
 */
import type { PostgrestError } from "@supabase/supabase-js";
import { applyProductionBillingRepairs } from "@/lib/ground-zero";
import {
  decodeArchiveDocumentNotes,
  inferDocumentLibrary,
  isArchiveDocumentType,
  normalizeCompanyName,
  parseArchiveDocumentType,
} from "@/lib/document-vault";
import { decodeLeadNotesFromStorage } from "@/lib/lead-stats";
import { decodeDirectoryNotes } from "@/lib/sales-sectors";
import { parseOpsExpenseNotes } from "@/lib/ops-costs";
import type {
  ActivityAction,
  ActivityEntity,
  ActivityLogEntry,
  Agreement,
  ArchiveDocument,
  AgreementCounterpartyType,
  AppNotification,
  AssetCategory,
  AssetEntry,
  Client,
  CompanyMember,
  CompanySettings,
  ComplianceDocument,
  Contact,
  DocumentsData,
  ExpenseEntry,
  ExpenseProof,
  FinancialBaseline,
  FixedMonthlyExpense,
  FixedMonthlyExpenseKind,
  FormOptionCatalogs,
  Founder,
  Invoice,
  Lead,
  LeadStatus,
  LineItem,
  Milestone,
  OperationsData,
  Partnership,
  PartnershipStatus,
  Payment,
  Project,
  ProjectBilling,
  ProjectPayment,
  ProjectStatus,
  ScheduleEvent,
  ScheduleEventStatus,
  TeamMemberType,
  Transaction,
  TransactionType,
  ValuationAuditEntry,
  ValuationSettings,
  ValuationSnapshot,
} from "@/lib/types";
import { DEFAULT_FINANCIAL_BASELINE } from "@/lib/default-financial-baseline";
import { parseSalaryMonthPayments } from "@/lib/team-payroll";
import { normalizeCompanySettings } from "@/lib/company-settings";
import { normalizeValuationSettings } from "@/lib/valuation-engine";
import { requireServerSupabase } from "./supabase-admin";

const ADMARK_SCHEMA = "admark";
const DEFAULT_ORG_LEGACY_ID = "org-admark-digitals";
const PAGE_SIZE = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Supabase plumbing
// ---------------------------------------------------------------------------

function admarkDb() {
  return requireServerSupabase().schema(ADMARK_SCHEMA);
}

type AdmarkDb = ReturnType<typeof admarkDb>;

function relationalTableError(table: string, error: PostgrestError): Error {
  const schemaHint =
    error.code === "PGRST106" || /schema/i.test(error.message)
      ? " Ensure the `admark` schema is exposed in the Supabase API settings and the schema migration has been applied."
      : "";
  return new Error(
    `Failed to read admark.${table}: ${error.message}${error.details ? ` (${error.details})` : ""}.${schemaHint}`,
  );
}

/** Reads every row of a table for one organization, paging past PostgREST's row cap. */
async function fetchAll<Row>(
  db: AdmarkDb,
  table: string,
  organizationId: string,
  options: { softDelete?: boolean; match?: Record<string, string> } = {},
): Promise<Row[]> {
  const { softDelete = true, match } = options;
  const rows: Row[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let query = db.from(table).select("*").eq("organization_id", organizationId);
    if (softDelete) query = query.is("deleted_at", null);
    if (match) {
      for (const [column, value] of Object.entries(match)) query = query.eq(column, value);
    }
    const { data, error } = await query
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw relationalTableError(table, error);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchMaybeSingle<Row>(
  db: AdmarkDb,
  table: string,
  organizationId: string,
): Promise<Row | null> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw relationalTableError(table, error);
  return (data as unknown as Row) ?? null;
}

interface OrganizationRef {
  id: string;
  legacyId: string;
}

async function resolveOrganization(db: AdmarkDb): Promise<OrganizationRef> {
  const { data, error } = await db
    .from("organizations")
    .select("id, legacy_id")
    .is("deleted_at", null);
  if (error) throw relationalTableError("organizations", error);
  const organizations = (data ?? []) as unknown as { id: string; legacy_id: string | null }[];
  const preferred =
    organizations.find((row) => row.legacy_id === DEFAULT_ORG_LEGACY_ID) ?? organizations[0];
  if (!preferred) {
    throw new Error(
      "Failed to read admark.organizations: no organization row exists. " +
        "Run `npm run db:migrate:apply` (scripts/migrate-json-to-relational.mjs) first.",
    );
  }
  return { id: preferred.id, legacyId: preferred.legacy_id ?? preferred.id };
}

// ---------------------------------------------------------------------------
// Row shapes (columns as returned by PostgREST)
// ---------------------------------------------------------------------------

interface BaseRow {
  id: string;
  legacy_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CompanyRow {
  id: string;
  name: string;
  tagline: string | null;
  logo_url: string | null;
  signature_url: string | null;
  gst_number: string | null;
  pan_number: string | null;
  udyam_document_url: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  authorized_name: string | null;
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  ifsc: string | null;
  branch: string | null;
  upi: string | null;
}

interface SettingsRow {
  default_payment_terms: string | null;
  default_remarks: string | null;
  default_payment_mode: string | null;
  application_preferences: unknown;
  feature_toggles: unknown;
}

interface ClientRow extends BaseRow {
  parent_client_id: string | null;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gst_number: string | null;
  pan_number: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  website: string | null;
  industry: string | null;
  client_since: string | null;
  status: string;
  notes: string | null;
}

interface TeamMemberRow extends BaseRow {
  name: string;
  email: string | null;
  phone: string | null;
  employee_code: string | null;
  role: string;
  member_type: string | null;
  team_group: string | null;
  job_title: string | null;
  join_date: string | null;
  status: string;
  base_monthly_salary: number | string | null;
  monthly_bonus_limit: number | string | null;
  salary_start_date: string | null;
  salary_due_day: number | string | null;
  founder_share_percentage: number | string | null;
  notes: string | null;
}

interface PartnershipRow extends BaseRow {
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  partnership_type: string | null;
  opportunity_type: string | null;
  status: string;
  notes: string | null;
}

interface LeadRow extends BaseRow {
  converted_client_id: string | null;
  source_partnership_id: string | null;
  assigned_team_member_id: string | null;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  expected_revenue: number | string | null;
  probability: number | string | null;
  expected_closing_date: string | null;
  notes: string | null;
}

interface AgreementRow extends BaseRow {
  client_id: string | null;
  title: string;
  legacy_counterparty_name: string | null;
  agreement_type: string;
  status: string;
  signed_date: string | null;
  expiry_date: string | null;
  notes: string | null;
  migration_review_required: boolean;
}

interface ProjectRow extends BaseRow {
  client_id: string | null;
  lead_id: string | null;
  agreement_id: string | null;
  display_name: string;
  project_type: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  deadline: string | null;
  budget: number | string | null;
  estimated_cost: number | string | null;
  contract_value: number | string | null;
  upfront_amount: number | string | null;
  maintenance_amount: number | string | null;
  maintenance_months: number | string | null;
  monthly_amount: number | string | null;
  monthly_months: number | string | null;
  monthly_start_date: string | null;
  monthly_end_date: string | null;
  historical_received: number | string;
  historical_outstanding: number | string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

interface ProjectAssignmentRow {
  id: string;
  project_id: string;
  team_member_id: string;
  ended_at: string | null;
}

interface MilestoneRow extends BaseRow {
  project_id: string;
  assigned_team_member_id: string | null;
  name: string;
  description: string | null;
  position: number;
  due_date: string | null;
  status: string;
  payment_trigger: boolean;
  completed_date: string | null;
}

interface InvoiceRow extends BaseRow {
  client_id: string;
  project_id: string | null;
  agreement_id: string | null;
  number: string;
  invoice_date: string;
  status: string;
  client_name_snapshot: string;
  client_business_type_snapshot: string | null;
  client_address_snapshot: string | null;
  client_contact_snapshot: string | null;
  client_phone_snapshot: string | null;
  client_email_snapshot: string | null;
  client_gstin_snapshot: string | null;
  advance: number | string;
  tax_percent: number | string;
  remarks: string | null;
  payment_terms: string | null;
  payment_mode: string | null;
  payment_date: string | null;
}

interface InvoiceLineRow extends BaseRow {
  invoice_id: string;
  description: string;
  quantity: number | string;
  rate: number | string;
  position: number;
}

interface RecurringExpenseRow extends BaseRow {
  label: string;
  payee: string | null;
  amount_per_month: number | string;
  expense_type: string;
  start_date: string;
  total_months: number | string | null;
  reminder_day: number | string | null;
  paid_months: string[] | null;
  status: string;
  notes: string | null;
}

interface SalaryRow extends BaseRow {
  team_member_id: string;
  salary_month: string;
  base_amount: number | string;
  bonus_amount: number | string;
}

interface ExpenseRow extends BaseRow {
  project_id: string | null;
  partnership_id: string | null;
  label: string;
  amount: number | string;
  expense_date: string;
  category: string | null;
  notes: string | null;
  historical: boolean;
}

interface TransactionRow extends BaseRow {
  client_id: string | null;
  project_id: string | null;
  invoice_id: string | null;
  team_member_id: string | null;
  expense_id: string | null;
  salary_id: string | null;
  recurring_expense_id: string | null;
  transaction_type: string;
  transaction_date: string;
  amount: number | string;
  description: string;
  category: string | null;
  payment_method: string | null;
  vendor: string | null;
  gst_amount: number | string | null;
  notes: string | null;
  payroll_month: string | null;
  salary_base_amount: number | string | null;
  salary_bonus_amount: number | string | null;
  created_by: string | null;
  historical: boolean;
}

interface PaymentRow extends BaseRow {
  transaction_id: string | null;
  client_id: string;
  invoice_id: string | null;
  project_id: string | null;
  amount: number | string;
  payment_date: string;
  payment_method: string | null;
  reference_number: string | null;
  external_transaction_id: string | null;
  notes: string | null;
  historical: boolean;
  recurring: boolean;
}

interface DocumentRow extends BaseRow {
  company_id: string | null;
  client_id: string | null;
  project_id: string | null;
  agreement_id: string | null;
  transaction_id: string | null;
  title: string;
  document_type: string;
  file_url: string | null;
  external_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  notes: string | null;
}

interface CalendarRow extends BaseRow {
  title: string;
  calendar_type: string;
  event_date: string;
  start_time: string;
  duration_minutes: number | string;
  attendees: string | null;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  reminder_minutes: number | string;
  status: string;
}

interface NotificationRow extends BaseRow {
  title: string;
  message: string;
  priority: string;
  read: boolean;
  occurred_at: string;
  related_module: string | null;
  action_url: string | null;
  action_label: string | null;
}

interface ActivityLogRow extends BaseRow {
  occurred_at: string;
  entity_type: string;
  action: string;
  summary: string;
  entity_legacy_id: string | null;
  entity_name: string | null;
  actor: string | null;
  metadata: unknown;
}

interface ValuationSnapshotRow extends BaseRow {
  valuation_date: string;
  calculated_valuation: number | string;
  revenue: number | string | null;
  assets: number | string | null;
  profit: number | string | null;
  growth: number | string | null;
  net_worth: number | string | null;
  enterprise_value: number | string | null;
  note: string | null;
  snapshot_data: unknown;
}

interface LegacyRecordMapRow {
  id: string;
  source_collection: string;
  legacy_id: string;
  target_id: string;
}

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function orUndefined<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const labels = value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
  return labels.length > 0 ? labels : undefined;
}

/** Preference overlay for team fields missing from older DBs (member_type / team_group / employee_code). */
function parseTeamDirectoryOverlay(
  value: unknown,
): Map<
  string,
  {
    memberType?: string;
    teamGroup?: string;
    employeeId?: string;
    role?: string;
  }
> {
  const map = new Map<
    string,
    {
      memberType?: string;
      teamGroup?: string;
      employeeId?: string;
      role?: string;
    }
  >();
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) continue;
    map.set(item.id, {
      memberType:
        typeof item.memberType === "string" && item.memberType.trim()
          ? item.memberType.trim()
          : undefined,
      teamGroup:
        typeof item.teamGroup === "string" && item.teamGroup.trim()
          ? item.teamGroup.trim()
          : undefined,
      employeeId:
        typeof item.employeeId === "string" && item.employeeId.trim()
          ? item.employeeId.trim()
          : undefined,
      role: typeof item.role === "string" && item.role.trim() ? item.role.trim() : undefined,
    });
  }
  return map;
}

function parseFormOptions(value: unknown): FormOptionCatalogs | undefined {
  if (!isRecord(value)) return undefined;
  const expenseCategories = parseStringList(value.expenseCategories);
  const incomeCategories = parseStringList(value.incomeCategories);
  const paymentMethods = parseStringList(value.paymentMethods);
  if (!expenseCategories && !incomeCategories && !paymentMethods) return undefined;
  return { expenseCategories, incomeCategories, paymentMethods };
}

function pickOne<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function toMillis(value: string | null | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function legacyIdOf(row: { id: string; legacy_id: string | null }): string {
  return row.legacy_id ?? row.id;
}

/** Removes keys with `undefined` values so spreads over defaults behave like legacy payloads. */
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

// ---------------------------------------------------------------------------
// Allowed value lists for the legacy unions
// ---------------------------------------------------------------------------

const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
  "cancelled",
];
const MILESTONE_STATUSES: readonly Milestone["status"][] = [
  "pending",
  "in_progress",
  "completed",
  "delayed",
];
const LEAD_STATUSES: readonly LeadStatus[] = [
  "new_lead",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
];
const PARTNERSHIP_STATUSES: readonly PartnershipStatus[] = ["active", "inactive", "prospect"];
const TRANSACTION_TYPES: readonly TransactionType[] = [
  "client_payment",
  "founder_investment",
  "founder_withdrawal",
  "expense",
  "refund",
  "internal_transfer",
  "adjustment",
];
const INVOICE_STATUSES: readonly Invoice["status"][] = [
  "draft",
  "generated",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "cancelled",
  "overdue",
];
const RECURRING_KINDS: readonly FixedMonthlyExpenseKind[] = [
  "salary",
  "emi",
  "rent",
  "subscription",
  "utility",
  "other",
];
const RECURRING_STATUSES: readonly NonNullable<FixedMonthlyExpense["status"]>[] = [
  "active",
  "paused",
  "completed",
];
const SCHEDULE_STATUSES: readonly ScheduleEventStatus[] = ["scheduled", "completed", "cancelled"];
const NOTIFICATION_PRIORITIES: readonly AppNotification["priority"][] = ["low", "medium", "high"];
const NOTIFICATION_MODULES: readonly AppNotification["relatedModule"][] = [
  "invoices",
  "payments",
  "accounts",
  "projects",
  "leads",
  "documents",
  "calendar",
  "system",
];
const ACTIVITY_ENTITIES: readonly ActivityEntity[] = [
  "project",
  "partnership",
  "expense",
  "invoice",
  "settings",
  "agreement",
  "document",
  "security",
];
const ACTIVITY_ACTIONS: readonly ActivityAction[] = [
  "created",
  "updated",
  "deleted",
  "payment_added",
  "payment_removed",
  "login",
  "logout",
  "failed_login",
];
const AGREEMENT_COUNTERPARTY_TYPES: readonly AgreementCounterpartyType[] = [
  "client",
  "partner",
  "vendor",
  "other",
];
const ASSET_CATEGORIES: readonly AssetCategory[] = [
  "equipment",
  "digital",
  "cash",
  "investment",
  "other",
];

/** Relational team roles → legacy member types. `advisor` has no legacy equivalent. */
const MEMBER_TYPE_BY_ROLE: Partial<Record<string, TeamMemberType>> = {
  founder: "founder",
  employee: "employee",
  intern: "intern",
  partner: "contractor",
};

// ---------------------------------------------------------------------------
// Settings `application_preferences` parsers (legacy JSON stored verbatim)
// ---------------------------------------------------------------------------

interface LegacyMigrationState {
  migrationApplied: boolean;
  migrationDate?: string;
  groundZeroApplied: boolean;
  blxRepairApplied: boolean;
  neRepairApplied: boolean;
  kapilaRetainerRepairApplied: boolean;
  rentManagementContractRepairApplied: boolean;
  historicalExpenseReconciliationApplied: boolean;
  dismissedNotificationIds?: string[];
}

function parseLegacyFinancialBaseline(raw: unknown): FinancialBaseline | undefined {
  if (!isRecord(raw)) return undefined;
  const asOfDate = asString(raw.asOfDate);
  const totalHandoutsTaken = asNumber(raw.totalHandoutsTaken);
  const totalRevenueReceived = asNumber(raw.totalRevenueReceived);
  if (!asOfDate || totalHandoutsTaken === undefined || totalRevenueReceived === undefined) {
    return undefined;
  }
  return {
    periodLabel: asString(raw.periodLabel) ?? DEFAULT_FINANCIAL_BASELINE.periodLabel,
    asOfDate,
    totalRevenueBooked: asNumber(raw.totalRevenueBooked) ?? null,
    totalHandoutsTaken,
    totalRevenueReceived,
    totalExternalPayouts: asNumber(raw.totalExternalPayouts) ?? 0,
    totalCompanyExpenses: asNumber(raw.totalCompanyExpenses) ?? 0,
    founderPayoutPool: asNumber(raw.founderPayoutPool) ?? 0,
  };
}

function parseLegacyAsset(raw: unknown): AssetEntry | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const name = asString(raw.name);
  const value = asNumber(raw.value);
  if (!id || !name || value === undefined) return null;
  return {
    id,
    name,
    category: pickOne(asString(raw.category), ASSET_CATEGORIES, "other"),
    value,
    acquiredDate: asString(raw.acquiredDate) ?? "",
    notes: asString(raw.notes),
  };
}

function parseLegacySalarySchedule(raw: unknown): FixedMonthlyExpense | null {
  if (!isRecord(raw)) return null;
  const id = asString(raw.id);
  const label = asString(raw.label);
  const amountPerMonth = asNumber(raw.amountPerMonth);
  if (!id || !label || amountPerMonth === undefined) return null;
  const status = pickOne(
    asString(raw.status),
    RECURRING_STATUSES,
    raw.active === false ? "paused" : "active",
  );
  const totalMonths = asNumber(raw.totalMonths);
  const reminderDay = asNumber(raw.reminderDay);
  return {
    id,
    label,
    payee: asString(raw.payee),
    teamMemberId: asString(raw.teamMemberId),
    amountPerMonth,
    kind: "salary",
    startDate: asString(raw.startDate) ?? "2026-01-01",
    totalMonths: totalMonths !== undefined && totalMonths > 0 ? Math.floor(totalMonths) : undefined,
    reminderDay:
      reminderDay !== undefined && reminderDay >= 1 && reminderDay <= 31
        ? Math.floor(reminderDay)
        : undefined,
    paidMonths: Array.isArray(raw.paidMonths)
      ? raw.paidMonths.filter(
          (month): month is string => typeof month === "string" && /^\d{4}-\d{2}$/.test(month),
        )
      : undefined,
    monthPayments: parseSalaryMonthPayments(raw.monthPayments),
    status,
    notes: asString(raw.notes),
    active: status === "active",
  };
}

function parseLegacyMigrationState(raw: unknown): LegacyMigrationState {
  const state = isRecord(raw) ? raw : {};
  return {
    migrationApplied: state.migrationApplied === true,
    migrationDate: asString(state.migrationDate),
    groundZeroApplied: state.groundZeroApplied === true,
    blxRepairApplied: state.blxRepairApplied === true,
    neRepairApplied: state.neRepairApplied === true,
    kapilaRetainerRepairApplied: state.kapilaRetainerRepairApplied === true,
    rentManagementContractRepairApplied: state.rentManagementContractRepairApplied === true,
    historicalExpenseReconciliationApplied: state.historicalExpenseReconciliationApplied === true,
    dismissedNotificationIds: Array.isArray(state.dismissedNotificationIds)
      ? state.dismissedNotificationIds.filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

interface ParsedApplicationPreferences {
  financialBaseline: FinancialBaseline;
  valuationSettings: ValuationSettings | undefined;
  assets: AssetEntry[];
  salarySchedules: FixedMonthlyExpense[];
  recurringExtras: Record<
    string,
    {
      nextDueDate?: string;
      billingCycle?: "monthly" | "yearly";
      vendor?: string;
      totalAmount?: number;
      priorPaidInstallments?: number;
      priorPaidAmount?: number;
    }
  >;
  projectCommissions: import("@/lib/types").ProjectCommission[];
  leadList: import("@/lib/types").LeadListEntry[];
  credentials: import("@/lib/types").CredentialEntry[];
  migrationState: LegacyMigrationState;
}

function parseApplicationPreferences(raw: unknown): ParsedApplicationPreferences {
  const preferences = isRecord(raw) ? raw : {};
  const legacyAssets = Array.isArray(preferences.legacyAssets) ? preferences.legacyAssets : [];
  const legacySalarySchedules = Array.isArray(preferences.legacySalarySchedules)
    ? preferences.legacySalarySchedules
    : [];
  const extrasRaw = isRecord(preferences.legacyRecurringExpenseExtras)
    ? preferences.legacyRecurringExpenseExtras
    : {};
  const recurringExtras: ParsedApplicationPreferences["recurringExtras"] = {};
  for (const [id, value] of Object.entries(extrasRaw)) {
    if (!isRecord(value)) continue;
    recurringExtras[id] = {
      nextDueDate:
        typeof value.nextDueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.nextDueDate)
          ? value.nextDueDate
          : undefined,
      billingCycle:
        value.billingCycle === "yearly" || value.billingCycle === "monthly"
          ? value.billingCycle
          : undefined,
      vendor: typeof value.vendor === "string" ? value.vendor : undefined,
      totalAmount:
        typeof value.totalAmount === "number" &&
        Number.isFinite(value.totalAmount) &&
        value.totalAmount > 0
          ? value.totalAmount
          : typeof value.totalAmount === "string" && Number(value.totalAmount) > 0
            ? Number(value.totalAmount)
            : undefined,
      priorPaidInstallments:
        typeof value.priorPaidInstallments === "number" &&
        Number.isFinite(value.priorPaidInstallments) &&
        value.priorPaidInstallments > 0
          ? Math.floor(value.priorPaidInstallments)
          : typeof value.priorPaidInstallments === "string" &&
              Number(value.priorPaidInstallments) > 0
            ? Math.floor(Number(value.priorPaidInstallments))
            : undefined,
      priorPaidAmount:
        typeof value.priorPaidAmount === "number" &&
        Number.isFinite(value.priorPaidAmount) &&
        value.priorPaidAmount > 0
          ? value.priorPaidAmount
          : typeof value.priorPaidAmount === "string" && Number(value.priorPaidAmount) > 0
            ? Number(value.priorPaidAmount)
            : undefined,
    };
  }
  const legacyCommissions = Array.isArray(preferences.legacyProjectCommissions)
    ? preferences.legacyProjectCommissions
    : [];
  const legacyLeadList = Array.isArray(preferences.legacyLeadList)
    ? preferences.legacyLeadList
    : [];
  const legacyCredentials = Array.isArray(preferences.legacyCredentials)
    ? preferences.legacyCredentials
    : [];
  return {
    financialBaseline:
      parseLegacyFinancialBaseline(preferences.legacyFinancialBaseline) ??
      DEFAULT_FINANCIAL_BASELINE,
    valuationSettings: isRecord(preferences.legacyValuationSettings)
      ? normalizeValuationSettings(
          preferences.legacyValuationSettings as unknown as Partial<ValuationSettings>,
        )
      : undefined,
    assets: legacyAssets
      .map(parseLegacyAsset)
      .filter((asset): asset is AssetEntry => asset !== null),
    salarySchedules: legacySalarySchedules
      .map(parseLegacySalarySchedule)
      .filter((schedule): schedule is FixedMonthlyExpense => schedule !== null),
    recurringExtras,
    projectCommissions: legacyCommissions
      .map((item) => {
        try {
          // Lazy import shape — parse inline to avoid circular deps
          if (!item || typeof item !== "object") return null;
          const c = item as Record<string, unknown>;
          if (typeof c.id !== "string" || typeof c.projectId !== "string") return null;
          const splits = Array.isArray(c.splits)
            ? c.splits
                .map((split) => {
                  if (!split || typeof split !== "object") return null;
                  const s = split as Record<string, unknown>;
                  if (typeof s.id !== "string" || typeof s.personName !== "string") return null;
                  if (typeof s.amount !== "number") return null;
                  return {
                    id: s.id,
                    personName: s.personName,
                    teamMemberId: typeof s.teamMemberId === "string" ? s.teamMemberId : undefined,
                    amount: s.amount,
                    notes: typeof s.notes === "string" ? s.notes : undefined,
                  };
                })
                .filter(Boolean)
            : [];
          return {
            id: c.id,
            projectId: c.projectId,
            label: typeof c.label === "string" ? c.label : undefined,
            splits: splits as import("@/lib/types").ProjectCommissionSplit[],
            status:
              c.status === "paid" || c.status === "partial" || c.status === "planned"
                ? c.status
                : "planned",
            paidAt: typeof c.paidAt === "string" ? c.paidAt : undefined,
            notes: typeof c.notes === "string" ? c.notes : undefined,
            createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
            updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
          } as import("@/lib/types").ProjectCommission;
        } catch {
          return null;
        }
      })
      .filter((c): c is import("@/lib/types").ProjectCommission => c != null),
    leadList: legacyLeadList
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Record<string, unknown>;
        if (typeof entry.id !== "string" || !entry.id.trim()) return null;
        if (typeof entry.externalId !== "string" || !entry.externalId.trim()) return null;
        if (typeof entry.title !== "string" || !entry.title.trim()) return null;
        const str = (value: unknown) =>
          typeof value === "string" && value.trim() ? value : undefined;
        return {
          id: entry.id,
          organizationId: str(entry.organizationId),
          externalId: entry.externalId,
          dateTime: str(entry.dateTime),
          phone: str(entry.phone),
          email: str(entry.email),
          title: entry.title.trim(),
          oneLiner: str(entry.oneLiner),
          xFactor: str(entry.xFactor),
          whatTheyWant: str(entry.whatTheyWant),
          platformModules: str(entry.platformModules),
          technicalStack: str(entry.technicalStack),
          keyNotes: str(entry.keyNotes),
          engagementCommercial: str(entry.engagementCommercial),
          applicationRequirements: str(entry.applicationRequirements),
          applicationIncludes: str(entry.applicationIncludes),
          mostValuableProof: str(entry.mostValuableProof),
          frameExpertiseAround: str(entry.frameExpertiseAround),
          intent: str(entry.intent),
          urgency: str(entry.urgency),
          closeWindow: str(entry.closeWindow),
          competition: str(entry.competition),
          projectType: str(entry.projectType),
          complexity: str(entry.complexity),
          engagementType: str(entry.engagementType),
          focus: str(entry.focus),
          category: str(entry.category),
          location: str(entry.location),
          informationLevel: str(entry.informationLevel),
          websiteStatus: str(entry.websiteStatus),
          growthPath: str(entry.growthPath),
          techFocus: str(entry.techFocus),
          keyDifferentiator: str(entry.keyDifferentiator),
          decisionDriver: str(entry.decisionDriver),
          leadScore:
            typeof entry.leadScore === "number" && Number.isFinite(entry.leadScore)
              ? entry.leadScore
              : undefined,
          redFlags: str(entry.redFlags),
          howToWin: str(entry.howToWin),
          angle: str(entry.angle),
          whyScore: str(entry.whyScore),
          strategicInsight: str(entry.strategicInsight),
          excellentFit: str(entry.excellentFit),
          poorFit: str(entry.poorFit),
          finalAssessment: str(entry.finalAssessment),
          fullOriginal: str(entry.fullOriginal),
          importedAt:
            typeof entry.importedAt === "string" && entry.importedAt
              ? entry.importedAt
              : new Date().toISOString(),
          contacted: entry.contacted === true,
          salesWon: entry.salesWon === true,
          sourceFileName: str(entry.sourceFileName),
        } as import("@/lib/types").LeadListEntry;
      })
      .filter((entry): entry is import("@/lib/types").LeadListEntry => entry != null),
    credentials: legacyCredentials
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const entry = item as Record<string, unknown>;
        if (typeof entry.id !== "string" || !entry.id.trim()) return null;
        if (typeof entry.service !== "string" || !entry.service.trim()) return null;
        const categories = [
          "Email",
          "Social",
          "Domain",
          "Cloud",
          "Development",
          "Hosting",
          "Database",
          "Other",
        ] as const;
        const category = categories.includes(entry.category as (typeof categories)[number])
          ? (entry.category as (typeof categories)[number])
          : "Other";
        const str = (value: unknown) =>
          typeof value === "string" && value.trim() ? value : undefined;
        return {
          id: entry.id.trim(),
          organizationId: str(entry.organizationId),
          category,
          service: entry.service.trim(),
          email: str(entry.email),
          username: str(entry.username),
          password: typeof entry.password === "string" ? entry.password : undefined,
          linkedTo: str(entry.linkedTo),
          otpMethod: str(entry.otpMethod),
          notes: str(entry.notes),
          updatedAt:
            typeof entry.updatedAt === "string" && entry.updatedAt.trim()
              ? entry.updatedAt
              : new Date().toISOString(),
        } as import("@/lib/types").CredentialEntry;
      })
      .filter((entry): entry is import("@/lib/types").CredentialEntry => entry != null),
    migrationState: parseLegacyMigrationState(preferences.legacyMigrationState),
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export async function loadRelationalOperations(): Promise<OperationsData> {
  const db = admarkDb();
  const org = await resolveOrganization(db);
  const [
    settingsRow,
    clientRows,
    teamMemberRows,
    partnershipRows,
    leadRows,
    projectRows,
    assignmentRows,
    milestoneRows,
    invoiceRows,
    recurringRows,
    salaryRows,
    expenseRows,
    transactionRows,
    paymentRows,
    documentRows,
    calendarRows,
    notificationRows,
    activityLogRows,
    valuationSnapshotRows,
    paymentSourceRows,
  ] = await Promise.all([
    fetchMaybeSingle<SettingsRow>(db, "settings", org.id),
    fetchAll<ClientRow>(db, "clients", org.id),
    fetchAll<TeamMemberRow>(db, "team_members", org.id),
    fetchAll<PartnershipRow>(db, "partnerships", org.id),
    fetchAll<LeadRow>(db, "leads", org.id),
    fetchAll<ProjectRow>(db, "projects", org.id),
    fetchAll<ProjectAssignmentRow>(db, "project_assignments", org.id),
    fetchAll<MilestoneRow>(db, "project_milestones", org.id),
    fetchAll<InvoiceRow>(db, "invoices", org.id),
    fetchAll<RecurringExpenseRow>(db, "recurring_expenses", org.id),
    fetchAll<SalaryRow>(db, "salaries", org.id),
    fetchAll<ExpenseRow>(db, "expenses", org.id),
    fetchAll<TransactionRow>(db, "transactions", org.id),
    fetchAll<PaymentRow>(db, "payments", org.id),
    fetchAll<DocumentRow>(db, "documents", org.id),
    fetchAll<CalendarRow>(db, "calendar", org.id),
    fetchAll<NotificationRow>(db, "notifications", org.id),
    fetchAll<ActivityLogRow>(db, "activity_logs", org.id),
    fetchAll<ValuationSnapshotRow>(db, "valuation_snapshots", org.id),
    fetchAll<LegacyRecordMapRow>(db, "legacy_record_map", org.id, {
      softDelete: false,
      match: { target_table: "payments" },
    }),
  ]);

  const preferences = parseApplicationPreferences(settingsRow?.application_preferences);

  // UUID → legacy-id lookup maps used to rebuild the legacy foreign keys.
  const clientLegacyById = new Map(clientRows.map((row) => [row.id, legacyIdOf(row)]));
  const clientNameById = new Map(clientRows.map((row) => [row.id, row.company_name]));
  const teamLegacyById = new Map(teamMemberRows.map((row) => [row.id, legacyIdOf(row)]));
  const partnershipLegacyById = new Map(partnershipRows.map((row) => [row.id, legacyIdOf(row)]));
  const leadLegacyById = new Map(leadRows.map((row) => [row.id, legacyIdOf(row)]));
  const projectLegacyById = new Map(projectRows.map((row) => [row.id, legacyIdOf(row)]));
  const invoiceLegacyById = new Map(invoiceRows.map((row) => [row.id, legacyIdOf(row)]));
  const recurringLegacyById = new Map(recurringRows.map((row) => [row.id, legacyIdOf(row)]));
  const salariesById = new Map(salaryRows.map((row) => [row.id, row]));

  const documentByLegacyId = new Map<string, DocumentRow>();
  const paymentProofByTransaction = new Map<string, DocumentRow>();
  const transactionProofByTransaction = new Map<string, DocumentRow>();
  for (const doc of documentRows) {
    documentByLegacyId.set(legacyIdOf(doc), doc);
    if (doc.transaction_id && doc.document_type === "payment_proof") {
      paymentProofByTransaction.set(doc.transaction_id, doc);
    }
    if (doc.transaction_id && doc.document_type === "transaction_proof") {
      transactionProofByTransaction.set(doc.transaction_id, doc);
    }
  }

  // --- Milestones & assignments grouped per project -------------------------
  const milestonesByProject = new Map<string, Milestone[]>();
  const orderedMilestoneRows = [...milestoneRows].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  for (const row of orderedMilestoneRows) {
    const milestone: Milestone = {
      id: legacyIdOf(row),
      name: row.name,
      description: orUndefined(row.description),
      dueDate: orUndefined(row.due_date),
      status: pickOne(row.status, MILESTONE_STATUSES, "pending"),
      paymentTrigger: row.payment_trigger === true,
      assignedUser: row.assigned_team_member_id
        ? teamLegacyById.get(row.assigned_team_member_id)
        : undefined,
      completedDate: orUndefined(row.completed_date),
    };
    const list = milestonesByProject.get(row.project_id) ?? [];
    list.push(milestone);
    milestonesByProject.set(row.project_id, list);
  }

  const membersByProject = new Map<string, string[]>();
  for (const row of assignmentRows) {
    if (row.ended_at) continue; // only active assignments count as assigned members
    const memberLegacyId = teamLegacyById.get(row.team_member_id);
    if (!memberLegacyId) continue;
    const list = membersByProject.get(row.project_id) ?? [];
    if (!list.includes(memberLegacyId)) list.push(memberLegacyId);
    membersByProject.set(row.project_id, list);
  }

  // --- Payments: split back into project payments and top-level payments ----
  const paymentSourceByLegacyId = new Map(
    paymentSourceRows.map((row) => [row.legacy_id, row.source_collection]),
  );

  function buildProof(
    row: PaymentRow,
    projectLegacyId: string | undefined,
  ): ProjectPayment["proof"] {
    const legacyId = legacyIdOf(row);
    const doc =
      (row.transaction_id ? paymentProofByTransaction.get(row.transaction_id) : undefined) ??
      (projectLegacyId
        ? documentByLegacyId.get(`project-payment-proof-${projectLegacyId}-${legacyId}`)
        : undefined);
    if (!doc?.file_url) return undefined;
    return {
      imageDataUrl: doc.file_url,
      fileName: orUndefined(doc.file_name),
      mimeType: orUndefined(doc.mime_type),
      uploadedAt: doc.created_at,
    };
  }

  const projectPaymentsByProject = new Map<string, ProjectPayment[]>();
  const topLevelPayments: Payment[] = [];
  for (const row of paymentRows) {
    const legacyId = legacyIdOf(row);
    const source = paymentSourceByLegacyId.get(legacyId);
    const projectLegacyId = row.project_id ? projectLegacyById.get(row.project_id) : undefined;
    if (source === "projectPayments" && row.project_id && projectLegacyId) {
      const payment: ProjectPayment = {
        id: legacyId,
        amount: asNumber(row.amount) ?? 0,
        date: row.payment_date,
        note: orUndefined(row.notes),
        recordedAfterMigration: row.historical ? undefined : true,
        recurring: row.recurring === true ? true : undefined,
        proof: buildProof(row, projectLegacyId),
      };
      const list = projectPaymentsByProject.get(row.project_id) ?? [];
      list.push(payment);
      projectPaymentsByProject.set(row.project_id, list);
      continue;
    }
    // Screenshot recovery relies on the payment's transaction link — proof documents
    // are owned by transactions, and documents have no direct payment owner column.
    const screenshotDoc = row.transaction_id
      ? (paymentProofByTransaction.get(row.transaction_id) ??
        transactionProofByTransaction.get(row.transaction_id))
      : undefined;
    topLevelPayments.push({
      id: legacyId,
      organizationId: org.legacyId,
      invoiceId: row.invoice_id ? invoiceLegacyById.get(row.invoice_id) : undefined,
      projectId: projectLegacyId,
      amount: asNumber(row.amount) ?? 0,
      date: row.payment_date,
      method: row.payment_method ?? "",
      referenceNumber: orUndefined(row.reference_number),
      transactionId: orUndefined(row.external_transaction_id),
      screenshotDataUrl: orUndefined(screenshotDoc?.file_url),
      notes: orUndefined(row.notes),
    });
  }
  for (const list of projectPaymentsByProject.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  topLevelPayments.sort((a, b) => a.date.localeCompare(b.date));

  // --- Projects --------------------------------------------------------------
  const projects: Project[] = projectRows.map((row) => {
    const billing: ProjectBilling = stripUndefined({
      contractValue: asNumber(row.contract_value),
      upfrontAmount: asNumber(row.upfront_amount),
      maintenanceAmount: asNumber(row.maintenance_amount),
      maintenanceMonths: asNumber(row.maintenance_months),
      monthlyAmount: asNumber(row.monthly_amount),
      monthlyMonths: asNumber(row.monthly_months),
      monthlyStartDate: orUndefined(row.monthly_start_date),
      monthlyEndDate: orUndefined(row.monthly_end_date),
    });
    const payments = projectPaymentsByProject.get(row.id);
    const milestones = milestonesByProject.get(row.id);
    const clientLegacyId = row.client_id ? clientLegacyById.get(row.client_id) : undefined;
    const leadLegacyId = row.lead_id ? leadLegacyById.get(row.lead_id) : undefined;
    return {
      id: legacyIdOf(row),
      organizationId: org.legacyId,
      clientId: clientLegacyId,
      leadId: leadLegacyId,
      client: (row.client_id ? clientNameById.get(row.client_id) : undefined) ?? row.display_name,
      name: row.display_name,
      projectType: orUndefined(row.project_type),
      status: pickOne(row.status, PROJECT_STATUSES, "planning"),
      billing: Object.keys(billing).length > 0 ? billing : undefined,
      historicalReceived: asNumber(row.historical_received) ?? 0,
      historicalOutstanding:
        row.historical_outstanding === null ? null : asNumber(row.historical_outstanding),
      payments,
      startDate: orUndefined(row.start_date),
      endDate: orUndefined(row.end_date),
      deadline: orUndefined(row.deadline),
      budget: asNumber(row.budget),
      estimatedCost: asNumber(row.estimated_cost),
      assignedMembers: membersByProject.get(row.id),
      notes: orUndefined(row.notes),
      milestones,
      phone: orUndefined(row.phone),
      email: orUndefined(row.email),
    };
  });

  // --- Clients ---------------------------------------------------------------
  const clients: Client[] = clientRows.map((row) => ({
    id: legacyIdOf(row),
    organizationId: org.legacyId,
    parentClientId: row.parent_client_id ? clientLegacyById.get(row.parent_client_id) : undefined,
    companyName: row.company_name,
    contactPerson: row.contact_person ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    gstNumber: orUndefined(row.gst_number),
    pan: orUndefined(row.pan_number),
    billingAddress: row.billing_address ?? "",
    shippingAddress: orUndefined(row.shipping_address),
    website: orUndefined(row.website),
    industry: orUndefined(row.industry),
    clientSince: row.client_since ?? row.created_at.slice(0, 10),
    status: row.status === "inactive" ? "inactive" : "active",
    notes: orUndefined(row.notes),
  }));

  // --- Leads and directory contacts (contacts were migrated as Directory leads)
  const leads: Lead[] = [];
  const contacts: Contact[] = [];
  for (const row of leadRows) {
    const legacyId = legacyIdOf(row);
    if (row.source === "Directory") {
      const personName = row.contact_person ?? row.company_name;
      const decoded = decodeDirectoryNotes(row.notes);
      contacts.push({
        id: legacyId,
        organizationId: org.legacyId,
        personName,
        companyName: row.company_name !== personName ? row.company_name : undefined,
        phone: orUndefined(row.phone),
        email: orUndefined(row.email) ?? decoded.emailFromNotes,
        designation: decoded.designation,
        contactVia: decoded.contactVia,
        sector: decoded.sector,
        contacted: decoded.contacted === true,
        salesWon: decoded.salesWon === true,
        createdAt: row.created_at,
      });
      continue;
    }
    const decodedNotes = decodeLeadNotesFromStorage(row.notes);
    leads.push({
      id: legacyId,
      organizationId: org.legacyId,
      company: row.company_name,
      contactPerson: orUndefined(row.contact_person),
      email: orUndefined(row.email),
      phone: orUndefined(row.phone),
      notes: decodedNotes.notes,
      archivedAt: decodedNotes.archivedAt,
      status: pickOne(row.status, LEAD_STATUSES, "new_lead"),
      source: orUndefined(row.source),
      expectedRevenue: asNumber(row.expected_revenue),
      probability: asNumber(row.probability),
      expectedClosingDate: orUndefined(row.expected_closing_date),
      assignedSalesperson: row.assigned_team_member_id
        ? teamLegacyById.get(row.assigned_team_member_id)
        : undefined,
      convertedClientId: row.converted_client_id
        ? clientLegacyById.get(row.converted_client_id)
        : undefined,
      createdAt: row.created_at,
    });
  }

  // --- Partnerships ------------------------------------------------------------
  const partnerships: Partnership[] = partnershipRows.map((row) => ({
    id: legacyIdOf(row),
    organizationId: org.legacyId,
    name: row.name,
    contact: orUndefined(row.contact_name),
    phone: orUndefined(row.phone),
    email: orUndefined(row.email),
    type: orUndefined(row.partnership_type),
    opportunityType: orUndefined(row.opportunity_type),
    status: pickOne(row.status, PARTNERSHIP_STATUSES, "prospect"),
    notes: orUndefined(row.notes),
  }));

  // --- Expenses ----------------------------------------------------------------
  // Documents have no expense owner column, so an expense proof is only recoverable
  // through the transaction that references the expense (`transactions.expense_id`)
  // and carries a `transaction_proof` document.
  const transactionIdByExpenseId = new Map<string, string>();
  for (const row of transactionRows) {
    if (row.expense_id && !transactionIdByExpenseId.has(row.expense_id)) {
      transactionIdByExpenseId.set(row.expense_id, row.id);
    }
  }
  function buildExpenseProof(expenseId: string): ExpenseProof | undefined {
    const transactionId = transactionIdByExpenseId.get(expenseId);
    const doc = transactionId ? transactionProofByTransaction.get(transactionId) : undefined;
    if (!doc?.file_url) return undefined;
    return {
      imageDataUrl: doc.file_url,
      fileName: orUndefined(doc.file_name),
      mimeType: orUndefined(doc.mime_type),
      uploadedAt: doc.created_at,
    };
  }
  const expenses: ExpenseEntry[] = expenseRows.map((row) => ({
    id: legacyIdOf(row),
    organizationId: org.legacyId,
    label: row.label,
    amount: asNumber(row.amount) ?? 0,
    date: row.expense_date,
    category: orUndefined(row.category),
    projectId: row.project_id ? projectLegacyById.get(row.project_id) : undefined,
    partnershipId: row.partnership_id ? partnershipLegacyById.get(row.partnership_id) : undefined,
    isBaseline: row.historical === true ? true : undefined,
    proof: buildExpenseProof(row.id),
    notes: orUndefined(row.notes),
  }));

  // --- Transactions --------------------------------------------------------------
  // Salary schedules live in settings preferences; map team member legacy id →
  // schedule legacy id so salary-linked transactions can point back at their schedule.
  const salaryScheduleIdByTeamLegacyId = new Map<string, string>();
  for (const schedule of preferences.salarySchedules) {
    if (schedule.teamMemberId && !salaryScheduleIdByTeamLegacyId.has(schedule.teamMemberId)) {
      salaryScheduleIdByTeamLegacyId.set(schedule.teamMemberId, schedule.id);
    }
  }
  const transactions: Transaction[] = transactionRows.map((row) => {
    const type = pickOne(row.transaction_type, TRANSACTION_TYPES, "adjustment");
    const teamLegacyId = row.team_member_id ? teamLegacyById.get(row.team_member_id) : undefined;
    const salary = row.salary_id ? salariesById.get(row.salary_id) : undefined;
    const proof = transactionProofByTransaction.get(row.id);
    const fixedMonthlyExpenseId =
      (row.recurring_expense_id ? recurringLegacyById.get(row.recurring_expense_id) : undefined) ??
      (salary && teamLegacyId ? salaryScheduleIdByTeamLegacyId.get(teamLegacyId) : undefined);
    return {
      id: legacyIdOf(row),
      organizationId: org.legacyId,
      type,
      date: row.transaction_date,
      amount: asNumber(row.amount) ?? 0,
      description: row.description,
      category: row.category ?? "",
      paymentMethod: row.payment_method ?? "",
      vendor: orUndefined(row.vendor),
      gst: asNumber(row.gst_amount),
      relatedClientId: row.client_id ? clientLegacyById.get(row.client_id) : undefined,
      relatedProjectId: row.project_id ? projectLegacyById.get(row.project_id) : undefined,
      relatedInvoiceId: row.invoice_id ? invoiceLegacyById.get(row.invoice_id) : undefined,
      relatedFounderId:
        type === "founder_investment" || type === "founder_withdrawal" ? teamLegacyId : undefined,
      relatedTeamMemberId: teamLegacyId,
      // Per-transaction payroll snapshots win over the monthly salary aggregate.
      payrollMonth: row.payroll_month ?? salary?.salary_month,
      salaryBaseAmount:
        asNumber(row.salary_base_amount) ?? (salary ? asNumber(salary.base_amount) : undefined),
      salaryBonusAmount:
        asNumber(row.salary_bonus_amount) ?? (salary ? asNumber(salary.bonus_amount) : undefined),
      fixedMonthlyExpenseId,
      notes: orUndefined(row.notes),
      attachmentDataUrl: orUndefined(proof?.file_url),
      createdBy: orUndefined(row.created_by),
      createdAt: toMillis(row.created_at, Date.now()),
      updatedAt: toMillis(row.updated_at, Date.now()),
      historical: row.historical === true,
    };
  });

  // --- Founders (founder-role team members) --------------------------------------
  const founders: Founder[] = teamMemberRows
    .filter((row) => row.role === "founder")
    .map((row) => ({
      id: legacyIdOf(row),
      name: row.name,
      sharePercentage: asNumber(row.founder_share_percentage) ?? 0,
      notes: orUndefined(row.notes),
    }));

  // --- Recurring costs + salary schedules kept in settings preferences ------------
  const recurringExpenses: FixedMonthlyExpense[] = recurringRows.map((row) => {
    const status = pickOne(row.status, RECURRING_STATUSES, "active");
    const extras = preferences.recurringExtras[legacyIdOf(row)];
    const { notes, meta } = parseOpsExpenseNotes(row.notes);
    return {
      id: legacyIdOf(row),
      label: row.label,
      payee: orUndefined(row.payee),
      amountPerMonth: asNumber(row.amount_per_month) ?? 0,
      kind: pickOne(row.expense_type, RECURRING_KINDS, "other"),
      startDate: row.start_date,
      totalMonths: asNumber(row.total_months),
      reminderDay: asNumber(row.reminder_day),
      paidMonths: row.paid_months ?? [],
      status,
      notes,
      active: status === "active",
      nextDueDate: meta.nextDueDate ?? extras?.nextDueDate,
      billingCycle: meta.billingCycle ?? extras?.billingCycle,
      vendor: meta.vendor ?? extras?.vendor,
      totalAmount: meta.totalAmount ?? extras?.totalAmount,
      priorPaidInstallments: meta.priorPaidInstallments ?? extras?.priorPaidInstallments,
      priorPaidAmount: meta.priorPaidAmount ?? extras?.priorPaidAmount,
    };
  });
  const fixedMonthlyExpenses = [...preferences.salarySchedules, ...recurringExpenses];

  // --- Calendar, notifications, valuation history ---------------------------------
  const scheduleEvents: ScheduleEvent[] = calendarRows.map((row) => ({
    id: legacyIdOf(row),
    title: row.title,
    type:
      row.calendar_type === "call"
        ? "call"
        : row.calendar_type === "reminder"
          ? "reminder"
          : "meeting",
    date: row.event_date,
    startTime: row.start_time.slice(0, 5),
    durationMinutes: asNumber(row.duration_minutes) ?? 30,
    contact: orUndefined(row.attendees),
    location: orUndefined(row.location),
    meetingUrl: orUndefined(row.meeting_url),
    notes: orUndefined(row.notes),
    reminderMinutes: asNumber(row.reminder_minutes) ?? 30,
    status: pickOne(row.status, SCHEDULE_STATUSES, "scheduled"),
    createdAt: toMillis(row.created_at, Date.now()),
    updatedAt: toMillis(row.updated_at, Date.now()),
  }));

  const notifications: AppNotification[] = notificationRows.map((row) => ({
    id: legacyIdOf(row),
    title: row.title,
    message: row.message,
    priority: pickOne(row.priority, NOTIFICATION_PRIORITIES, "medium"),
    read: row.read === true,
    timestamp: row.occurred_at,
    relatedModule: pickOne(row.related_module, NOTIFICATION_MODULES, "system"),
    actionUrl: orUndefined(row.action_url),
    actionLabel: orUndefined(row.action_label),
  }));

  const valuationSnapshots: ValuationSnapshot[] = valuationSnapshotRows.map((row) => {
    const raw = isRecord(row.snapshot_data) ? row.snapshot_data : {};
    return {
      id: legacyIdOf(row),
      date: asString(raw.date) ?? row.valuation_date,
      createdAt: asNumber(raw.createdAt) ?? toMillis(row.created_at, Date.now()),
      calculatedValuation:
        asNumber(raw.calculatedValuation) ?? asNumber(row.calculated_valuation) ?? 0,
      manualAdjustment: asNumber(raw.manualAdjustment) ?? 0,
      reason: asString(raw.reason) ?? row.note ?? "Monthly valuation snapshot",
      revenue: asNumber(raw.revenue) ?? asNumber(row.revenue) ?? 0,
      assets: asNumber(raw.assets) ?? asNumber(row.assets) ?? 0,
      profit: asNumber(raw.profit) ?? asNumber(row.profit) ?? 0,
      growth: asNumber(raw.growth) ?? asNumber(row.growth) ?? 0,
      netWorth: asNumber(raw.netWorth) ?? asNumber(row.net_worth) ?? 0,
      enterpriseValue: asNumber(raw.enterpriseValue) ?? asNumber(row.enterprise_value) ?? 0,
      assumptionsHash: asString(raw.assumptionsHash) ?? "",
    };
  });

  // Valuation audit entries were merged into activity_logs with entity_type "valuation".
  const valuationAudit: ValuationAuditEntry[] = activityLogRows
    .filter((row) => row.entity_type === "valuation")
    .map((row): ValuationAuditEntry => {
      const metadata = isRecord(row.metadata) ? row.metadata : {};
      return {
        id: legacyIdOf(row),
        timestamp: toMillis(row.occurred_at, Date.now()),
        actor: row.actor ?? "Admin (shared session)",
        reason: row.summary,
        field: row.entity_name ?? "",
        oldValue: asString(metadata.oldValue) ?? "",
        newValue: asString(metadata.newValue) ?? "",
      };
    });

  return applyProductionBillingRepairs({
    projects,
    partnerships,
    expenses,
    leads,
    assets: preferences.assets,
    financialBaseline: preferences.financialBaseline,
    fixedMonthlyExpenses,
    clients,
    contacts,
    leadList: preferences.leadList,
    credentials: preferences.credentials,
    payments: topLevelPayments,
    transactions,
    founders,
    projectCommissions: preferences.projectCommissions,
    notifications,
    scheduleEvents,
    valuationSettings: preferences.valuationSettings,
    valuationSnapshots,
    valuationAudit,
    dismissedNotificationIds: preferences.migrationState.dismissedNotificationIds,
    migrationApplied: preferences.migrationState.migrationApplied,
    migrationDate: preferences.migrationState.migrationDate,
    groundZeroApplied: preferences.migrationState.groundZeroApplied,
    blxRepairApplied: preferences.migrationState.blxRepairApplied,
    neRepairApplied: preferences.migrationState.neRepairApplied,
    kapilaRetainerRepairApplied: preferences.migrationState.kapilaRetainerRepairApplied,
    rentManagementContractRepairApplied:
      preferences.migrationState.rentManagementContractRepairApplied,
    historicalExpenseReconciliationApplied:
      preferences.migrationState.historicalExpenseReconciliationApplied,
  });
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

export async function loadRelationalCompany(): Promise<CompanySettings> {
  const db = admarkDb();
  const org = await resolveOrganization(db);
  const [companyRow, settingsRow, teamMemberRows, documentRows] = await Promise.all([
    fetchMaybeSingle<CompanyRow>(db, "companies", org.id),
    fetchMaybeSingle<SettingsRow>(db, "settings", org.id),
    fetchAll<TeamMemberRow>(db, "team_members", org.id),
    fetchAll<DocumentRow>(db, "documents", org.id),
  ]);
  if (!companyRow) {
    throw new Error(
      `Failed to read admark.companies: no company row exists for organization ${org.legacyId}. ` +
        "Run `npm run db:migrate:apply` first.",
    );
  }

  const featureToggles = isRecord(settingsRow?.feature_toggles) ? settingsRow.feature_toggles : {};

  const directoryOverlay = parseTeamDirectoryOverlay(
    isRecord(settingsRow?.application_preferences)
      ? settingsRow.application_preferences.legacyTeamDirectory
      : undefined,
  );

  const companyMembers: CompanyMember[] = teamMemberRows.map((row) => {
    const id = legacyIdOf(row);
    const overlay = directoryOverlay.get(id);
    return stripUndefined({
      id,
      name: row.name,
      email: row.email ?? "",
      phone: row.phone ?? "",
      employeeId: orUndefined(row.employee_code) ?? overlay?.employeeId,
      role: orUndefined(row.job_title) ?? overlay?.role,
      memberType:
        orUndefined(row.member_type) ??
        overlay?.memberType ??
        MEMBER_TYPE_BY_ROLE[row.role],
      teamGroup: orUndefined(row.team_group) ?? overlay?.teamGroup,
      joinDate: orUndefined(row.join_date),
      status: row.status === "inactive" ? ("inactive" as const) : ("active" as const),
      baseMonthlySalary: asNumber(row.base_monthly_salary),
      monthlyBonusCap: asNumber(row.monthly_bonus_limit),
      salaryStartDate: orUndefined(row.salary_start_date),
      salaryDueDay: asNumber(row.salary_due_day),
    });
  });

  const complianceDocuments: ComplianceDocument[] = documentRows
    .filter((doc) => doc.company_id !== null && doc.document_type === "compliance")
    .map((doc) =>
      stripUndefined({
        id: legacyIdOf(doc),
        title: doc.title,
        fileDataUrl: orUndefined(doc.file_url),
        fileName: orUndefined(doc.file_name),
        mimeType: orUndefined(doc.mime_type),
        externalUrl: orUndefined(doc.external_url),
      }),
    );

  const raw: CompanySettings = stripUndefined({
    organizationId: org.legacyId,
    name: companyRow.name,
    tagline: orUndefined(companyRow.tagline),
    address: companyRow.address ?? "",
    email: companyRow.email ?? "",
    phone: orUndefined(companyRow.phone),
    website: orUndefined(companyRow.website),
    pan: orUndefined(companyRow.pan_number),
    gstin: orUndefined(companyRow.gst_number),
    bankName: orUndefined(companyRow.bank_name),
    accountName: orUndefined(companyRow.account_name),
    accountNumber: orUndefined(companyRow.account_number),
    ifsc: orUndefined(companyRow.ifsc),
    branch: orUndefined(companyRow.branch),
    upi: orUndefined(companyRow.upi),
    logoDataUrl: orUndefined(companyRow.logo_url),
    signatureDataUrl: orUndefined(companyRow.signature_url),
    udyamCertificateDataUrl: orUndefined(companyRow.udyam_document_url),
    complianceDocuments,
    authorizedName: orUndefined(companyRow.authorized_name),
    companyMembers,
    customMemberTypes: parseStringList(
      isRecord(settingsRow?.application_preferences)
        ? settingsRow.application_preferences.customMemberTypes
        : undefined,
    ),
    customTeamGroups: parseStringList(
      isRecord(settingsRow?.application_preferences)
        ? settingsRow.application_preferences.customTeamGroups
        : undefined,
    ),
    formOptions: isRecord(settingsRow?.application_preferences)
      ? parseFormOptions(settingsRow.application_preferences.formOptions)
      : undefined,
    teamDirectoryMigrationApplied: true,
    paymentTerms: orUndefined(settingsRow?.default_payment_terms),
    remarks: orUndefined(settingsRow?.default_remarks),
    paymentMode: orUndefined(settingsRow?.default_payment_mode),
    paymentProofUploadsEnabled: featureToggles.paymentProofUploadsEnabled === true,
    companyValuationEnabled: featureToggles.companyValuationEnabled === true,
    projectAssignmentsEnabled: featureToggles.projectAssignmentsEnabled === true,
    partnershipsEnabled: featureToggles.partnershipsEnabled === true,
  });
  return normalizeCompanySettings(raw);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

function buildInvoice(
  row: InvoiceRow,
  lines: InvoiceLineRow[],
  clientLegacyId: string | undefined,
  organizationLegacyId: string,
  projectLegacyById: Map<string, string>,
  agreementLegacyById: Map<string, string>,
): Invoice {
  const items: LineItem[] = [...lines]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((line) => ({
      id: legacyIdOf(line),
      description: line.description,
      quantity: asNumber(line.quantity) ?? 0,
      rate: asNumber(line.rate) ?? 0,
    }));
  return {
    id: legacyIdOf(row),
    organizationId: organizationLegacyId,
    clientId: clientLegacyId,
    projectId: row.project_id ? projectLegacyById.get(row.project_id) : undefined,
    agreementId: row.agreement_id ? agreementLegacyById.get(row.agreement_id) : undefined,
    number: row.number,
    date: row.invoice_date,
    clientName: row.client_name_snapshot,
    clientBusinessType: orUndefined(row.client_business_type_snapshot),
    clientAddress: orUndefined(row.client_address_snapshot),
    clientContact: orUndefined(row.client_contact_snapshot),
    clientPhone: orUndefined(row.client_phone_snapshot),
    clientEmail: orUndefined(row.client_email_snapshot),
    clientGstin: orUndefined(row.client_gstin_snapshot),
    items,
    advance: asNumber(row.advance) ?? 0,
    taxPercent: asNumber(row.tax_percent) ?? 0,
    remarks: orUndefined(row.remarks),
    paymentTerms: orUndefined(row.payment_terms),
    paymentMode: orUndefined(row.payment_mode),
    paymentDate: orUndefined(row.payment_date),
    status: pickOne(row.status, INVOICE_STATUSES, "generated"),
    createdAt: toMillis(row.created_at, Date.now()),
  };
}

export async function listRelationalInvoices(): Promise<Invoice[]> {
  const db = admarkDb();
  const org = await resolveOrganization(db);
  const [invoiceRows, lineRows, clientRows, projectRows, agreementRows] = await Promise.all([
    fetchAll<InvoiceRow>(db, "invoices", org.id),
    fetchAll<InvoiceLineRow>(db, "invoice_lines", org.id),
    fetchAll<ClientRow>(db, "clients", org.id),
    fetchAll<ProjectRow>(db, "projects", org.id),
    fetchAll<AgreementRow>(db, "agreements", org.id),
  ]);
  const clientLegacyById = new Map(clientRows.map((row) => [row.id, legacyIdOf(row)]));
  const projectLegacyById = new Map(projectRows.map((row) => [row.id, legacyIdOf(row)]));
  const agreementLegacyById = new Map(agreementRows.map((row) => [row.id, legacyIdOf(row)]));
  const linesByInvoice = new Map<string, InvoiceLineRow[]>();
  for (const line of lineRows) {
    const list = linesByInvoice.get(line.invoice_id) ?? [];
    list.push(line);
    linesByInvoice.set(line.invoice_id, list);
  }
  return invoiceRows
    .map((row) =>
      buildInvoice(
        row,
        linesByInvoice.get(row.id) ?? [],
        clientLegacyById.get(row.client_id),
        org.legacyId,
        projectLegacyById,
        agreementLegacyById,
      ),
    )
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRelationalInvoice(legacyId: string): Promise<Invoice | null> {
  if (typeof legacyId !== "string" || legacyId.trim() === "") {
    throw new Error("getRelationalInvoice: a non-empty legacy invoice id is required.");
  }
  const db = admarkDb();
  const org = await resolveOrganization(db);

  async function findByColumn(column: "legacy_id" | "id"): Promise<InvoiceRow | null> {
    const { data, error } = await db
      .from("invoices")
      .select("*")
      .eq("organization_id", org.id)
      .eq(column, legacyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw relationalTableError("invoices", error);
    return (data as unknown as InvoiceRow) ?? null;
  }

  let row = await findByColumn("legacy_id");
  if (!row && UUID_PATTERN.test(legacyId)) row = await findByColumn("id");
  if (!row) return null;

  const [
    { data: lineData, error: lineError },
    { data: clientData, error: clientError },
    { data: projectData, error: projectError },
    { data: agreementData, error: agreementError },
  ] = await Promise.all([
    db
      .from("invoice_lines")
      .select("*")
      .eq("organization_id", org.id)
      .eq("invoice_id", row.id)
      .is("deleted_at", null)
      .order("position", { ascending: true }),
    db.from("clients").select("id, legacy_id").eq("id", row.client_id).maybeSingle(),
    row.project_id
      ? db.from("projects").select("id, legacy_id").eq("id", row.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    row.agreement_id
      ? db.from("agreements").select("id, legacy_id").eq("id", row.agreement_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (lineError) throw relationalTableError("invoice_lines", lineError);
  if (clientError) throw relationalTableError("clients", clientError);
  if (projectError) throw relationalTableError("projects", projectError);
  if (agreementError) throw relationalTableError("agreements", agreementError);

  const lines = (lineData ?? []) as unknown as InvoiceLineRow[];
  const client = (clientData ?? null) as { id: string; legacy_id: string | null } | null;
  const project = (projectData ?? null) as { id: string; legacy_id: string | null } | null;
  const agreement = (agreementData ?? null) as { id: string; legacy_id: string | null } | null;
  const projectLegacyById = new Map<string, string>();
  if (project) projectLegacyById.set(project.id, legacyIdOf(project));
  const agreementLegacyById = new Map<string, string>();
  if (agreement) agreementLegacyById.set(agreement.id, legacyIdOf(agreement));
  return buildInvoice(
    row,
    lines,
    client ? legacyIdOf(client) : undefined,
    org.legacyId,
    projectLegacyById,
    agreementLegacyById,
  );
}

// ---------------------------------------------------------------------------
// Documents (agreements vault)
// ---------------------------------------------------------------------------

export async function loadRelationalDocuments(): Promise<DocumentsData> {
  const db = admarkDb();
  const org = await resolveOrganization(db);
  const [agreementRows, documentRows, clientRows] = await Promise.all([
    fetchAll<AgreementRow>(db, "agreements", org.id),
    fetchAll<DocumentRow>(db, "documents", org.id),
    fetchAll<ClientRow>(db, "clients", org.id),
  ]);
  const clientLegacyById = new Map(clientRows.map((row) => [row.id, legacyIdOf(row)]));
  const clientNameById = new Map(clientRows.map((row) => [row.id, row.company_name]));
  const clientIdByNormalizedName = new Map<string, string>();
  for (const row of clientRows) {
    const key = normalizeCompanyName(row.company_name).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (key && !clientIdByNormalizedName.has(key)) clientIdByNormalizedName.set(key, legacyIdOf(row));
  }
  // Renamed CRM clients vs older document uploads.
  const CLIENT_DOC_ALIASES: Record<string, string> = {
    "cli-srivatsanka-catering-events-services": "cli-kannan-sirangapalli",
    "cli-avighna-consultancy-services": "cli-avighna",
    srivatsankacateringeventsservices: "cli-kannan-sirangapalli",
    avighnaconsultancyservices: "cli-avighna",
  };
  function resolveClientLegacyId(
    storedClientId: string | undefined,
    companyName: string | undefined,
  ): string | undefined {
    if (storedClientId) {
      const aliased = CLIENT_DOC_ALIASES[storedClientId] ?? storedClientId;
      if ([...clientLegacyById.values()].includes(aliased)) return aliased;
    }
    const key = normalizeCompanyName(companyName).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key) return storedClientId;
    const alias = CLIENT_DOC_ALIASES[key];
    if (alias && [...clientLegacyById.values()].includes(alias)) return alias;
    if (clientIdByNormalizedName.has(key)) return clientIdByNormalizedName.get(key);
    return storedClientId;
  }

  const documentByAgreement = new Map<string, DocumentRow>();
  for (const doc of documentRows) {
    if (doc.agreement_id && !documentByAgreement.has(doc.agreement_id)) {
      documentByAgreement.set(doc.agreement_id, doc);
    }
  }
  const agreements: Agreement[] = agreementRows
    .map((row): Agreement => {
      const doc = documentByAgreement.get(row.id);
      const clientName = row.client_id ? clientNameById.get(row.client_id) : undefined;
      return {
        id: legacyIdOf(row),
        organizationId: org.legacyId,
        title: row.title,
        counterpartyName:
          clientName ?? orUndefined(row.legacy_counterparty_name) ?? "Unknown counterparty",
        counterpartyType: pickOne(
          row.agreement_type,
          AGREEMENT_COUNTERPARTY_TYPES,
          row.client_id ? "client" : "other",
        ),
        clientId: row.client_id ? clientLegacyById.get(row.client_id) : undefined,
        signedDate: orUndefined(row.signed_date),
        expiryDate: orUndefined(row.expiry_date),
        fileDataUrl: orUndefined(doc?.file_url),
        fileName: orUndefined(doc?.file_name),
        mimeType: orUndefined(doc?.mime_type),
        externalUrl: orUndefined(doc?.external_url),
        notes: orUndefined(row.notes),
        createdAt: toMillis(row.created_at, Date.now()),
        updatedAt: toMillis(row.updated_at, Date.now()),
      };
    })
    .sort((a, b) => a.createdAt - b.createdAt);
  const archiveDocuments = documentRows
    .filter((row) => row.document_type.startsWith("archive:"))
    .map((row): ArchiveDocument => {
      const { library: encodedLibrary, typeLabel } = parseArchiveDocumentType(row.document_type);
      const { meta, notes } = decodeArchiveDocumentNotes(row.notes);
      const documentType: ArchiveDocument["documentType"] = isArchiveDocumentType(typeLabel)
        ? typeLabel
        : "other";
      const linkedClientLegacy = row.client_id
        ? (clientLegacyById.get(row.client_id) ?? row.client_id)
        : undefined;
      const linkedClientName = row.client_id ? clientNameById.get(row.client_id) : undefined;
      const companyName =
        meta.companyName || linkedClientName || (linkedClientLegacy ? "Unknown company" : "Admark");
      // Prefer explicit library from type/meta — never let a coincidental client_id
      // promote a proposal/preclient file into the client library.
      let library = inferDocumentLibrary({
        library: meta.library ?? encodedLibrary,
        clientId: undefined,
        documentType,
      });
      let clientId: string | undefined;
      if (library === "client") {
        clientId = resolveClientLegacyId(linkedClientLegacy, companyName);
        // Orphan client-library files (CRM id renamed) — keep visible under Proposals.
        if (!clientId) library = "preclient";
      }
      return {
        id: legacyIdOf(row).replace(/^archive-document-/, ""),
        organizationId: org.legacyId,
        title: row.title,
        documentType,
        customType:
          documentType === "other" ? meta.customType || typeLabel || "Other" : undefined,
        library,
        companyName,
        clientId: library === "client" ? clientId : undefined,
        clientName: companyName,
        projectId: meta.projectId,
        assignedMemberIds:
          meta.assignedMemberIds && meta.assignedMemberIds.length > 0
            ? meta.assignedMemberIds
            : undefined,
        fileDataUrl: orUndefined(row.file_url),
        fileName: orUndefined(row.file_name),
        mimeType: orUndefined(row.mime_type),
        externalUrl: orUndefined(row.external_url),
        notes,
        createdAt: toMillis(row.created_at, Date.now()),
        updatedAt: toMillis(row.updated_at, Date.now()),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  return { agreements, archiveDocuments };
}

// ---------------------------------------------------------------------------
// Activity logs
// ---------------------------------------------------------------------------

export async function loadRelationalActivityLogs(): Promise<ActivityLogEntry[]> {
  const db = admarkDb();
  const org = await resolveOrganization(db);
  const rows = await fetchAll<ActivityLogRow>(db, "activity_logs", org.id);
  return rows
    .filter((row) => row.entity_type !== "valuation") // valuation audit is surfaced via operations
    .map(
      (row): ActivityLogEntry => ({
        id: legacyIdOf(row),
        organizationId: org.legacyId,
        timestamp: toMillis(row.occurred_at, Date.now()),
        entity: pickOne(row.entity_type, ACTIVITY_ENTITIES, "settings"),
        action: pickOne(row.action, ACTIVITY_ACTIONS, "updated"),
        summary: row.summary,
        entityId: orUndefined(row.entity_legacy_id),
        entityName: orUndefined(row.entity_name),
      }),
    )
    .sort((a, b) => b.timestamp - a.timestamp);
}
