import type { OperationsData } from "@/lib/types";
import { DEFAULT_PROJECTS, withDefaultProjects } from "@/lib/default-projects";
import { DEFAULT_PARTNERSHIPS, withDefaultPartnerships } from "@/lib/default-partnerships";
import { withDefaultFinancialBaseline } from "@/lib/default-financial-baseline";
import { withDefaultFixedMonthlyExpenses } from "@/lib/default-fixed-monthly-expenses";
import { withDefaultLeads, needsLeadSeed } from "@/lib/default-leads";
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

function mergeWithDefaults(data: OperationsData): OperationsData {
  let base = !needsProjectSeed(data.projects)
    ? withDefaultProjects(data)
    : { ...data, projects: DEFAULT_PROJECTS };

  if (needsPartnershipSeed(base.partnerships)) {
    base = { ...base, partnerships: DEFAULT_PARTNERSHIPS };
  } else {
    base = withDefaultPartnerships(base);
  }

  return withDefaultLeads(
    withDefaultFixedMonthlyExpenses(
      withDefaultFinancialBaseline({
        ...base,
        projects: mergeAllProjectBilling(normalizeAllProjectPayments(base.projects)),
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

function paymentsFingerprint(projects: OperationsData["projects"]): string {
  return JSON.stringify(
    projects.map((p) => ({ id: p.id, payments: p.payments ?? [], paymentStatus: p.paymentStatus })),
  );
}

async function persistIfChanged(before: OperationsData, after: OperationsData) {
  const seededProjects =
    before.projects.length !== after.projects.length || needsProjectSeed(before.projects);
  const seededPartnerships =
    before.partnerships.length !== after.partnerships.length ||
    needsPartnershipSeed(before.partnerships);
  const seededLeads =
    (before.leads?.length ?? 0) !== (after.leads?.length ?? 0) || needsLeadSeed(before.leads);
  const migrated = paymentsFingerprint(before.projects) !== paymentsFingerprint(after.projects);
  if (!seededProjects && !seededPartnerships && !seededLeads && !migrated) return;
  try {
    if (await serverApiEnabled()) {
      await saveOperationsFn({ data: after });
    } else {
      saveOperationsLocal(after);
    }
  } catch (e) {
    logClientError("operations-storage.persistSeed", e);
    saveOperationsLocal(after);
  }
}

export async function loadOperations(): Promise<OperationsData> {
  if (!(await serverApiEnabled())) {
    const local = loadOperationsLocal();
    const raw = isBrowser() ? localStorage.getItem(OPERATIONS_KEY) : null;
    const before = raw ? (JSON.parse(raw) as OperationsData) : EMPTY_OPERATIONS;
    void persistIfChanged(before, local);
    return local;
  }

  try {
    const remote = await getOperationsFn();
    const before = withDefaultProjects(remote);
    const merged = mergeWithDefaults(before);
    void persistIfChanged(before, merged);
    return merged;
  } catch (e) {
    logClientError("operations-storage.loadRemote", e);
    return loadOperationsLocal();
  }
}

export async function saveOperations(data: OperationsData) {
  if (!(await serverApiEnabled())) {
    saveOperationsLocal(data);
    return;
  }
  try {
    await saveOperationsFn({ data });
  } catch (e) {
    logClientError("operations-storage.saveRemote", e);
    saveOperationsLocal(data);
  }
}
