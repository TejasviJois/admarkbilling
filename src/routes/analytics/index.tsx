import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  TrendingUp,
  Users,
} from "lucide-react";
import { CategoryBreakdownPanel } from "@/components/analytics/CategoryBreakdownPanel";
import { LazyMonthlyChart } from "@/components/analytics/LazyMonthlyChart";
import {
  AnalyticsKpiGrid,
  AnalyticsPageHeader,
} from "@/components/analytics/analytics-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  buildAnalyticsSnapshot,
  buildIncomeByClientForPeriod,
  buildIncomeSourceForPeriod,
  buildMoneyOutForPeriod,
} from "@/lib/analytics";
import type { PeriodKey } from "@/lib/date-range-filter";
import { computeFinancialSummary } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/analytics/")({
  component: AnalyticsPage,
});

// Analytics is fixed to the complete history — the Dashboard covers recent months.
const period: PeriodKey = "all";

function AnalyticsPage() {
  const { ops, loading } = useOperations();

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
  const moneyOutByCategory = useMemo(() => buildMoneyOutForPeriod(ops, period), [ops, period]);

  const clientIncomeTotal = incomeByClient.reduce((sum, row) => sum + row.amount, 0);
  const totalSpent = moneyOutByCategory.reduce((sum, row) => sum + row.amount, 0);
  const periodHint = "All time";

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Analytics"
        description="Complete cash flow history, category splits, and client trends — all time."
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
            hint: "Baseline + logged (excl. handouts)",
          },
          {
            label: "Active MRR",
            value: formatINRWhole(snapshot.activeMrr),
            icon: TrendingUp,
            tone: "accent",
            hint: "Started retainers / month",
            to: "/accounts/retainers",
          },
          {
            label: "Future monthly",
            value: formatINRWhole(snapshot.futureMonthly),
            icon: Building2,
            tone: "neutral",
            hint: "Unstarted retainers",
            to: "/accounts/retainers",
          },
        ]}
      />

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
          description="Baseline reconciliation plus new project payments."
          rows={incomeBySource}
          total={financial.totalRevenueReceived}
          tone="income"
          emptyMessage="No income recorded for this period."
          icon={ArrowDownRight}
        />
        <CategoryBreakdownPanel
          title="Money out — by category"
          description="Operating payouts logged in the period. Handout loans are not outflows — they're repaid monthly via EMI."
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

    </div>
  );
}
