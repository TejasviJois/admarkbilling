import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  LineChart,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { CategoryBreakdownPanel } from "@/components/analytics/CategoryBreakdownPanel";
import { LazyMonthlyChart } from "@/components/analytics/LazyMonthlyChart";
import {
  AnalyticsKpiGrid,
  AnalyticsPageHeader,
  AnalyticsPeriodFilter,
  AnalyticsQuickLinks,
} from "@/components/analytics/analytics-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  buildAnalyticsSnapshot,
  buildIncomeByClientForPeriod,
  buildIncomeSourceForPeriod,
  buildMoneyOutForPeriod,
} from "@/lib/analytics";
import { DEFAULT_PERIOD, periodLabel, type PeriodKey } from "@/lib/date-range-filter";
import { computeFinancialSummary, formatFinancialINR } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/analytics/")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { ops, loading } = useOperations();
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);

  const financial = useMemo(() => computeFinancialSummary(ops), [ops]);
  const snapshot = useMemo(() => buildAnalyticsSnapshot(ops, period), [ops, period]);
  const incomeByClient = useMemo(
    () => buildIncomeByClientForPeriod(ops.payments ?? [], ops.projects, period),
    [ops.payments, ops.projects, period],
  );
  const incomeBySource = useMemo(
    () => buildIncomeSourceForPeriod(financial, snapshot.periodIncome, period),
    [financial, snapshot.periodIncome, period],
  );
  const moneyOutByCategory = useMemo(
    () => buildMoneyOutForPeriod(ops, period),
    [ops, period],
  );

  const clientIncomeTotal = incomeByClient.reduce((sum, row) => sum + row.amount, 0);
  const totalSpent = moneyOutByCategory.reduce((sum, row) => sum + row.amount, 0);
  const periodHint = period === "all" ? "All time" : `Last ${periodLabel(period)}`;

  if (loading) return <OperationsLoading />;

  const topClient = incomeByClient[0];
  const topExpense = moneyOutByCategory[0];

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Analytics"
        description="Cash flow, category splits, and client trends — filtered by time period."
        action={<AnalyticsPeriodFilter period={period} onPeriodChange={setPeriod} />}
      />

      <AnalyticsKpiGrid
        items={[
          {
            label: "Money in",
            value: formatINRWhole(snapshot.periodIncome),
            icon: ArrowDownRight,
            tone: "positive",
            hint: periodHint,
          },
          {
            label: "Money out",
            value: formatINRWhole(snapshot.periodExpenses),
            icon: ArrowUpRight,
            tone: "negative",
            hint:
              period === "all"
                ? "Baseline + logged (excl. handouts)"
                : `${periodHint} · incl. retainers`,
          },
          {
            label: "Net flow",
            value: formatINRWhole(snapshot.netFlow),
            icon: LineChart,
            tone: snapshot.netFlow >= 0 ? "positive" : "negative",
            hint: "Income minus money out",
          },
          {
            label: "Cash balance",
            value: formatFinancialINR(snapshot.cashBalance),
            icon: Wallet,
            tone: snapshot.cashBalance >= 0 ? "accent" : "negative",
            hint: "All-time position",
            to: "/accounts",
          },
          {
            label: "Active MRR",
            value: formatINRWhole(snapshot.activeMrr),
            icon: TrendingUp,
            tone: "accent",
            hint: "Started retainers / month",
            to: "/accounts",
          },
          {
            label: "Revenue booked",
            value: formatINRWhole(snapshot.revenueBooked),
            icon: Briefcase,
            tone: "neutral",
            hint: `${snapshot.activeProjects} active projects`,
            to: "/accounts/billing",
          },
          {
            label: "Future monthly",
            value: formatINRWhole(snapshot.futureMonthly),
            icon: Building2,
            tone: "neutral",
            hint: "Unstarted retainers",
            to: "/accounts/billing",
          },
          {
            label: "Proof coverage",
            value:
              snapshot.proofCoverage.total > 0
                ? `${snapshot.proofCoverage.pct}%`
                : "—",
            icon: ShieldCheck,
            tone: snapshot.proofCoverage.pct >= 80 ? "positive" : "neutral",
            hint:
              snapshot.proofCoverage.total > 0
                ? `${snapshot.proofCoverage.withProof} of ${snapshot.proofCoverage.total} payments`
                : "No payments in period",
            to: "/documents/payments/clients",
          },
        ]}
      />

      {(topClient || topExpense) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {topClient && topClient.amount > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-400/80">
                Top client · {periodHint}
              </p>
              <p className="mt-1 font-semibold text-foreground">{topClient.label}</p>
              <p className="text-sm tabular-nums text-emerald-400">{formatINRWhole(topClient.amount)}</p>
            </div>
          )}
          {topExpense && topExpense.amount > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-rose-400/80">
                Largest outflow · {periodHint}
              </p>
              <p className="mt-1 font-semibold text-foreground">{topExpense.label}</p>
              <p className="text-sm tabular-nums text-rose-400">{formatINRWhole(topExpense.amount)}</p>
            </div>
          )}
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
              <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Cash flow trend</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Money in vs money out by month — net line shows surplus or deficit.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">
            {periodHint}
          </span>
        </div>
        <LazyMonthlyChart ops={ops} period={period} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdownPanel
          title="Money in — by source"
          description={
            period === "all"
              ? "Baseline reconciliation plus new project payments."
              : "Project payments received in the selected period."
          }
          rows={incomeBySource}
          total={period === "all" ? financial.totalRevenueReceived : snapshot.periodIncome}
          tone="income"
          emptyMessage="No income recorded for this period."
          icon={ArrowDownRight}
        />
        <CategoryBreakdownPanel
          title="Money out — by category"
          description="Operating payouts logged in the period. Handouts excluded from cash balance."
          rows={moneyOutByCategory}
          total={totalSpent}
          tone="expense"
          emptyMessage="No expenses logged for this period."
          icon={ArrowUpRight}
        />
      </div>

      <CategoryBreakdownPanel
        title="Money in — by client"
        description="Payment installments grouped by client."
        rows={incomeByClient}
        total={clientIncomeTotal}
        tone="income"
        emptyMessage="No client payments in this period."
        icon={Users}
        maxRows={10}
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold tracking-tight">Explore further</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          Drill into ledgers, billing, and payment proofs.
        </p>
        <AnalyticsQuickLinks
          links={[
            {
              label: "Ongoing projects",
              description: "Active billing, booked value, and received amounts.",
              to: "/analytics/ongoing",
            },
            {
              label: "Accounts",
              description: "Income, expenses, assets, and monthly retainers.",
              to: "/accounts",
            },
            {
              label: "Billing details",
              description: "Full project billing ledger with search.",
              to: "/accounts/billing",
            },
            {
              label: "Payment proofs",
              description: "Client, partner, and vendor payment archives.",
              to: "/documents/payments/clients",
            },
          ]}
        />
      </section>
    </div>
  );
}
