/**
 * Server-only write adapters over the `admark` relational schema.
 *
 * Counterpart of `relational-read-repository.ts`: every writer receives the legacy UI
 * models (see `src/lib/types.ts`) and persists them into the normalized tables created
 * by `supabase/migrations/20260718120000_create_admark_relational_schema.sql`, following
 * the exact id and mapping conventions of `scripts/migrate-json-to-relational.mjs` so
 * writes are idempotent against migrated rows. The legacy `public.*` JSON tables are
 * never touched.
 *
 * Conventions:
 * - Legacy string ids are preserved in `legacy_id`. Row UUIDs are resolved from existing
 *   rows first; brand-new records reuse the legacy id verbatim when it already is a UUID
 *   and otherwise derive one with the migration's SHA-256 stable-UUID algorithm.
 * - Foreign keys are resolved through legacy ids (with the migration's name-based
 *   fallbacks) and rows are written in FK-safe order.
 * - Aggregate saves are snapshots: rows are upserted first and omitted mutable rows are
 *   soft-deleted (`deleted_at`) only after every upsert succeeded. PostgREST offers no
 *   cross-statement transaction, so a mid-save failure leaves prior data intact instead
 *   of half-deleted. Re-running any save converges to the same state.
 * - File payloads are externalized to storage first, so relational rows store URLs
 *   instead of large data URLs.
 */
import { createHash } from "node:crypto";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  encodeArchiveDocumentNotes,
  encodeArchiveDocumentType,
  inferDocumentLibrary,
} from "@/lib/document-vault";
import { encodeLeadNotesForStorage } from "@/lib/lead-stats";
import { formatOpsExpenseNotes, metaFromFixed } from "@/lib/ops-costs";
import type {
  ActivityLogEntry,
  CompanySettings,
  DocumentsData,
  FixedMonthlyExpense,
  Invoice,
  OperationsData,
  ProjectPayment,
  Transaction,
} from "@/lib/types";
import { monthPaymentsFromSchedule } from "@/lib/team-payroll";
import { externalizeDataUrl } from "./file-storage";
import { toStableAdmarkFileRef } from "@/lib/admark-file-ref";
import {
  externalizeCompanySettings,
  externalizeDocumentsData,
  externalizeOperationsData,
} from "./payload-files";
import { requireServerSupabase } from "./supabase-admin";

const ADMARK_SCHEMA = "admark";
const DEFAULT_ORG_LEGACY_ID = "org-admark-digitals";
const PAGE_SIZE = 1000;
const WRITE_CHUNK = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** Document types owned by the operations aggregate (proof attachments). */
const OPERATIONS_DOCUMENT_TYPES = ["transaction_proof", "payment_proof"] as const;
/** Document types owned by company settings (branding + compliance uploads). */
const COMPANY_DOCUMENT_TYPES = ["compliance", "logo", "signature", "udyam"] as const;

const LEAD_STATUSES = [
  "new_lead",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
  "won",
  "lost",
] as const;
const PARTNERSHIP_STATUSES = ["active", "inactive", "prospect"] as const;
const PROJECT_STATUSES = ["planning", "active", "on_hold", "completed", "cancelled"] as const;
const MILESTONE_STATUSES = ["pending", "in_progress", "completed", "delayed"] as const;
const RECURRING_EXPENSE_TYPES = ["emi", "rent", "subscription", "utility", "other"] as const;
const RECURRING_STATUSES = ["active", "paused", "completed"] as const;
const TRANSACTION_TYPES = [
  "client_payment",
  "founder_investment",
  "founder_withdrawal",
  "expense",
  "refund",
  "internal_transfer",
  "adjustment",
] as const;
const INVOICE_STATUSES = [
  "draft",
  "generated",
  "sent",
  "viewed",
  "partially_paid",
  "paid",
  "cancelled",
  "overdue",
] as const;
const SCHEDULE_STATUSES = ["scheduled", "completed", "cancelled"] as const;
const NOTIFICATION_PRIORITIES = ["low", "medium", "high"] as const;

/** UI member types → relational team roles (same map as the migration script). */
const ROLE_BY_MEMBER_TYPE: Record<string, string> = {
  founder: "founder",
  employee: "employee",
  intern: "intern",
  contractor: "partner",
};

function relationalRoleForMember(memberType: string | undefined, role: string | undefined): string {
  if (memberType && ROLE_BY_MEMBER_TYPE[memberType]) return ROLE_BY_MEMBER_TYPE[memberType];
  if (role?.toLowerCase().includes("founder")) return "founder";
  return "employee";
}

// ---------------------------------------------------------------------------
// Supabase plumbing
// ---------------------------------------------------------------------------

function admarkDb(sb: SupabaseClient) {
  return sb.schema(ADMARK_SCHEMA);
}

type AdmarkDb = ReturnType<typeof admarkDb>;

type WriteRow = Record<string, unknown>;

function writeError(table: string, error: PostgrestError): Error {
  const schemaHint =
    error.code === "PGRST106" || /schema/i.test(error.message)
      ? " Ensure the `admark` schema is exposed in the Supabase API settings and the schema migration has been applied."
      : "";
  return new Error(
    `Failed to write admark.${table}: ${error.message}${error.details ? ` (${error.details})` : ""}.${schemaHint}`,
  );
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
  if (error) throw writeError("organizations", error);
  const organizations = (data ?? []) as unknown as { id: string; legacy_id: string | null }[];
  const preferred =
    organizations.find((row) => row.legacy_id === DEFAULT_ORG_LEGACY_ID) ?? organizations[0];
  if (!preferred) {
    throw new Error(
      "Failed to write admark.organizations: no organization row exists. " +
        "Run `npm run db:migrate:apply` (scripts/migrate-json-to-relational.mjs) first.",
    );
  }
  return { id: preferred.id, legacyId: preferred.legacy_id ?? preferred.id };
}

interface ExistingRow {
  id: string;
  legacy_id?: string | null;
  deleted_at: string | null;
}

/** Reads id/legacy columns of every row (including soft-deleted) for one organization. */
async function fetchExistingRows<Row extends ExistingRow>(
  db: AdmarkDb,
  table: string,
  organizationId: string,
  columns: string,
  filter?: { column: string; values: readonly string[] },
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    let query = db.from(table).select(columns).eq("organization_id", organizationId);
    if (filter) query = query.in(filter.column, [...filter.values]);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) throw writeError(table, error);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function upsertRows(
  db: AdmarkDb,
  table: string,
  rows: readonly WriteRow[],
  onConflict = "id",
): Promise<void> {
  for (let start = 0; start < rows.length; start += WRITE_CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(start, start + WRITE_CHUNK), {
      onConflict,
      ignoreDuplicates: false,
    });
    if (error) throw writeError(table, error);
  }
}

/** Soft-deletes every currently active row that the latest snapshot no longer contains. */
async function softDeleteOmitted(
  db: AdmarkDb,
  table: string,
  organizationId: string,
  activeIds: ReadonlySet<string>,
  keptIds: ReadonlySet<string>,
): Promise<void> {
  const omitted = [...activeIds].filter((id) => !keptIds.has(id));
  if (omitted.length === 0) return;
  const deletedAt = new Date().toISOString();
  for (let start = 0; start < omitted.length; start += WRITE_CHUNK) {
    const { error } = await db
      .from(table)
      .update({ deleted_at: deletedAt })
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("id", omitted.slice(start, start + WRITE_CHUNK));
    if (error) throw writeError(table, error);
  }
}

async function fetchSingletonRow<Row>(
  db: AdmarkDb,
  table: string,
  organizationId: string,
  columns: string,
): Promise<Row | null> {
  const { data, error } = await db
    .from(table)
    .select(columns)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw writeError(table, error);
  return (data as unknown as Row) ?? null;
}

/** Update-or-insert for one-row-per-organization tables without ever rewriting the PK. */
async function writeSingletonRow(
  db: AdmarkDb,
  table: string,
  organizationId: string,
  existingId: string | null,
  insertId: string,
  patch: WriteRow,
): Promise<void> {
  if (existingId) {
    const { error } = await db.from(table).update(patch).eq("id", existingId);
    if (error) throw writeError(table, error);
    return;
  }
  const { error } = await db
    .from(table)
    .insert({ id: insertId, organization_id: organizationId, ...patch });
  if (error) throw writeError(table, error);
}

// ---------------------------------------------------------------------------
// Deterministic ids (identical to scripts/migrate-json-to-relational.mjs)
// ---------------------------------------------------------------------------

