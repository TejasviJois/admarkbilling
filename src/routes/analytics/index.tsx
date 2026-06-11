import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, ChevronRight, IndianRupee, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { MonthlyIncomeExpenseChart } from "@/components/analytics/MonthlyChart";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import {
  buildMonthlyChart,
  sumActiveMrr,
  sumAllProjectIncome,
  sumFutureMonthlyPipeline,
} from "@/lib/analytics";
import {
  EXPENSE_CATEGORY_DESCRIPTIONS,
  EXPENSE_CATEGORY_LABELS,
  computeFinancialSummary,
  formatFinancialINR,
} from "@/lib/financial";

export const Route = createFileRoute("/analytics/")({ component: AnalyticsPage });

function AnalyticsPage() {
  const { ops, loading } = useOperations();
  const financial = computeFinancialSummary(ops);
  const projectPayments = sumAllProjectIncome(ops.projects);
  const activeMrr = sumActiveMrr(ops.projects);
  const futureMonthly = sumFutureMonthlyPipeline(ops.projects);
  const chartData = useMemo(() => buildMonthlyChart(ops), [ops]);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Analytics
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-[15px]">
          Cash position, money out by category, and project billing — structured the way you track
          it in your books.
        </p>
      </div>

      {/* Cash position */}
      <section>
        <SectionHeading
          icon={<IndianRupee className="h-5 w-5 text-emerald-400" />}
          title="Cash position"
          description="Revenue received minus operating payouts. Handouts (company loan) are tracked separately."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <MetricCard
            to="/analytics/balance"
            label="Cash balance"
            value={formatFinancialINR(financial.currentCashBalance)}
            tone={financial.currentCashBalance >= 0 ? "positive" : "negative"}
          />
          <MetricCard
            to="/analytics/income"
            label="Revenue received"
            value={formatFinancialINR(financial.totalRevenueReceived)}
            tone="positive"
            hint={`${formatFinancialINR(financial.baseline.totalRevenueReceived)} baseline + new`}
          />
          <MetricCard
            to="/analytics/balance"
            label="Total money out"
            value={formatFinancialINR(financial.totalExpense)}
            tone="negative"
          />
        </div>
      </section>

      {/* Money out */}
      <section>
        <SectionHeading
          icon={<TrendingDown className="h-5 w-5 text-rose-400" />}
          title="Money out"
          description="Three buckets — baseline totals plus any new entries logged with proof."
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <ExpenseBucket
            to="/analytics/expenses"
            label={EXPENSE_CATEGORY_LABELS.company}
            description={EXPENSE_CATEGORY_DESCRIPTIONS.company}
            amount={financial.totalCompanyExpenses}
          />
          <ExpenseBucket
            to="/analytics/expenses"
            label={EXPENSE_CATEGORY_LABELS.founder_payout}
            description={EXPENSE_CATEGORY_DESCRIPTIONS.founder_payout}
            amount={financial.founderPayoutPool}
          />
          <ExpenseBucket
            to="/analytics/expenses"
            label={EXPENSE_CATEGORY_LABELS.external_payout}
            description={EXPENSE_CATEGORY_DESCRIPTIONS.external_payout}
            amount={financial.totalExternalPayouts}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Company handouts (loan): {formatFinancialINR(financial.totalHandoutsTaken)} — not
          subtracted from cash balance.{" "}
          <Link to="/analytics/balance" className="text-primary hover:underline">
            View full breakdown
          </Link>
        </p>
      </section>

      {/* Project billing */}
      <section>
        <SectionHeading
          icon={<TrendingUp className="h-5 w-5 text-sky-400" />}
          title="Project billing"
          description="Upfront counts now. Monthly retainers count only after their start date is set."
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            to="/analytics/revenue"
            label="Revenue booked"
            value={formatFinancialINR(financial.totalRevenueBooked)}
            tone="neutral"
            hint="Upfront + started fixed-term monthly"
          />
          <MetricCard
            to="/analytics/revenue"
            label="Future monthly (not started)"
            value={formatFinancialINR(futureMonthly)}
            tone="neutral"
            hint="Safe Wheels, Spice Trip, etc."
          />
          <MetricCard
            to="/analytics/revenue"
            label="Active MRR"
            value={formatFinancialINR(activeMrr)}
            tone="positive"
            hint="Ongoing retainers already started"
          />
          <MetricCard
            to="/analytics/income"
            label="Payments logged"
            value={formatFinancialINR(projectPayments)}
            tone="neutral"
            hint="All project installments in system"
          />
        </div>
      </section>

      {/* Chart */}
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex items-start gap-3">
          <BarChart3 className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold tracking-tight">New activity by month</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Project payments and logged expenses after the baseline — grouped by month.
            </p>
          </div>
        </div>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No post-baseline activity yet to chart.
          </p>
        ) : (
          <MonthlyIncomeExpenseChart ops={ops} />
        )}
      </section>
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function MetricCard({
  to,
  label,
  value,
  tone,
  hint,
}: {
  to: string;
  label: string;
  value: string;
  tone: "positive" | "negative" | "neutral";
  hint?: string;
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-rose-400"
        : "text-foreground";
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <p className={`mt-2 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${toneClass}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        Details
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}

function ExpenseBucket({
  to,
  label,
  description,
  amount,
}: {
  to: string;
  label: string;
  description: string;
  amount: number;
}) {
  return (
    <Link
      to={to}
      className="group block rounded-lg border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start gap-2">
        <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-rose-400/80" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      <p className="mt-4 text-xl font-semibold tabular-nums text-rose-400">{formatFinancialINR(amount)}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
        View ledger
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </Link>
  );
}
