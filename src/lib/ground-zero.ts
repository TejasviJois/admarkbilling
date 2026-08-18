import { formatINRWhole } from "./invoice-calc";
import { buildRevenueValueFromBilling } from "./project-billing";
import { paymentSummary } from "./project-payments";
import type {
  FinancialBaseline,
  Founder,
  OperationsData,
  Project,
  ProjectBilling,
  ProjectStatus,
  Transaction,
} from "./types";

/**
 * GROUND ZERO — 17 Jul 2026.
 *
 * All financial history before this date was wiped and re-initialized from the
 * company's Ground Zero Financial Excel (single source of truth). Nothing here
 * is derived or reconstructed — every number below is copied from the Excel.
 *
 * Rules encoded here:
 * - The Opening Balance is the authoritative cash/bank balance; never recalculated.
 * - The historical expense row is ledger context only — it must not change the balance.
 * - Per-project "Historical Received" initializes payment history and pending balances.
 *   Its ledger rows are display-only (`historical: true`) and never change financial totals.
 */
export const GROUND_ZERO_DATE = "2026-07-17";

const GZ_TIMESTAMP = Date.parse(`${GROUND_ZERO_DATE}T00:00:00+05:30`);

export const GROUND_ZERO_OPENING_BALANCE = 46_966.42;

/** Summary sheet — reconciled totals for everything before migration. */
export const GROUND_ZERO_BASELINE: FinancialBaseline = {
  periodLabel: "Ground Zero migration (history up to 17 Jul 2026)",
  asOfDate: GROUND_ZERO_DATE,
  totalRevenueBooked: 462_425,
  totalHandoutsTaken: 123_745,
  // Reconciled against the actual imported payments (24,000 + 36,000 + 30,000
  // + 10,000 + 12,425 + 20,000 + 5,000 + 10,000) — the Excel summary said
  // 148,425 but was ₹1,000 higher than the payments it summarized.
  totalRevenueReceived: 147_425,
  totalExternalPayouts: 10_000,
  totalCompanyExpenses: 36_564.48,
  founderPayoutPool: 56_894.1,
};

/** Transactions sheet — imported exactly as provided (2 rows). */
export const GROUND_ZERO_TRANSACTIONS: Transaction[] = [
  {
    id: "tx-gz-opening-balance",
    type: "adjustment",
    date: GROUND_ZERO_DATE,
    amount: GROUND_ZERO_OPENING_BALANCE,
    description: "Opening Balance",
    category: "Opening Balance",
    paymentMethod: "bank_transfer",
    notes: "Ground Zero Migration — authoritative cash/bank balance as of 17 Jul 2026.",
    createdAt: GZ_TIMESTAMP,
    updatedAt: GZ_TIMESTAMP,
  },
  {
    id: "tx-gz-historical-expense",
    type: "expense",
    date: GROUND_ZERO_DATE,
    amount: 103_459,
    description: "Historical Expense Adjustment",
    category: "Historical Expense",
    paymentMethod: "bank_transfer",
    vendor: "Historical",
    notes:
      "Includes company expenses, founder salaries and historical payouts before migration. " +
      "Context only — already reflected in the Opening Balance.",
    createdAt: GZ_TIMESTAMP,
    updatedAt: GZ_TIMESTAMP,
    historical: true,
  },
];

/** Founders sheet. */
export const GROUND_ZERO_FOUNDERS: Founder[] = [
  { id: "member-tejasvi", name: "Tejasvi Jois", sharePercentage: 40, notes: "CEO" },
  { id: "member-revanth", name: "Revanth Kumar S", sharePercentage: 20, notes: "CTO" },
  { id: "member-harshith", name: "Harshith V Malipatil", sharePercentage: 20, notes: "COO" },
  { id: "member-prajwal", name: "Prajwal BP", sharePercentage: 20, notes: "CFO" },
];

