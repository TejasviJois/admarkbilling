import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  FREE_PLAN_CAPS,
  formatGbPair,
  usagePercent,
  type CloudUsageSnapshot,
} from "@/lib/cloud-usage";
import { getCloudUsageFn } from "@/server/cloud-usage-fns";
import { logClientError } from "@/lib/client-logger";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function UsageRing({ percent }: { percent: number | null }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const pct = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const tone =
    percent == null
      ? "text-muted-foreground/40"
      : pct >= 90
        ? "text-rose-400"
        : pct >= 70
          ? "text-amber-400"
          : "text-emerald-400";
  return (
    <svg className="h-10 w-10 shrink-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-muted-foreground/20"
        strokeWidth="3"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        className={tone}
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloudUsagePanel() {
  const [snapshot, setSnapshot] = useState<CloudUsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    void getCloudUsageFn()
      .then(setSnapshot)
      .catch((error) => {
        logClientError("settings.cloudUsage", error);
        setSnapshot({
          configured: false,
          databaseBytes: null,
          storageBytes: null,
          storageFileCount: null,
          dashboardUrl: null,
          measuredAt: null,
          error: error instanceof Error ? error.message : "Could not read usage.",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const db = snapshot?.databaseBytes;
  const storage = snapshot?.storageBytes;
  const overQuota =
    (db != null && db >= FREE_PLAN_CAPS.databaseBytes) ||
    (storage != null && storage >= FREE_PLAN_CAPS.storageBytes);

  const rows = [
    {
      key: "database",
      label: "Database Size",
      value: db != null ? formatGbPair(db, FREE_PLAN_CAPS.databaseBytes) : "— / 0.5 GB",
      percent: db != null ? usagePercent(db, FREE_PLAN_CAPS.databaseBytes) : null,
      hint: "Invoices, operations, and indexes",
    },
    {
      key: "storage",
      label: "Storage Size",
      value: storage != null ? formatGbPair(storage, FREE_PLAN_CAPS.storageBytes) : "— / 1 GB",
      percent: storage != null ? usagePercent(storage, FREE_PLAN_CAPS.storageBytes) : null,
      hint:
        snapshot?.storageFileCount != null
          ? `${snapshot.storageFileCount.toLocaleString("en-IN")} files in admark-files`
          : "Photos, PDFs, proofs — updates after each upload",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Cloud usage</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {overQuota
              ? "A Free Plan quota is full."
              : "Database and file storage vs Free Plan caps."}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Measuring…" : "Refresh"}
        </Button>
      </div>

      {snapshot?.error && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {snapshot.error}
        </p>
      )}

      <div className="grid gap-px overflow-hidden border border-border/80 bg-border/80 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 bg-background px-4 py-3.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{row.value}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground/80">{row.hint}</p>
            </div>
            <UsageRing percent={row.percent} />
          </div>
        ))}
      </div>

      {snapshot?.dashboardUrl && (
        <p className="text-[11px] text-muted-foreground">
          {snapshot.measuredAt
            ? `Last measured ${new Date(snapshot.measuredAt).toLocaleString("en-IN")} · `
            : null}
          <a
            href={snapshot.dashboardUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sky-400 hover:underline"
          >
            Open Supabase usage
          </a>
        </p>
      )}
    </div>
  );
}
