/**
 * Server-only activity-log persistence. Kept out of activity-log-fns.ts so
 * client bundles (which import the server-fn stubs) never pull in the
 * Supabase/node:crypto dependency chain.
 */
import type { ActivityLogEntry } from "@/lib/types";
import { createActivityLogEntry, type LogDraft } from "@/lib/activity-log";
import { requireServerSupabase } from "./supabase-admin";
import { assertRelationalMode } from "./env";
import { loadRelationalActivityLogs } from "./relational-read-repository";
import { replaceRelationalActivityLogs } from "./relational-write-repository";
import { bumpLegacyVersionToken, readLegacyVersionToken } from "./legacy-version-token";

const ROW_ID = "activity_logs";
const DEFAULT_ORG_ID = "org-admark-digitals";

export type VersionedActivityLogs = {
  entries: ActivityLogEntry[];
  version: string;
};
export type SaveActivityLogsInput = {
  upserts: ActivityLogEntry[];
  deletes: string[];
  expectedVersion: string;
};
export type SaveActivityLogsResult =
  | { ok: true; entries: ActivityLogEntry[]; version: string }
  | { ok: false; conflict: true; entries: ActivityLogEntry[]; version: string };

function applyActivityLogMutation(
  entries: ActivityLogEntry[],
  input: SaveActivityLogsInput,
): ActivityLogEntry[] {
  const deletes = new Set(input.deletes);
  const upserts = input.upserts.map((entry) => ({ ...entry, organizationId: DEFAULT_ORG_ID }));
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  for (const id of deletes) byId.delete(id);
  for (const entry of upserts) byId.set(entry.id, entry);
  return [...byId.values()].sort((left, right) => right.timestamp - left.timestamp);
}

export async function readActivityLogsCore(): Promise<VersionedActivityLogs> {
  assertRelationalMode();
  const sb = requireServerSupabase();
  const [{ data: versionRow, error }, entries] = await Promise.all([
    sb.from("operations_data").select("updated_at").eq("id", ROW_ID).maybeSingle(),
    loadRelationalActivityLogs(),
  ]);
  if (error) throw error;
  if (!versionRow?.updated_at) throw new Error("Activity log version is missing.");
  return { entries, version: versionRow.updated_at };
}

export async function saveActivityLogsCore(
  data: SaveActivityLogsInput,
): Promise<SaveActivityLogsResult> {
  assertRelationalMode();
  const version = await readLegacyVersionToken(ROW_ID);
  if (version !== data.expectedVersion) {
    const entries = await loadRelationalActivityLogs();
    return { ok: false, conflict: true, entries, version };
  }

  const current = await loadRelationalActivityLogs();
  const entries =
    data.upserts.length === 0 && data.deletes.length === 0
      ? current
      : applyActivityLogMutation(current, data);

  if (data.upserts.length > 0 || data.deletes.length > 0) {
    await replaceRelationalActivityLogs(entries);
    const bumped = await bumpLegacyVersionToken(ROW_ID, data.expectedVersion);
    if (!bumped.ok) {
      const latest = await loadRelationalActivityLogs();
      return { ok: false, conflict: true, entries: latest, version: bumped.version };
    }
    return { ok: true, entries, version: bumped.version };
  }

  return { ok: true, entries, version };
}

/**
 * Server-only audit logging for auth events (login/logout). Runs before the
 * new session cookie exists on the incoming request, so it must NOT go through
 * the session-gated server functions — doing so made every first login
 * attempt fail with "Unauthorized access detected. Session expired.".
 * Best-effort: audit failures never block authentication.
 */
export async function appendServerAuditLog(draft: LogDraft): Promise<void> {
  try {
    const entry = createActivityLogEntry(draft);
    const current = await readActivityLogsCore();
    const result = await saveActivityLogsCore({
      upserts: [entry],
      deletes: [],
      expectedVersion: current.version,
    });
    if (!result.ok) {
      // One retry against the latest version — concurrent writers moved it.
      await saveActivityLogsCore({
        upserts: [entry],
        deletes: [],
        expectedVersion: result.version,
      });
    }
  } catch (error) {
    console.error("[audit-log] Failed to record auth event:", error);
  }
}
