import { createServerFn } from "@tanstack/react-start";
import type { ActivityLogEntry } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { relationalDualWritesEnabled, relationalReadsEnabled } from "./env";
import { loadRelationalActivityLogs } from "./relational-read-repository";
import { replaceRelationalActivityLogs } from "./relational-write-repository";

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

function parseActivityLogs(payload: unknown): ActivityLogEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as { entries?: unknown };
  if (!Array.isArray(raw.entries)) return [];
  return raw.entries
    .filter(
      (entry): entry is ActivityLogEntry =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as ActivityLogEntry).id === "string" &&
        typeof (entry as ActivityLogEntry).timestamp === "number" &&
        typeof (entry as ActivityLogEntry).summary === "string",
    )
    .map((entry) => ({ ...entry, organizationId: DEFAULT_ORG_ID }));
}

export const getActivityLogsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<VersionedActivityLogs> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    if (relationalReadsEnabled()) {
      const [{ data: versionRow, error }, entries] = await Promise.all([
        sb.from("operations_data").select("updated_at").eq("id", ROW_ID).maybeSingle(),
        loadRelationalActivityLogs(),
      ]);
      if (error) throw error;
      if (!versionRow?.updated_at) throw new Error("Activity log version is missing.");
      return { entries, version: versionRow.updated_at };
    }
    const { data, error } = await sb
      .from("operations_data")
      .select("payload, updated_at")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data?.payload || !data.updated_at) {
      // First run — initialize the row so versioned saves have a CAS token.
      const { data: created, error: initError } = await sb
        .from("operations_data")
        .upsert({ id: ROW_ID, payload: { entries: [] }, updated_at: new Date().toISOString() })
        .select("payload, updated_at")
        .single();
      if (initError) throw initError;
      return { entries: parseActivityLogs(created.payload), version: created.updated_at };
    }
    return { entries: parseActivityLogs(data.payload), version: data.updated_at };
  },
);

export const saveActivityLogsFn = createServerFn({ method: "POST" })
  .inputValidator((data: SaveActivityLogsInput) => data)
  .handler(async ({ data }): Promise<SaveActivityLogsResult> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const entriesWithTenant = data.upserts.map((entry) => ({
      ...entry,
      organizationId: DEFAULT_ORG_ID,
    }));
    const { data: rows, error } = await sb.rpc("mutate_operations_aux_data", {
      p_row_id: ROW_ID,
      p_expected_updated_at: data.expectedVersion,
      p_entity_key: "entries",
      p_upserts: entriesWithTenant,
      p_deletes: data.deletes,
    });
    if (error) throw error;
    const result = (
      rows as Array<{
        success: boolean;
        is_conflict: boolean;
        result_payload: unknown;
        result_updated_at: string;
      }> | null
    )?.[0];
    if (!result?.result_payload || !result.result_updated_at) {
      throw new Error("Safe activity log mutation returned no result.");
    }
    const entries = parseActivityLogs(result.result_payload);
    if (!result.success || result.is_conflict) {
      return {
        ok: false,
        conflict: true,
        entries,
        version: result.result_updated_at,
      };
    }
    if (relationalReadsEnabled() || relationalDualWritesEnabled()) {
      await replaceRelationalActivityLogs(entries);
    }
    return { ok: true, entries, version: result.result_updated_at };
  });