type GroundZeroContract = {
  /** Project code from the Excel. */
  code: string;
  clientName: string;
  /** Lowercase substrings used to find the matching existing project. */
  match: string[];
  status: ProjectStatus;
  billing: ProjectBilling;
  historicalReceived: number;
  historicalOutstanding: number | null;
  note?: string;
};

/**
 * Project Contracts sheet. Order matters — more specific names (BLXR SEO) must
 * match before broader ones (BLXR) so each row claims the right project.
 */
export const GROUND_ZERO_CONTRACTS: GroundZeroContract[] = [
  {
    code: "BLXR SEO",
    clientName: "BLX Realty — SEO",
    match: ["blxr seo", "blx realty seo", "blx seo"],
    status: "active",
    billing: { upfrontAmount: 2_000 },
    historicalReceived: 1_000,
    historicalOutstanding: 1_000,
  },
  {
    code: "BLXR",
    clientName: "BLX Realty",
    match: ["blxr", "blx realty", "blx"],
    status: "active",
    // ₹77,000 total project value with 2 months of maintenance (₹7k × 2) included.
    billing: { contractValue: 77_000, maintenanceAmount: 14_000, maintenanceMonths: 2 },
    historicalReceived: 25_000,
    historicalOutstanding: 52_000,
    note: "Project not yet completed.",
  },
  {
    code: "RLQ",
    clientName: "Reliable Logistics",
    match: ["reliable logistics", "rlq", "rls p", "rls"],
    status: "completed",
    billing: { upfrontAmount: 24_000 },
    historicalReceived: 24_000,
    historicalOutstanding: 0,
  },
  {
    code: "TAH",
    clientName: "Trustandhoperad",
    match: ["trustandhope", "tah"],
    status: "active",
    billing: { upfrontAmount: 110_000 },
    historicalReceived: 36_000,
    historicalOutstanding: 74_000,
    note: "12 months included in the total cost. Project not yet completed.",
  },
  {
    code: "KSC",
    clientName: "Srivatsanka Catering",
    match: ["srivatsanka", "ksc", "kannan"],
    status: "active",
    billing: { contractValue: 140_000, monthlyAmount: 8_500, monthlyMonths: 12 },
    historicalReceived: 30_000,
    historicalOutstanding: 110_000,
    note: "Project not yet completed.",
  },
  {
    code: "NE",
    clientName: "Nidhi Estates",
    match: ["nidhi estates", "nidhi"],
    status: "active",
    billing: { upfrontAmount: 20_000 },
    historicalReceived: 10_000,
    historicalOutstanding: 10_000,
  },
  {
    code: "A7GX",
    clientName: "A7 Global Tech",
    match: ["a7 global", "a7 gtech", "a7gx", "a7"],
    status: "active",
    billing: { upfrontAmount: 12_425 },
    historicalReceived: 12_425,
    historicalOutstanding: 0,
  },
  {
    code: "PPRS",
    clientName: "Safe Wheels",
    match: ["safe wheels", "pprs"],
    status: "active",
    billing: { upfrontAmount: 80_000 },
    historicalReceived: 0,
    historicalOutstanding: 80_000,
    note: "12 months included in the total cost. Project not yet completed.",
  },
  {
    code: "KMS",
    clientName: "Kapila Management Software",
    match: ["kapila management", "kapila mgmt", "kms"],
    status: "active",
    billing: {
      monthlyAmount: 10_000,
      monthlyStartDate: "2026-07-08",
    },
    historicalReceived: 10_000,
    historicalOutstanding: null,
    note: "Monthly retainer started July 8th (ongoing).",
  },
];

function contractTotal(billing: ProjectBilling): number {
  if (billing.contractValue) return billing.contractValue;
  let total = (billing.upfrontAmount ?? 0) + (billing.maintenanceAmount ?? 0);
  if (billing.monthlyAmount && billing.monthlyMonths != null) {
    total += billing.monthlyAmount * billing.monthlyMonths;
  }
  return total;
}

