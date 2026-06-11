import { formatINRWhole } from "@/lib/invoice-calc";
import type {
  ActiveMrrRow,
  BookedRevenueRow,
  FutureMonthlyRow,
} from "@/lib/project-billing";

export function BookedRevenueBreakdownList({ rows }: { rows: BookedRevenueRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No booked revenue on active projects yet.</p>;
  }
  return (
    <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {rows.map((r) => (
        <li
          key={`${r.client}-${r.billingLabel}`}
          className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{r.client}</p>
            {r.projectType && <p className="text-xs text-muted-foreground">{r.projectType}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{r.billingLabel}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300">
            {formatINRWhole(r.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FutureMonthlyBreakdownList({ rows }: { rows: FutureMonthlyRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No unstarted monthly retainers.</p>;
  }
  return (
    <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {rows.map((r) => (
        <li
          key={`${r.client}-${r.scheduleLabel}`}
          className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-foreground">{r.client}</p>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  r.termKind === "fixed"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {r.termKind === "fixed" ? "Fixed term" : "Ongoing"}
              </span>
            </div>
            {r.projectType && <p className="text-xs text-muted-foreground">{r.projectType}</p>}
            <p className="mt-1 text-sm font-medium text-foreground">{r.scheduleLabel}</p>
            {r.upfrontNote && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{r.upfrontNote}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="text-sm font-semibold tabular-nums text-foreground">
              {formatINRWhole(r.amount)}
            </span>
            <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{r.amountSubtext}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ActiveMrrBreakdownList({ rows }: { rows: ActiveMrrRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No active retainers yet.</p>;
  }
  return (
    <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
      {rows.map((r) => (
        <li
          key={`${r.client}-${r.billingLabel}`}
          className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="font-medium text-foreground">{r.client}</p>
            {r.projectType && <p className="text-xs text-muted-foreground">{r.projectType}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{r.billingLabel}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-300">
            {formatINRWhole(r.amount)}/mo
          </span>
        </li>
      ))}
    </ul>
  );
}
