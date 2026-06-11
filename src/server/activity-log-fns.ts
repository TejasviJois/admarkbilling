import { createServerFn } from "@tanstack/react-start";
import type { ActivityLogEntry } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";

const ROW_ID = "activity_logs";

function parseActivityLogs(payload: unknown): ActivityLogEntry[] {
  if (!payload || typeof payload !== "object") return [];
  const raw = payload as { entries?: unknown };
  if (!Array.isArray(raw.entries)) return [];
  return raw.entries.filter(
    (entry): entry is ActivityLogEntry =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ActivityLogEntry).id === "string" &&
      typeof (entry as ActivityLogEntry).timestamp === "number" &&
      typeof (entry as ActivityLogEntry).summary === "string",
  );
}

export const getActivityLogsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActivityLogEntry[]> => {
    await assertAppSession();
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
    const { error } = await sb.from("operations_data").upsert({
      id: ROW_ID,
      payload: { entries: data },
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true as const };
  });
