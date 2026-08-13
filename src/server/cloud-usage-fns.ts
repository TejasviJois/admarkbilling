import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CloudUsageSnapshot } from "@/lib/cloud-usage";
import { assertAppSession } from "./app-session";
import { getSupabaseServerConfig } from "./env";
import { ADMARK_FILES_BUCKET } from "./file-storage";
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

async function sumStorageObjects(sb: SupabaseClient): Promise<{ bytes: number; files: number } | null> {
  let bytes = 0;
  let files = 0;
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await sb
      .schema("storage")
      .from("objects")
      .select("metadata")
      .eq("bucket_id", ADMARK_FILES_BUCKET)
      .range(from, from + page - 1);
    if (error) return null;
    const rows = data ?? [];
    for (const row of rows) {
      const size = Number((row as { metadata?: { size?: number } | null }).metadata?.size ?? 0);
      if (Number.isFinite(size)) bytes += size;
      files += 1;
    }
    if (rows.length < page) break;
    from += page;
  }
  return { bytes, files };
}

async function sumBucketByList(
  sb: SupabaseClient,
  prefix = "",
): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await sb.storage.from(ADMARK_FILES_BUCKET).list(prefix, {
      limit,
      offset,
    });
    if (error || !data?.length) break;
    for (const item of data) {
      const isFolder = item.id == null;
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (isFolder) {
        const nested = await sumBucketByList(sb, path);
        bytes += nested.bytes;
        files += nested.files;
      } else {
        bytes += Number(item.metadata?.size ?? 0) || 0;
        files += 1;
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return { bytes, files };
}

export const getCloudUsageFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CloudUsageSnapshot> => {
    const cfg = getSupabaseServerConfig();
    if (!cfg) {
      return emptySnapshot({
        error: "Supabase is not configured on the server.",
      });
    }

    try {
      await assertAppSession();
    } catch {
      return emptySnapshot({
        configured: true,
        dashboardUrl: dashboardUsageUrl(cfg.url),
        error: "Sign in again to read live usage.",
      });
    }

    const sb = requireServerSupabase();
    const fromRpc = await usageFromRpc(sb);
    let storageBytes = fromRpc.storageBytes;
    let storageFileCount: number | null = null;

    if (storageBytes == null) {
      const fromTable = await sumStorageObjects(sb);
      if (fromTable) {
        storageBytes = fromTable.bytes;
        storageFileCount = fromTable.files;
      } else {
        const fromList = await sumBucketByList(sb);
        storageBytes = fromList.bytes;
        storageFileCount = fromList.files;
      }
    } else {
      const fromTable = await sumStorageObjects(sb);
      storageFileCount = fromTable?.files ?? null;
    }

    return {
      configured: true,
      databaseBytes: fromRpc.databaseBytes,
      storageBytes,
      storageFileCount,
      dashboardUrl: dashboardUsageUrl(cfg.url),
      measuredAt: new Date().toISOString(),
      error: null,
    };
  },
);
