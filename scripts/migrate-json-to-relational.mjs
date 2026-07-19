/**
 * Idempotent migration from legacy JSON payloads to the admark relational schema.
 *
 * Usage:
 *   node scripts/migrate-json-to-relational.mjs             # dry-run
 *   node scripts/migrate-json-to-relational.mjs --apply     # write rows
 *
 * Prerequisites:
 *   1. Run supabase/migrations/20260718120000_create_admark_relational_schema.sql.
 *   2. Expose the `admark` schema to PostgREST in Supabase API settings.
 *
 * The legacy public tables are read-only inputs and are never altered.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { decrypt } from "../shared/encryption-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
const DEFAULT_ORG_LEGACY_ID = "org-admark-digitals";

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase credentials missing in .env");

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const relational = sb.schema("admark");

function stableUuid(scope, legacyId) {
  const bytes = createHash("sha256").update(`${scope}:${legacyId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const array = (value) => (Array.isArray(value) ? value : []);
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : value === 0 ? 0 : null;
const isoDate = (value) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
const isoTime = (value) =>
  typeof value === "string" && /^\d{2}:\d{2}/.test(value) ? value.slice(0, 8) : "09:00";
const timestamp = (value, fallback = new Date().toISOString()) => {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
    return new Date(value).toISOString();
  return fallback;
};
const normalize = (value) => (text(value) ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

async function legacyRow(id) {
  const { data, error } = await sb
    .from("operations_data")
    .select("payload")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.payload && typeof data.payload === "object" ? data.payload : {};
}

async function legacyCompany() {
  const { data, error } = await sb
    .from("company_settings")
    .select("payload")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  return data?.payload && typeof data.payload === "object" ? data.payload : {};
}

async function legacyInvoices() {
  const { data, error } = await sb.from("invoices").select("id,payload,created_at");
  if (error) throw error;
  return array(data);
}

const issues = [];
function issue(collection, sourceId, code, message, sourceRecord, severity = "warning") {
  issues.push({
    source_collection: collection,
    source_id: sourceId ? String(sourceId) : null,
    severity,
    issue_code: code,
    message,
    source_record: sourceRecord ?? null,
  });
}

const tables = new Map();
function rows(table) {
  if (!tables.has(table)) tables.set(table, []);
  return tables.get(table);
}

function add(table, row) {
  rows(table).push(row);
  return row;
}

const mapRecords = [];
function mappedId(collection, legacyId) {
  if (!legacyId) return null;
  return stableUuid(collection, String(legacyId));
}

function remember(sourceTable, sourceCollection, legacyId, targetTable, targetId) {
  if (!legacyId || !targetId) return;
  mapRecords.push({
    source_table: sourceTable,
    source_collection: sourceCollection,
    legacy_id: String(legacyId),
    target_table: targetTable,
    target_id: targetId,
  });
}

async function upsert(table, data, onConflict = "organization_id,legacy_id") {
  if (!data.length || !apply) return;
  for (let index = 0; index < data.length; index += 100) {
    const batch = data.slice(index, index + 100);
    const { error } = await relational.from(table).upsert(batch, {
      onConflict,
      ignoreDuplicates: false,
    });
    if (error) {
      const hint =
        error.message?.includes("schema") || error.code === "PGRST106"
          ? " Ensure the `admark` schema is exposed in Supabase API settings."
          : "";
      throw new Error(`${table}: ${error.message}.${hint}`);
    }
  }
}

const ops = await legacyRow("default");
const documentsPayload = await legacyRow("documents");
const activityPayload = await legacyRow("activity_logs");
const companyPayload = await legacyCompany();
const invoiceRows = await legacyInvoices();

const organizationId = stableUuid("organization", DEFAULT_ORG_LEGACY_ID);
const companyId = stableUuid("company", DEFAULT_ORG_LEGACY_ID);
const settingsId = stableUuid("settings", DEFAULT_ORG_LEGACY_ID);

add("organizations", {
  id: organizationId,
  legacy_id: DEFAULT_ORG_LEGACY_ID,
  slug: "admark-digitals",
  name: text(companyPayload.name) ?? "Admark Digitals",
});
add("companies", {
  id: companyId,
  organization_id: organizationId,
  name: text(companyPayload.name) ?? "Admark Digitals",
  tagline: text(companyPayload.tagline),
  logo_url: text(companyPayload.logoDataUrl),
  signature_url: text(companyPayload.signatureDataUrl),
  gst_number: decrypt(text(companyPayload.gstin)),
  pan_number: decrypt(text(companyPayload.pan)),
  udyam_document_url: text(companyPayload.udyamCertificateDataUrl),
  address: decrypt(text(companyPayload.address)),
  email: text(companyPayload.email),
  phone: text(companyPayload.phone),
  website: text(companyPayload.website),
  authorized_name: text(companyPayload.authorizedName),
  bank_name: decrypt(text(companyPayload.bankName)),
  account_name: decrypt(text(companyPayload.accountName)),
  account_number: decrypt(text(companyPayload.accountNumber)),
  ifsc: decrypt(text(companyPayload.ifsc)),
  branch: decrypt(text(companyPayload.branch)),
  upi: decrypt(text(companyPayload.upi)),
});
add("settings", {
  id: settingsId,
  organization_id: organizationId,
  default_payment_terms: text(companyPayload.paymentTerms),
  default_remarks: text(companyPayload.remarks),
  default_payment_mode: text(companyPayload.paymentMode),
  opening_balance: number(ops.financialBaseline?.openingBalance),
  opening_balance_as_of: isoDate(ops.financialBaseline?.asOfDate),
  feature_toggles: {
    paymentProofUploadsEnabled: companyPayload.paymentProofUploadsEnabled === true,
    companyValuationEnabled: companyPayload.companyValuationEnabled === true,
  },
  application_preferences: {
    legacyFinancialBaseline: ops.financialBaseline ?? null,
    legacyValuationSettings: ops.valuationSettings ?? null,
    legacyAssets: array(ops.assets),
    legacySalarySchedules: array(ops.fixedMonthlyExpenses).filter((item) => item.kind === "salary"),
    legacyExpenseProofs: array(ops.expenses)
      .filter((item) => item.proof)
      .map((item) => ({ expenseId: item.id, proof: item.proof })),
    legacyMigrationState: {
      migrationApplied: ops.migrationApplied === true,
      migrationDate: ops.migrationDate ?? null,
      groundZeroApplied: ops.groundZeroApplied === true,
      blxRepairApplied: ops.blxRepairApplied === true,
      neRepairApplied: ops.neRepairApplied === true,
    },
  },
  user_preferences: {},
});

const clientByLegacy = new Map();
const clientByName = new Map();
function registerClient(source, synthetic = false) {
  const legacyId = text(source.id) ?? `synthetic-${normalize(source.companyName || source.client)}`;
  const name = text(source.companyName) ?? text(source.client) ?? text(source.clientName);
  if (!name) return null;
  const existing = clientByLegacy.get(legacyId) ?? clientByName.get(normalize(name));
  if (existing) return existing;
  const id = mappedId("client", legacyId);
  const row = add("clients", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    parent_client_id: null,
    company_name: name,
    contact_person: text(source.contactPerson) ?? text(source.clientContact),
    phone: decrypt(text(source.phone) ?? text(source.clientPhone)),
    email: decrypt(text(source.email) ?? text(source.clientEmail)),
    gst_number: decrypt(text(source.gstNumber) ?? text(source.clientGstin)),
    pan_number: decrypt(text(source.pan)),
    billing_address: decrypt(text(source.billingAddress) ?? text(source.clientAddress)),
    shipping_address: decrypt(text(source.shippingAddress)),
    website: text(source.website),
    industry: text(source.industry),
    client_since: isoDate(source.clientSince) ?? isoDate(source.startDate),
    status: source.status === "inactive" ? "inactive" : "active",
    notes: text(source.notes),
  });
  clientByLegacy.set(legacyId, id);
  clientByName.set(normalize(name), id);
  remember("operations_data", synthetic ? "synthetic_clients" : "clients", legacyId, "clients", id);
  return id;
}

for (const client of array(ops.clients)) registerClient(client);
const projectPaymentProofIds = new Set();
for (const project of array(ops.projects)) {
  if (!clientByLegacy.has(text(project.clientId)) && !clientByName.has(normalize(project.client))) {
    registerClient(
      {
        id: text(project.clientId) ?? `project-client-${project.id}`,
        companyName: project.client,
        phone: project.phone,
        email: project.email,
        startDate: project.startDate,
      },
      true,
    );
  }
}
for (const invoiceRow of invoiceRows) {
  const invoice = invoiceRow.payload ?? {};
  if (
    !clientByLegacy.has(text(invoice.clientId)) &&
    !clientByName.has(normalize(invoice.clientName))
  ) {
    registerClient(
      {
        id: text(invoice.clientId) ?? `invoice-client-${invoice.id}`,
        companyName: invoice.clientName,
        contactPerson: invoice.clientContact,
        phone: invoice.clientPhone,
        email: invoice.clientEmail,
        gstNumber: invoice.clientGstin,
        billingAddress: invoice.clientAddress,
      },
      true,
    );
  }
}

for (const client of array(ops.clients)) {
  const id = clientByLegacy.get(String(client.id));
  const parentId = clientByLegacy.get(String(client.parentClientId));
  const row = rows("clients").find((candidate) => candidate.id === id);
  if (row && parentId) row.parent_client_id = parentId;
  else if (row && client.parentClientId) {
    issue(
      "clients",
      client.id,
      "MISSING_PARENT_CLIENT",
      `Parent ${client.parentClientId} was not found.`,
      client,
    );
  }
}

const teamByLegacy = new Map();
const teamByName = new Map();
function registerTeamMember(member, sourceCollection = "companyMembers") {
  const legacyId = text(member.id) ?? `member-${normalize(member.name)}`;
  const name = text(member.name);
  if (!name) return null;
  const existing = teamByLegacy.get(legacyId) ?? teamByName.get(normalize(name));
  const roleMap = {
    founder: "founder",
    employee: "employee",
    intern: "intern",
    contractor: "partner",
    advisor: "advisor",
    partner: "partner",
  };
  if (existing) return existing;
  const id = mappedId("team_member", legacyId);
  add("team_members", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    name,
    email: text(member.email),
    phone: text(member.phone),
    role:
      roleMap[member.memberType] ??
      (member.role?.toLowerCase().includes("founder") ? "founder" : "employee"),
    job_title: text(member.role),
    join_date: isoDate(member.joinDate),
    status: member.status === "inactive" ? "inactive" : "active",
    base_monthly_salary: number(member.baseMonthlySalary),
    monthly_bonus_limit: number(member.monthlyBonusCap),
    salary_start_date: isoDate(member.salaryStartDate),
    salary_due_day: number(member.salaryDueDay),
    founder_share_percentage: number(member.sharePercentage),
    notes: text(member.notes),
  });
  teamByLegacy.set(legacyId, id);
  teamByName.set(normalize(name), id);
  remember(
    sourceCollection === "founders" ? "operations_data" : "company_settings",
    sourceCollection,
    legacyId,
    "team_members",
    id,
  );
  return id;
}

for (const member of array(companyPayload.companyMembers)) registerTeamMember(member);
for (const founder of array(ops.founders)) {
  const existing = teamByLegacy.get(String(founder.id)) ?? teamByName.get(normalize(founder.name));
  if (existing) {
    const row = rows("team_members").find((candidate) => candidate.id === existing);
    if (row) {
      row.role = "founder";
      row.founder_share_percentage = number(founder.sharePercentage);
      row.notes = text(founder.notes) ?? row.notes;
    }
    remember("operations_data", "founders", founder.id, "team_members", existing);
  } else {
    registerTeamMember({ ...founder, memberType: "founder", status: "active" }, "founders");
  }
}

const partnershipByLegacy = new Map();
const partnershipByName = new Map();
for (const partnership of array(ops.partnerships)) {
  const legacyId = text(partnership.id) ?? `partnership-${normalize(partnership.name)}`;
  const id = mappedId("partnership", legacyId);
  add("partnerships", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    name: text(partnership.name) ?? "Unnamed partnership",
    contact_name: text(partnership.contact),
    phone: text(partnership.phone),
    email: text(partnership.email),
    partnership_type: text(partnership.type),
    opportunity_type: text(partnership.opportunityType),
    status: ["active", "inactive", "prospect"].includes(partnership.status)
      ? partnership.status
      : "prospect",
    notes: text(partnership.notes),
  });
  partnershipByLegacy.set(legacyId, id);
  partnershipByName.set(normalize(partnership.name), id);
  remember("operations_data", "partnerships", legacyId, "partnerships", id);
}

const leadByLegacy = new Map();
function registerLead(lead, sourceCollection = "leads") {
  const legacyId =
    text(lead.id) ?? `${sourceCollection}-${normalize(lead.company || lead.companyName)}`;
  const id = mappedId("lead", legacyId);
  const companyName =
    text(lead.company) ?? text(lead.companyName) ?? text(lead.business) ?? text(lead.personName);
  if (!companyName) {
    issue(
      sourceCollection,
      legacyId,
      "MISSING_LEAD_NAME",
      "Lead/contact has no usable name.",
      lead,
      "error",
    );
    return null;
  }
  add("leads", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    converted_client_id:
      clientByLegacy.get(String(lead.clientId)) ?? clientByName.get(normalize(companyName)) ?? null,
    source_partnership_id:
      partnershipByLegacy.get(String(lead.partnershipId)) ??
      partnershipByName.get(normalize(lead.source)) ??
      null,
    assigned_team_member_id:
      teamByLegacy.get(String(lead.assignedSalesperson)) ??
      teamByName.get(normalize(lead.assignedSalesperson)) ??
      null,
    company_name: companyName,
    contact_person: text(lead.contactPerson) ?? text(lead.personName),
    email: text(lead.email),
    phone: decrypt(text(lead.phone)),
    status: [
      "new_lead",
      "contacted",
      "meeting_scheduled",
      "proposal_sent",
      "negotiation",
      "won",
      "lost",
    ].includes(lead.status)
      ? lead.status
      : "new_lead",
    source: text(lead.source) ?? (sourceCollection === "contacts" ? "Directory" : null),
    expected_revenue: number(lead.expectedRevenue),
    probability: number(lead.probability),
    expected_closing_date: isoDate(lead.expectedClosingDate),
    notes: text(lead.notes) ?? text(lead.contactVia),
    created_at: timestamp(lead.createdAt),
  });
  leadByLegacy.set(legacyId, id);
  remember("operations_data", sourceCollection, legacyId, "leads", id);
  return id;
}

for (const lead of array(ops.leads)) registerLead(lead);
for (const contact of array(ops.contacts)) registerLead(contact, "contacts");

const agreementByLegacy = new Map();
const agreementDocuments = [];
for (const agreement of array(documentsPayload.agreements)) {
  const legacyId = text(agreement.id) ?? `agreement-${normalize(agreement.title)}`;
  const id = mappedId("agreement", legacyId);
  const clientId =
    clientByLegacy.get(String(agreement.clientId)) ??
    clientByLegacy.get(String(agreement.counterpartyRef)) ??
    clientByName.get(normalize(agreement.counterpartyName)) ??
    null;
  const review = !clientId;
  if (review) {
    issue(
      "agreements",
      legacyId,
      "UNRESOLVED_AGREEMENT_CLIENT",
      "Agreement has no safely resolvable Client; migrated for review with no client link.",
      agreement,
    );
  }
  add("agreements", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    client_id: clientId,
    title: text(agreement.title) ?? "Untitled agreement",
    legacy_counterparty_name: text(agreement.counterpartyName),
    agreement_type: text(agreement.counterpartyType) ?? "agreement",
    status: agreement.signedDate ? "signed" : "draft",
    signed_date: isoDate(agreement.signedDate),
    expiry_date: isoDate(agreement.expiryDate),
    notes: text(agreement.notes),
    migration_review_required: review,
    created_at: timestamp(agreement.createdAt),
    updated_at: timestamp(agreement.updatedAt),
  });
  agreementByLegacy.set(legacyId, id);
  remember("operations_data", "agreements", legacyId, "agreements", id);
  if (agreement.fileDataUrl || agreement.externalUrl) {
    agreementDocuments.push({ agreement, agreementId: id });
  }
}

const projectByLegacy = new Map();
for (const project of array(ops.projects)) {
  const legacyId = text(project.id) ?? `project-${normalize(project.name || project.client)}`;
  const id = mappedId("project", legacyId);
  const clientId =
    clientByLegacy.get(String(project.clientId)) ?? clientByName.get(normalize(project.client));
  if (!clientId) {
    issue(
      "projects",
      legacyId,
      "UNRESOLVED_PROJECT_CLIENT",
      "Project Client could not be resolved.",
      project,
      "error",
    );
    continue;
  }
  add("projects", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    client_id: clientId,
    agreement_id: agreementByLegacy.get(String(project.agreementId)) ?? null,
    display_name: text(project.name) ?? text(project.client) ?? "Unnamed project",
    project_type: text(project.projectType),
    status: ["planning", "active", "on_hold", "completed", "cancelled"].includes(project.status)
      ? project.status
      : "planning",
    start_date: isoDate(project.startDate),
    end_date: isoDate(project.endDate),
    deadline: isoDate(project.deadline),
    budget: number(project.budget),
    estimated_cost: number(project.estimatedCost),
    contract_value: number(project.billing?.contractValue),
    upfront_amount: number(project.billing?.upfrontAmount),
    maintenance_amount: number(project.billing?.maintenanceAmount),
    maintenance_months: number(project.billing?.maintenanceMonths),
    monthly_amount: number(project.billing?.monthlyAmount),
    monthly_months: number(project.billing?.monthlyMonths),
    monthly_start_date: isoDate(project.billing?.monthlyStartDate),
    monthly_end_date: isoDate(project.billing?.monthlyEndDate),
    historical_received: number(project.historicalReceived) ?? 0,
    historical_outstanding: number(project.historicalOutstanding),
    phone: text(project.phone),
    email: text(project.email),
    notes: text(project.notes),
  });
  projectByLegacy.set(legacyId, id);
  remember("operations_data", "projects", legacyId, "projects", id);

  const memberIds = array(project.assignedMembers).length
    ? project.assignedMembers
    : project.assignedPartner
      ? [project.assignedPartner]
      : [];
  for (const legacyMemberId of new Set(memberIds)) {
    const teamMemberId =
      teamByLegacy.get(String(legacyMemberId)) ?? teamByName.get(normalize(legacyMemberId));
    if (!teamMemberId) {
      issue(
        "projects",
        legacyId,
        "UNRESOLVED_PROJECT_ASSIGNEE",
        `Team member ${legacyMemberId} was not found.`,
        project,
      );
      continue;
    }
    add("project_assignments", {
      id: stableUuid("project_assignment", `${legacyId}:${legacyMemberId}`),
      organization_id: organizationId,
      project_id: id,
      team_member_id: teamMemberId,
    });
  }

  array(project.milestones).forEach((milestone, position) => {
    const milestoneLegacyId = text(milestone.id) ?? `${legacyId}-${normalize(milestone.name)}`;
    const milestoneId = mappedId("project_milestone", milestoneLegacyId);
    add("project_milestones", {
      id: milestoneId,
      organization_id: organizationId,
      legacy_id: milestoneLegacyId,
      project_id: id,
      assigned_team_member_id:
        teamByLegacy.get(String(milestone.assignedUser)) ??
        teamByName.get(normalize(milestone.assignedUser)) ??
        null,
      name: text(milestone.name) ?? "Unnamed milestone",
      description: text(milestone.description),
      position,
      due_date: isoDate(milestone.dueDate),
      status: ["pending", "in_progress", "completed", "delayed"].includes(milestone.status)
        ? milestone.status
        : "pending",
      payment_trigger: milestone.paymentTrigger === true,
      completed_date: isoDate(milestone.completedDate),
    });
    remember("operations_data", "milestones", milestoneLegacyId, "project_milestones", milestoneId);
  });
}

const recurringByLegacy = new Map();
const salaryScheduleByMember = new Map();
for (const fixed of array(ops.fixedMonthlyExpenses)) {
  if (fixed.kind === "salary" && fixed.teamMemberId) {
    const memberId = teamByLegacy.get(String(fixed.teamMemberId));
    if (memberId) {
      salaryScheduleByMember.set(memberId, fixed);
      remember("operations_data", "fixedMonthlyExpenses", fixed.id, "team_members", memberId);
    } else
      issue(
        "fixedMonthlyExpenses",
        fixed.id,
        "UNRESOLVED_SALARY_MEMBER",
        "Salary schedule Team Member was not found.",
        fixed,
      );
    continue;
  }
  const legacyId = text(fixed.id) ?? `recurring-${normalize(fixed.label)}`;
  const id = mappedId("recurring_expense", legacyId);
  add("recurring_expenses", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    label: text(fixed.label) ?? "Recurring expense",
    payee: text(fixed.payee),
    amount_per_month: number(fixed.amountPerMonth) ?? 0,
    expense_type: ["emi", "rent", "subscription", "utility", "other"].includes(fixed.kind)
      ? fixed.kind
      : "other",
    start_date: isoDate(fixed.startDate) ?? new Date().toISOString().slice(0, 10),
    total_months: number(fixed.totalMonths),
    reminder_day: number(fixed.reminderDay),
    paid_months: array(fixed.paidMonths),
    status: ["active", "paused", "completed"].includes(fixed.status)
      ? fixed.status
      : fixed.active === false
        ? "paused"
        : "active",
    notes: text(fixed.notes),
  });
  recurringByLegacy.set(legacyId, id);
  remember("operations_data", "fixedMonthlyExpenses", legacyId, "recurring_expenses", id);
}

const expenseByLegacy = new Map();
for (const expense of array(ops.expenses)) {
  const legacyId = text(expense.id) ?? `expense-${normalize(expense.label)}-${expense.date}`;
  const id = mappedId("expense", legacyId);
  add("expenses", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    project_id: projectByLegacy.get(String(expense.projectId)) ?? null,
    partnership_id: partnershipByLegacy.get(String(expense.partnershipId)) ?? null,
    label: text(expense.label) ?? "Expense",
    amount: number(expense.amount) ?? 0,
    expense_date: isoDate(expense.date) ?? new Date().toISOString().slice(0, 10),
    category: text(expense.category),
    status: "paid",
    notes: text(expense.notes),
    historical: expense.isBaseline === true,
  });
  expenseByLegacy.set(legacyId, id);
  remember("operations_data", "expenses", legacyId, "expenses", id);
}

const invoiceByLegacy = new Map();
for (const sourceRow of invoiceRows) {
  const invoice = sourceRow.payload ?? {};
  const legacyId = text(invoice.id) ?? String(sourceRow.id);
  const id = mappedId("invoice", legacyId);
  const clientId =
    clientByLegacy.get(String(invoice.clientId)) ?? clientByName.get(normalize(invoice.clientName));
  if (!clientId) {
    issue(
      "invoices",
      legacyId,
      "UNRESOLVED_INVOICE_CLIENT",
      "Invoice Client could not be resolved.",
      invoice,
      "error",
    );
    continue;
  }
  const projectId =
    projectByLegacy.get(String(invoice.projectId)) ??
    (array(ops.projects).filter((project) => project.clientId === invoice.clientId).length === 1
      ? projectByLegacy.get(
          String(array(ops.projects).find((project) => project.clientId === invoice.clientId)?.id),
        )
      : null);
  add("invoices", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    client_id: clientId,
    project_id: projectId ?? null,
    agreement_id: agreementByLegacy.get(String(invoice.agreementId)) ?? null,
    number: text(invoice.number) ?? legacyId,
    invoice_date: isoDate(invoice.date) ?? new Date().toISOString().slice(0, 10),
    status: [
      "draft",
      "generated",
      "sent",
      "viewed",
      "partially_paid",
      "paid",
      "cancelled",
      "overdue",
    ].includes(invoice.status)
      ? invoice.status
      : "generated",
    client_name_snapshot: text(invoice.clientName) ?? "Unknown client",
    client_business_type_snapshot: text(invoice.clientBusinessType),
    client_address_snapshot: decrypt(text(invoice.clientAddress)),
    client_contact_snapshot: text(invoice.clientContact),
    client_phone_snapshot: decrypt(text(invoice.clientPhone)),
    client_email_snapshot: decrypt(text(invoice.clientEmail)),
    client_gstin_snapshot: decrypt(text(invoice.clientGstin)),
    company_snapshot: {
      name: text(companyPayload.name),
      address: decrypt(text(companyPayload.address)),
      gstin: decrypt(text(companyPayload.gstin)),
      pan: decrypt(text(companyPayload.pan)),
    },
    advance: number(invoice.advance) ?? 0,
    tax_percent: number(invoice.taxPercent) ?? 0,
    remarks: text(invoice.remarks),
    payment_terms: text(invoice.paymentTerms),
    payment_mode: text(invoice.paymentMode),
    payment_date: isoDate(invoice.paymentDate),
    created_at: timestamp(invoice.createdAt, sourceRow.created_at),
  });
  invoiceByLegacy.set(legacyId, id);
  remember("invoices", "invoices", legacyId, "invoices", id);
  array(invoice.items).forEach((line, position) => {
    const lineLegacyId = text(line.id) ?? `${legacyId}-line-${position}`;
    const lineId = mappedId("invoice_line", lineLegacyId);
    add("invoice_lines", {
      id: lineId,
      organization_id: organizationId,
      legacy_id: lineLegacyId,
      invoice_id: id,
      project_id: projectId ?? null,
      description: text(line.description) ?? "Service",
      quantity: number(line.quantity) ?? 0,
      rate: number(line.rate) ?? 0,
      position,
    });
    remember("invoices", "invoice_lines", lineLegacyId, "invoice_lines", lineId);
  });
}

const salaryByMemberMonth = new Map();
const payrollTransactions = array(ops.transactions).filter(
  (transaction) => transaction.relatedTeamMemberId && transaction.payrollMonth,
);
const salaryKeys = new Set(
  payrollTransactions.map(
    (transaction) => `${transaction.relatedTeamMemberId}:${transaction.payrollMonth}`,
  ),
);
for (const [memberId, schedule] of salaryScheduleByMember) {
  for (const month of array(schedule.paidMonths)) {
    const legacyMemberId = [...teamByLegacy.entries()].find(([, id]) => id === memberId)?.[0];
    if (legacyMemberId) salaryKeys.add(`${legacyMemberId}:${month}`);
  }
}
for (const keyValue of salaryKeys) {
  const separator = keyValue.lastIndexOf(":");
  const legacyMemberId = keyValue.slice(0, separator);
  const month = keyValue.slice(separator + 1);
  const teamMemberId = teamByLegacy.get(legacyMemberId);
  if (!teamMemberId) continue;
  const schedule = salaryScheduleByMember.get(teamMemberId);
  const related = payrollTransactions.filter(
    (transaction) =>
      String(transaction.relatedTeamMemberId) === legacyMemberId &&
      transaction.payrollMonth === month,
  );
  const paidBase = related.reduce(
    (sum, transaction) =>
      sum + (number(transaction.salaryBaseAmount) ?? number(transaction.amount) ?? 0),
    0,
  );
  const baseAmount =
    number(schedule?.amountPerMonth) ??
    number(
      rows("team_members").find((member) => member.id === teamMemberId)?.base_monthly_salary,
    ) ??
    paidBase;
  const bonusAmount = related.reduce(
    (sum, transaction) => sum + (number(transaction.salaryBonusAmount) ?? 0),
    0,
  );
  const legacyId = `salary-${legacyMemberId}-${month}`;
  const id = mappedId("salary", legacyId);
  add("salaries", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    team_member_id: teamMemberId,
    salary_month: month,
    base_amount: baseAmount,
    bonus_amount: bonusAmount,
    status: paidBase >= baseAmount ? "paid" : paidBase > 0 ? "partial" : "pending",
  });
  salaryByMemberMonth.set(`${legacyMemberId}:${month}`, id);
  remember("operations_data", "salaries", legacyId, "salaries", id);
}

const transactionByLegacy = new Map();
for (const transaction of array(ops.transactions)) {
  const legacyId = text(transaction.id) ?? `transaction-${transaction.date}-${transaction.amount}`;
  const id = mappedId("transaction", legacyId);
  const salaryId =
    transaction.relatedTeamMemberId && transaction.payrollMonth
      ? salaryByMemberMonth.get(`${transaction.relatedTeamMemberId}:${transaction.payrollMonth}`)
      : null;
  add("transactions", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    client_id: clientByLegacy.get(String(transaction.relatedClientId)) ?? null,
    project_id: projectByLegacy.get(String(transaction.relatedProjectId)) ?? null,
    invoice_id: invoiceByLegacy.get(String(transaction.relatedInvoiceId)) ?? null,
    team_member_id:
      teamByLegacy.get(String(transaction.relatedTeamMemberId ?? transaction.relatedFounderId)) ??
      null,
    expense_id:
      expenseByLegacy.get(String(transaction.expenseId)) ??
      expenseByLegacy.get(String(transaction.relatedExpenseId)) ??
      null,
    salary_id: salaryId,
    recurring_expense_id: recurringByLegacy.get(String(transaction.fixedMonthlyExpenseId)) ?? null,
    transaction_type: [
      "client_payment",
      "founder_investment",
      "founder_withdrawal",
      "expense",
      "refund",
      "internal_transfer",
      "adjustment",
    ].includes(transaction.type)
      ? transaction.type
      : "adjustment",
    transaction_date: isoDate(transaction.date) ?? new Date().toISOString().slice(0, 10),
    amount: number(transaction.amount) ?? 0,
    description: text(transaction.description) ?? "Transaction",
    category: text(transaction.category),
    payment_method: text(transaction.paymentMethod),
    vendor: text(transaction.vendor),
    gst_amount: number(transaction.gst),
    notes: text(transaction.notes),
    payroll_month: text(transaction.payrollMonth),
    salary_base_amount: number(transaction.salaryBaseAmount),
    salary_bonus_amount: number(transaction.salaryBonusAmount),
    created_by: text(transaction.createdBy),
    historical: transaction.historical === true,
    created_at: timestamp(transaction.createdAt),
    updated_at: timestamp(transaction.updatedAt),
  });
  transactionByLegacy.set(legacyId, id);
  remember("operations_data", "transactions", legacyId, "transactions", id);
}

for (const expense of array(ops.expenses)) {
  if (expense.isBaseline) continue;
  const transactionId = transactionByLegacy.get(String(expense.id));
  if (transactionId) {
    const transaction = rows("transactions").find((candidate) => candidate.id === transactionId);
    if (transaction) transaction.expense_id = expenseByLegacy.get(String(expense.id)) ?? null;
  }
}

const paymentByLegacy = new Map();
const paymentCandidates = [
  ...array(ops.payments).map((payment) => ({ ...payment, source: "payments" })),
  ...array(ops.projects).flatMap((project) =>
    array(project.payments).map((payment) => ({
      ...payment,
      projectId: project.id,
      clientId: project.clientId,
      source: "projectPayments",
    })),
  ),
];
for (const payment of paymentCandidates) {
  const legacyId = text(payment.id);
  if (!legacyId || paymentByLegacy.has(legacyId)) continue;
  const candidateProjectId = projectByLegacy.get(String(payment.projectId)) ?? null;
  const candidateInvoiceId = invoiceByLegacy.get(String(payment.invoiceId)) ?? null;
  const matchingTransaction = rows("transactions").find(
    (transaction) =>
      transaction.transaction_type === "client_payment" &&
      transaction.transaction_date === isoDate(payment.date) &&
      Math.abs(Number(transaction.amount) - Number(payment.amount)) < 0.005 &&
      (!candidateProjectId || transaction.project_id === candidateProjectId) &&
      (!candidateInvoiceId || transaction.invoice_id === candidateInvoiceId),
  );
  const transactionId = transactionByLegacy.get(legacyId) ?? matchingTransaction?.id;
  const invoiceId = candidateInvoiceId;
  const projectId = candidateProjectId;
  const project = array(ops.projects).find((candidate) => candidate.id === payment.projectId);
  const clientId =
    clientByLegacy.get(String(payment.clientId ?? project?.clientId)) ??
    clientByName.get(normalize(project?.client)) ??
    rows("invoices").find((invoice) => invoice.id === invoiceId)?.client_id ??
    null;
  if (!clientId) {
    issue(
      payment.source,
      legacyId,
      "UNRESOLVED_PAYMENT_CLIENT",
      "Payment Client could not be resolved.",
      payment,
      "error",
    );
    continue;
  }
  const id = mappedId("payment", legacyId);
  add("payments", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    transaction_id: transactionId,
    client_id: clientId,
    invoice_id: invoiceId,
    project_id: projectId,
    amount: number(payment.amount) ?? 0,
    payment_date: isoDate(payment.date) ?? new Date().toISOString().slice(0, 10),
    payment_method: text(payment.method) ?? "upi",
    reference_number: text(payment.referenceNumber),
    external_transaction_id: text(payment.transactionId),
    notes: text(payment.notes) ?? text(payment.note),
    historical: !transactionId,
    recurring: payment.recurring === true,
  });
  paymentByLegacy.set(legacyId, id);
  remember("operations_data", payment.source, legacyId, "payments", id);
}

for (const event of array(ops.scheduleEvents)) {
  const legacyId = text(event.id) ?? `calendar-${event.date}-${normalize(event.title)}`;
  const id = mappedId("calendar", legacyId);
  add("calendar", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    client_id:
      clientByLegacy.get(String(event.clientId)) ??
      clientByName.get(normalize(event.contact)) ??
      null,
    lead_id: leadByLegacy.get(String(event.leadId)) ?? null,
    project_id: projectByLegacy.get(String(event.projectId)) ?? null,
    team_member_id: teamByLegacy.get(String(event.teamMemberId)) ?? null,
    title: text(event.title) ?? "Calendar item",
    calendar_type: event.type === "call" ? "call" : "meeting",
    event_date: isoDate(event.date) ?? new Date().toISOString().slice(0, 10),
    start_time: isoTime(event.startTime),
    duration_minutes: number(event.durationMinutes) ?? 30,
    attendees: text(event.contact),
    location: text(event.location),
    meeting_url: text(event.meetingUrl),
    notes: text(event.notes),
    reminder_minutes: number(event.reminderMinutes) ?? 30,
    status: ["scheduled", "completed", "cancelled"].includes(event.status)
      ? event.status
      : "scheduled",
    created_at: timestamp(event.createdAt),
    updated_at: timestamp(event.updatedAt),
  });
  remember("operations_data", "scheduleEvents", legacyId, "calendar", id);
}

for (const notification of array(ops.notifications)) {
  const legacyId = text(notification.id) ?? `notification-${notification.timestamp}`;
  const id = mappedId("notification", legacyId);
  add("notifications", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    title: text(notification.title) ?? "Notification",
    message: text(notification.message) ?? "",
    priority: ["low", "medium", "high"].includes(notification.priority)
      ? notification.priority
      : "medium",
    read: notification.read === true,
    occurred_at: timestamp(notification.timestamp),
    related_module: text(notification.relatedModule),
    action_url: text(notification.actionUrl),
    action_label: text(notification.actionLabel),
  });
  remember("operations_data", "notifications", legacyId, "notifications", id);
}

for (const entry of array(activityPayload.entries)) {
  const legacyId = text(entry.id) ?? `activity-${entry.timestamp}-${normalize(entry.summary)}`;
  const id = mappedId("activity_log", legacyId);
  add("activity_logs", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    occurred_at: timestamp(entry.timestamp),
    entity_type: text(entry.entity) ?? "system",
    action: text(entry.action) ?? "updated",
    summary: text(entry.summary) ?? "Activity",
    entity_legacy_id: text(entry.entityId),
    entity_name: text(entry.entityName),
  });
  remember("operations_data", "activity_logs", legacyId, "activity_logs", id);
}
for (const entry of array(ops.valuationAudit)) {
  const legacyId = text(entry.id) ?? `valuation-audit-${entry.timestamp}`;
  const id = mappedId("activity_log", legacyId);
  add("activity_logs", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    occurred_at: timestamp(entry.timestamp),
    entity_type: "valuation",
    action: "updated",
    summary: text(entry.reason) ?? `Valuation ${entry.field ?? "setting"} changed`,
    entity_legacy_id: null,
    entity_name: text(entry.field),
    actor: text(entry.actor),
    metadata: {
      oldValue: entry.oldValue,
      newValue: entry.newValue,
    },
  });
  remember("operations_data", "valuationAudit", legacyId, "activity_logs", id);
}

for (const snapshot of array(ops.valuationSnapshots)) {
  const legacyId = text(snapshot.id) ?? `valuation-${snapshot.date}`;
  const id = mappedId("valuation_snapshot", legacyId);
  add("valuation_snapshots", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    valuation_date: isoDate(snapshot.date) ?? new Date().toISOString().slice(0, 10),
    calculated_valuation: number(snapshot.calculatedValuation) ?? 0,
    revenue: number(snapshot.revenue),
    assets: number(snapshot.assets),
    profit: number(snapshot.profit),
    growth: number(snapshot.growth),
    net_worth: number(snapshot.netWorth),
    enterprise_value: number(snapshot.enterpriseValue),
    note: text(snapshot.reason),
    snapshot_data: snapshot,
    created_at: timestamp(snapshot.createdAt),
  });
  remember("operations_data", "valuationSnapshots", legacyId, "valuation_snapshots", id);
}

function addDocument({
  legacyId,
  title,
  type,
  fileUrl,
  externalUrl,
  fileName,
  mimeType,
  notes,
  owner,
  sourceCollection,
}) {
  if (!fileUrl && !externalUrl) return null;
  const id = mappedId("document", legacyId);
  add("documents", {
    id,
    organization_id: organizationId,
    legacy_id: legacyId,
    company_id: owner.company_id ?? null,
    client_id: owner.client_id ?? null,
    project_id: owner.project_id ?? null,
    agreement_id: owner.agreement_id ?? null,
    invoice_id: owner.invoice_id ?? null,
    transaction_id: owner.transaction_id ?? null,
    partnership_id: owner.partnership_id ?? null,
    title,
    document_type: type,
    file_url: fileUrl ?? null,
    external_url: externalUrl ?? null,
    file_name: fileName ?? null,
    mime_type: mimeType ?? null,
    notes: notes ?? null,
  });
  remember("mixed", sourceCollection, legacyId, "documents", id);
  return id;
}

for (const { agreement, agreementId } of agreementDocuments) {
  addDocument({
    legacyId: `agreement-document-${agreement.id}`,
    title: text(agreement.title) ?? "Agreement",
    type: "agreement",
    fileUrl: text(agreement.fileDataUrl),
    externalUrl: text(agreement.externalUrl),
    fileName: text(agreement.fileName),
    mimeType: text(agreement.mimeType),
    notes: text(agreement.notes),
    owner: { agreement_id: agreementId },
    sourceCollection: "agreements",
  });
}
for (const document of array(companyPayload.complianceDocuments)) {
  addDocument({
    legacyId: text(document.id) ?? `compliance-${normalize(document.title)}`,
    title: text(document.title) ?? "Compliance document",
    type: "compliance",
    fileUrl: text(document.fileDataUrl),
    externalUrl: text(document.externalUrl),
    fileName: text(document.fileName),
    mimeType: text(document.mimeType),
    owner: { company_id: companyId },
    sourceCollection: "complianceDocuments",
  });
}
for (const [kind, value] of [
  ["logo", companyPayload.logoDataUrl],
  ["signature", companyPayload.signatureDataUrl],
  ["udyam", companyPayload.udyamCertificateDataUrl],
]) {
  if (value) {
    addDocument({
      legacyId: `company-${kind}`,
      title: `Company ${kind}`,
      type: kind,
      fileUrl: text(value),
      owner: { company_id: companyId },
      sourceCollection: "companySettings",
    });
  }
}
for (const transaction of array(ops.transactions)) {
  if (!transaction.attachmentDataUrl) continue;
  const transactionId = transactionByLegacy.get(String(transaction.id));
  if (!transactionId) continue;
  addDocument({
    legacyId: `transaction-proof-${transaction.id}`,
    title: `${transaction.description ?? "Transaction"} proof`,
    type: "transaction_proof",
    fileUrl: text(transaction.attachmentDataUrl),
    owner: { transaction_id: transactionId },
    sourceCollection: "transactionAttachments",
  });
}
for (const project of array(ops.projects)) {
  const projectId = projectByLegacy.get(String(project.id));
  if (!projectId) continue;
  for (const payment of array(project.payments)) {
    if (!payment.proof?.imageDataUrl) continue;
    const transactionId = transactionByLegacy.get(String(payment.id));
    addDocument({
      legacyId: `project-payment-proof-${project.id}-${payment.id}`,
      title: `${project.name ?? project.client} payment proof`,
      type: "payment_proof",
      fileUrl: text(payment.proof.imageDataUrl),
      fileName: text(payment.proof.fileName),
      mimeType: text(payment.proof.mimeType),
      owner: transactionId ? { transaction_id: transactionId } : { project_id: projectId },
      sourceCollection: "projectPaymentProofs",
    });
    projectPaymentProofIds.add(String(payment.id));
  }
}
for (const payment of paymentCandidates) {
  if (!payment.id || !payment.screenshotDataUrl || projectPaymentProofIds.has(String(payment.id))) {
    continue;
  }
  const migratedPayment = rows("payments").find(
    (candidate) => candidate.legacy_id === String(payment.id),
  );
  if (!migratedPayment) continue;
  const owner = migratedPayment.transaction_id
    ? { transaction_id: migratedPayment.transaction_id }
    : migratedPayment.project_id
      ? { project_id: migratedPayment.project_id }
      : migratedPayment.invoice_id
        ? { invoice_id: migratedPayment.invoice_id }
        : { client_id: migratedPayment.client_id };
  addDocument({
    legacyId: `payment-proof-${payment.id}`,
    title: `Payment ${payment.id} proof`,
    type: "payment_proof",
    fileUrl: text(payment.screenshotDataUrl),
    owner,
    sourceCollection: "paymentProofs",
  });
}
for (const expense of array(ops.expenses)) {
  if (!expense.proof?.imageDataUrl) continue;
  const transaction = rows("transactions").find(
    (candidate) => candidate.expense_id === expenseByLegacy.get(String(expense.id)),
  );
  if (!transaction) continue;
  addDocument({
    legacyId: `expense-proof-${expense.id}`,
    title: `${expense.label ?? "Expense"} proof`,
    type: "transaction_proof",
    fileUrl: text(expense.proof.imageDataUrl),
    fileName: text(expense.proof.fileName),
    mimeType: text(expense.proof.mimeType),
    owner: { transaction_id: transaction.id },
    sourceCollection: "expenseProofs",
  });
}

const sourceCounts = {
  clients: array(ops.clients).length,
  contacts: array(ops.contacts).length,
  leads: array(ops.leads).length,
  projects: array(ops.projects).length,
  projectPayments: array(ops.projects).reduce(
    (sum, project) => sum + array(project.payments).length,
    0,
  ),
  partnerships: array(ops.partnerships).length,
  expenses: array(ops.expenses).length,
  fixedMonthlyExpenses: array(ops.fixedMonthlyExpenses).length,
  payments: array(ops.payments).length,
  transactions: array(ops.transactions).length,
  founders: array(ops.founders).length,
  notifications: array(ops.notifications).length,
  scheduleEvents: array(ops.scheduleEvents).length,
  valuationSnapshots: array(ops.valuationSnapshots).length,
  agreements: array(documentsPayload.agreements).length,
  activityLogs: array(activityPayload.entries).length,
  invoices: invoiceRows.length,
  companyMembers: array(companyPayload.companyMembers).length,
  complianceDocuments: array(companyPayload.complianceDocuments).length,
};
const targetCounts = Object.fromEntries(
  [...tables.entries()].map(([table, records]) => [table, records.length]),
);

console.log(apply ? "Applying relational migration..." : "Dry-run only (pass --apply to write).");
console.log("Source counts:", JSON.stringify(sourceCounts, null, 2));
console.log("Target counts:", JSON.stringify(targetCounts, null, 2));
console.log(`Migration issues: ${issues.length}`);
for (const entry of issues) {
  console.log(
    `- [${entry.severity}] ${entry.source_collection}/${entry.source_id}: ${entry.message}`,
  );
}

if (apply) {
  const { error: orgError } = await relational.from("organizations").upsert(rows("organizations"), {
    onConflict: "legacy_id",
  });
  if (orgError) throw new Error(`organizations: ${orgError.message}`);

  const runId = stableUuid("migration_run", "legacy-json-v1");
  const { error: runError } = await relational.from("migration_runs").upsert(
    {
      id: runId,
      organization_id: organizationId,
      migration_name: "legacy-json-v1",
      status: "running",
      source_counts: sourceCounts,
      target_counts: {},
      started_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (runError) throw new Error(`migration_runs: ${runError.message}`);

  const order = [
    "companies",
    "settings",
    "clients",
    "team_members",
    "partnerships",
    "leads",
    "agreements",
    "projects",
    "project_assignments",
    "project_milestones",
    "invoices",
    "invoice_lines",
    "recurring_expenses",
    "salaries",
    "expenses",
    "transactions",
    "payments",
    "documents",
    "calendar",
    "notifications",
    "activity_logs",
    "valuation_snapshots",
  ];
  for (const table of order) {
    const conflict =
      table === "companies" || table === "settings"
        ? "organization_id"
        : table === "project_assignments"
          ? "id"
          : "organization_id,legacy_id";
    await upsert(table, rows(table), conflict);
    console.log(`Migrated ${table}: ${rows(table).length}`);
  }

  const maps = mapRecords.map((record) => ({
    ...record,
    id: stableUuid(
      "legacy_map",
      `${record.source_table}:${record.source_collection}:${record.legacy_id}:${record.target_table}`,
    ),
    organization_id: organizationId,
  }));
  await upsert(
    "legacy_record_map",
    maps,
    "organization_id,source_table,source_collection,legacy_id,target_table",
  );

  if (issues.length) {
    const issueRows = issues.map((entry, index) => ({
      id: stableUuid(
        "migration_issue",
        `${runId}:${entry.source_collection}:${entry.source_id}:${entry.issue_code}:${index}`,
      ),
      migration_run_id: runId,
      organization_id: organizationId,
      ...entry,
    }));
    const { error } = await relational.from("migration_issues").upsert(issueRows, {
      onConflict: "id",
    });
    if (error) throw new Error(`migration_issues: ${error.message}`);
  }

  const { error: completeError } = await relational
    .from("migration_runs")
    .update({
      status: issues.length ? "completed_with_issues" : "completed",
      target_counts: targetCounts,
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (completeError) throw new Error(`migration_runs completion: ${completeError.message}`);
  console.log("Relational migration complete. Legacy JSON tables were not modified.");
}
