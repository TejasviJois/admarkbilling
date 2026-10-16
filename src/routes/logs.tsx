import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { actionLabel, entityLabel, formatActivityTimestamp } from "@/lib/activity-log-labels";
import { logClientError } from "@/lib/client-logger";
import type { ActivityEntity, ActivityLogEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/logs")({ component: LogsPage });

const ENTITY_FILTERS: Array<ActivityEntity | "all"> = [
  "all",
  "project",
  "partnership",
  "expense",
  "invoice",
  "settings",
  "security",
  "lead",
];

function actionTone(action: ActivityLogEntry["action"]): string {
  switch (action) {
    case "created":
    case "payment_added":
    case "login":
      return "text-emerald-400";
    case "updated":
    case "password_change":
      return "text-sky-400";
    case "deleted":
    case "payment_removed":
    case "failed_login":
      return "text-rose-400";
    case "logout":
    default:
      return "text-muted-foreground";
  }
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayHeading(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "full" }).format(d);
}

function timeOnly(ts: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts));
}

/** Local midnight for YYYY-MM-DD. */
function startOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** End of local day for YYYY-MM-DD. */
function endOfLocalDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

const dateInputClass =
  "h-8 rounded-md border border-border/80 bg-transparent px-2 text-xs text-foreground outline-none focus:border-primary [color-scheme:dark]";

function LogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<ActivityEntity | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    void import("@/lib/activity-log-storage")
      .then((m) => m.loadActivityLogs())
      .then(setLogs)
      .catch((e) => logClientError("logs.load", e))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromTs = dateFrom ? startOfLocalDay(dateFrom) : null;
    const toTs = dateTo ? endOfLocalDay(dateTo) : null;

    return logs.filter((entry) => {
      if (entityFilter !== "all" && entry.entity !== entityFilter) return false;
      if (fromTs != null && entry.timestamp < fromTs) return false;
      if (toTs != null && entry.timestamp > toTs) return false;
      if (!term) return true;
      return (
        entry.summary.toLowerCase().includes(term) ||
        entityLabel(entry.entity).toLowerCase().includes(term) ||
        actionLabel(entry.action).toLowerCase().includes(term) ||
        (entry.entityName?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [logs, q, entityFilter, dateFrom, dateTo]);

  const [visibleLimit, setVisibleLimit] = useState(50);

  useEffect(() => {
    setVisibleLimit(50);
  }, [q, entityFilter, dateFrom, dateTo]);

  const visibleEntries = useMemo(() => {
    return filtered.slice(0, visibleLimit);
  }, [filtered, visibleLimit]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityLogEntry[]>();
    for (const entry of visibleEntries) {
      const key = dayKey(entry.timestamp);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return Array.from(map.entries()).map(([key, entries]) => ({
      key,
      heading: dayHeading(entries[0].timestamp),
      entries,
    }));
  }, [visibleEntries]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  const clearDates = () => {
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Activity Logs
          </h1>
          <p className="mt-1.5 max-w-xl text-xs text-white/50">
            Real-time audit log of changes across projects, invoices, expenses, security, and settings.
          </p>
        </div>

        {/* Filter Bar */}
        <div className="rounded-2xl border border-white/10 glass-panel p-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
                strokeWidth={1.5}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search events, summaries, and team members…"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-white/40 focus:border-[#ff6b2b]/50 focus:ring-1 focus:ring-[#ff6b2b]/50"
              />
            </div>
            <p className="shrink-0 text-xs font-mono text-white/40">
              {loading ? "…" : `${filtered.length} of ${logs.length} entries`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-white/5">
            <label className="flex items-center gap-2 text-xs text-white/50">
              <span className="shrink-0 font-medium">From:</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white outline-none focus:border-[#ff6b2b]/50 [color-scheme:dark]"
                aria-label="From date"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-white/50">
              <span className="shrink-0 font-medium">To:</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-8 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white outline-none focus:border-[#ff6b2b]/50 [color-scheme:dark]"
                aria-label="To date"
              />
            </label>
            {hasDateFilter ? (
              <button
                type="button"
                onClick={clearDates}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 glass-card px-2.5 py-1.5 text-xs text-white/70 transition-colors hover:border-white/20 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
                Clear dates
              </button>
            ) : null}
          </div>
        </div>

        {/* Entity Filters Capsule Dock */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl border border-white/10 glass-panel max-w-fit" role="group" aria-label="Filter by area">
          {ENTITY_FILTERS.map((value) => {
            const active = entityFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setEntityFilter(value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
                  active
                    ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-[#ff6b2b]/20"
                    : "text-white/60 hover:text-white hover:bg-white/5",
                )}
              >
                {value === "all" ? "All" : entityLabel(value)}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10 glass-panel py-16 text-center text-sm text-white/40">
          Loading activity logs…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 glass-panel py-16 text-center text-sm text-white/40">
          {logs.length === 0
            ? "No activity yet. Changes made in the platform will appear here."
            : "No logs match your filter criteria."}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} className="rounded-2xl border border-white/10 glass-panel overflow-hidden">
              <div className="border-b border-white/10 px-5 py-3.5 bg-white/[0.02]">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#ff6b2b]">
                  {group.heading}
                </h2>
              </div>
              <ul className="divide-y divide-white/5">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid gap-2 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
                  >
                    <time
                      dateTime={new Date(entry.timestamp).toISOString()}
                      className="text-xs font-mono tabular-nums text-white/40"
                      title={formatActivityTimestamp(entry.timestamp)}
                    >
                      {timeOnly(entry.timestamp)}
                    </time>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn("text-xs font-bold capitalize", actionTone(entry.action))}>
                          {actionLabel(entry.action)}
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/60">
                          {entityLabel(entry.entity)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-white/90 leading-snug">{entry.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {filtered.length > visibleEntries.length && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 50)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 glass-card px-5 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:border-[#ff6b2b]/40 hover:text-white"
              >
                Show more logs ({visibleEntries.length} of {filtered.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
