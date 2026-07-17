import { logClientError } from "./client-logger";
import {
  createActivityLogEntry,
  trimActivityLogs,
  type LogDraft,
} from "./activity-log";
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
    const trimmed = trimActivityLogs(remote);
    saveActivityLogsLocal(trimmed);
    return trimmed;
  } catch (e) {
    logClientError("activity-log-storage.loadRemote", e);
    return trimActivityLogs(loadActivityLogsLocal());
  }
}

async function persistActivityLogs(entries: ActivityLogEntry[]) {
  const trimmed = trimActivityLogs(entries);
  if (await serverApiEnabled()) {
    try {
      await saveActivityLogsFn({ data: trimmed });
      saveActivityLogsLocal(trimmed);
      return;
    } catch (e) {
      logClientError("activity-log-storage.saveRemote", e);
    }
  }
  saveActivityLogsLocal(trimmed);
}

/** Replace the complete activity-log history (used by full-system restore). */
export async function replaceActivityLogs(entries: ActivityLogEntry[]): Promise<void> {
  await persistActivityLogs(entries);
}

export async function appendActivityLogs(drafts: LogDraft[]): Promise<void> {
  if (drafts.length === 0) return;
  const current = await loadActivityLogs();
  const next = trimActivityLogs([
    ...drafts.map((draft) => createActivityLogEntry(draft)),
    ...current,
  ]);
  await persistActivityLogs(next);
}

export async function appendActivityLog(draft: LogDraft): Promise<void> {
  await appendActivityLogs([draft]);
}