function contractPaymentStatus(contract: GroundZeroContract): string {
  const received = contract.historicalReceived;
  if (received <= 0) return "";
  const total = contractTotal(contract.billing);
  const parts = [`${formatINRWhole(received)} received`];
  if (total > received) parts.push(`${formatINRWhole(total - received)} remaining`);
  if (total > 0 && received >= total) parts.push("settled");
  return parts.join(" · ");
}

function normalizeLabel(project: Project): string {
  return `${project.client ?? ""} ${project.name ?? ""}`.toLowerCase();
}

function applyContract(project: Project, contract: GroundZeroContract): Project {
  const billing = { ...contract.billing };
  return {
    ...project,
    status: contract.status,
    billing,
    revenueValue: buildRevenueValueFromBilling(billing) ?? project.revenueValue,
    historicalReceived: contract.historicalReceived,
    historicalOutstanding: contract.historicalOutstanding,
    payments: [],
    paymentProofs: undefined,
    paymentStatus: contractPaymentStatus(contract),
    notes: contract.note
      ? [project.notes?.trim(), contract.note].filter(Boolean).join(" ")
      : project.notes,
  };
}

function projectFromContract(contract: GroundZeroContract): Project {
  const slug = contract.code.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const billing = { ...contract.billing };
  return {
    id: `proj-gz-${slug}`,
    client: contract.clientName,
    name: contract.clientName,
    status: contract.status,
    billing,
    revenueValue: buildRevenueValueFromBilling(billing),
    historicalReceived: contract.historicalReceived,
    historicalOutstanding: contract.historicalOutstanding,
    payments: [],
    paymentStatus: contractPaymentStatus(contract),
    notes: contract.note,
  };
}

/**
 * One-time Ground Zero reset. Wipes every financial record (transactions, expenses,
 * payments, proofs) and re-initializes the system from the Excel. Non-financial data
 * (clients, leads, partnerships, calendar, valuation settings, …) is preserved.
 */
export function applyGroundZeroMigration(data: OperationsData): OperationsData {
  if (data.groundZeroApplied) return data;

  // Wipe payment history on every project; paymentStatus "" blocks legacy
  // text from being resurrected as synthetic payments.
  const wiped: Project[] = data.projects.map((project) => ({
    ...project,
    payments: [],
    paymentProofs: undefined,
    paymentStatus: "",
    historicalReceived: undefined,
    historicalOutstanding: undefined,
  }));

  const claimed = new Set<string>();
  const created: Project[] = [];
  const projects = [...wiped];

  for (const contract of GROUND_ZERO_CONTRACTS) {
    const index = projects.findIndex(
      (project) =>
        !claimed.has(project.id) &&
        contract.match.some((needle) => normalizeLabel(project).includes(needle)),
    );
    if (index >= 0) {
      claimed.add(projects[index].id);
      projects[index] = applyContract(projects[index], contract);
    } else {
      created.push(projectFromContract(contract));
    }
  }

  return {
    ...data,
    projects: [...projects, ...created],
    transactions: GROUND_ZERO_TRANSACTIONS.map((transaction) => ({ ...transaction })),
    expenses: [],
    payments: [],
    fixedMonthlyExpenses: [],
    financialBaseline: { ...GROUND_ZERO_BASELINE },
    founders: GROUND_ZERO_FOUNDERS.map((founder) => ({ ...founder })),
    migrationApplied: true,
    migrationDate: GROUND_ZERO_DATE,
    groundZeroApplied: true,
    historicalExpenseReconciliationApplied: true,
  };
}

function isSeoLabel(project: Project): boolean {
  return normalizeLabel(project).includes("seo");
}

function isBlxOrDevProject(project: Project): boolean {
  if (normalizeLabel(project).includes("blx")) return true;
  return project.id === "proj-dev" || (project.client ?? "").trim().toLowerCase() === "dev";
}

function contractFields(contract: GroundZeroContract) {
  const billing = { ...contract.billing };
  return {
    status: contract.status,
    billing,
    revenueValue: buildRevenueValueFromBilling(billing),
    historicalReceived: contract.historicalReceived,
    historicalOutstanding: contract.historicalOutstanding,
    paymentStatus: contractPaymentStatus(contract),
  };
}

