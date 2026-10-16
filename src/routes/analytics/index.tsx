import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarRange,
  IndianRupee,
  Scale,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { ClientRevenueBreakdown } from "@/components/analytics/ClientRevenueBreakdown";
import { LazyMonthlyChart } from "@/components/analytics/LazyMonthlyChart";
import { SpendByCategoryBreakdown } from "@/components/analytics/SpendByCategoryBreakdown";
import {
  AnalyticsChapter,
  AnalyticsKpiGrid,
  AnalyticsPageHeader,
} from "@/components/analytics/analytics-ui";
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
  ledgerCashflowForPeriod,
  liveCashflowMonths,
  spendByCategoryForMonth,
  spendByCategoryForPeriod,
} from "@/lib/analytics";
import { buildClientRevenueBreakdown } from "@/lib/client-revenue-analytics";
import {
  ANALYTICS_RANGE_OPTIONS,
  calendarMonthKey,
  formatCalendarMonthLabel,
  periodLabel,
  type PeriodKey,
} from "@/lib/date-range-filter";
import { formatINRWhole } from "@/lib/invoice-calc";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analytics/")({
  component: AnalyticsPage,
});

type AnalyticsView =
  | { kind: "range"; period: "all" | "3mo" | "6mo" }
  | { kind: "month"; month: string };

function AnalyticsPage() {
  const { ops, loading } = useOperations();
  const monthOptions = useMemo(() => liveCashflowMonths(ops), [ops]);
  const [view, setView] = useState<AnalyticsView>({ kind: "range", period: "all" });

  const selectedMonth =
    view.kind === "month"
      ? monthOptions.includes(view.month)
        ? view.month
        : (monthOptions.at(-1) ?? calendarMonthKey())
      : null;

  const cashPeriod: PeriodKey = view.kind === "range" ? view.period : "all";
  const chartMonth = selectedMonth ?? undefined;

  const snapshot = useMemo(() => buildAnalyticsSnapshot(ops, "all"), [ops]);
  const cashFlow = useMemo(() => {
    if (selectedMonth) return ledgerCashflowForMonth(ops, selectedMonth);
    return ledgerCashflowForPeriod(ops, cashPeriod);
  }, [ops, selectedMonth, cashPeriod]);

  const spendByCategory = useMemo(() => {
    if (selectedMonth) return spendByCategoryForMonth(ops, selectedMonth);
    return spendByCategoryForPeriod(ops, cashPeriod);
  }, [ops, selectedMonth, cashPeriod]);

  const revenue = useMemo(
    () => buildClientRevenueBreakdown(ops.projects, undefined, ops.clients),
    [ops.projects, ops.clients],
  );

  const net = cashFlow.income - cashFlow.expenses;

  const rangeHint = selectedMonth
    ? formatCalendarMonthLabel(selectedMonth)
    : cashPeriod === "all"
      ? "All time"
      : `Last ${periodLabel(cashPeriod)}`;

  const selectRange = (period: "all" | "3mo" | "6mo") => {
    setView({ kind: "range", period });
  };

  const selectMonth = (month: string) => {
    setView({ kind: "month", month });
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-12">
      <div className="space-y-5">
        <AnalyticsPageHeader
          title="Analytics"
          description="Cash for the window you pick, then outlook and clients."
        />

        <div className="glass-panel flex flex-col gap-4 rounded-3xl border border-white/10 p-5 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              Time window
            </p>
            <p className="mt-0.5 text-sm font-bold text-white">{rangeHint}</p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <div
              className="glass-pill inline-flex flex-wrap gap-1 p-1 rounded-2xl border border-white/10"
              role="group"
              aria-label="Analytics time range"
            >
              {ANALYTICS_RANGE_OPTIONS.map((option) => {
                const active = view.kind === "range" && view.period === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectRange(option.value as "all" | "3mo" | "6mo")}
                    className={cn(
                      "rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all",
                      active
                        ? "bg-gradient-to-r from-[#ff6b2b] to-[#f04400] text-white shadow-md shadow-orange-500/25"
                        : "text-white/50 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <Select
              value={view.kind === "month" ? (selectedMonth ?? undefined) : undefined}
              onValueChange={selectMonth}
            >
              <SelectTrigger
                aria-label="Calendar month"
                className={cn(
                  "h-9 w-full min-w-[11rem] gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white shadow-none sm:w-auto hover:bg-white/10 transition-colors",
                  view.kind === "month" && "border-orange-500/50 bg-orange-500/10 text-white",
                )}
              >
                <SelectValue placeholder="Pick Month…" />
              </SelectTrigger>
              <SelectContent align="end" className="glass-panel border border-white/10 rounded-2xl p-1 shadow-2xl text-white">
                {monthOptions.map((value) => (
                  <SelectItem
                    key={value}
                    value={value}
                    className="rounded-xl text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
                  >
                    {formatCalendarMonthLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <AnalyticsChapter
        step="01"
        title="Cash activity"
        subtitle={`Money that moved in ${rangeHint.toLowerCase() === "all time" ? "all time" : rangeHint}.`}
      >
        <AnalyticsKpiGrid
          className="xl:grid-cols-3"
          items={[
            {
              label: "Money in",
              value: formatINRWhole(cashFlow.income),
              icon: ArrowDownRight,
              tone: "positive",
            },
            {
              label: "Money out",
              value: formatINRWhole(cashFlow.expenses),
              icon: ArrowUpRight,
              tone: "negative",
            },
            {
              label: "Net",
              value: formatINRWhole(net),
              icon: Scale,
              tone: net >= 0 ? "positive" : "negative",
              hint: net >= 0 ? "Surplus" : "Deficit",
            },
          ]}
        />
        <div className="space-y-3 border-t border-border/80 pt-4">
          <p className="text-xs font-medium text-muted-foreground">Weekly cash flow</p>
          <LazyMonthlyChart ops={ops} period={cashPeriod} month={chartMonth} />
        </div>
      </AnalyticsChapter>

      <AnalyticsChapter
        step="02"
        title="Spend mix"
        subtitle={`Where money out went · ${rangeHint}.`}
      >
        <SpendByCategoryBreakdown rows={spendByCategory} monthLabel={rangeHint} embedded />
      </AnalyticsChapter>

      <AnalyticsChapter
        step="03"
        title="Business outlook"
        subtitle="Live retainers and FY booking — not limited by the time window."
      >
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
              label: "FY retainer left",
              value: formatINRWhole(revenue.totalFyRemaining),
              icon: CalendarRange,
              tone: "accent",
              hint: "Through 31 Mar",
            },
          ]}
        />
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
              label: "Booked + FY retainer",
              value: formatINRWhole(revenue.totalRevenue),
              icon: IndianRupee,
              tone: "positive",
            },
          ]}
        />
      </AnalyticsChapter>

      <AnalyticsChapter
        step="04"
        title="Revenue by client"
        subtitle={`FY ${revenue.financialYear} · booked plus retainer outlook.`}
      >
        <ClientRevenueBreakdown projects={ops.projects} clients={ops.clients} embedded />
      </AnalyticsChapter>
    </div>
  );
}
