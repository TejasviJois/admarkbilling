import type {
  Client,
  OperationsData,
  Payment,
  Project,
  Transaction,
  TransactionType,
} from "@/lib/types";
import { DEFAULT_PROJECTS, withDefaultProjects } from "@/lib/default-projects";
import { DEFAULT_PARTNERSHIPS, withDefaultPartnerships } from "@/lib/default-partnerships";
import { withDefaultFinancialBaseline } from "@/lib/default-financial-baseline";
import { withDefaultLeads } from "@/lib/default-leads";
import { isRevenueProject } from "./project-status";
import { normalizeAllProjectPayments } from "./project-payments";
import { mergeAllProjectBilling } from "./project-billing";
import { logClientError } from "./client-logger";
import { getOperationsFn, saveOperationsFn, EMPTY_OPERATIONS } from "@/server/operations-fns";
import { isServerApiConfigured } from "@/lib/backend-status-cache";
import { safeLocalStorageSet } from "./browser-storage";
import type { OperationsMutation, OperationsPersistOptions } from "./operations-mutations";
import {
  countOperationsRecords,
  stabilizeOperationsFileRefs,
} from "./stabilize-file-refs";

const OPERATIONS_KEY = "admark.operations.v2";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Seed defaults only on a brand-new empty install. Never replace live data. */
function needsProjectSeed(
  projects: OperationsData["projects"] | undefined,
  allowFirstInstallSeed: boolean,
): boolean {
  // Empty array after deletes must stay empty — only seed a first local install.
  return allowFirstInstallSeed && (projects === undefined || projects.length === 0);
}

function needsPartnershipSeed(
  partnerships: OperationsData["partnerships"] | undefined,
  allowFirstInstallSeed: boolean,
): boolean {
  return allowFirstInstallSeed && (partnerships === undefined || partnerships.length === 0);
}