/**
 * One-time repair — the legacy "Dev" project and BLX Realty are the same client.
 * Ground Zero couldn't match them by name, so BLX contract data landed on the
 * wrong records and produced duplicate historical ledger rows. This pass:
 * 1. Renames the legacy "Dev" project to BLX Realty and applies the authoritative
 *    contract (₹77,000 total incl. 2 months maintenance, ₹25,000 received, ₹52,000 balance).
 * 2. Restores the small BLX Realty — SEO project to its own contract (₹2,000 / ₹1,000 received).
 * 3. Deletes ghost BLX duplicates created during migration, repointing their
 *    payments/transactions to the merged project.
 * 4. Drops every BLX historical ledger row so ensureHistoricalProjectPaymentLogs
 *    regenerates them once, correctly.
 */
export function repairBlxRealtyData(data: OperationsData): OperationsData {
  if (data.blxRepairApplied) return data;

  const candidates = data.projects.filter(isBlxOrDevProject);
  if (candidates.length === 0) return { ...data, blxRepairApplied: true };

  const blxContract = GROUND_ZERO_CONTRACTS.find((c) => c.code === "BLXR");
  const seoContract = GROUND_ZERO_CONTRACTS.find((c) => c.code === "BLXR SEO");
  if (!blxContract || !seoContract) return { ...data, blxRepairApplied: true };

  const seoProject = candidates.find(isSeoLabel);
  const mainCandidates = candidates.filter((p) => !isSeoLabel(p));
  // The legacy "Dev" record is the real project — keep its id so default-project
  // merging and existing references stay stable.
  const mainProject =
    mainCandidates.find(
      (p) => p.id === "proj-dev" || (p.client ?? "").trim().toLowerCase() === "dev",
    ) ?? mainCandidates[0];

  const candidateIds = new Set(candidates.map((p) => p.id));
  const removedIds = new Set(
    candidates.filter((p) => p !== mainProject && p !== seoProject).map((p) => p.id),
  );

  // Payments recorded after migration are real money movements — never drop them.
  const keptPayments = (project: Project | undefined): Project["payments"] => {
    if (!project) return [];
    const own = (project.payments ?? []).filter((pay) => pay.recordedAfterMigration === true);
    if (project !== mainProject) return own;
    const fromGhosts = candidates
      .filter((p) => removedIds.has(p.id))
      .flatMap((p) => (p.payments ?? []).filter((pay) => pay.recordedAfterMigration === true));
    return [...own, ...fromGhosts];
  };

  // A dedicated BLX Realty client record if one exists; otherwise rename "Dev".
  let clients = data.clients ?? [];
  const blxClient = clients.find((c) => c.companyName.trim().toLowerCase().includes("blx"));
  const devClient = clients.find((c) => c.companyName.trim().toLowerCase() === "dev");
  const mainClientId = blxClient?.id ?? devClient?.id ?? mainProject?.clientId;
  if (!blxClient && devClient) {
    clients = clients.map((c) =>
      c.id === devClient.id ? { ...c, companyName: blxContract.clientName } : c,
    );
  } else if (blxClient && devClient && blxClient.id !== devClient.id) {
    clients = clients.filter((c) => c.id !== devClient.id);
  }

  const projects = data.projects
    .filter((p) => !removedIds.has(p.id))
    .map((p) => {
      if (mainProject && p.id === mainProject.id) {
        return {
          ...p,
          client: blxContract.clientName,
          name: blxContract.clientName,
          clientId: mainClientId,
          ...contractFields(blxContract),
          payments: keptPayments(mainProject),
          paymentProofs: undefined,
          notes: blxContract.note,
        };
      }
      if (seoProject && p.id === seoProject.id) {
        return {
          ...p,
          client: seoContract.clientName,
          name: seoContract.clientName,
          clientId: mainClientId,
          ...contractFields(seoContract),
          payments: keptPayments(seoProject),
          paymentProofs: undefined,
          notes: seoContract.note,
        };
      }
      return p;
    });

  const mainId = mainProject?.id;
  const payments = (data.payments ?? []).map((payment) =>
    payment.projectId && removedIds.has(payment.projectId) && mainId
      ? { ...payment, projectId: mainId }
      : payment,
  );

  // Drop every BLX historical ledger row (they get regenerated correctly);
  // repoint any real transaction that referenced a removed ghost project.
  const isBlxHistoricalRow = (transaction: Transaction): boolean => {
    if (
      !transaction.id.startsWith("tx-gz-project-payment-") &&
      !transaction.id.startsWith("tx-gz-blx-attributed-")
    ) {
      return false;
    }
    if (transaction.relatedProjectId && candidateIds.has(transaction.relatedProjectId)) return true;
    return transaction.description.toLowerCase().includes("blx");
  };
  const transactions = (data.transactions ?? [])
    .filter((transaction) => !isBlxHistoricalRow(transaction))
    .map((transaction) =>
      transaction.relatedProjectId && removedIds.has(transaction.relatedProjectId) && mainId
        ? { ...transaction, relatedProjectId: mainId }
        : transaction,
    );

  return {
    ...data,
    projects,
    clients,
    payments,
    transactions,
    blxRepairApplied: true,
  };
}

