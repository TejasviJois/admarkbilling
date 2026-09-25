import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Trophy, XCircle, TrendingUp, Filter } from "lucide-react";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINRWhole } from "@/lib/invoice-calc";
import { leadDisplayName } from "@/lib/lead-conversion";
import { computeLeadCrmStats, isLeadArchived } from "@/lib/lead-stats";
import { leadStatusLabel } from "@/lib/lead-utils";
import { cn } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";

export const Route = createFileRoute("/pipeline-history")({
  component: PipelineHistoryPage,
});

type LedgerFilter = "all" | "won" | "lost";

const FUNNEL_STATUSES: LeadStatus[] = [
  "new_lead",
  "contacted",
  "meeting_scheduled",
  "proposal_sent",
  "negotiation",
];

const STAGE_TONE: Record<LeadStatus, string> = {
  new_lead: "bg-sky-400",
  contacted: "bg-cyan-400",
  meeting_scheduled: "bg-teal-400",
  proposal_sent: "bg-amber-400",
  negotiation: "bg-orange-400",
  won: "bg-emerald-400",
  lost: "bg-rose-400",
};

function PipelineHistoryPage() {
  const { ops, loading } = useOperations();
  const [ledgerFilter, setLedgerFilter] = useState<LedgerFilter>("all");
  const leads = ops.leads ?? [];
  const stats = useMemo(() => computeLeadCrmStats(leads), [leads]);

  const wonLeads = useMemo(() => leads.filter((l) => l.status === "won"), [leads]);
  const lostLeads = useMemo(() => leads.filter((l) => l.status === "lost"), [leads]);
  const wonValue = useMemo(
    () => wonLeads.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0),
    [wonLeads],
  );
  const lostValue = useMemo(
    () => lostLeads.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0),
    [lostLeads],
  );

  const funnel = useMemo(() => {
    return FUNNEL_STATUSES.map((status) => {
      const list = leads.filter((l) => l.status === status && !isLeadArchived(l));
      const value = list.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);
      return { status, count: list.length, value };
    });
  }, [leads]);

  const funnelMax = Math.max(1, ...funnel.map((s) => s.count));

  const closed = useMemo(
    () =>
      leads
        .filter((lead) => lead.status === "won" || lead.status === "lost")
        .sort((a, b) => {
          const aKey = a.expectedClosingDate || a.createdAt || "";
          const bKey = b.expectedClosingDate || b.createdAt || "";
          return bKey.localeCompare(aKey);
        }),
    [leads],
  );

  const ledger = useMemo(() => {
    return closed.filter((lead) => {
      if (ledgerFilter === "all") return true;
      if (ledgerFilter === "won") return lead.status === "won";
      return lead.status === "lost";
    });
  }, [closed, ledgerFilter]);

  if (loading) return <OperationsLoading />;

  const closedTotal = stats.wonCount + stats.lostDeals;

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            CRM · Outcomes
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Pipeline history
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Fresh wins and losses stay here and on the Pipeline WON / Lost columns.
          </p>
        </div>
        <Link
          to="/leads"
          className="inline-flex h-10 items-center gap-1.5 self-start rounded-lg border border-border/80 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to board
        </Link>
      </div>

      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-emerald-500/[0.08] via-card/60 to-rose-500/[0.08] px-5 py-6 sm:px-8 sm:py-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(52,211,153,0.18), transparent 42%), radial-gradient(circle at 85% 70%, rgba(251,113,133,0.14), transparent 40%)",
          }}
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Win rate on closed deals
            </p>
            <p className="mt-2 text-5xl font-semibold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {stats.conversionRate.toFixed(0)}
              <span className="text-3xl text-muted-foreground sm:text-4xl">%</span>
            </p>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              {closedTotal === 0
                ? "No closed deals yet. Mark a prospect Won or Lost on the board to start this ledger."
                : `${stats.wonCount} won and ${stats.lostDeals} lost across ${closedTotal} closed deal${closedTotal === 1 ? "" : "s"}. ${stats.activeCount} still open on the board.`}
            </p>
            {closedTotal > 0 ? (
              <div className="mt-5 h-2.5 max-w-md overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                  style={{ width: `${Math.min(100, stats.conversionRate)}%` }}
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <OutcomeTile
              icon={<Trophy className="h-4 w-4" />}
              label="Won"
              count={stats.wonCount}
              value={formatINRWhole(wonValue)}
              tone="emerald"
            />
            <OutcomeTile
              icon={<XCircle className="h-4 w-4" />}
              label="Lost"
              count={stats.lostDeals}
              value={formatINRWhole(lostValue)}
              tone="rose"
            />
            <OutcomeTile
              icon={<TrendingUp className="h-4 w-4" />}
              label="Open now"
              count={stats.activeCount}
              value={formatINRWhole(stats.pipelineValue)}
              tone="sky"
              className="col-span-2 sm:col-span-1"
            />
            <OutcomeTile
              icon={<Filter className="h-4 w-4" />}
              label="Avg deal"
              count={null}
              value={formatINRWhole(stats.averageDealSize)}
              tone="amber"
              className="col-span-2 sm:col-span-1"
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Open funnel</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live deals by stage — bar length is deal count.
          </p>
        </div>
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card/30 p-4 sm:p-5">
          {funnel.every((s) => s.count === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing open in the funnel right now.
            </p>
          ) : (
            funnel.map((stage) => (
              <div
                key={stage.status}
                className="grid grid-cols-[7.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)_8rem]"
              >
                <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">
                  {leadStatusLabel(stage.status)}
                </p>
                <div className="h-3 overflow-hidden rounded-full bg-muted/50">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      STAGE_TONE[stage.status],
                    )}
                    style={{ width: `${(stage.count / funnelMax) * 100}%` }}
                  />
                </div>
                <div className="text-right tabular-nums">
                  <span className="text-sm font-semibold text-foreground">{stage.count}</span>
                  <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                    {formatINRWhole(stage.value)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Closed ledger</h2>
            <p className="mt-1 text-sm text-muted-foreground">Won and lost deals with forecast value.</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border/80 bg-background/40 p-1">
            {(
              [
                ["all", "All"],
                ["won", "Won"],
                ["lost", "Lost"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLedgerFilter(id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  ledgerFilter === id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/30">
          {ledger.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted-foreground">
              No deals in this view yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {ledger.map((lead) => (
                <LedgerRow key={lead.id} lead={lead} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function OutcomeTile({
  icon,
  label,
  count,
  value,
  tone,
  className,
}: {
  icon: ReactNode;
  label: string;
  count: number | null;
  value: string;
  tone: "emerald" | "rose" | "sky" | "amber";
  className?: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-400 bg-emerald-500/10"
      : tone === "rose"
        ? "text-rose-400 bg-rose-500/10"
        : tone === "sky"
          ? "text-sky-400 bg-sky-500/10"
          : "text-amber-400 bg-amber-500/10";

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-background/45 px-3.5 py-3 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", toneClass)}>
          {icon}
        </span>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      {count != null ? (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{count}</p>
      ) : (
        <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      )}
      {count != null ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">Across all deals</p>
      )}
    </div>
  );
}

function LedgerRow({ lead }: { lead: Lead }) {
  const won = lead.status === "won";
  const lost = lead.status === "lost";

  return (
    <li className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-foreground">{leadDisplayName(lead)}</p>
          <StatusPill won={won} lost={lost} />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {[lead.contactPerson, lead.source, lead.expectedClosingDate || lead.createdAt]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-baseline gap-3 sm:text-right">
        {lead.probability != null ? (
          <span className="text-xs tabular-nums text-muted-foreground">{lead.probability}%</span>
        ) : null}
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {lead.expectedRevenue != null ? formatINRWhole(lead.expectedRevenue) : "—"}
        </span>
      </div>
    </li>
  );
}

function StatusPill({ won, lost }: { won: boolean; lost: boolean }) {
  if (won) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        Won
      </span>
    );
  }
  if (lost) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
        Lost
      </span>
    );
  }
  return null;
}
