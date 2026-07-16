import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  actionLabel,
  entityLabel,
  formatActivityTimestamp,
} from "@/lib/activity-log-labels";
import { logClientError } from "@/lib/client-logger";
import type { ActivityEntity, ActivityLogEntry } from "@/lib/types";
export const Route = createFileRoute("/logs")({ component: LogsPage });

const ENTITY_FILTERS: Array<ActivityEntity | "all"> = [
  "all",
  "project",
  "partnership",
  "expense",
  "invoice",
  "settings",
  "security",
];

function entityBadgeClass(entity: ActivityEntity): string {
  switch (entity) {
    case "project":
      return "bg-sky-500/15 text-sky-400 ring-sky-500/30";
    case "partnership":
      return "bg-violet-500/15 text-violet-400 ring-violet-500/30";
    case "expense":
      return "bg-amber-500/15 text-amber-400 ring-amber-500/30";
    case "invoice":
      return "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30";
    case "settings":
      return "bg-muted text-muted-foreground ring-border";
    case "agreement":
    case "document":
      return "bg-indigo-500/15 text-indigo-400 ring-indigo-500/30";
    case "security":
      return "bg-rose-500/15 text-rose-400 ring-rose-500/30";
    default:
      return "bg-muted text-muted-foreground ring-border";
  }
}

function actionBadgeClass(action: ActivityLogEntry["action"]): string {
  switch (action) {
    case "created":
      return "text-emerald-400";
    case "updated":
      return "text-sky-400";
    case "deleted":
      return "text-rose-400";
    case "payment_added":
      return "text-emerald-300";
    case "payment_removed":
      return "text-rose-300";
    case "login":
      return "text-emerald-400 font-bold";
    case "logout":
      return "text-muted-foreground";
    case "failed_login":
      return "text-rose-500 font-extrabold";
    default:
      return "text-muted-foreground";
  }
}

function LogsPage() {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [entityFilter, setEntityFilter] = useState<ActivityEntity | "all">("all");

  useEffect(() => {
    void import("@/lib/activity-log-storage")
      .then((m) => m.loadActivityLogs())
      .then(setLogs)
      .catch((e) => logClientError("logs.load", e))
      .finally(() => setLoading(false));
  }, []);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return logs.filter((entry) => {
      if (entityFilter !== "all" && entry.entity !== entityFilter) return false;
      if (!term) return true;
      return (
        entry.summary.toLowerCase().includes(term) ||
        entityLabel(entry.entity).toLowerCase().includes(term) ||
        actionLabel(entry.action).toLowerCase().includes(term) ||
        (entry.entityName?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [logs, q, entityFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Activity logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every change across projects, partnerships, expenses, invoices, and settings is recorded
          here.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:min-w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search logs..."
            className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value as ActivityEntity | "all")}
          className="w-full shrink-0 rounded-md border border-input bg-card px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:w-auto"
        >
          {ENTITY_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === "all" ? "All areas" : entityLabel(value)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading logs…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            {logs.length === 0
              ? "No activity yet. Changes you make will appear here."
              : "No logs match your search."}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden" aria-label="Activity log list">
              {filtered.map((entry) => (
                <li key={entry.id} className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${entityBadgeClass(entry.entity)}`}
                    >
                      {entityLabel(entry.entity)}
                    </span>
                    <span className={`text-xs font-medium ${actionBadgeClass(entry.action)}`}>
                      {actionLabel(entry.action)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">{entry.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatActivityTimestamp(entry.timestamp)}
                  </p>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-normal">When</th>
                    <th className="px-4 py-3 font-normal">Area</th>
                    <th className="px-4 py-3 font-normal">Action</th>
                    <th className="px-4 py-3 font-normal">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.id}
                      className="border-t border-border transition-colors hover:bg-muted/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {formatActivityTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${entityBadgeClass(entry.entity)}`}
                        >
                          {entityLabel(entry.entity)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-medium ${actionBadgeClass(entry.action)}`}>
                        {actionLabel(entry.action)}
                      </td>
                      <td className="px-4 py-3 text-foreground">{entry.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