/**
 * One-time repair — the legacy "k h kiran" project and Nidhi Estates are the
 * same engagement (Nidhi Estates is the company, k h kiran is the contact).
 * Ground Zero couldn't match them by name and created a ghost "Nidhi Estates"
 * project next to the legacy one. Merge them: keep the legacy record, rename it
 * to Nidhi Estates, apply the authoritative contract, delete the ghost, and
 * drop the historical ledger rows so they regenerate once, correctly.
 */
export function repairNidhiEstatesData(data: OperationsData): OperationsData {
  if (data.neRepairApplied) return data;

  const contract = GROUND_ZERO_CONTRACTS.find((c) => c.code === "NE");
  if (!contract) return { ...data, neRepairApplied: true };

  const isKiran = (p: Project) =>
    p.id === "proj-kh-kiran" || (p.client ?? "").trim().toLowerCase() === "k h kiran";
  const candidates = data.projects.filter((p) => isKiran(p) || normalizeLabel(p).includes("nidhi"));
  if (candidates.length === 0) return { ...data, neRepairApplied: true };

  // The legacy "k h kiran" record is the real project — keep its id.
  const mainProject = candidates.find(isKiran) ?? candidates[0];
  const candidateIds = new Set(candidates.map((p) => p.id));
  const removedIds = new Set(candidates.filter((p) => p !== mainProject).map((p) => p.id));

  // Payments recorded after migration are real money movements — never drop them.
  const keptPayments = candidates.flatMap((p) =>
    (p.payments ?? []).filter((pay) => pay.recordedAfterMigration === true),
  );

  // Prefer an existing Nidhi Estates client record; otherwise rename "k h kiran".
  let clients = data.clients ?? [];
  const nidhiClient = clients.find((c) => c.companyName.trim().toLowerCase().includes("nidhi"));
  const kiranClient = clients.find((c) => c.companyName.trim().toLowerCase() === "k h kiran");
  const mainClientId = nidhiClient?.id ?? kiranClient?.id ?? mainProject.clientId;
  if (!nidhiClient && kiranClient) {
    clients = clients.map((c) =>
      c.id === kiranClient.id
        ? { ...c, companyName: contract.clientName, contactPerson: c.contactPerson || "k h kiran" }
        : c,
    );
  } else if (nidhiClient) {
    clients = clients
      .filter((c) => !(kiranClient && c.id === kiranClient.id && c.id !== nidhiClient.id))
      .map((c) =>
        c.id === nidhiClient.id && !c.contactPerson ? { ...c, contactPerson: "k h kiran" } : c,
      );
  }

  const projects = data.projects
    .filter((p) => !removedIds.has(p.id))
    .map((p) =>
      p.id === mainProject.id
        ? {
            ...p,
            client: contract.clientName,
            name: contract.clientName,
            clientId: mainClientId,
            ...contractFields(contract),
            payments: keptPayments,
            paymentProofs: undefined,
            notes: contract.note,
          }
        : p,
    );

  const mainId = mainProject.id;
  const payments = (data.payments ?? []).map((payment) =>
    payment.projectId && removedIds.has(payment.projectId)
      ? { ...payment, projectId: mainId }
      : payment,
  );

  // Drop the Nidhi historical ledger rows (regenerated correctly afterwards);
  // repoint any real transaction that referenced the removed ghost project.
  const isNidhiHistoricalRow = (transaction: Transaction): boolean => {
    if (!transaction.id.startsWith("tx-gz-project-payment-")) return false;
    if (transaction.relatedProjectId && candidateIds.has(transaction.relatedProjectId)) return true;
    const description = transaction.description.toLowerCase();
    return description.includes("nidhi") || description.includes("k h kiran");
  };
  const transactions = (data.transactions ?? [])
    .filter((transaction) => !isNidhiHistoricalRow(transaction))
    .map((transaction) =>
      transaction.relatedProjectId && removedIds.has(transaction.relatedProjectId)
        ? { ...transaction, relatedProjectId: mainId }
        : transaction,
    );

  return {
    ...data,
    projects,
    clients,
    payments,
    transactions,
    neRepairApplied: true,
  };
}