/** Seed clients only from won/revenue work — never from pipeline discussion projects. */
function seedClientsFromProjects(projects: Project[]): Client[] {
  const seen = new Set<string>();
  const list: Client[] = [];
  for (const p of projects) {
    if (!isRevenueProject(p.status)) continue;
    const name = (p.client ?? "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const id =
      "cli-" +
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
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

function mergeWithDefaults(
  data: OperationsData,
  options: { allowFirstInstallSeed?: boolean } = {},
): OperationsData {
  const allowFirstInstallSeed = options.allowFirstInstallSeed === true;
  const migrated = runHistoricalMigration(data);
  let base = needsProjectSeed(migrated.projects, allowFirstInstallSeed)
    ? { ...migrated, projects: DEFAULT_PROJECTS }
    : withDefaultProjects(migrated);

  base = needsPartnershipSeed(base.partnerships, allowFirstInstallSeed)
    ? { ...base, partnerships: DEFAULT_PARTNERSHIPS }
    : withDefaultPartnerships(base);

  // Never invent clients/payments from projects after an intentional empty CRM —
  // that resurrected soft-deleted rows on every refresh/save.
  const seededClients =
    allowFirstInstallSeed && !(data.clients && data.clients.length > 0)
      ? seedClientsFromProjects(base.projects)
      : (data.clients ?? []);
  const seededPayments =
    allowFirstInstallSeed && !(data.payments && data.payments.length > 0)
      ? seedPaymentsFromProjects(base.projects)
      : (data.payments ?? []);

  const projectsWithClientIds = base.projects.map((p) => {
    if (p.clientId) return p;
    const name = (p.client ?? "").trim();
    if (!name) return p;
    const found = seededClients.find(
      (c) => (c.companyName ?? "").toLowerCase() === name.toLowerCase(),
    );
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
    withDefaultFinancialBaseline({
      ...merged,
      projects: mergeAllProjectBilling(normalizeAllProjectPayments(merged.projects)),
    }),
  );
}

function loadOperationsLocal(): OperationsData {
  if (!isBrowser()) return mergeWithDefaults(EMPTY_OPERATIONS, { allowFirstInstallSeed: true });
  try {
    const raw = localStorage.getItem(OPERATIONS_KEY);
    if (!raw) {
      // First visit on this device with no cache — allow one-time default seed.
      return mergeWithDefaults(EMPTY_OPERATIONS, { allowFirstInstallSeed: true });
    }
    const data = JSON.parse(raw) as OperationsData;
    return mergeWithDefaults(data, { allowFirstInstallSeed: false });
  } catch {
    return mergeWithDefaults(EMPTY_OPERATIONS, { allowFirstInstallSeed: false });
  }
}

function saveOperationsLocal(data: OperationsData) {
  if (!isBrowser()) return;
  // Never persist expiring signed tokens — re-sign on display / after remote load.
  safeLocalStorageSet(OPERATIONS_KEY, JSON.stringify(stabilizeOperationsFileRefs(data)));
}

function readOperationsLocalRaw(): OperationsData | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(OPERATIONS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OperationsData;
  } catch {
    return null;
  }
}

let operationsVersion: string | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
let blockedConflict: OperationsConflictError | null = null;

export class OperationsConflictError extends Error {
  constructor(
    public readonly latest: OperationsData,
    public readonly version: string,
    public readonly mutation: OperationsMutation,
  ) {
    super("This data changed in another browser. Reload or merge before saving.");
    this.name = "OperationsConflictError";
  }
}

async function serverApiEnabled(): Promise<boolean> {
  return isServerApiConfigured();
}

let pendingWrites = 0;

export function operationsWritesInFlight(): boolean {
  return pendingWrites > 0;
}

export async function loadOperations(): Promise<OperationsData> {
  if (!(await serverApiEnabled())) {
    const local = loadOperationsLocal();
    return local;
  }

  try {
    const remote = await getOperationsFn();
    // Never clear a conflict lock or advance the CAS token while saves are
    // still draining — that would let a stale queued write ride a newer version.
    if (pendingWrites === 0) {
      operationsVersion = remote.version;
      blockedConflict = null;
      const merged = mergeWithDefaults(
        stabilizeOperationsFileRefs(remote.data),
        { allowFirstInstallSeed: false },
      );
      const localRaw = readOperationsLocalRaw();
      // Guard against an empty/sparse remote clobbering a richer local mirror
      // (e.g. after a bad sync or transient read failure upstream).
      if (
        localRaw &&
        countOperationsRecords(merged) === 0 &&
        countOperationsRecords(localRaw) > 0
      ) {
        logClientError(
          "operations-storage.loadRemote.emptyGuard",
          new Error(
            `Refusing empty remote overwrite of local ops (${countOperationsRecords(localRaw)} records).`,
          ),
        );
        return mergeWithDefaults(localRaw, { allowFirstInstallSeed: false });
      }
      saveOperationsLocal(merged);
      return merged;
    }
    if (!operationsVersion) operationsVersion = remote.version;
    return mergeWithDefaults(
      stabilizeOperationsFileRefs(remote.data),
      { allowFirstInstallSeed: false },
    );
  } catch (e) {
    logClientError("operations-storage.loadRemote", e);
    return loadOperationsLocal();
  }
}

export async function saveOperations(
  data: OperationsData,
  mutation: OperationsMutation,
  conflictVersion?: string,
  persistOptions: OperationsPersistOptions = {},
): Promise<OperationsData> {
  // Local cache is best-effort. Phone Safari quota must not block the cloud write.
  saveOperationsLocal(data);
  if (!(await serverApiEnabled())) return data;

  pendingWrites += 1;
  const task = async (): Promise<OperationsData> => {
    // Pin the version for this task so a concurrent load cannot advance the
    // token underneath an already-queued mutation.
    let expectedVersion = conflictVersion ?? operationsVersion;
    if (conflictVersion) {
      operationsVersion = conflictVersion;
      blockedConflict = null;
    } else if (blockedConflict) {
      // Drop the sticky lock: the CAS token was already advanced to the server
      // version. Re-throwing forever made every later CRM click show the same toast.
      blockedConflict = null;
      expectedVersion = operationsVersion ?? expectedVersion;
    }
    if (!expectedVersion) {
      // First save raced ahead of the initial load — fetch the current server
      // version now. The CAS check below still rejects genuinely stale writes.
      const remote = await getOperationsFn();
      operationsVersion = remote.version;
      expectedVersion = remote.version;
    }

    try {
      const result = await saveOperationsFn({
        data: {
          mutation,
          expectedVersion,
          allowedDeleteIds: persistOptions.allowAllDeletes
            ? undefined
            : (persistOptions.deleteIds ?? mutation.deletes),
          allowAllDeletes: persistOptions.allowAllDeletes === true,
        },
      });
      operationsVersion = result.version;
      // Always mirror the authoritative server payload locally — including on
      // conflict — so a rejected write can never linger in localStorage and be
      // revived if a later remote load fails.
      const authoritative = mergeWithDefaults(
        stabilizeOperationsFileRefs(result.data),
        { allowFirstInstallSeed: false },
      );
      saveOperationsLocal(authoritative);
      if (!result.ok) {
        const conflict = new OperationsConflictError(authoritative, result.version, mutation);
        blockedConflict = conflict;
        throw conflict;
      }

      blockedConflict = null;
      return authoritative;
    } finally {
      pendingWrites = Math.max(0, pendingWrites - 1);
    }
  };

  const queued = writeQueue.then(task, task);
  writeQueue = queued.catch((error) => {
    if (!(error instanceof OperationsConflictError)) {
      logClientError("operations-storage.saveRemote", error);
    }
  });
  return queued;
}
