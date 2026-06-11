import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AnalyticsPageHeader,
  AnalyticsSummaryCards,
  AnalyticsTableSection,
} from "@/components/analytics/analytics-ui";
import { FinancialSummaryPanel } from "@/components/operations/FinancialSummaryPanel";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { ongoingRevenueRows, sumAllProjectIncome } from "@/lib/analytics";
import { computeFinancialSummary, formatFinancialINR } from "@/lib/financial";

export const Route = createFileRoute("/analytics/balance")({ component: AnalyticsBalancePage });

function AnalyticsBalancePage() {
  const { ops, loading } = useOperations();

  const financial = computeFinancialSummary(ops);
  const totalIncome = sumAllProjectIncome(ops.projects);
  const revenueRows = ongoingRevenueRows(ops.projects);
  const pipelinePending = revenueRows.reduce((s, r) => s + (r.pending ?? 0), 0);

  const rows = useMemo(
    () => [
      {
        label: "Total revenue booked (ongoing pipeline)",
        amount: financial.totalRevenueBooked,
        tone: "neutral" as const,
      },
      {
        label: "Total handouts taken (company loan)",
        amount: financial.totalHandoutsTaken,
        tone: "neutral" as const,
      },
      {
        label: "Total revenue received",
        amount: financial.totalRevenueReceived,
        tone: "positive" as const,
      },
      {
        label: "Total external payouts",
        amount: financial.totalExternalPayouts,
        tone: "negative" as const,
      },
      {
        label: "Total company expenses",
        amount: financial.totalCompanyExpenses,
        tone: "negative" as const,
      },
      {
        label: "Founder payout pool",
        amount: financial.founderPayoutPool,
        tone: "negative" as const,
      },
      {
        label: "Total expense",
        amount: financial.totalExpense,
        tone: "negative" as const,
      },
      {
        label: "Current cash balance",
        amount: financial.currentCashBalance,
        tone: financial.currentCashBalance >= 0 ? ("positive" as const) : ("negative" as const),
      },
      {
        label: "Project payments logged (all time)",
        amount: totalIncome,
        tone: "neutral" as const,
      },
      {
        label: "Pending from ongoing projects",
        amount: pipelinePending,
        tone: "neutral" as const,
      },
    ],
    [financial, totalIncome, pipelinePending],
  );

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Cash balance"
        description="Historical baseline plus new logged expenses. Cash balance = revenue received − total expense."
      />
      <AnalyticsSummaryCards
        items={[
          {
            label: "Cash balance",
            value: formatFinancialINR(financial.currentCashBalance),
            tone: financial.currentCashBalance >= 0 ? "positive" : "negative",
          },
          {
            label: "Revenue received",
            value: formatFinancialINR(financial.totalRevenueReceived),
            tone: "positive",
          },
          {
            label: "Total expense",
            value: formatFinancialINR(financial.totalExpense),
            tone: "negative",
          },
        ]}
      />
      <FinancialSummaryPanel summary={financial} compact />
      <AnalyticsTableSection
        title="Breakdown"
        description="How cash balance is calculated from baseline and new entries."
        headers={["Item", "Amount"]}
        rows={rows.map((r) => [
          r.label,
          <span
            key={r.label}
            className={`font-semibold tabular-nums ${
              r.tone === "positive"
                ? "text-emerald-300"
                : r.tone === "negative"
                  ? "text-rose-400"
                  : "text-foreground"
            }`}
          >
            {formatFinancialINR(r.amount)}
          </span>,
        ])}
        emptyMessage="No data."
      />
    </div>
  );
}
