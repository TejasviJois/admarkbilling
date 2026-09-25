import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudUsageSnapshot } from "@/lib/cloud-usage";
import { requireAdmin } from "./app-session.server";
import { getSupabaseServerConfig } from "./env";
import { requireServerSupabase } from "./supabase-admin";

function dashboardUsageUrl(supabaseUrl: string): string | null {
  try {
    const ref = new URL(supabaseUrl).hostname.split(".")[0];
    if (!ref) return null;
    return `https://supabase.com/dashboard/project/${ref}/settings/billing`;
  } catch {
    return null;
  }
}

function emptySnapshot(partial: Partial<CloudUsageSnapshot> = {}): CloudUsageSnapshot {
  return {
    configured: false,
    databaseBytes: null,
    storageBytes: null,
    storageFileCount: null,
    dashboardUrl: null,
    measuredAt: null,
    error: null,
    ...partial,
  };
}

function parseUsageRow(raw: unknown): {
  databaseBytes: number | null;
  storageBytes: number | null;
} {
  const empty = { databaseBytes: null, storageBytes: null };
  let row = raw;
  if (typeof row === "string") {
    try {
      row = JSON.parse(row);
    } catch {
      return empty;
    }
  }
  if (Array.isArray(row)) row = row[0];
  if (!row || typeof row !== "object") return empty;
  const rec = row as Record<string, unknown>;
  const databaseBytes = Number(rec.database_bytes ?? rec.databaseBytes);
  const storageBytes = Number(rec.storage_bytes ?? rec.storageBytes);
  return {
    databaseBytes: Number.isFinite(databaseBytes) ? databaseBytes : null,
    storageBytes: Number.isFinite(storageBytes) ? storageBytes : null,
  };
}

async function usageFromRpc(sb: SupabaseClient): Promise<{
  databaseBytes: number | null;
  storageBytes: number | null;
}> {
  const { data, error } = await sb.rpc("cloud_usage_bytes");
  if (error || data == null) {
    return { databaseBytes: null, storageBytes: null };
  }
  return parseUsageRow(data);
}

/**
 * Cloud usage is RPC-only. Never list or download Storage buckets here —
 * recursive storage.list previously burned multi-GB egress.
 */
export const getCloudUsageFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CloudUsageSnapshot> => {
    const cfg = getSupabaseServerConfig();
    if (!cfg) {
      return emptySnapshot({
        error: "Supabase is not configured on the server.",
      });
    }

    try {
      await requireAdmin();
    } catch {
      return emptySnapshot({
        configured: true,
        dashboardUrl: null,
        error: "Sign in again to read live usage.",
      });
    }

    const sb = requireServerSupabase();
    const fromRpc = await usageFromRpc(sb);

    return {
      configured: true,
      databaseBytes: fromRpc.databaseBytes,
      storageBytes: fromRpc.storageBytes,
      storageFileCount: null,
      dashboardUrl: dashboardUsageUrl(cfg.url),
      measuredAt: new Date().toISOString(),
      error:
        fromRpc.databaseBytes == null && fromRpc.storageBytes == null
          ? "Usage RPC unavailable. Check Supabase dashboard billing for live numbers."
          : null,
    };
  },
);
