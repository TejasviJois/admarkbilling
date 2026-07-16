import type { Client, OperationsData, Payment, Project, Transaction, TransactionType } from "@/lib/types";
import { DEFAULT_PROJECTS, withDefaultProjects } from "@/lib/default-projects";
import { DEFAULT_PARTNERSHIPS, withDefaultPartnerships } from "@/lib/default-partnerships";
import { withDefaultFinancialBaseline } from "@/lib/default-financial-baseline";
import { withDefaultFixedMonthlyExpenses } from "@/lib/default-fixed-monthly-expenses";
import { withDefaultLeads } from "@/lib/default-leads";
import { normalizeAllProjectPayments } from "./project-payments";
import { mergeAllProjectBilling } from "./project-billing";
import { logClientError } from "./client-logger";
import { getOperationsFn, saveOperationsFn, EMPTY_OPERATIONS } from "@/server/operations-fns";
import { getDataBackendStatus } from "@/server/invoice-fns";

const OPERATIONS_KEY = "admark.operations";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function needsProjectSeed(projects: OperationsData["projects"]): boolean {
  if (projects.length === 0) return true;
  // Re-seed if saved data predates the Admark pipeline import.
  return !projects.some((p) => p.id === "proj-kapila-faq");
}

function needsPartnershipSeed(partnerships: OperationsData["partnerships"]): boolean {
  if (partnerships.length === 0) return true;
  return !partnerships.some((p) => p.id === "part-epixable");
}

function seedClientsFromProjects(projects: Project[]): Client[] {
  const seen = new Set<string>();
  const list: Client[] = [];
  for (const p of projects) {
    const name = p.client.trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const id = "cli-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    list.push({
      id,
      companyName: name,
      contactPerson: name + " Contact",
      phone: p.phone || "",
      email: p.email || "",
      billingAddress: "Billing Address of " + name,
      clientSince: p.startDate || "2026-01-01",
      status: "active",
    });
  }
  return list;
}

function seedPaymentsFromProjects(projects: Project[]): Payment[] {
  const list: Payment[] = [];
  for (const proj of projects) {
    for (const pay of proj.payments ?? []) {
      list.push({
        id: pay.id || crypto.randomUUID(),
        projectId: proj.id,
        amount: pay.amount,
        date: pay.date,
        method: "upi",
        screenshotDataUrl: pay.proof?.imageDataUrl,
        notes: pay.note,
      });
    }
  }
  return list;
}

function runHistoricalMigration(data: OperationsData): OperationsData {
  if (data.migrationApplied) return data;

  // 1. Safety Backup
  if (isBrowser()) {
    const rawPrev = localStorage.getItem(OPERATIONS_KEY);
    if (rawPrev) {
      localStorage.setItem(`${OPERATIONS_KEY}.backup.${Date.now()}`, rawPrev);
    }
  }

  const transactions: Transaction[] = [];

  // A. Migrate project payments
  for (const proj of data.projects ?? []) {
    for (const pay of proj.payments ?? []) {
      transactions.push({
        id: pay.id || "tx-" + crypto.randomUUID().slice(0, 8),
        type: "client_payment",
        date: pay.date,
        amount: pay.amount,
        description: `Project Payment: ${proj.name || proj.client}`,
        category: "Project Income",
        paymentMethod: "upi",
        relatedProjectId: proj.id,
        relatedClientId: proj.clientId,
        notes: pay.note,
        createdAt: new Date(pay.date).getTime() || Date.now(),
        updatedAt: new Date(pay.date).getTime() || Date.now(),
        historical: true,
      });
    }
  }

  // B. Migrate operations payments
  for (const pay of data.payments ?? []) {
    if (transactions.some((tx) => tx.id === pay.id)) continue;
    transactions.push({
      id: pay.id || "tx-" + crypto.randomUUID().slice(0, 8),
      type: "client_payment",
      date: pay.date,
      amount: pay.amount,
      description: pay.notes || `Invoice Payment`,
      category: "Invoice Income",
      paymentMethod: pay.method || "upi",
      relatedInvoiceId: pay.invoiceId,
      relatedProjectId: pay.projectId,
      notes: pay.notes,
      attachmentDataUrl: pay.screenshotDataUrl,
      createdAt: new Date(pay.date).getTime() || Date.now(),
      updatedAt: new Date(pay.date).getTime() || Date.now(),
      historical: true,
    });
  }

  // C. Migrate legacy expenses
  for (const exp of data.expenses ?? []) {
    if (exp.isBaseline) continue;

    let type: TransactionType = "expense";
    let relatedFounderId: string | undefined = undefined;

    if (exp.category === "founder_payout") {
      type = "founder_withdrawal";
      const lbl = exp.label.toLowerCase();
      if (lbl.includes("prajwal")) relatedFounderId = "member-prajwal";
      else if (lbl.includes("tejasvi")) relatedFounderId = "member-tejasvi";
      else if (lbl.includes("harshith")) relatedFounderId = "member-harshith";
      else if (lbl.includes("revanth")) relatedFounderId = "member-revanth";
    } else if (exp.category === "handout") {
      type = "internal_transfer";
    }

    transactions.push({
      id: exp.id || "tx-" + crypto.randomUUID().slice(0, 8),
      type,
      date: exp.date,
      amount: exp.amount,
      description: exp.label,
      category: typeof exp.category === "string" ? exp.category : "company",
      paymentMethod: "bank_transfer",
      relatedProjectId: exp.projectId,
      relatedFounderId,
      notes: exp.notes,
      attachmentDataUrl: exp.proof?.imageDataUrl,
      createdAt: new Date(exp.date).getTime() || Date.now(),
      updatedAt: new Date(exp.date).getTime() || Date.now(),
      historical: true,
    });
  }

  transactions.sort((a, b) => b.date.localeCompare(a.date));

  return {
    ...data,
    transactions,
    migrationApplied: true,
    migrationDate: new Date().toISOString().slice(0, 10),
  };
}

