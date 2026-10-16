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
import type { Lead, LeadStatus } from "@/lib/types";

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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ff6b2b]">
            CRM · Performance Analytics
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">
            Pipeline History & Outcomes
          </h1>
          <p className="mt-1.5 max-w-lg text-xs text-white/50">
            Historical conversion performance, funnel velocity, and closed deal records.
          </p>
        </div>
        <Link
          to="/leads"
          className="inline-flex h-9 items-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-semibold text-white transition-all hover:bg-white/[0.08] active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pipeline
        </Link>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-500/[0.1] via-[#0e0e14]/90 to-rose-500/[0.08] px-6 py-7 sm:px-8 sm:py-8 glass-panel shadow-2xl">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(52,211,153,0.22), transparent 45%), radial-gradient(circle at 85% 70%, rgba(251,113,133,0.18), transparent 45%)",
          }}
        />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider mb-2">
              Closed Conversion Metric
            </span>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Win rate on closed deals
            </p>
            <p className="mt-2 text-5xl font-extrabold tracking-tight tabular-nums font-mono text-white sm:text-6xl drop-shadow-[0_0_25px_rgba(52,211,153,0.25)]">
              {stats.conversionRate.toFixed(0)}
              <span className="text-3xl text-emerald-400 sm:text-4xl">%</span>
            </p>
            <p className="mt-3 max-w-md text-xs leading-relaxed text-white/60">
              {closedTotal === 0
                ? "No closed deals yet. Mark a prospect Won or Lost on the board to start this ledger."
                : `${stats.wonCount} won and ${stats.lostDeals} lost across ${closedTotal} closed deal${closedTotal === 1 ? "" : "s"}. ${stats.activeCount} still open on the board.`}
            </p>
            {closedTotal > 0 ? (
              <div className="mt-5 h-2.5 max-w-md overflow-hidden rounded-full bg-white/[0.06] border border-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(52,211,153,0.5)] transition-all duration-700"
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
          <h2 className="text-lg font-bold tracking-tight text-white">Open Funnel Stages</h2>
          <p className="mt-1 text-xs text-white/50">
            Live pipeline distributions — bar length corresponds to deal volume.
          </p>
        </div>
        <div className="space-y-3.5 rounded-2xl border border-white/10 glass-panel p-5">
          {funnel.every((s) => s.count === 0) ? (
            <p className="py-8 text-center text-sm text-white/40">
              Nothing open in the funnel right now.
            </p>
          ) : (
            funnel.map((stage) => (
              <div
                key={stage.status}
                className="grid grid-cols-[8.5rem_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_8rem]"
              >
                <p className="truncate text-xs font-semibold text-white/70">
                  {leadStatusLabel(stage.status)}
                </p>
                <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.05] border border-white/5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500 shadow-sm",
                      STAGE_TONE[stage.status],
                    )}
                    style={{ width: `${(stage.count / funnelMax) * 100}%` }}
                  />
                </div>
                <div className="text-right tabular-nums font-mono">
                  <span className="text-sm font-bold text-white">{stage.count}</span>
                  <span className="ml-2 hidden text-xs text-white/40 sm:inline">
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
            <h2 className="text-lg font-bold tracking-tight text-white">Closed Ledger</h2>
            <p className="mt-1 text-xs text-white/50">Comprehensive historical archive of won and lost opportunities.</p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-[#121218]/80 p-1">
            {(
              [
                ["all", "All Deals"],
                ["won", "Won Deals"],
                ["lost", "Lost Deals"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLedgerFilter(id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  ledgerFilter === id
                    ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-[#ff6b2b]/25"
                    : "text-white/60 hover:text-white",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/10 glass-panel shadow-xl">
          {ledger.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-white/40">
              No deals in this view yet.
            </p>
          ) : (
            <ul className="divide-y divide-white/10">
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
      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
      : tone === "rose"
        ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
        : tone === "sky"
          ? "text-sky-400 bg-sky-500/10 border-sky-500/20"
          : "text-amber-400 bg-amber-500/10 border-amber-500/20";

  return (
    <div
      className={cn(
        "glass-panel rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-all hover:border-white/20",
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm", toneClass)}>
          {icon}
        </span>
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      </div>
      {count != null ? (
        <p className="mt-2.5 text-2xl font-bold tabular-nums font-mono text-white">{count}</p>
      ) : (
        <p className="mt-2.5 text-2xl font-bold tabular-nums font-mono text-white">{value}</p>
      )}
      {count != null ? (
        <p className="mt-0.5 text-xs font-mono text-white/50">{value}</p>
      ) : (
        <p className="mt-0.5 text-xs text-white/40">Across all deals</p>
      )}
    </div>
  );
}

function LedgerRow({ lead }: { lead: Lead }) {
  const won = lead.status === "won";
  const lost = lead.status === "lost";

  return (
    <li className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="truncate font-semibold text-white">{leadDisplayName(lead)}</p>
          <StatusPill won={won} lost={lost} />
        </div>
        <p className="mt-1 truncate text-xs text-white/50 font-mono">
          {[lead.contactPerson, lead.source, lead.expectedClosingDate || lead.createdAt]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 items-baseline gap-3 sm:text-right font-mono">
        {lead.probability != null ? (
          <span className="text-xs tabular-nums text-white/40">{lead.probability}% probability</span>
        ) : null}
        <span className={cn("text-base font-bold tabular-nums", won ? "text-emerald-400" : "text-white/80")}>
          {lead.expectedRevenue != null ? formatINRWhole(lead.expectedRevenue) : "—"}
        </span>
      </div>
    </li>
  );
}

function StatusPill({ won, lost }: { won: boolean; lost: boolean }) {
  if (won) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.2)]">
        Won Deal
      </span>
    );
  }
  if (lost) {
    return (
      <span className="inline-flex items-center rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-400">
        Lost Deal
      </span>
    );
  }
  return null;
}
