import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarRange,
  IndianRupee,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ClientRevenueBreakdown } from "@/components/analytics/ClientRevenueBreakdown";
import { LazyMonthlyChart } from "@/components/analytics/LazyMonthlyChart";
import { AnalyticsKpiGrid, AnalyticsKpiSection, AnalyticsPageHeader } from "@/components/analytics/analytics-ui";
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
import { buildClientRevenueBreakdown } from "@/lib/client-revenue-analytics";
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
  const revenue = useMemo(
    () => buildClientRevenueBreakdown(ops.projects, undefined, ops.clients),
    [ops.projects, ops.clients],
  );
  const monthHint = formatCalendarMonthLabel(selectedMonth);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <AnalyticsPageHeader title="Analytics" />

      <AnalyticsKpiSection title="Monthly analytics">
        <AnalyticsKpiGrid
          className="xl:grid-cols-2"
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
              hint: monthHint,
            },
          ]}
        />
      </AnalyticsKpiSection>

      <AnalyticsKpiSection title="Recurring revenue">
        <AnalyticsKpiGrid
          className="xl:grid-cols-3"
          items={[
            {
              label: "Active MRR",
              value: formatINRWhole(snapshot.activeMrr),
              icon: TrendingUp,
              tone: "accent",
              hint: "Live retainers",
              to: "/accounts/retainers",
            },
            {
              label: "Future monthly",
              value: formatINRWhole(snapshot.futureMonthly),
              icon: Building2,
              tone: "neutral",
              hint: "Not started",
              to: "/accounts/retainers",
            },
            {
              label: "FY retainer",
              value: formatINRWhole(revenue.totalFyRemaining),
              icon: CalendarRange,
              tone: "accent",
              hint: "Through 31 Mar",
            },
          ]}
        />
      </AnalyticsKpiSection>

      <AnalyticsKpiSection title="Total">
        <AnalyticsKpiGrid
          className="xl:grid-cols-2"
          items={[
            {
              label: "Booked",
              value: formatINRWhole(revenue.totalBooked),
              icon: Wallet,
              hint: `FY ${revenue.financialYear}`,
            },
            {
              label: "Total",
              value: formatINRWhole(revenue.totalRevenue),
              icon: IndianRupee,
              tone: "positive",
              hint: "Booked + FY retainer",
            },
          ]}
        />
      </AnalyticsKpiSection>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <BarChart3 className="h-4 w-4 text-primary" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold tracking-tight">Cash flow</h2>
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
          </div>
        </div>
        <LazyMonthlyChart ops={ops} period={period} month={selectedMonth} />
      </section>

      <ClientRevenueBreakdown projects={ops.projects} clients={ops.clients} />
    </div>
  );
}