/**
 * One-time: restore Kapila's ongoing ₹10k/month retainer after lead conversion
 * replaced `proj-kapila-mgmt` without carrying historicalReceived / identity.
 * Does not re-run once `kapilaRetainerRepairApplied` is set — later edits stick.
 */
export function ensureKapilaRetainerBilling(data: OperationsData): OperationsData {
  if (data.kapilaRetainerRepairApplied) return data;
  return {
    ...repairKapilaRetainerBilling(data),
    kapilaRetainerRepairApplied: true,
  };
}

function isKapilaRetainerProject(project: Project, kms: GroundZeroContract): boolean {
  if (project.id === "proj-kapila-faq") return false;
  const label = normalizeLabel(project);
  if (label.includes("kapila faq")) return false;

  const billing = project.billing ?? {};
  if (project.id === "proj-kapila-mgmt" || project.id === "proj-lead-lead-be258f6a") return true;
  if (kms.match.some((needle) => label.includes(needle))) return true;
  if (!label.includes("kapila")) return false;
  return (
    billing.monthlyAmount === 10_000 ||
    /10,?000\s*\/?\s*month/i.test(project.revenueValue ?? "") ||
    /kapila\s+erp/i.test(label)
  );
}

function repairKapilaRetainerBilling(data: OperationsData): OperationsData {
  const kms = GROUND_ZERO_CONTRACTS.find((contract) => contract.code === "KMS");
  if (!kms) return data;

  let changed = false;
  const projects = data.projects.map((project) => {
    if (!isKapilaRetainerProject(project, kms)) return project;

    const billing = project.billing ?? {};
    const nextBilling: ProjectBilling = {
      monthlyAmount: billing.monthlyAmount ?? 10_000,
      monthlyStartDate: billing.monthlyStartDate ?? kms.billing.monthlyStartDate ?? "2026-07-08",
    };
    // Drop fixed-term / zero-contract leftovers from the original Ground Zero row.
    const historicalReceived = Math.max(project.historicalReceived ?? 0, kms.historicalReceived);
    const nextName =
      project.name && /kapila/i.test(project.name) ? project.name : kms.clientName;
    const next: Project = {
      ...project,
      client: kms.clientName,
      name: nextName,
      status: project.status === "planning" ? "active" : project.status,
      billing: nextBilling,
      revenueValue: buildRevenueValueFromBilling(nextBilling),
      historicalReceived,
      historicalOutstanding: null,
    };

    if (
      project.client === next.client &&
      project.name === next.name &&
      project.status === next.status &&
      project.historicalReceived === next.historicalReceived &&
      project.historicalOutstanding === next.historicalOutstanding &&
      project.billing?.monthlyAmount === nextBilling.monthlyAmount &&
      project.billing?.monthlyStartDate === nextBilling.monthlyStartDate &&
      project.billing?.monthlyMonths == null &&
      project.billing?.contractValue == null &&
      project.revenueValue === next.revenueValue
    ) {
      return project;
    }

    changed = true;
    return next;
  });

  return changed ? { ...data, projects } : data;
}