function mergeWithDefaults(data: OperationsData): OperationsData {
  const migrated = runHistoricalMigration(data);
  let base = !needsProjectSeed(migrated.projects)
    ? withDefaultProjects(migrated)
    : { ...migrated, projects: DEFAULT_PROJECTS };

  if (needsPartnershipSeed(base.partnerships)) {
    base = { ...base, partnerships: DEFAULT_PARTNERSHIPS };
  } else {
    base = withDefaultPartnerships(base);
  }

  const seededClients = data.clients && data.clients.length > 0 ? data.clients : seedClientsFromProjects(base.projects);
  const seededPayments = data.payments && data.payments.length > 0 ? data.payments : seedPaymentsFromProjects(base.projects);

  const projectsWithClientIds = base.projects.map((p) => {
    if (p.clientId) return p;
    const name = p.client.trim();
    const found = seededClients.find((c) => c.companyName.toLowerCase() === name.toLowerCase());
    return {
      ...p,
      clientId: found?.id,
    };
  });

  const merged = {
    ...base,
    clients: seededClients,
    payments: seededPayments,
    projects: projectsWithClientIds,
    transactions: migrated.transactions ?? [],
    migrationApplied: migrated.migrationApplied,
    migrationDate: migrated.migrationDate,
  };

  return withDefaultLeads(
    withDefaultFixedMonthlyExpenses(
      withDefaultFinancialBaseline({
        ...merged,
        projects: mergeAllProjectBilling(normalizeAllProjectPayments(merged.projects)),
      }),
    ),
  );
}

function loadOperationsLocal(): OperationsData {
  if (!isBrowser()) return mergeWithDefaults(EMPTY_OPERATIONS);
  try {
    const raw = localStorage.getItem(OPERATIONS_KEY);
    const data = raw ? (JSON.parse(raw) as OperationsData) : EMPTY_OPERATIONS;
    return mergeWithDefaults(data);
  } catch {
    return mergeWithDefaults(EMPTY_OPERATIONS);
  }
}

function saveOperationsLocal(data: OperationsData) {
  if (!isBrowser()) return;
  localStorage.setItem(OPERATIONS_KEY, JSON.stringify(data));
}

let serverConfiguredCache: boolean | null = null;

async function serverApiEnabled(): Promise<boolean> {
  if (serverConfiguredCache !== null) return serverConfiguredCache;
  try {
    const s = await getDataBackendStatus();
    serverConfiguredCache = s.configured;
    return serverConfiguredCache;
  } catch {
    serverConfiguredCache = false;
    return false;
  }
}

export async function loadOperations(): Promise<OperationsData> {
  if (!(await serverApiEnabled())) {
    const local = loadOperationsLocal();
    return local;
  }

  try {
    const remote = await getOperationsFn();
    const merged = mergeWithDefaults(remote);
    saveOperationsLocal(merged);
    return merged;
  } catch (e) {
    logClientError("operations-storage.loadRemote", e);
    return loadOperationsLocal();
  }
}

export async function saveOperations(data: OperationsData) {
  saveOperationsLocal(data);
  if (!(await serverApiEnabled())) return;
  try {
    await saveOperationsFn({ data });
  } catch (e) {
    logClientError("operations-storage.saveRemote", e);
  }
}
