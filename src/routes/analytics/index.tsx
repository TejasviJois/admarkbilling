import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, BarChart3, Building2, TrendingUp } from "lucide-react";
import { LazyMonthlyChart } from "@/components/analytics/LazyMonthlyChart";
import { AnalyticsKpiGrid, AnalyticsPageHeader } from "@/components/analytics/analytics-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperations } from "@/hooks/use-operations";
import {
  buildAnalyticsSnapshot,
  ledgerCashflowForMonth,
  liveCashflowMonths,
} from "@/lib/analytics";
import {
  calendarMonthKey,
  formatCalendarMonthLabel,
  type PeriodKey,
} from "@/lib/date-range-filter";
import { formatINRWhole } from "@/lib/invoice-calc";

export const Route = createFileRoute("/analytics/")({
  component: AnalyticsPage,
});

const period: PeriodKey = "all";

function AnalyticsPage() {
  const { ops, loading } = useOperations();
  const monthOptions = useMemo(() => liveCashflowMonths(ops), [ops]);
  const [month, setMonth] = useState(() => calendarMonthKey());
  const selectedMonth = monthOptions.includes(month) ? month : (monthOptions.at(-1) ?? month);

  const snapshot = useMemo(() => buildAnalyticsSnapshot(ops, period), [ops]);
  const monthFlow = useMemo(() => ledgerCashflowForMonth(ops, selectedMonth), [ops, selectedMonth]);
  const monthHint = formatCalendarMonthLabel(selectedMonth);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader
        title="Analytics"
        description="Cash flow by week for the selected month. Click a bar to see names."
      />

      <AnalyticsKpiGrid
        items={[
          {
            label: "Money in",
            value: formatINRWhole(monthFlow.income),
            icon: ArrowDownRight,
            tone: "positive",
            hint: monthHint,
          },
          {
            label: "Money out",
            value: formatINRWhole(monthFlow.expenses),
            icon: ArrowUpRight,
            tone: "negative",
            hint: "Logged ledger (excl. handouts)",
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
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Cash flow trend</h2>
              <Select value={selectedMonth} onValueChange={setMonth}>
                <SelectTrigger
                  id="analytics-month"
                  aria-label="Month"
                  className="h-7 w-auto shrink-0 gap-1.5 rounded-full border-border bg-muted/50 px-3 text-xs font-medium text-foreground shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="bg-popover text-foreground">
                  {monthOptions.map((value) => (
                    <SelectItem
                      key={value}
                      value={value}
                      className="text-foreground focus:bg-accent focus:text-foreground"
                    >
                      {formatCalendarMonthLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Money in vs money out by week — click a bar to see names. Weeks that cross months are
              shown in full in both months.
            </p>
          </div>
        </div>
        <LazyMonthlyChart ops={ops} period={period} month={selectedMonth} />
      </section>
    </div>
  );
}