/**
 * One-time: drop a stale understated contractValue on Rent Management so labels
 * match the locked ₹80,000 Ground Zero total.
 */
export function ensureRentManagementContract(data: OperationsData): OperationsData {
  if (data.rentManagementContractRepairApplied) return data;
  return {
    ...repairRentManagementContract(data),
    rentManagementContractRepairApplied: true,
  };
}

function repairRentManagementContract(data: OperationsData): OperationsData {
  let changed = false;
  const projects = data.projects.map((project) => {
    const label = normalizeLabel(project);
    const isRent =
      project.id === "proj-safe-wheels" ||
      label.includes("rent management") ||
      (label.includes("safe wheels") &&
        ((project.billing?.upfrontAmount ?? 0) >= 80_000 ||
          project.historicalOutstanding === 80_000));
    if (!isRent) return project;

    const upfront = Math.max(project.billing?.upfrontAmount ?? 0, 80_000);
    if (
      project.billing?.contractValue == null &&
      project.billing?.upfrontAmount === upfront &&
      (project.historicalOutstanding ?? 80_000) === 80_000
    ) {
      return project;
    }

    const nextBilling: ProjectBilling = { upfrontAmount: upfront };
    changed = true;
    return {
      ...project,
      billing: nextBilling,
      revenueValue: buildRevenueValueFromBilling(nextBilling),
      historicalReceived: project.historicalReceived ?? 0,
      historicalOutstanding: project.historicalOutstanding ?? 80_000,
    };
  });

  return changed ? { ...data, projects } : data;
}

/** Apply all production billing backfills (one-shot each). */
export function applyProductionBillingRepairs(data: OperationsData): OperationsData {
  return ensureHistoricalExpenseReconciliation(
    ensureRentManagementContract(ensureKapilaRetainerBilling(data)),
  );
}

const HISTORICAL_EXPENSE_RECONCILIATION = 2_000;
const HISTORICAL_EXPENSE_TX_ID = "tx-gz-historical-expense";

/**
 * One-time: add ₹2,000 to historical company expenses so dashboard
 * Revenue − Expenses equals cash. Does not change cash (historical only).
 */
export function ensureHistoricalExpenseReconciliation(data: OperationsData): OperationsData {
  if (data.historicalExpenseReconciliationApplied) return data;

  const baseline = data.financialBaseline
    ? {
        ...data.financialBaseline,
        totalCompanyExpenses:
          (data.financialBaseline.totalCompanyExpenses ?? 0) + HISTORICAL_EXPENSE_RECONCILIATION,
      }
    : data.financialBaseline;

  const transactions = (data.transactions ?? []).map((transaction) =>
    transaction.id === HISTORICAL_EXPENSE_TX_ID && transaction.historical
      ? { ...transaction, amount: transaction.amount + HISTORICAL_EXPENSE_RECONCILIATION }
      : transaction,
  );

  return {
    ...data,
    financialBaseline: baseline,
    transactions,
    historicalExpenseReconciliationApplied: true,
  };
}

/**
 * Add one display-only Accounts ledger row for each imported client collection.
 * Idempotent: stable ids ensure loading the app never creates duplicates.
 */
