import { createServerFn } from "@tanstack/react-start";
import type { OperationsData } from "@/lib/types";
import { requireServerSupabase } from "./supabase-admin";
import { assertAppSession } from "./app-session";

export const EMPTY_OPERATIONS: OperationsData = {
  projects: [],
  partnerships: [],
  expenses: [],
};

function parseOperationsPayload(payload: unknown): OperationsData {
  if (!payload || typeof payload !== "object") return EMPTY_OPERATIONS;
  const raw = payload as Partial<OperationsData>;
  return {
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    partnerships: Array.isArray(raw.partnerships) ? raw.partnerships : [],
    expenses: Array.isArray(raw.expenses) ? raw.expenses : [],
  };
}

export const getOperationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<OperationsData> => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("operations_data")
      .select("payload")
      .eq("id", "default")
      .maybeSingle();
    if (error) throw error;
    if (!data?.payload) return EMPTY_OPERATIONS;
    return parseOperationsPayload(data.payload);
  },
);

export const saveOperationsFn = createServerFn({ method: "POST" })
  .inputValidator((data: OperationsData) => data)
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const { error } = await sb.from("operations_data").upsert({
      id: "default",
      payload: data,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true as const };
  });
