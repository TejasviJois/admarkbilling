import { formatFinancialINR, type FinancialSummary } from "@/lib/financial";

export function FinancialSummaryPanel({
  summary,
  compact,
}: {
  summary: FinancialSummary;
  compact?: boolean;
}) {
  const rows: Array<{ label: string; value: number; tone?: "positive" | "negative" | "neutral" }> = [
    { label: "Total revenue booked", value: summary.totalRevenueBooked, tone: "positive" },
    { label: "Total handouts taken (company loan)", value: summary.totalHandoutsTaken, tone: "neutral" },
    { label: "Total revenue received", value: summary.totalRevenueReceived, tone: "positive" },
    { label: "Founder salaries", value: summary.founderPayoutPool, tone: "negative" },
    { label: "External payouts (vendors & partners)", value: summary.totalExternalPayouts, tone: "negative" },
    { label: "Company expenses", value: summary.totalCompanyExpenses, tone: "negative" },
    { label: "Total expense", value: summary.totalExpense, tone: "negative" },
    {
      label: "Current cash balance",
      value: summary.currentCashBalance,
      tone: summary.currentCashBalance >= 0 ? "positive" : "negative",
    },
  ];

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-foreground">
          {compact ? "Financial summary" : summary.baseline.periodLabel}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Historical baseline through {summary.baseline.asOfDate} (no proof required). New entries
          after this date require proof.
        </p>
      </div>
      <dl className={compact ? "divide-y divide-border" : "grid gap-0 sm:grid-cols-2"}>
        {rows.map((row) => (
          <div
            key={row.label}
            className={
              compact
                ? "flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5"
                : "flex items-center justify-between gap-4 border-b border-border px-4 py-3 last:border-b-0 sm:px-5 sm:[&:nth-last-child(-n+2)]:border-b-0 sm:odd:border-r sm:odd:border-border"
            }
          >
            <dt className="text-sm text-muted-foreground">{row.label}</dt>
            <dd
              className={`shrink-0 text-sm font-semibold tabular-nums ${
                row.tone === "positive"
                  ? "text-emerald-400"
                  : row.tone === "negative"
                    ? "text-rose-400"
                    : "text-foreground"
              }`}
            >
              {formatFinancialINR(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