function stableUuid(scope: string, legacyId: string): string {
  const bytes = createHash("sha256").update(`${scope}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Maps legacy string ids onto row UUIDs for one table. Existing rows (matched by
 * `legacy_id` or by their own UUID) always win so upserts update rather than duplicate;
 * new legacy ids reuse the string verbatim when it already is a UUID and otherwise get
 * the migration's stable UUID.
 */
class RowIdResolver {
  private readonly idByKey = new Map<string, string>();
  private readonly legacyById = new Map<string, string>();
  readonly activeIds = new Set<string>();

  constructor(
    private readonly scope: string,
    rows: readonly ExistingRow[],
  ) {
    for (const row of rows) {
      this.idByKey.set(row.id, row.id);
      if (row.legacy_id) {
        this.idByKey.set(row.legacy_id, row.id);
        this.legacyById.set(row.id, row.legacy_id);
      }
      if (row.deleted_at === null) this.activeIds.add(row.id);
    }
  }

  lookup(legacyId: string | null | undefined): string | null {
    if (!legacyId) return null;
    return this.idByKey.get(legacyId) ?? null;
  }

  /** Like lookup, but ignores soft-deleted rows so saves cannot resurrect them by accident. */
  lookupActive(legacyId: string | null | undefined): string | null {
    const id = this.lookup(legacyId);
    if (!id || !this.activeIds.has(id)) return null;
    return id;
  }

  resolve(legacyId: string): string {
    const known = this.idByKey.get(legacyId);
    if (known) return known;
    const id = UUID_PATTERN.test(legacyId)
      ? legacyId.toLowerCase()
      : stableUuid(this.scope, legacyId);
    this.register(legacyId, id);
    return id;
  }

  register(legacyId: string, id: string): void {
    this.idByKey.set(legacyId, id);
    this.idByKey.set(id, id);
  }

  /** `legacy_id` column value; keeps the public id of rows matched by name/UUID stable. */
  storedLegacyId(id: string, fallback: string): string {
    return this.legacyById.get(id) ?? fallback;
  }
}

/** Collects upsert payloads, de-duplicated by row id (last write wins). */
class RowBatch {
  private readonly rowsById = new Map<string, WriteRow & { id: string }>();

  add(row: WriteRow & { id: string }): void {
    this.rowsById.set(row.id, row);
  }

  get(id: string): (WriteRow & { id: string }) | undefined {
    return this.rowsById.get(id);
  }

  get ids(): Set<string> {
    return new Set(this.rowsById.keys());
  }

  get rows(): (WriteRow & { id: string })[] {
    return [...this.rowsById.values()];
  }
}

// ---------------------------------------------------------------------------
// Value helpers (mirroring the migration script's coercions)
// ---------------------------------------------------------------------------

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function numeric(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Coerces PostgREST numeric columns, which arrive as `number | string`. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isoDate(value: string | null | undefined): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function isoTime(value: string | null | undefined): string {
  return typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 8) : "09:00";
}

function isoTimestamp(value: number | string | null | undefined): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeName(value: string | null | undefined): string {
  return (text(value) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function pickAllowed<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value != null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireLegacyId(table: string, value: string | null | undefined): string {
  const id = text(value);
  if (!id) throw new Error(`Failed to write admark.${table}: a record is missing its id.`);
  return id;
}

// ---------------------------------------------------------------------------
// Shared row builders
// ---------------------------------------------------------------------------

interface ClientSeed {
  legacyId: string;
  companyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  gstNumber?: string;
  pan?: string;
  billingAddress?: string;
  shippingAddress?: string;
  website?: string;
  industry?: string;
  clientSince?: string;
  status?: string;
  notes?: string;
}

function buildClientRow(
  organizationId: string,
  resolver: RowIdResolver,
  seed: ClientSeed,
): WriteRow & { id: string } {
  const id = resolver.resolve(seed.legacyId);
  return {
    id,
    organization_id: organizationId,
    legacy_id: resolver.storedLegacyId(id, seed.legacyId),
    parent_client_id: null,
    company_name: seed.companyName,
    contact_person: text(seed.contactPerson),
    phone: text(seed.phone),
    email: text(seed.email),
    gst_number: text(seed.gstNumber),
    pan_number: text(seed.pan),
    billing_address: text(seed.billingAddress),
    shipping_address: text(seed.shippingAddress),
    website: text(seed.website),
    industry: text(seed.industry),
    client_since: isoDate(seed.clientSince),
    status: seed.status === "inactive" ? "inactive" : "active",
    notes: text(seed.notes),
    deleted_at: null,
  };
}

type DocumentOwnerColumn =
  | "company_id"
  | "client_id"
  | "project_id"
  | "agreement_id"
  | "invoice_id"
  | "transaction_id"
  | "partnership_id";

interface DocumentSeed {
  legacyId: string;
  title: string;
  documentType: string;
  fileUrl?: string | null;
  externalUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  notes?: string | null;
  owner: Partial<Record<DocumentOwnerColumn, string | null>>;
}

/** Builds a universal `documents` row; returns null when there is no file to store. */
function buildDocumentRow(
  organizationId: string,
  resolver: RowIdResolver,
  seed: DocumentSeed,
): (WriteRow & { id: string }) | null {
  const fileUrl = toStableAdmarkFileRef(text(seed.fileUrl)) ?? text(seed.fileUrl);
  const externalUrl = text(seed.externalUrl);
  if (!fileUrl && !externalUrl) return null;
  const id = resolver.resolve(seed.legacyId);
  return {
    id,
    organization_id: organizationId,
    legacy_id: resolver.storedLegacyId(id, seed.legacyId),
    company_id: seed.owner.company_id ?? null,
    client_id: seed.owner.client_id ?? null,
    project_id: seed.owner.project_id ?? null,
    agreement_id: seed.owner.agreement_id ?? null,
    invoice_id: seed.owner.invoice_id ?? null,
    transaction_id: seed.owner.transaction_id ?? null,
    partnership_id: seed.owner.partnership_id ?? null,
    title: seed.title,
    document_type: seed.documentType,
    file_url: fileUrl,
    external_url: externalUrl,
    file_name: text(seed.fileName),
    mime_type: text(seed.mimeType),
    notes: text(seed.notes),
    deleted_at: null,
  };
}

// ---------------------------------------------------------------------------
// Operations aggregate
// ---------------------------------------------------------------------------

interface ClientLookupRow extends ExistingRow {
  company_name: string | null;
}

interface TeamLookupRow extends ExistingRow {
  name: string | null;
  base_monthly_salary: number | string | null;
}

interface NamedLookupRow extends ExistingRow {
  name: string | null;
}

interface ProjectLookupRow extends ExistingRow {
  client_id: string | null;
  lead_id?: string | null;
}

interface AssignmentLookupRow extends ExistingRow {
  project_id: string;
  team_member_id: string;
}

interface InvoiceLookupRow extends ExistingRow {
  client_id: string;
}

interface AgreementLookupRow extends ExistingRow {
  client_id: string | null;
}

interface ActivityLookupRow extends ExistingRow {
  entity_type: string;
}

interface SettingsLookupRow {
  id: string;
  application_preferences: unknown;
  feature_toggles: unknown;
}

/**
 * Persists the full operations snapshot: masters, projects (assignments, milestones,
 * payments), the accounts ledger, calendar, notifications, valuation history, and the
 * legacy preferences kept in `settings.application_preferences`. Rows omitted from the
 * snapshot are soft-deleted after every upsert succeeded.
 */
export async function saveRelationalOperations(data: OperationsData): Promise<void> {
  const sb = requireServerSupabase();
  const ops = await externalizeOperationsData(sb, data);
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const [
    clientRows,
    teamRows,
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
    calendarRows,
    notificationRows,
    activityRows,
    snapshotRows,
    documentRows,
  ] = await Promise.all([
    fetchExistingRows<ClientLookupRow>(
      db,
      "clients",
      org.id,
      "id, legacy_id, deleted_at, company_name",
    ),
    fetchExistingRows<TeamLookupRow>(
      db,
      "team_members",
      org.id,
      "id, legacy_id, deleted_at, name, base_monthly_salary",
    ),
    fetchExistingRows<NamedLookupRow>(
      db,
      "partnerships",
      org.id,
      "id, legacy_id, deleted_at, name",
    ),
    fetchExistingRows<ExistingRow>(db, "leads", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ProjectLookupRow>(
      db,
      "projects",
      org.id,
      "id, legacy_id, deleted_at, client_id, lead_id",
    ),
    fetchExistingRows<AssignmentLookupRow>(
      db,
      "project_assignments",
      org.id,
      "id, deleted_at, project_id, team_member_id",
    ),
    fetchExistingRows<ExistingRow>(db, "project_milestones", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<InvoiceLookupRow>(
      db,
      "invoices",
      org.id,
      "id, legacy_id, deleted_at, client_id",
    ),
    fetchExistingRows<ExistingRow>(db, "recurring_expenses", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "salaries", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "expenses", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "transactions", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "payments", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "calendar", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(db, "notifications", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ActivityLookupRow>(
      db,
      "activity_logs",
      org.id,
      "id, legacy_id, deleted_at, entity_type",
    ),
    fetchExistingRows<ExistingRow>(db, "valuation_snapshots", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(
      db,
      "documents",
      org.id,
      "id, legacy_id, deleted_at, document_type",
      { column: "document_type", values: OPERATIONS_DOCUMENT_TYPES },
    ),
  ]);

  const clientIds = new RowIdResolver("client", clientRows);
  const teamIds = new RowIdResolver("team_member", teamRows);
  const partnershipIds = new RowIdResolver("partnership", partnershipRows);
  const leadIds = new RowIdResolver("lead", leadRows);
  const projectIds = new RowIdResolver("project", projectRows);
  const milestoneIds = new RowIdResolver("project_milestone", milestoneRows);
  const recurringIds = new RowIdResolver("recurring_expense", recurringRows);
  const salaryIds = new RowIdResolver("salary", salaryRows);
  const expenseIds = new RowIdResolver("expense", expenseRows);
  const transactionIds = new RowIdResolver("transaction", transactionRows);
  const paymentIds = new RowIdResolver("payment", paymentRows);
  const calendarIds = new RowIdResolver("calendar", calendarRows);
  const notificationIds = new RowIdResolver("notification", notificationRows);
  const activityIds = new RowIdResolver("activity_log", activityRows);
  const snapshotIds = new RowIdResolver("valuation_snapshot", snapshotRows);
  const documentIds = new RowIdResolver("document", documentRows);
  const invoiceIds = new RowIdResolver("invoice", invoiceRows);

  // Name-based fallbacks, matching the migration's dedupe heuristics.
  const clientIdByName = new Map<string, string>();
  for (const row of clientRows) {
    const key = normalizeName(row.company_name);
    if (key && !row.deleted_at && !clientIdByName.has(key)) clientIdByName.set(key, row.id);
  }
  const teamIdByName = new Map<string, string>();
  for (const row of teamRows) {
    const key = normalizeName(row.name);
    if (key && !row.deleted_at && !teamIdByName.has(key)) teamIdByName.set(key, row.id);
  }
  const partnershipIdByName = new Map<string, string>();
  for (const row of partnershipRows) {
    const key = normalizeName(row.name);
    if (key && !row.deleted_at && !partnershipIdByName.has(key)) {
      partnershipIdByName.set(key, row.id);
    }
  }
  const baseSalaryByTeamRowId = new Map<string, number | null>(
    teamRows.map((row) => [row.id, toNumber(row.base_monthly_salary)]),
  );
  const invoiceClientByRowId = new Map(invoiceRows.map((row) => [row.id, row.client_id]));

  const clientBatch = new RowBatch();
  const teamBatch = new RowBatch();
  const partnershipBatch = new RowBatch();
  const leadBatch = new RowBatch();
  const projectBatch = new RowBatch();
  const assignmentBatch = new RowBatch();
  const milestoneBatch = new RowBatch();
  const recurringBatch = new RowBatch();
  const salaryBatch = new RowBatch();
  const expenseBatch = new RowBatch();
  const transactionBatch = new RowBatch();
  const paymentBatch = new RowBatch();
  const documentBatch = new RowBatch();
  const calendarBatch = new RowBatch();
  const notificationBatch = new RowBatch();
  const valuationActivityBatch = new RowBatch();
  const snapshotBatch = new RowBatch();
  const legacyMapBatch = new RowBatch();

  // --- Clients ---------------------------------------------------------------
  for (const client of ops.clients ?? []) {
    const legacyId = requireLegacyId("clients", client.id);
    const companyName = text(client.companyName);
    if (!companyName) {
      throw new Error(`Failed to write admark.clients: client "${legacyId}" has no company name.`);
    }
    const row = buildClientRow(org.id, clientIds, { ...client, legacyId, companyName });
    clientBatch.add(row);
    clientIds.activeIds.add(row.id);
    clientIdByName.set(normalizeName(companyName), row.id);
  }
  // Parent links resolve after every client id is known.
  for (const client of ops.clients ?? []) {
    if (!client.parentClientId) continue;
    const row = clientBatch.get(clientIds.resolve(client.id));
    const parentId = clientIds.lookup(client.parentClientId);
    if (row && parentId && parentId !== row.id) row.parent_client_id = parentId;
  }

  // --- Founders (merged into team_members; no separate founder table) ---------
  for (const founder of ops.founders ?? []) {
    const legacyId = requireLegacyId("team_members", founder.id);
    const name = text(founder.name);
    if (!name) {
      throw new Error(`Failed to write admark.team_members: founder "${legacyId}" has no name.`);
    }
    const id =
      teamIds.lookup(legacyId) ??
      teamIdByName.get(normalizeName(name)) ??
      teamIds.resolve(legacyId);
    teamIds.register(legacyId, id);
    teamIdByName.set(normalizeName(name), id);
    // Founder saves only touch founder-owned columns so payroll fields written by
    // saveRelationalCompany (base salary, join date, …) are preserved.
    teamBatch.add({
      id,
      organization_id: org.id,
      legacy_id: teamIds.storedLegacyId(id, legacyId),
      name,
      role: "founder",
      founder_share_percentage: numeric(founder.sharePercentage),
      notes: text(founder.notes),
      deleted_at: null,
    });
  }

  // --- Partnerships ------------------------------------------------------------
  for (const partnership of ops.partnerships ?? []) {
    const legacyId = requireLegacyId("partnerships", partnership.id);
    const id = partnershipIds.resolve(legacyId);
    partnershipBatch.add({
      id,
      organization_id: org.id,
      legacy_id: partnershipIds.storedLegacyId(id, legacyId),
      name: text(partnership.name) ?? "Unnamed partnership",
      contact_name: text(partnership.contact),
      phone: text(partnership.phone),
      email: text(partnership.email),
      partnership_type: text(partnership.type),
      opportunity_type: text(partnership.opportunityType),
      status: pickAllowed(partnership.status, PARTNERSHIP_STATUSES, "prospect"),
      notes: text(partnership.notes),
      deleted_at: null,
    });
    if (partnership.name) partnershipIdByName.set(normalizeName(partnership.name), id);
  }

  // --- Leads + Directory contacts (contacts persist as leads with source Directory)
  // Built before projects so discussion projects can resolve lead_id FKs.
  interface LeadSeed {
    legacyId: string;
    companyName: string;
    contactPerson: string | null;
    email: string | null;
    phone: string | null;
    status: string | undefined;
    source: string | null;
    expectedRevenue: number | null;
    probability: number | null;
    expectedClosingDate: string | null;
    notes: string | null;
    assignedSalesperson: string | null;
    convertedClientId: string | null;
    createdAt: string;
  }
  const leadSeeds: LeadSeed[] = [];
  for (const lead of ops.leads ?? []) {
    const legacyId = requireLegacyId("leads", lead.id);
    const companyName = text(lead.company) ?? text(lead.business) ?? text(lead.name);
    if (!companyName) {
      throw new Error(`Failed to write admark.leads: lead "${legacyId}" has no company name.`);
    }
    leadSeeds.push({
      legacyId,
      companyName,
      contactPerson: text(lead.contactPerson),
      email: text(lead.email),
      phone: text(lead.phone),
      status: lead.status,
      source: text(lead.source),
      expectedRevenue: numeric(lead.expectedRevenue),
      probability: numeric(lead.probability),
      expectedClosingDate: isoDate(lead.expectedClosingDate),
      notes: encodeLeadNotesForStorage(lead.notes, lead.archivedAt),
      assignedSalesperson: text(lead.assignedSalesperson),
      convertedClientId: text(lead.convertedClientId),
      createdAt: isoTimestamp(lead.createdAt),
    });
  }
  for (const contact of ops.contacts ?? []) {
    const legacyId = requireLegacyId("leads", contact.id);
    const companyName = text(contact.companyName) ?? text(contact.personName);
    if (!companyName) {
      throw new Error(`Failed to write admark.leads: contact "${legacyId}" has no name.`);
    }
    leadSeeds.push({
      legacyId,
      companyName,
      contactPerson: text(contact.personName),
      email: null,
      phone: text(contact.phone),
      status: "new_lead",
      source: "Directory",
      expectedRevenue: null,
      probability: null,
      expectedClosingDate: null,
      notes: text(contact.contactVia),
      assignedSalesperson: null,
      convertedClientId: null,
      createdAt: isoTimestamp(contact.createdAt),
    });
  }
  for (const seed of leadSeeds) {
    const id = leadIds.resolve(seed.legacyId);
    leadBatch.add({
      id,
      organization_id: org.id,
      legacy_id: leadIds.storedLegacyId(id, seed.legacyId),
      converted_client_id:
        clientIds.lookup(seed.convertedClientId) ??
        clientIdByName.get(normalizeName(seed.companyName)) ??
        null,
      source_partnership_id: partnershipIdByName.get(normalizeName(seed.source)) ?? null,
      assigned_team_member_id:
        teamIds.lookup(seed.assignedSalesperson) ??
        teamIdByName.get(normalizeName(seed.assignedSalesperson)) ??
        null,
      company_name: seed.companyName,
      contact_person: seed.contactPerson,
      email: seed.email,
      phone: seed.phone,
      status: pickAllowed(seed.status, LEAD_STATUSES, "new_lead"),
      source: seed.source,
      expected_revenue: seed.expectedRevenue,
      probability: seed.probability,
      expected_closing_date: seed.expectedClosingDate,
      notes: seed.notes,
      created_at: seed.createdAt,
      deleted_at: null,
    });
  }

  // --- Projects, synthetic clients, assignments, milestones ---------------------
  const projectClientByRowId = new Map<string, string>();
  for (const row of projectRows) {
    if (row.client_id) projectClientByRowId.set(row.id, row.client_id);
  }
  const projectNameByRowId = new Map<string, string>();
  const seenAssignmentPairs = new Set<string>();
  const assignmentIdByPair = new Map<string, string>();
  for (const row of assignmentRows) {
    assignmentIdByPair.set(`${row.project_id}:${row.team_member_id}`, row.id);
  }

  for (const project of ops.projects ?? []) {
    const legacyId = requireLegacyId("projects", project.id);
    const leadRowId = leadIds.lookup(project.leadId);
    // Resolve only *active* clients. Soft-deleted CRM rows must stay deleted —
    // never invent a synthetic client from the project display name (that undid deletes).
    let clientRowId =
      clientIds.lookupActive(project.clientId) ??
      clientIdByName.get(normalizeName(project.client)) ??
      null;
    if (!clientRowId && !leadRowId && !text(project.client) && !text(project.name)) {
      throw new Error(
        `Failed to write admark.projects: project "${legacyId}" has no resolvable client, lead, or name.`,
      );
    }

    const id = projectIds.resolve(legacyId);
    if (clientRowId) projectClientByRowId.set(id, clientRowId);
    const displayName = text(project.name) ?? text(project.client) ?? "Unnamed project";
    projectNameByRowId.set(id, displayName);
    projectBatch.add({
      id,
      organization_id: org.id,
      legacy_id: projectIds.storedLegacyId(id, legacyId),
      client_id: clientRowId,
      lead_id: leadRowId,
      display_name: displayName,
      project_type: text(project.projectType),
      status: pickAllowed(project.status, PROJECT_STATUSES, "planning"),
      start_date: isoDate(project.startDate),
      end_date: isoDate(project.endDate),
      deadline: isoDate(project.deadline),
      budget: numeric(project.budget),
      estimated_cost: numeric(project.estimatedCost),
      contract_value: numeric(project.billing?.contractValue),
      upfront_amount: numeric(project.billing?.upfrontAmount),
      maintenance_amount: numeric(project.billing?.maintenanceAmount),
      maintenance_months: numeric(project.billing?.maintenanceMonths),
      monthly_amount: numeric(project.billing?.monthlyAmount),
      monthly_months: numeric(project.billing?.monthlyMonths),
      monthly_start_date: isoDate(project.billing?.monthlyStartDate),
      monthly_end_date: isoDate(project.billing?.monthlyEndDate),
      historical_received: numeric(project.historicalReceived) ?? 0,
      historical_outstanding: numeric(project.historicalOutstanding),
      phone: text(project.phone),
      email: text(project.email),
      notes: text(project.notes),
      deleted_at: null,
    });

    const memberLegacyIds = project.assignedMembers?.length
      ? project.assignedMembers
      : project.assignedPartner
        ? [project.assignedPartner]
        : [];
    for (const memberLegacyId of new Set(memberLegacyIds)) {
      const teamMemberId =
        teamIds.lookup(memberLegacyId) ?? teamIdByName.get(normalizeName(memberLegacyId));
      if (!teamMemberId) continue; // unknown reference — migration treated this as a warning
      const pairKey = `${id}:${teamMemberId}`;
      if (seenAssignmentPairs.has(pairKey)) continue;
      seenAssignmentPairs.add(pairKey);
      assignmentBatch.add({
        id:
          assignmentIdByPair.get(pairKey) ??
          stableUuid("project_assignment", `${legacyId}:${memberLegacyId}`),
        organization_id: org.id,
        project_id: id,
        team_member_id: teamMemberId,
        ended_at: null,
        deleted_at: null,
      });
    }

    (project.milestones ?? []).forEach((milestone, position) => {
      const milestoneLegacyId =
        text(milestone.id) ?? `${legacyId}-${normalizeName(milestone.name)}`;
      const milestoneId = milestoneIds.resolve(milestoneLegacyId);
      milestoneBatch.add({
        id: milestoneId,
        organization_id: org.id,
        legacy_id: milestoneIds.storedLegacyId(milestoneId, milestoneLegacyId),
        project_id: id,
        assigned_team_member_id:
          teamIds.lookup(milestone.assignedUser) ??
          teamIdByName.get(normalizeName(milestone.assignedUser)) ??
          null,
        name: text(milestone.name) ?? "Unnamed milestone",
        description: text(milestone.description),
        due_date: isoDate(milestone.dueDate),
        status: pickAllowed(milestone.status, MILESTONE_STATUSES, "pending"),
        payment_trigger: milestone.paymentTrigger === true,
        completed_date: isoDate(milestone.completedDate),
        position,
        deleted_at: null,
      });
    });
  }

  // --- Fixed monthly costs: salary schedules stay in settings preferences, the
  // rest becomes recurring_expenses rows.
  const salarySchedules = (ops.fixedMonthlyExpenses ?? []).filter(
    (fixed) => fixed.kind === "salary",
  );
  for (const fixed of ops.fixedMonthlyExpenses ?? []) {
    if (fixed.kind === "salary") continue;
    const legacyId = requireLegacyId("recurring_expenses", fixed.id);
    const id = recurringIds.resolve(legacyId);
    recurringBatch.add({
      id,
      organization_id: org.id,
      legacy_id: recurringIds.storedLegacyId(id, legacyId),
      label: text(fixed.label) ?? "Recurring expense",
      payee: text(fixed.payee),
      amount_per_month: numeric(fixed.amountPerMonth) ?? 0,
      expense_type: pickAllowed(fixed.kind, RECURRING_EXPENSE_TYPES, "other"),
      start_date: isoDate(fixed.startDate) ?? today(),
      total_months: numeric(fixed.totalMonths),
      reminder_day: numeric(fixed.reminderDay),
      paid_months: (fixed.paidMonths ?? []).filter((month) => MONTH_PATTERN.test(month)),
      status: pickAllowed(
        fixed.status,
        RECURRING_STATUSES,
        fixed.active === false ? "paused" : "active",
      ),
      notes: text(formatOpsExpenseNotes(fixed.notes, metaFromFixed(fixed))),
      deleted_at: null,
    });
  }

  // --- Salaries: derived from payroll transactions + salary schedule paid months ---
  const scheduleByLegacyMember = new Map<string, FixedMonthlyExpense>();
  for (const schedule of salarySchedules) {
    if (schedule.teamMemberId) scheduleByLegacyMember.set(schedule.teamMemberId, schedule);
  }
  const fixedScheduleByLegacyId = new Map<string, FixedMonthlyExpense>();
  for (const fixed of ops.fixedMonthlyExpenses ?? []) {
    if (fixed.id) fixedScheduleByLegacyId.set(fixed.id, fixed);
  }
  /** Payroll member of a transaction — direct link first, then its salary schedule. */
  const payrollMemberOf = (transaction: Transaction): string | undefined => {
    if (transaction.relatedTeamMemberId) return transaction.relatedTeamMemberId;
    const fixed = transaction.fixedMonthlyExpenseId
      ? fixedScheduleByLegacyId.get(transaction.fixedMonthlyExpenseId)
      : undefined;
    return fixed?.kind === "salary" ? fixed.teamMemberId : undefined;
  };
  const payrollTransactions = (ops.transactions ?? []).flatMap((transaction) => {
    const memberLegacyId = payrollMemberOf(transaction);
    return memberLegacyId &&
      transaction.payrollMonth &&
      MONTH_PATTERN.test(transaction.payrollMonth)
      ? [{ transaction, memberLegacyId, month: transaction.payrollMonth }]
      : [];
  });
  const salaryKeys = new Set<string>(
    payrollTransactions.map((entry) => `${entry.memberLegacyId}:${entry.month}`),
  );
  for (const schedule of salarySchedules) {
    if (!schedule.teamMemberId) continue;
    for (const payment of monthPaymentsFromSchedule(schedule)) {
      if (MONTH_PATTERN.test(payment.month))
        salaryKeys.add(`${schedule.teamMemberId}:${payment.month}`);
    }
    for (const month of schedule.paidMonths ?? []) {
      if (MONTH_PATTERN.test(month)) salaryKeys.add(`${schedule.teamMemberId}:${month}`);
    }
  }
  const salaryRowIdByKey = new Map<string, string>();
  const seenSalaryPairs = new Set<string>();
  for (const key of salaryKeys) {
    const separator = key.lastIndexOf(":");
    const legacyMemberId = key.slice(0, separator);
    const month = key.slice(separator + 1);
    const memberRowId =
      teamIds.lookup(legacyMemberId) ?? teamIdByName.get(normalizeName(legacyMemberId));
    if (!memberRowId) continue; // schedule/transaction references an unknown member
    const pairKey = `${memberRowId}:${month}`;
    if (seenSalaryPairs.has(pairKey)) continue;
    seenSalaryPairs.add(pairKey);
    const related = payrollTransactions.filter(
      (entry) => entry.memberLegacyId === legacyMemberId && entry.month === month,
    );
    const payment = monthPaymentsFromSchedule(scheduleByLegacyMember.get(legacyMemberId)).find(
      (item) => item.month === month,
    );
    const paidBase = related.reduce(
      (sum, { transaction }) =>
        sum + (numeric(transaction.salaryBaseAmount) ?? numeric(transaction.amount) ?? 0),
      0,
    );
    const bonusFromTx = related.reduce(
      (sum, { transaction }) => sum + (numeric(transaction.salaryBonusAmount) ?? 0),
      0,
    );
    const scheduleAmount = numeric(scheduleByLegacyMember.get(legacyMemberId)?.amountPerMonth);
    const baseAmount =
      payment?.salaryAmount ?? scheduleAmount ?? baseSalaryByTeamRowId.get(memberRowId) ?? paidBase;
    const bonusAmount = payment?.bonusAmount ?? bonusFromTx;
    const status =
      payment?.mode === "partial"
        ? "partial"
        : payment
          ? "paid"
          : paidBase >= (baseAmount ?? 0)
            ? "paid"
            : paidBase > 0
              ? "partial"
              : "pending";
    const legacyId = `salary-${legacyMemberId}-${month}`;
    const id = salaryIds.resolve(legacyId);
    salaryBatch.add({
      id,
      organization_id: org.id,
      legacy_id: salaryIds.storedLegacyId(id, legacyId),
      team_member_id: memberRowId,
      salary_month: month,
      base_amount: Math.max(baseAmount ?? 0, 0),
      bonus_amount: Math.max(bonusAmount, 0),
      status,
      notes: payment?.note ?? null,
      deleted_at: null,
    });
    salaryRowIdByKey.set(key, id);
  }

  // --- Expenses -----------------------------------------------------------------
  const nonBaselineExpenseLegacyIds = new Set<string>();
  for (const expense of ops.expenses ?? []) {
    const legacyId = requireLegacyId("expenses", expense.id);
    if (expense.isBaseline !== true) nonBaselineExpenseLegacyIds.add(legacyId);
    const id = expenseIds.resolve(legacyId);
    expenseBatch.add({
      id,
      organization_id: org.id,
      legacy_id: expenseIds.storedLegacyId(id, legacyId),
      project_id: projectIds.lookup(expense.projectId),
      partnership_id: partnershipIds.lookup(expense.partnershipId),
      label: text(expense.label) ?? "Expense",
      amount: numeric(expense.amount) ?? 0,
      expense_date: isoDate(expense.date) ?? today(),
      category: text(typeof expense.category === "string" ? expense.category : undefined),
      status: "paid",
      notes: text(expense.notes),
      historical: expense.isBaseline === true,
      deleted_at: null,
    });
  }

  // --- Transactions ----------------------------------------------------------------
  interface TransactionMatchInfo {
    id: string;
    type: string;
    date: string;
    amount: number;
    projectRowId: string | null;
    invoiceRowId: string | null;
  }
  const transactionMatchInfos: TransactionMatchInfo[] = [];
  const transactionAttachmentUrls = new Map<string, string>();
  await Promise.all(
    (ops.transactions ?? [])
      .filter((transaction) => text(transaction.attachmentDataUrl))
      .map(async (transaction) => {
        const url = await externalizeDataUrl(
          sb,
          transaction.attachmentDataUrl,
          `proofs/transactions/${transaction.id}`,
        );
        if (url) transactionAttachmentUrls.set(transaction.id, url);
      }),
  );
  for (const transaction of ops.transactions ?? []) {
    const legacyId = requireLegacyId("transactions", transaction.id);
    const amount = numeric(transaction.amount) ?? 0;
    if (amount === 0) {
      throw new Error(
        `Failed to write admark.transactions: transaction "${legacyId}" must have a non-zero amount.`,
      );
    }
    const id = transactionIds.resolve(legacyId);
    const payrollMemberId = payrollMemberOf(transaction);
    const memberLegacyId = payrollMemberId ?? transaction.relatedFounderId;
    const payrollMonth =
      transaction.payrollMonth && MONTH_PATTERN.test(transaction.payrollMonth)
        ? transaction.payrollMonth
        : null;
    const salaryKey = payrollMemberId && payrollMonth ? `${payrollMemberId}:${payrollMonth}` : null;
    // fixedMonthlyExpenseId resolves to recurring_expense_id for non-salary schedules;
    // salary schedules are represented through salary_id/team member instead.
    const linkedSchedule = transaction.fixedMonthlyExpenseId
      ? fixedScheduleByLegacyId.get(transaction.fixedMonthlyExpenseId)
      : undefined;
    const recurringExpenseRowId =
      transaction.fixedMonthlyExpenseId && linkedSchedule?.kind !== "salary"
        ? recurringIds.lookup(transaction.fixedMonthlyExpenseId)
        : null;
    const projectRowId = projectIds.lookup(transaction.relatedProjectId);
    const invoiceRowId = invoiceIds.lookup(transaction.relatedInvoiceId);
    const transactionDate = isoDate(transaction.date) ?? today();
    const transactionType = pickAllowed(transaction.type, TRANSACTION_TYPES, "adjustment");
    transactionBatch.add({
      id,
      organization_id: org.id,
      legacy_id: transactionIds.storedLegacyId(id, legacyId),
      client_id: clientIds.lookup(transaction.relatedClientId),
      project_id: projectRowId,
      invoice_id: invoiceRowId,
      team_member_id:
        teamIds.lookup(memberLegacyId) ?? teamIdByName.get(normalizeName(memberLegacyId)) ?? null,
      expense_id: nonBaselineExpenseLegacyIds.has(legacyId) ? expenseIds.lookup(legacyId) : null,
      salary_id: salaryKey ? (salaryRowIdByKey.get(salaryKey) ?? null) : null,
      recurring_expense_id: recurringExpenseRowId,
      payroll_month: payrollMonth,
      salary_base_amount: numeric(transaction.salaryBaseAmount),
      salary_bonus_amount: numeric(transaction.salaryBonusAmount),
      transaction_type: transactionType,
      transaction_date: transactionDate,
      amount,
      description: text(transaction.description) ?? "Transaction",
      category: text(transaction.category),
      payment_method: text(transaction.paymentMethod),
      vendor: text(transaction.vendor),
      gst_amount: numeric(transaction.gst),
      notes: text(transaction.notes),
      created_by: text(transaction.createdBy),
      historical: transaction.historical === true,
      created_at: isoTimestamp(transaction.createdAt),
      deleted_at: null,
    });
    transactionMatchInfos.push({
      id,
      type: transactionType,
      date: transactionDate,
      amount,
      projectRowId,
      invoiceRowId,
    });

    const attachmentUrl = transactionAttachmentUrls.get(transaction.id);
    if (attachmentUrl) {
      const documentRow = buildDocumentRow(org.id, documentIds, {
        legacyId: `transaction-proof-${legacyId}`,
        title: `${text(transaction.description) ?? "Transaction"} proof`,
        documentType: "transaction_proof",
        fileUrl: attachmentUrl,
        owner: { transaction_id: id },
      });
      if (documentRow) documentBatch.add(documentRow);
    }
  }

  // --- Expense proofs: attach through the expense-linked (mirrored) transaction when
  // one exists and does not already carry its own attachment document; everything else
  // is kept verbatim in settings preferences so no proof data is lost.
  const leftoverExpenseProofs: { expenseId: string; [key: string]: unknown }[] = [];
  const currentDocumentIds = documentBatch.ids;
  for (const expense of ops.expenses ?? []) {
    if (!expense.proof?.imageDataUrl) continue;
    const legacyId = requireLegacyId("expenses", expense.id);
    const mirroredTransactionRowId = nonBaselineExpenseLegacyIds.has(legacyId)
      ? transactionIds.lookup(legacyId)
      : null;
    const hasMirroredTransaction =
      mirroredTransactionRowId !== null &&
      transactionBatch.get(mirroredTransactionRowId) !== undefined;
    const attachmentDocRowId = documentIds.lookup(`transaction-proof-${legacyId}`);
    const transactionHasOwnProof =
      attachmentDocRowId !== null && currentDocumentIds.has(attachmentDocRowId);
    if (hasMirroredTransaction && !transactionHasOwnProof) {
      const documentRow = buildDocumentRow(org.id, documentIds, {
        legacyId: `expense-proof-${legacyId}`,
        title: `${text(expense.label) ?? "Expense"} proof`,
        documentType: "transaction_proof",
        fileUrl: expense.proof.imageDataUrl,
        fileName: expense.proof.fileName,
        mimeType: expense.proof.mimeType,
        owner: { transaction_id: mirroredTransactionRowId },
      });
      if (documentRow) {
        documentBatch.add(documentRow);
        continue;
      }
    }
    leftoverExpenseProofs.push({ expenseId: legacyId, ...expense.proof });
  }

  // --- Payments: top-level ledger payments + historical/current project payments ---
  interface PaymentSeed {
    source: "payments" | "projectPayments";
    legacyId: string;
    amount: number | undefined;
    date: string | undefined;
    method: string | null;
    referenceNumber: string | null;
    externalTransactionId: string | null;
    notes: string | null;
    recordedAfterMigration: boolean;
    recurring: boolean;
    invoiceLegacyId: string | undefined;
    projectLegacyId: string | undefined;
    proof: ProjectPayment["proof"];
    screenshotUrl: string | null;
  }
  const paymentScreenshotUrls = new Map<string, string>();
  await Promise.all(
    (ops.payments ?? [])
      .filter((payment) => text(payment.screenshotDataUrl))
      .map(async (payment) => {
        const url = await externalizeDataUrl(
          sb,
          payment.screenshotDataUrl,
          `proofs/payments/${payment.id}`,
        );
        if (url) paymentScreenshotUrls.set(payment.id, url);
      }),
  );
  const paymentSeeds: PaymentSeed[] = [];
  for (const payment of ops.payments ?? []) {
    const legacyId = requireLegacyId("payments", payment.id);
    paymentSeeds.push({
      source: "payments",
      legacyId,
      amount: payment.amount,
      date: payment.date,
      method: text(payment.method),
      referenceNumber: text(payment.referenceNumber),
      externalTransactionId: text(payment.transactionId),
      notes: text(payment.notes),
      recordedAfterMigration: false,
      recurring: false,
      invoiceLegacyId: payment.invoiceId,
      projectLegacyId: payment.projectId,
      proof: undefined,
      screenshotUrl: paymentScreenshotUrls.get(payment.id) ?? null,
    });
  }
  for (const project of ops.projects ?? []) {
    for (const payment of project.payments ?? []) {
      paymentSeeds.push({
        source: "projectPayments",
        legacyId: requireLegacyId("payments", payment.id),
        amount: payment.amount,
        date: payment.date,
        method: null,
        referenceNumber: null,
        externalTransactionId: null,
        notes: text(payment.note),
        recordedAfterMigration: payment.recordedAfterMigration === true,
        recurring: payment.recurring === true,
        invoiceLegacyId: undefined,
        projectLegacyId: project.id,
        proof: payment.proof,
        screenshotUrl: null,
      });
    }
  }

  const usedTransactionRowIds = new Set<string>();
  const seenPaymentLegacyIds = new Set<string>();
  for (const seed of paymentSeeds) {
    if (seenPaymentLegacyIds.has(seed.legacyId)) continue;
    seenPaymentLegacyIds.add(seed.legacyId);
    const amount = numeric(seed.amount) ?? 0;
    if (amount === 0) {
      throw new Error(
        `Failed to write admark.payments: payment "${seed.legacyId}" must have a non-zero amount.`,
      );
    }
    const projectRowId = projectIds.lookup(seed.projectLegacyId);
    const invoiceRowId = invoiceIds.lookup(seed.invoiceLegacyId);
    const clientRowId =
      (projectRowId ? projectClientByRowId.get(projectRowId) : null) ??
      (invoiceRowId ? invoiceClientByRowId.get(invoiceRowId) : null) ??
      null;
    if (!clientRowId) {
      console.error(
        `[relational] Skipping payment "${seed.legacyId}" — no resolvable client (link it to a known project or invoice).`,
      );
      continue;
    }
    const paymentDate = isoDate(seed.date) ?? today();
    // Mirrored ledger entries share the payment's id; otherwise fall back to the
    // migration's heuristic match against client_payment transactions.
    let transactionRowId = transactionIds.lookup(seed.legacyId);
    if (!transactionRowId) {
      transactionRowId =
        transactionMatchInfos.find(
          (candidate) =>
            candidate.type === "client_payment" &&
            candidate.date === paymentDate &&
            Math.abs(candidate.amount - amount) < 0.005 &&
            (!projectRowId || candidate.projectRowId === projectRowId) &&
            (!invoiceRowId || candidate.invoiceRowId === invoiceRowId) &&
            !usedTransactionRowIds.has(candidate.id),
        )?.id ?? null;
    }
    if (transactionRowId && usedTransactionRowIds.has(transactionRowId)) transactionRowId = null;
    if (transactionRowId) usedTransactionRowIds.add(transactionRowId);

    const id = paymentIds.resolve(seed.legacyId);
    paymentBatch.add({
      id,
      organization_id: org.id,
      legacy_id: paymentIds.storedLegacyId(id, seed.legacyId),
      transaction_id: transactionRowId,
      client_id: clientRowId,
      invoice_id: invoiceRowId,
      project_id: projectRowId,
      amount,
      payment_date: paymentDate,
      payment_method: seed.method ?? "upi",
      reference_number: seed.referenceNumber,
      external_transaction_id: seed.externalTransactionId,
      notes: seed.notes,
      recurring: seed.recurring,
      historical:
        seed.source === "projectPayments" ? !seed.recordedAfterMigration : !transactionRowId,
      deleted_at: null,
    });
    // The read path relies on legacy_record_map to split project payments from the
    // top-level ledger, so keep the mapping in sync with every write.
    legacyMapBatch.add({
      id: stableUuid("legacy_map", `operations_data:${seed.source}:${seed.legacyId}:payments`),
      organization_id: org.id,
      source_table: "operations_data",
      source_collection: seed.source,
      legacy_id: seed.legacyId,
      target_table: "payments",
      target_id: id,
    });

    if (seed.source === "projectPayments" && seed.proof?.imageDataUrl) {
      const projectName = projectRowId ? projectNameByRowId.get(projectRowId) : undefined;
      const documentRow = buildDocumentRow(org.id, documentIds, {
        legacyId: `project-payment-proof-${seed.projectLegacyId}-${seed.legacyId}`,
        title: `${projectName ?? "Project"} payment proof`,
        documentType: "payment_proof",
        fileUrl: seed.proof.imageDataUrl,
        fileName: seed.proof.fileName,
        mimeType: seed.proof.mimeType,
        owner: transactionRowId
          ? { transaction_id: transactionRowId }
          : { project_id: projectRowId },
      });
      if (documentRow) documentBatch.add(documentRow);
    }

    // Top-level payment screenshots become universal payment_proof documents: owned by
    // the linked transaction, by the project when historical and transactionless, and
    // otherwise by the invoice/client so the proof is never dropped.
    if (seed.source === "payments" && seed.screenshotUrl) {
      const documentRow = buildDocumentRow(org.id, documentIds, {
        legacyId: `payment-proof-${seed.legacyId}`,
        title: `Payment proof (${paymentDate})`,
        documentType: "payment_proof",
        fileUrl: seed.screenshotUrl,
        owner: transactionRowId
          ? { transaction_id: transactionRowId }
          : projectRowId
            ? { project_id: projectRowId }
            : invoiceRowId
              ? { invoice_id: invoiceRowId }
              : { client_id: clientRowId },
      });
      if (documentRow) documentBatch.add(documentRow);
    }
  }

  // --- Calendar ---------------------------------------------------------------------
  for (const event of ops.scheduleEvents ?? []) {
    const legacyId = requireLegacyId("calendar", event.id);
    const id = calendarIds.resolve(legacyId);
    const duration = numeric(event.durationMinutes) ?? 30;
    const reminder = numeric(event.reminderMinutes) ?? 30;
    calendarBatch.add({
      id,
      organization_id: org.id,
      legacy_id: calendarIds.storedLegacyId(id, legacyId),
      client_id: clientIdByName.get(normalizeName(event.contact)) ?? null,
      title: text(event.title) ?? "Calendar item",
      calendar_type:
        event.type === "call" ? "call" : event.type === "reminder" ? "reminder" : "meeting",
      event_date: isoDate(event.date) ?? today(),
      start_time: isoTime(event.startTime),
      duration_minutes: duration > 0 ? duration : 30,
      attendees: text(event.contact),
      location: text(event.location),
      meeting_url: text(event.meetingUrl),
      notes: text(event.notes),
      reminder_minutes: reminder >= 0 ? reminder : 30,
      status: pickAllowed(event.status, SCHEDULE_STATUSES, "scheduled"),
      created_at: isoTimestamp(event.createdAt),
      deleted_at: null,
    });
  }

  // --- Notifications ------------------------------------------------------------------
  for (const notification of ops.notifications ?? []) {
    const legacyId = requireLegacyId("notifications", notification.id);
    const id = notificationIds.resolve(legacyId);
    notificationBatch.add({
      id,
      organization_id: org.id,
      legacy_id: notificationIds.storedLegacyId(id, legacyId),
      title: text(notification.title) ?? "Notification",
      message: text(notification.message) ?? "",
      priority: pickAllowed(notification.priority, NOTIFICATION_PRIORITIES, "medium"),
      read: notification.read === true,
      occurred_at: isoTimestamp(notification.timestamp),
      related_module: text(notification.relatedModule),
      action_url: text(notification.actionUrl),
      action_label: text(notification.actionLabel),
      deleted_at: null,
    });
  }

  // --- Valuation audit (persisted as activity_logs rows with entity_type "valuation") --
  for (const entry of ops.valuationAudit ?? []) {
    const legacyId = requireLegacyId("activity_logs", entry.id);
    const id = activityIds.resolve(legacyId);
    valuationActivityBatch.add({
      id,
      organization_id: org.id,
      legacy_id: activityIds.storedLegacyId(id, legacyId),
      occurred_at: isoTimestamp(entry.timestamp),
      entity_type: "valuation",
      action: "updated",
      summary: text(entry.reason) ?? `Valuation ${text(entry.field) ?? "setting"} changed`,
      entity_legacy_id: null,
      entity_name: text(entry.field),
      actor: text(entry.actor),
      metadata: { oldValue: entry.oldValue, newValue: entry.newValue },
      deleted_at: null,
    });
  }

  // --- Valuation snapshots ---------------------------------------------------------
  for (const snapshot of ops.valuationSnapshots ?? []) {
    const legacyId = requireLegacyId("valuation_snapshots", snapshot.id);
    const id = snapshotIds.resolve(legacyId);
    snapshotBatch.add({
      id,
      organization_id: org.id,
      legacy_id: snapshotIds.storedLegacyId(id, legacyId),
      valuation_date: isoDate(snapshot.date) ?? today(),
      calculated_valuation: numeric(snapshot.calculatedValuation) ?? 0,
      revenue: numeric(snapshot.revenue),
      assets: numeric(snapshot.assets),
      profit: numeric(snapshot.profit),
      growth: numeric(snapshot.growth),
      net_worth: numeric(snapshot.netWorth),
      enterprise_value: numeric(snapshot.enterpriseValue),
      note: text(snapshot.reason),
      snapshot_data: snapshot,
      created_at: isoTimestamp(snapshot.createdAt),
      deleted_at: null,
    });
  }

  // --- Upserts in FK-safe order -------------------------------------------------------
  await upsertRows(db, "clients", clientBatch.rows);
  await upsertRows(db, "team_members", teamBatch.rows);
  await upsertRows(db, "partnerships", partnershipBatch.rows);
  await upsertRows(db, "leads", leadBatch.rows);
  await upsertRows(db, "projects", projectBatch.rows);
  await upsertRows(db, "project_assignments", assignmentBatch.rows);
  await upsertRows(db, "project_milestones", milestoneBatch.rows);
  await upsertRows(db, "recurring_expenses", recurringBatch.rows);
  await upsertRows(db, "salaries", salaryBatch.rows);
  await upsertRows(db, "expenses", expenseBatch.rows);
  await upsertRows(db, "transactions", transactionBatch.rows);
  await upsertRows(db, "payments", paymentBatch.rows);
  await upsertRows(db, "documents", documentBatch.rows);
  await upsertRows(db, "calendar", calendarBatch.rows);
  await upsertRows(db, "notifications", notificationBatch.rows);
  await upsertRows(db, "activity_logs", valuationActivityBatch.rows);
  await upsertRows(db, "valuation_snapshots", snapshotBatch.rows);
  await upsertRows(
    db,
    "legacy_record_map",
    legacyMapBatch.rows,
    "organization_id,source_table,source_collection,legacy_id,target_table",
  );

  // --- Settings: financial baseline, valuation settings, assets, salary schedules and
  // migration flags live in application_preferences (company-owned columns untouched).
  const settingsRow = await fetchSingletonRow<SettingsLookupRow>(
    db,
    "settings",
    org.id,
    "id, application_preferences, feature_toggles",
  );
  const existingPreferences = isRecord(settingsRow?.application_preferences)
    ? settingsRow.application_preferences
    : {};
  await writeSingletonRow(
    db,
    "settings",
    org.id,
    settingsRow?.id ?? null,
    stableUuid("settings", org.legacyId),
    {
      opening_balance_as_of: isoDate(ops.financialBaseline?.asOfDate),
      application_preferences: {
        ...existingPreferences,
        legacyFinancialBaseline: ops.financialBaseline ?? null,
        legacyValuationSettings: ops.valuationSettings ?? null,
        legacyAssets: ops.assets ?? [],
        legacySalarySchedules: salarySchedules,
        legacyRecurringExpenseExtras: Object.fromEntries(
          (ops.fixedMonthlyExpenses ?? [])
            .filter((fixed) => fixed.kind !== "salary")
            .filter(
              (fixed) =>
                fixed.nextDueDate ||
                fixed.billingCycle ||
                fixed.vendor ||
                fixed.totalAmount != null ||
                fixed.priorPaidInstallments != null ||
                fixed.priorPaidAmount != null,
            )
            .map((fixed) => [
              fixed.id,
              {
                nextDueDate: fixed.nextDueDate ?? null,
                billingCycle: fixed.billingCycle ?? null,
                vendor: fixed.vendor ?? null,
                totalAmount: fixed.totalAmount ?? null,
                priorPaidInstallments: fixed.priorPaidInstallments ?? null,
                priorPaidAmount: fixed.priorPaidAmount ?? null,
              },
            ]),
        ),
        legacyProjectCommissions: ops.projectCommissions ?? [],
        legacyLeadList: ops.leadList ?? [],
        // Expense proofs that could not be attached to a mirrored transaction document
        // (externalized to URLs above) are preserved here instead of being dropped.
        legacyExpenseProofs: leftoverExpenseProofs,
        legacyMigrationState: {
          migrationApplied: ops.migrationApplied === true,
          migrationDate: ops.migrationDate ?? null,
          groundZeroApplied: ops.groundZeroApplied === true,
          blxRepairApplied: ops.blxRepairApplied === true,
          neRepairApplied: ops.neRepairApplied === true,
          kapilaRetainerRepairApplied: ops.kapilaRetainerRepairApplied === true,
          rentManagementContractRepairApplied: ops.rentManagementContractRepairApplied === true,
          historicalExpenseReconciliationApplied:
            ops.historicalExpenseReconciliationApplied === true,
          dismissedNotificationIds: ops.dismissedNotificationIds ?? [],
        },
      },
    },
  );

  // --- Soft-delete rows the snapshot no longer contains (only after all upserts) -------
  // Team members are intentionally excluded: operations only carries founders, the full
  // directory is owned by saveRelationalCompany.
  const operationsDocumentActiveIds = new Set(
    documentRows.filter((row) => !row.deleted_at).map((row) => row.id),
  );
  const valuationActivityActiveIds = new Set(
    activityRows
      .filter((row) => !row.deleted_at && row.entity_type === "valuation")
      .map((row) => row.id),
  );
  const assignmentActiveIds = new Set(
    assignmentRows.filter((row) => !row.deleted_at).map((row) => row.id),
  );
  await softDeleteOmitted(db, "documents", org.id, operationsDocumentActiveIds, documentBatch.ids);
  await softDeleteOmitted(db, "payments", org.id, paymentIds.activeIds, paymentBatch.ids);
  await softDeleteOmitted(
    db,
    "transactions",
    org.id,
    transactionIds.activeIds,
    transactionBatch.ids,
  );
  await softDeleteOmitted(db, "salaries", org.id, salaryIds.activeIds, salaryBatch.ids);
  await softDeleteOmitted(db, "expenses", org.id, expenseIds.activeIds, expenseBatch.ids);
  await softDeleteOmitted(
    db,
    "recurring_expenses",
    org.id,
    recurringIds.activeIds,
    recurringBatch.ids,
  );
  await softDeleteOmitted(
    db,
    "project_milestones",
    org.id,
    milestoneIds.activeIds,
    milestoneBatch.ids,
  );
  await softDeleteOmitted(
    db,
    "project_assignments",
    org.id,
    assignmentActiveIds,
    assignmentBatch.ids,
  );
  await softDeleteOmitted(db, "projects", org.id, projectIds.activeIds, projectBatch.ids);
  await softDeleteOmitted(db, "leads", org.id, leadIds.activeIds, leadBatch.ids);
  await softDeleteOmitted(
    db,
    "partnerships",
    org.id,
    partnershipIds.activeIds,
    partnershipBatch.ids,
  );
  await softDeleteOmitted(db, "clients", org.id, clientIds.activeIds, clientBatch.ids);
  await softDeleteOmitted(db, "calendar", org.id, calendarIds.activeIds, calendarBatch.ids);
  await softDeleteOmitted(
    db,
    "notifications",
    org.id,
    notificationIds.activeIds,
    notificationBatch.ids,
  );
  await softDeleteOmitted(
    db,
    "activity_logs",
    org.id,
    valuationActivityActiveIds,
    valuationActivityBatch.ids,
  );
  await softDeleteOmitted(
    db,
    "valuation_snapshots",
    org.id,
    snapshotIds.activeIds,
    snapshotBatch.ids,
  );
}

// ---------------------------------------------------------------------------
// Company settings
// ---------------------------------------------------------------------------

/**
 * Persists company settings: the company profile row, invoice defaults + feature
 * toggles in `settings`, the full team directory, and company-owned documents
 * (compliance uploads, logo, signature, Udyam certificate).
 */
export async function saveRelationalCompany(data: CompanySettings): Promise<void> {
  const sb = requireServerSupabase();
  const settings = await externalizeCompanySettings(sb, data);
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const [teamRows, documentRows, companyRow, settingsRow] = await Promise.all([
    fetchExistingRows<NamedLookupRow>(
      db,
      "team_members",
      org.id,
      "id, legacy_id, deleted_at, name",
    ),
    fetchExistingRows<ExistingRow>(
      db,
      "documents",
      org.id,
      "id, legacy_id, deleted_at, document_type",
      { column: "document_type", values: COMPANY_DOCUMENT_TYPES },
    ),
    fetchSingletonRow<{ id: string }>(db, "companies", org.id, "id"),
    fetchSingletonRow<SettingsLookupRow>(
      db,
      "settings",
      org.id,
      "id, feature_toggles, application_preferences",
    ),
  ]);

  const companyName = text(settings.name);
  if (!companyName) {
    throw new Error("Failed to write admark.companies: the company name must not be empty.");
  }

  // --- Company profile ---------------------------------------------------------
  const companyId = companyRow?.id ?? stableUuid("company", org.legacyId);
  await writeSingletonRow(db, "companies", org.id, companyRow?.id ?? null, companyId, {
    name: companyName,
    tagline: text(settings.tagline),
    logo_url: text(settings.logoDataUrl),
    signature_url: text(settings.signatureDataUrl),
    gst_number: text(settings.gstin),
    pan_number: text(settings.pan),
    udyam_document_url: text(settings.udyamCertificateDataUrl),
    address: text(settings.address),
    email: text(settings.email),
    phone: text(settings.phone),
    website: text(settings.website),
    authorized_name: text(settings.authorizedName),
    bank_name: text(settings.bankName),
    account_name: text(settings.accountName),
    account_number: text(settings.accountNumber),
    ifsc: text(settings.ifsc),
    branch: text(settings.branch),
    upi: text(settings.upi),
    deleted_at: null,
  });

  // --- Invoice defaults + feature toggles (application_preferences untouched) ----
  const existingToggles = isRecord(settingsRow?.feature_toggles) ? settingsRow.feature_toggles : {};
  const existingPreferences = isRecord(settingsRow?.application_preferences)
    ? settingsRow.application_preferences
    : {};
  await writeSingletonRow(
    db,
    "settings",
    org.id,
    settingsRow?.id ?? null,
    stableUuid("settings", org.legacyId),
    {
      default_payment_terms: text(settings.paymentTerms),
      default_remarks: text(settings.remarks),
      default_payment_mode: text(settings.paymentMode),
      feature_toggles: {
        ...existingToggles,
        paymentProofUploadsEnabled: settings.paymentProofUploadsEnabled === true,
        companyValuationEnabled: settings.companyValuationEnabled === true,
        projectAssignmentsEnabled: settings.projectAssignmentsEnabled === true,
        partnershipsEnabled: settings.partnershipsEnabled === true,
      },
      application_preferences: {
        ...existingPreferences,
        customMemberTypes: settings.customMemberTypes ?? [],
        customTeamGroups: settings.customTeamGroups ?? [],
        formOptions: settings.formOptions ?? {},
      },
    },
  );

  // --- Team directory -------------------------------------------------------------
  const teamIds = new RowIdResolver("team_member", teamRows);
  const teamIdByName = new Map<string, string>();
  for (const row of teamRows) {
    const key = normalizeName(row.name);
    if (key && !row.deleted_at && !teamIdByName.has(key)) teamIdByName.set(key, row.id);
  }
  const teamBatch = new RowBatch();
  for (const member of settings.companyMembers ?? []) {
    const legacyId = requireLegacyId("team_members", member.id);
    const name = text(member.name);
    if (!name) {
      throw new Error(`Failed to write admark.team_members: member "${legacyId}" has no name.`);
    }
    const id =
      teamIds.lookup(legacyId) ??
      teamIdByName.get(normalizeName(name)) ??
      teamIds.resolve(legacyId);
    teamIds.register(legacyId, id);
    teamIdByName.set(normalizeName(name), id);
    // founder_share_percentage and notes are founder-owned (saveRelationalOperations)
    // and intentionally left untouched here.
    teamBatch.add({
      id,
      organization_id: org.id,
      legacy_id: teamIds.storedLegacyId(id, legacyId),
      name,
      email: text(member.email),
      phone: text(member.phone),
      employee_code: text(member.employeeId),
      role: relationalRoleForMember(member.memberType, member.role),
      member_type: text(member.memberType),
      team_group: text(member.teamGroup),
      job_title: text(member.role),
      join_date: isoDate(member.joinDate),
      status: member.status === "inactive" ? "inactive" : "active",
      base_monthly_salary: numeric(member.baseMonthlySalary),
      monthly_bonus_limit: numeric(member.monthlyBonusCap),
      salary_start_date: isoDate(member.salaryStartDate),
      salary_due_day: numeric(member.salaryDueDay),
      deleted_at: null,
    });
  }
  await upsertRows(db, "team_members", teamBatch.rows);

  // --- Company documents ------------------------------------------------------------
  const documentIds = new RowIdResolver("document", documentRows);
  const documentBatch = new RowBatch();
  for (const document of settings.complianceDocuments ?? []) {
    const documentRow = buildDocumentRow(org.id, documentIds, {
      legacyId: requireLegacyId("documents", document.id),
      title: text(document.title) ?? "Compliance document",
      documentType: "compliance",
      fileUrl: document.fileDataUrl,
      externalUrl: document.externalUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      owner: { company_id: companyId },
    });
    if (documentRow) documentBatch.add(documentRow);
  }
  const brandingUploads: [string, string | undefined][] = [
    ["logo", settings.logoDataUrl],
    ["signature", settings.signatureDataUrl],
    ["udyam", settings.udyamCertificateDataUrl],
  ];
  for (const [kind, value] of brandingUploads) {
    const documentRow = buildDocumentRow(org.id, documentIds, {
      legacyId: `company-${kind}`,
      title: `Company ${kind}`,
      documentType: kind,
      fileUrl: value,
      owner: { company_id: companyId },
    });
    if (documentRow) documentBatch.add(documentRow);
  }
  await upsertRows(db, "documents", documentBatch.rows);

  // --- Soft-delete omitted rows (after all upserts succeeded) ------------------------
  const companyDocumentActiveIds = new Set(
    documentRows.filter((row) => !row.deleted_at).map((row) => row.id),
  );
  await softDeleteOmitted(db, "documents", org.id, companyDocumentActiveIds, documentBatch.ids);
  await softDeleteOmitted(db, "team_members", org.id, teamIds.activeIds, teamBatch.ids);
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

async function findInvoiceRow(
  db: AdmarkDb,
  organizationId: string,
  legacyId: string,
): Promise<{ id: string; deleted_at: string | null } | null> {
  async function findByColumn(column: "legacy_id" | "id") {
    const { data, error } = await db
      .from("invoices")
      .select("id, deleted_at")
      .eq("organization_id", organizationId)
      .eq(column, legacyId)
      .maybeSingle();
    if (error) throw writeError("invoices", error);
    return (data as unknown as { id: string; deleted_at: string | null }) ?? null;
  }
  const byLegacy = await findByColumn("legacy_id");
  if (byLegacy) return byLegacy;
  if (!UUID_PATTERN.test(legacyId)) return null;
  return findByColumn("id");
}

/** Upserts one invoice with its ordered lines; omitted old lines are soft-deleted. */
export async function upsertRelationalInvoice(data: Invoice): Promise<void> {
  const legacyId = requireLegacyId("invoices", data.id);
  const invoiceNumber = text(data.number);
  if (!invoiceNumber) {
    throw new Error(`Failed to write admark.invoices: invoice "${legacyId}" has no number.`);
  }
  const sb = requireServerSupabase();
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const projectLegacyId = text(data.projectId);
  const agreementLegacyId = text(data.agreementId);
  const [existingInvoice, clientRows, projectRows, agreementRows] = await Promise.all([
    findInvoiceRow(db, org.id, legacyId),
    fetchExistingRows<ClientLookupRow>(
      db,
      "clients",
      org.id,
      "id, legacy_id, deleted_at, company_name",
    ),
    projectLegacyId
      ? fetchExistingRows<ProjectLookupRow>(
          db,
          "projects",
          org.id,
          "id, legacy_id, deleted_at, client_id",
        )
      : Promise.resolve<ProjectLookupRow[]>([]),
    agreementLegacyId
      ? fetchExistingRows<AgreementLookupRow>(
          db,
          "agreements",
          org.id,
          "id, legacy_id, deleted_at, client_id",
        )
      : Promise.resolve<AgreementLookupRow[]>([]),
  ]);

  // Resolve the client by legacy id, then by name, else register a synthetic client
  // from the invoice snapshot (mirrors the migration's fallback).
  const clientIds = new RowIdResolver("client", clientRows);
  const clientIdByName = new Map<string, string>();
  for (const row of clientRows) {
    const key = normalizeName(row.company_name);
    if (key && !row.deleted_at && !clientIdByName.has(key)) clientIdByName.set(key, row.id);
  }
  let clientRowId =
    clientIds.lookup(data.clientId) ?? clientIdByName.get(normalizeName(data.clientName)) ?? null;
  if (!clientRowId) {
    const clientRow = buildClientRow(org.id, clientIds, {
      legacyId: text(data.clientId) ?? `invoice-client-${legacyId}`,
      companyName: text(data.clientName) ?? "Unknown client",
      contactPerson: data.clientContact,
      phone: data.clientPhone,
      email: data.clientEmail,
      gstNumber: data.clientGstin,
      billingAddress: data.clientAddress,
    });
    await upsertRows(db, "clients", [clientRow]);
    clientRowId = clientRow.id;
  }

  // Resolve explicitly supplied project/agreement links; an unknown id is an error
  // rather than a silently dropped reference. Both links are validated against the
  // invoice's client where the linked row carries a client.
  let projectRowId: string | null = null;
  if (projectLegacyId) {
    projectRowId = new RowIdResolver("project", projectRows).lookup(projectLegacyId);
    if (!projectRowId) {
      throw new Error(
        `Failed to write admark.invoices: linked project "${projectLegacyId}" does not exist for invoice "${legacyId}".`,
      );
    }
    const projectClientId = projectRows.find((row) => row.id === projectRowId)?.client_id ?? null;
    if (projectClientId && projectClientId !== clientRowId) {
      throw new Error(
        `Failed to write admark.invoices: project "${projectLegacyId}" belongs to a different client than invoice "${legacyId}".`,
      );
    }
  }
  let agreementRowId: string | null = null;
  if (agreementLegacyId) {
    agreementRowId = new RowIdResolver("agreement", agreementRows).lookup(agreementLegacyId);
    if (!agreementRowId) {
      throw new Error(
        `Failed to write admark.invoices: linked agreement "${agreementLegacyId}" does not exist for invoice "${legacyId}".`,
      );
    }
    const agreementClientId =
      agreementRows.find((row) => row.id === agreementRowId)?.client_id ?? null;
    if (agreementClientId && agreementClientId !== clientRowId) {
      throw new Error(
        `Failed to write admark.invoices: agreement "${agreementLegacyId}" belongs to a different client than invoice "${legacyId}".`,
      );
    }
  }

  const invoiceRowId =
    existingInvoice?.id ??
    (UUID_PATTERN.test(legacyId) ? legacyId.toLowerCase() : stableUuid("invoice", legacyId));
  // company_snapshot is intentionally omitted so values written by the migration (or
  // other flows) survive UI saves; project_id/agreement_id are only written when the
  // invoice explicitly supplies them, otherwise existing DB links are preserved.
  const invoiceRow: WriteRow & { id: string } = {
    id: invoiceRowId,
    organization_id: org.id,
    legacy_id: legacyId,
    client_id: clientRowId,
    number: invoiceNumber,
    invoice_date: isoDate(data.date) ?? today(),
    status: pickAllowed(data.status, INVOICE_STATUSES, "generated"),
    client_name_snapshot: text(data.clientName) ?? "Unknown client",
    client_business_type_snapshot: text(data.clientBusinessType),
    client_address_snapshot: text(data.clientAddress),
    client_contact_snapshot: text(data.clientContact),
    client_phone_snapshot: text(data.clientPhone),
    client_email_snapshot: text(data.clientEmail),
    client_gstin_snapshot: text(data.clientGstin),
    advance: numeric(data.advance) ?? 0,
    tax_percent: numeric(data.taxPercent) ?? 0,
    remarks: text(data.remarks),
    payment_terms: text(data.paymentTerms),
    payment_mode: text(data.paymentMode),
    payment_date: isoDate(data.paymentDate),
    created_at: isoTimestamp(data.createdAt),
    deleted_at: null,
  };
  if (projectLegacyId) invoiceRow.project_id = projectRowId;
  if (agreementLegacyId) invoiceRow.agreement_id = agreementRowId;
  await upsertRows(db, "invoices", [invoiceRow]);

  const lineRows = await fetchExistingRows<ExistingRow>(
    db,
    "invoice_lines",
    org.id,
    "id, legacy_id, deleted_at, invoice_id",
  );
  const invoiceLineRows = lineRows.filter(
    (row) => (row as ExistingRow & { invoice_id: string }).invoice_id === invoiceRowId,
  );
  const lineIds = new RowIdResolver("invoice_line", invoiceLineRows);
  const lineBatch = new RowBatch();
  (data.items ?? []).forEach((item, position) => {
    const lineLegacyId = text(item.id) ?? `${legacyId}-line-${position}`;
    const id = lineIds.resolve(lineLegacyId);
    lineBatch.add({
      id,
      organization_id: org.id,
      legacy_id: lineIds.storedLegacyId(id, lineLegacyId),
      invoice_id: invoiceRowId,
      description: text(item.description) ?? "Service",
      quantity: numeric(item.quantity) ?? 0,
      rate: numeric(item.rate) ?? 0,
      position,
      deleted_at: null,
    });
  });
  await upsertRows(db, "invoice_lines", lineBatch.rows);
  await softDeleteOmitted(db, "invoice_lines", org.id, lineIds.activeIds, lineBatch.ids);
}

/** Soft-deletes an invoice (by legacy id or row UUID) together with its lines. */
export async function softDeleteRelationalInvoice(legacyId: string): Promise<void> {
  const invoiceLegacyId = requireLegacyId("invoices", legacyId);
  const sb = requireServerSupabase();
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const existing = await findInvoiceRow(db, org.id, invoiceLegacyId);
  if (!existing) {
    throw new Error(
      `Failed to write admark.invoices: no invoice found for id "${invoiceLegacyId}".`,
    );
  }
  const deletedAt = new Date().toISOString();
  const { error: invoiceError } = await db
    .from("invoices")
    .update({ deleted_at: deletedAt })
    .eq("organization_id", org.id)
    .eq("id", existing.id)
    .is("deleted_at", null);
  if (invoiceError) throw writeError("invoices", invoiceError);
  const { error: lineError } = await db
    .from("invoice_lines")
    .update({ deleted_at: deletedAt })
    .eq("organization_id", org.id)
    .eq("invoice_id", existing.id)
    .is("deleted_at", null);
  if (lineError) throw writeError("invoice_lines", lineError);
}

// ---------------------------------------------------------------------------
// Documents (agreements vault)
// ---------------------------------------------------------------------------

/** Persists the agreements vault: agreement rows plus their universal document rows. */
export async function saveRelationalDocuments(data: DocumentsData): Promise<void> {
  const sb = requireServerSupabase();
  const docs = await externalizeDocumentsData(sb, data);
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const [agreementRows, documentRows, allDocumentRows, clientRows, companyRow] = await Promise.all([
    fetchExistingRows<ExistingRow>(db, "agreements", org.id, "id, legacy_id, deleted_at"),
    fetchExistingRows<ExistingRow>(
      db,
      "documents",
      org.id,
      "id, legacy_id, deleted_at, document_type",
      { column: "document_type", values: ["agreement"] },
    ),
    fetchExistingRows<ExistingRow>(
      db,
      "documents",
      org.id,
      "id, legacy_id, deleted_at, document_type",
    ),
    fetchExistingRows<ClientLookupRow>(
      db,
      "clients",
      org.id,
      "id, legacy_id, deleted_at, company_name",
    ),
    fetchSingletonRow<{ id: string }>(db, "companies", org.id, "id"),
  ]);
  const archiveDocumentRows = allDocumentRows.filter((row) =>
    String((row as ExistingRow & { document_type?: string }).document_type).startsWith("archive:"),
  );

  const agreementIds = new RowIdResolver("agreement", agreementRows);
  const documentIds = new RowIdResolver("document", documentRows);
  const archiveDocumentIds = new RowIdResolver("archive-document", archiveDocumentRows);
  const clientIds = new RowIdResolver("client", clientRows);
  const clientIdByName = new Map<string, string>();
  for (const row of clientRows) {
    const key = normalizeName(row.company_name);
    if (key && !row.deleted_at && !clientIdByName.has(key)) clientIdByName.set(key, row.id);
  }
  const companyId = companyRow?.id ?? stableUuid("company", org.legacyId);
  const CLIENT_DOC_ALIASES: Record<string, string> = {
    "cli-srivatsanka-catering-events-services": "cli-kannan-sirangapalli",
    "cli-avighna-consultancy-services": "cli-avighna",
    srivatsankacateringeventsservices: "cli-kannan-sirangapalli",
    avighnaconsultancyservices: "cli-avighna",
  };
  function resolveArchiveClientRowId(document: {
    clientId?: string;
    clientName?: string;
    companyName?: string;
  }): string | null {
    const rawId = text(document.clientId);
    const aliasedLegacy = rawId ? (CLIENT_DOC_ALIASES[rawId] ?? rawId) : null;
    const byLegacy = aliasedLegacy ? clientIds.lookup(aliasedLegacy) : null;
    if (byLegacy) return byLegacy;
    const nameKey = normalizeName(document.clientName || document.companyName);
    if (nameKey && CLIENT_DOC_ALIASES[nameKey]) {
      const viaAlias = clientIds.lookup(CLIENT_DOC_ALIASES[nameKey]);
      if (viaAlias) return viaAlias;
    }
    return nameKey ? (clientIdByName.get(nameKey) ?? null) : null;
  }

  const agreementBatch = new RowBatch();
  const documentBatch = new RowBatch();
  const agreementDocumentKept = new Set<string>();
  const archiveDocumentKept = new Set<string>();
  for (const agreement of docs.agreements ?? []) {
    const legacyId = requireLegacyId("agreements", agreement.id);
    const id = agreementIds.resolve(legacyId);
    const clientRowId =
      clientIds.lookup(agreement.clientId) ??
      clientIds.lookup(agreement.counterpartyRef) ??
      clientIdByName.get(normalizeName(agreement.counterpartyName)) ??
      null;
    agreementBatch.add({
      id,
      organization_id: org.id,
      legacy_id: agreementIds.storedLegacyId(id, legacyId),
      client_id: clientRowId,
      title: text(agreement.title) ?? "Untitled agreement",
      // Preserve the free-text counterparty even when a client link resolves.
      legacy_counterparty_name: text(agreement.counterpartyName),
      agreement_type: text(agreement.counterpartyType) ?? "agreement",
      status: agreement.signedDate ? "signed" : "draft",
      signed_date: isoDate(agreement.signedDate),
      expiry_date: isoDate(agreement.expiryDate),
      notes: text(agreement.notes),
      migration_review_required: !clientRowId,
      created_at: isoTimestamp(agreement.createdAt),
      deleted_at: null,
    });
    const documentRow = buildDocumentRow(org.id, documentIds, {
      legacyId: `agreement-document-${legacyId}`,
      title: text(agreement.title) ?? "Agreement",
      documentType: "agreement",
      fileUrl: agreement.fileDataUrl,
      externalUrl: agreement.externalUrl,
      fileName: agreement.fileName,
      mimeType: agreement.mimeType,
      notes: agreement.notes,
      owner: { agreement_id: id },
    });
    if (documentRow) {
      documentBatch.add(documentRow);
      agreementDocumentKept.add(documentRow.id);
    }
  }
  for (const document of docs.archiveDocuments ?? []) {
    const legacyId = requireLegacyId("archive documents", document.id);
    const library = inferDocumentLibrary(document);
    // Only the client library is owned by a CRM client. Proposals / pre-client /
    // vault stay company-owned so name collisions with CRM rows cannot pull them
    // into Clients (or hide them when the old reader required client_id).
    const clientRowId = library === "client" ? resolveArchiveClientRowId(document) : null;
    const owner = clientRowId ? { client_id: clientRowId } : { company_id: companyId };
    const documentRow = buildDocumentRow(org.id, archiveDocumentIds, {
      legacyId: `archive-document-${legacyId}`,
      title: text(document.title) ?? "Untitled document",
      documentType: encodeArchiveDocumentType(library, document.documentType, document.customType),
      fileUrl: document.fileDataUrl,
      externalUrl: document.externalUrl,
      fileName: document.fileName,
      mimeType: document.mimeType,
      notes: encodeArchiveDocumentNotes({ ...document, library }),
      owner,
    });
    if (documentRow) {
      documentBatch.add(documentRow);
      archiveDocumentKept.add(documentRow.id);
    } else {
      console.error(
        `[relational] Skipping archive document "${legacyId}" — needs a file_url or external_url.`,
      );
    }
  }

  await upsertRows(db, "agreements", agreementBatch.rows);
  await upsertRows(db, "documents", documentBatch.rows);

  const agreementDocumentActiveIds = new Set(
    documentRows.filter((row) => !row.deleted_at).map((row) => row.id),
  );
  await softDeleteOmitted(db, "documents", org.id, agreementDocumentActiveIds, agreementDocumentKept);
  const archiveDocumentActiveIds = new Set(
    archiveDocumentRows.filter((row) => !row.deleted_at).map((row) => row.id),
  );
  await softDeleteOmitted(db, "documents", org.id, archiveDocumentActiveIds, archiveDocumentKept);
  await softDeleteOmitted(db, "agreements", org.id, agreementIds.activeIds, agreementBatch.ids);
}

// ---------------------------------------------------------------------------
// Activity logs
// ---------------------------------------------------------------------------

/**
 * Replaces the activity log: upserts every entry and soft-deletes omitted rows.
 * Rows with entity_type "valuation" are excluded — they belong to the operations
 * aggregate's valuation audit trail.
 */
export async function replaceRelationalActivityLogs(entries: ActivityLogEntry[]): Promise<void> {
  const sb = requireServerSupabase();
  const db = admarkDb(sb);
  const org = await resolveOrganization(db);

  const activityRows = await fetchExistingRows<ActivityLookupRow>(
    db,
    "activity_logs",
    org.id,
    "id, legacy_id, deleted_at, entity_type",
  );
  const activityIds = new RowIdResolver("activity_log", activityRows);
  const batch = new RowBatch();
  for (const entry of entries ?? []) {
    const legacyId = requireLegacyId("activity_logs", entry.id);
    const id = activityIds.resolve(legacyId);
    batch.add({
      id,
      organization_id: org.id,
      legacy_id: activityIds.storedLegacyId(id, legacyId),
      occurred_at: isoTimestamp(entry.timestamp),
      entity_type: text(entry.entity) ?? "settings",
      action: text(entry.action) ?? "updated",
      summary: text(entry.summary) ?? "Activity",
      entity_legacy_id: text(entry.entityId),
      entity_name: text(entry.entityName),
      deleted_at: null,
    });
  }
  await upsertRows(db, "activity_logs", batch.rows);

  const replaceableActiveIds = new Set(
    activityRows
      .filter((row) => !row.deleted_at && row.entity_type !== "valuation")
      .map((row) => row.id),
  );
  await softDeleteOmitted(db, "activity_logs", org.id, replaceableActiveIds, batch.ids);
}
