import { logClientError } from "./client-logger";
import { createActivityLogEntry, trimActivityLogs, type LogDraft } from "./activity-log";
import type { ActivityLogEntry } from "./types";
import { getActivityLogsFn, saveActivityLogsFn } from "@/server/activity-log-fns";
import { getDataBackendStatus } from "@/server/invoice-fns";

const ACTIVITY_LOGS_KEY = "admark.activity-logs";

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function loadActivityLogsLocal(): ActivityLogEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(ACTIVITY_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveActivityLogsLocal(entries: ActivityLogEntry[]) {
  if (!isBrowser()) return;
  localStorage.setItem(ACTIVITY_LOGS_KEY, JSON.stringify(entries));
}

let serverConfiguredCache: boolean | null = null;
let activityVersion: string | null = null;
let activitySnapshot: ActivityLogEntry[] = [];
let writeQueue: Promise<unknown> = Promise.resolve();

class ActivityLogsConflictError extends Error {
  constructor(
    public readonly latest: ActivityLogEntry[],
    public readonly version: string,
  ) {
    super("Activity logs changed in another browser.");
    this.name = "ActivityLogsConflictError";
  }
}

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

export async function loadActivityLogs(): Promise<ActivityLogEntry[]> {
  if (!(await serverApiEnabled())) {
    return trimActivityLogs(loadActivityLogsLocal());
  }

  try {
    const remote = await getActivityLogsFn();
    activityVersion = remote.version;
    activitySnapshot = remote.entries;
    const trimmed = trimActivityLogs(remote.entries);
    saveActivityLogsLocal(trimmed);
    return trimmed;
  } catch (e) {
    logClientError("activity-log-storage.loadRemote", e);
    return trimActivityLogs(loadActivityLogsLocal());
  }
}

async function persistActivityLogs(entries: ActivityLogEntry[], expectedVersion?: string) {
  const trimmed = trimActivityLogs(entries);
  if (!(await serverApiEnabled())) {
    saveActivityLogsLocal(trimmed);
    return;
  }

  const task = async () => {
    const previous = new Map(activitySnapshot.map((entry) => [entry.id, entry]));
    const next = new Map(trimmed.map((entry) => [entry.id, entry]));
    const upserts = [...next.values()].filter(
      (entry) => JSON.stringify(previous.get(entry.id)) !== JSON.stringify(entry),
    );
    const deletes = [...previous.keys()].filter((id) => !next.has(id));
    if (upserts.length === 0 && deletes.length === 0) {
      saveActivityLogsLocal(trimmed);
      return;
    }
    const version = expectedVersion ?? activityVersion;
    if (!version) throw new Error("Activity log version is not loaded.");
    const result = await saveActivityLogsFn({
      data: { upserts, deletes, expectedVersion: version },
    });
    activityVersion = result.version;
    activitySnapshot = result.entries;
    const saved = trimActivityLogs(result.entries);
    saveActivityLogsLocal(saved);
    if (!result.ok) throw new ActivityLogsConflictError(saved, result.version);
  };

  const queued = writeQueue.then(task, task);
  writeQueue = queued.catch((error) => {
    if (!(error instanceof ActivityLogsConflictError)) {
      logClientError("activity-log-storage.saveRemote", error);
    }
  });
  await queued;
}

/** Replace the complete activity-log history (used by full-system restore). */
export async function replaceActivityLogs(entries: ActivityLogEntry[]): Promise<void> {
  if (activityVersion == null) await loadActivityLogs();
  await persistActivityLogs(entries);
}

export async function appendActivityLogs(drafts: LogDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const additions = drafts.map((draft) => createActivityLogEntry(draft));
  let current = await loadActivityLogs();
  try {
    await persistActivityLogs(trimActivityLogs([...additions, ...current]));
  } catch (error) {
    if (!(error instanceof ActivityLogsConflictError)) throw error;
    activityVersion = error.version;
    activitySnapshot = error.latest;
    current = error.latest;
    await persistActivityLogs(trimActivityLogs([...additions, ...current]), error.version);
  }
}

export async function appendActivityLog(draft: LogDraft): Promise<void> {
  await appendActivityLogs([draft]);
}
