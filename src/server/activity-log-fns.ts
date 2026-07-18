import { createServerFn } from "@tanstack/react-start";
import type { ActivityLogEntry } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";
import { relationalDualWritesEnabled, relationalReadsEnabled } from "./env";
import { loadRelationalActivityLogs } from "./relational-read-repository";
import { replaceRelationalActivityLogs } from "./relational-write-repository";

const ROW_ID = "activity_logs";
const DEFAULT_ORG_ID = "org-admark-digitals";

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
  async (): Promise<ActivityLogEntry[]> => {
    await assertAppSession();
    if (relationalReadsEnabled()) return loadRelationalActivityLogs();
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("operations_data")
      .select("payload")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error) throw error;
    if (!data?.payload) return [];
    return parseActivityLogs(data.payload);
  },
);

export const saveActivityLogsFn = createServerFn({ method: "POST" })
  .inputValidator((data: ActivityLogEntry[]) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const entriesWithTenant = data.map((entry) => ({ ...entry, organizationId: DEFAULT_ORG_ID }));
    const { error } = await sb.from("operations_data").upsert({
      id: ROW_ID,
      payload: { entries: entriesWithTenant, organizationId: DEFAULT_ORG_ID },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    if (relationalReadsEnabled() || relationalDualWritesEnabled()) {
      await replaceRelationalActivityLogs(data);
    }
    return { ok: true as const };
  });
