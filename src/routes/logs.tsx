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

  const groups = useMemo(() => {
    const map = new Map<string, ActivityLogEntry[]>();
    for (const entry of filtered) {
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
  }, [filtered]);

  const hasDateFilter = Boolean(dateFrom || dateTo);

  const clearDates = () => {
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Activity
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Changes across projects, invoices, expenses, and settings.
          </p>
        </div>

        <div className="flex flex-col gap-3 border-y border-border/80 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.5}
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="w-full border-0 bg-transparent py-1.5 pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
            <p className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {loading ? "…" : `${filtered.length} of ${logs.length}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">From</span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className={dateInputClass}
                aria-label="From date"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="shrink-0">To</span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className={dateInputClass}
                aria-label="To date"
              />
            </label>
            {hasDateFilter ? (
              <button
                type="button"
                onClick={clearDates}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear dates
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-0.5" role="group" aria-label="Filter by area">
          {ENTITY_FILTERS.map((value) => {
            const active = entityFilter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setEntityFilter(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {value === "all" ? "All" : entityLabel(value)}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="border-y border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          Loading…
        </p>
      ) : filtered.length === 0 ? (
        <p className="border-y border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
          {logs.length === 0
            ? "No activity yet. Changes you make will appear here."
            : "No logs match your filters."}
        </p>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.heading}
              </h2>
              <ul className="divide-y divide-border/80 border-y border-border/80">
                {group.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="grid gap-1 py-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
                  >
                    <time
                      dateTime={new Date(entry.timestamp).toISOString()}
                      className="text-xs tabular-nums text-muted-foreground"
                      title={formatActivityTimestamp(entry.timestamp)}
                    >
                      {timeOnly(entry.timestamp)}
                    </time>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className={cn("text-xs font-medium", actionTone(entry.action))}>
                          {actionLabel(entry.action)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {entityLabel(entry.entity)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm leading-snug text-foreground">{entry.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