export function ensureHistoricalProjectPaymentLogs(data: OperationsData): OperationsData {
  // Backfill the authoritative spreadsheet balances for installations where
  // Ground Zero had already run before this field was introduced.
  let balancesChanged = false;
  const projects = data.projects.map((project) => {
    if (project.historicalReceived == null || project.historicalOutstanding !== undefined) {
      return project;
    }
    const label = normalizeLabel(project);
    const contract = GROUND_ZERO_CONTRACTS.find((item) =>
      item.match.some((needle) => label.includes(needle)),
    );
    if (!contract) return project;
    balancesChanged = true;
    return {
      ...project,
      historicalOutstanding: contract.historicalOutstanding,
      billing:
        contract.code === "KMS"
          ? {
              monthlyAmount: contract.billing.monthlyAmount,
              monthlyStartDate: contract.billing.monthlyStartDate,
            }
          : project.billing,
    };
  });

  const existing = new Set((data.transactions ?? []).map((transaction) => transaction.id));
  const logs: Transaction[] = [];

  for (const project of projects) {
    const received = project.historicalReceived ?? 0;
    if (received <= 0) continue;

    const id = `tx-gz-project-payment-${project.id}`;
    if (existing.has(id)) continue;

    const { pending } = paymentSummary(project);
    logs.push({
      id,
      type: "client_payment",
      date: GROUND_ZERO_DATE,
      amount: received,
      description: `${project.client}: historical payment received`,
      category:
        pending != null
          ? `Imported balance · Outstanding ${formatINRWhole(pending)}`
          : "Imported balance · Outstanding not defined",
      paymentMethod: "upi",
      relatedClientId: project.clientId,
      relatedProjectId: project.id,
      notes:
        "Imported payment total as of Ground Zero. Display-only ledger context; already included in the opening financial baseline.",
      createdAt: GZ_TIMESTAMP,
      updatedAt: GZ_TIMESTAMP,
      historical: true,
    });
  }

  let payments = data.payments ?? [];
  let transactions = [...(data.transactions ?? []), ...logs];

  // The existing ₹5,000 proof/payment was previously unlinked and therefore
  // displayed as "Unknown Client". It is part of BLX Realty's imported ₹25,000,
  // so attribute it without increasing any financial or project totals.
  const blxProject = projects.find((project) => {
    const label = normalizeLabel(project);
    return label.includes("blx realty") && !label.includes("seo");
  });
  const blxPayment = blxProject
    ? payments.find(
        (payment) =>
          payment.amount === 5_000 && (!payment.projectId || payment.projectId === blxProject.id),
      )
    : undefined;
  let attributionChanged = false;

  if (blxProject && blxPayment) {
    payments = payments.map((payment) =>
      payment.id === blxPayment.id ? { ...payment, projectId: blxProject.id } : payment,
    );

    const summaryId = `tx-gz-project-payment-${blxProject.id}`;
    transactions = transactions.map((transaction) =>
      transaction.id === summaryId
        ? {
            ...transaction,
            amount: Math.max(0, (blxProject.historicalReceived ?? 0) - blxPayment.amount),
            description: `${blxProject.client}: remaining historical payments`,
          }
        : transaction,
    );

    const detailId = `tx-gz-blx-attributed-${blxPayment.id}`;
    if (!transactions.some((transaction) => transaction.id === detailId)) {
      const { pending } = paymentSummary(blxProject);
      transactions.push({
        id: detailId,
        type: "client_payment",
        date: blxPayment.date || GROUND_ZERO_DATE,
        amount: blxPayment.amount,
        description: `${blxProject.client}: client payment received`,
        category:
          pending != null
            ? `Included in imported ₹25,000 · Outstanding ${formatINRWhole(pending)}`
            : "Included in imported ₹25,000",
        paymentMethod: blxPayment.method || "upi",
        relatedClientId: blxProject.clientId,
        relatedProjectId: blxProject.id,
        notes:
          "Reattributed from Unknown Client to BLX Realty. Already included in historical received and the Ground Zero baseline.",
        createdAt: GZ_TIMESTAMP,
        updatedAt: GZ_TIMESTAMP,
        historical: true,
      });
    }
    attributionChanged = true;
  }

  if (logs.length === 0 && !balancesChanged && !attributionChanged) return data;
  return {
    ...data,
    projects,
    payments,
    transactions,
  };
}
