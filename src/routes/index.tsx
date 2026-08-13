import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Briefcase,
  ArrowUpRight,
  Activity,
  FileText,
  CalendarDays,
  Clock3,
  Phone,
  BellRing,
} from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import { computeFinancialSummary } from "@/lib/financial";
import { formatINRWhole } from "@/lib/invoice-calc";
import { sumActiveMrr } from "@/lib/project-billing";
import { estimatedPending } from "@/lib/project-payments";
import { isRevenueProject } from "@/lib/project-status";
import {
  formatScheduleDateTime,
  isUpcomingScheduleEvent,
  scheduleReminderState,
  sortScheduleEvents,
} from "@/lib/schedule";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: ExecutiveDashboard });

function ExecutiveDashboard() {
  const { ops, loading: opsLoading } = useOperations();
  const [mounted, setMounted] = useState(false);
  const [hasRendered, setHasRendered] = useState(false);
  const [reminderClock, setReminderClock] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setReminderClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loading = opsLoading;

  useEffect(() => {
    if (mounted && !loading) setHasRendered(true);
  }, [mounted, loading]);
  const upcomingSchedule = useMemo(() => {
    const now = new Date(reminderClock);
    return sortScheduleEvents(
      (ops.scheduleEvents ?? []).filter((event) => isUpcomingScheduleEvent(event, now)),
    ).slice(0, 5);
  }, [ops.scheduleEvents, reminderClock]);

  // Dynamic calculations
  const dashboardData = useMemo(() => {
    if (!ops) return null;

    // Historical rows (Ground Zero imports) are context only — never re-summed.
    const transactions = (ops.transactions ?? []).filter((t) => !t.historical);
    const projects = ops.projects ?? [];
    // 1. Core KPIs — baseline (Ground Zero Excel) + post-migration transactions.
    const financial = computeFinancialSummary(ops);
    const cashBalance = financial.currentCashBalance;
    const revenue = financial.totalRevenueReceived;
    const expenses = financial.totalExpense;

    const revenueBooked = financial.totalRevenueBooked;

    const outstandingReceivables = projects
      .filter((project) => isRevenueProject(project.status))
      .reduce((sum, project) => sum + estimatedPending(project), 0);

    const activeMrr = sumActiveMrr(projects);

    // 2. Recent Payments
    const recentPayments = transactions
      .filter((t) => t.type === "client_payment")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);

    // 4. Monthly Revenue & Profit Chart — Dashboard is fixed to the last 3 months;
    // the Analytics page covers the complete all-time history.
    const monthKeys = Array.from({ length: 3 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      return d.toISOString().slice(0, 7); // YYYY-MM
    }).reverse();

    const monthlyChartData = monthKeys.map((mKey) => {
      const monthPayments = transactions.filter(
        (t) => t.type === "client_payment" && t.date.startsWith(mKey),
      );
      const monthExpenses = transactions.filter(
        (t) => t.type === "expense" && t.date.startsWith(mKey),
      );

      const rev = monthPayments.reduce((s, t) => s + t.amount, 0);
      const exp = monthExpenses.reduce((s, t) => s + t.amount, 0);
      const profit = rev - exp;

      const parts = mKey.split("-");
      const label = new Date(Number(parts[0]), Number(parts[1]) - 1).toLocaleString("default", {
        month: "short",
      });

      return {
        label,
        revenue: rev,
        expenses: exp,
        profit,
      };
    });

    // Max value for chart scaling
    const maxChartValue = Math.max(
      ...monthlyChartData.map((d) => Math.max(d.revenue, d.expenses)),
      10000,
    );

    return {
      cashBalance,
      revenue,
      expenses,
      revenueBooked,
      outstandingReceivables,
      activeMrr,
      recentPayments,
      monthlyChartData,
      maxChartValue,
    };
  }, [ops]);

  // Never remount the whole dashboard for background refetches/prefetches.
  // Remounting under the cursor re-fires intent preload and causes a click-blocking loop.
  if ((!mounted || loading || !dashboardData) && !hasRendered) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Activity className="mr-2 h-5 w-5 animate-spin text-primary" />
        Loading dashboard…
      </div>
    );
  }

  // Cannot happen in practice (ops is always set once loaded) — this narrows the
  // type without ever showing the click-blocking loading overlay again.
  if (!dashboardData) return null;

  return (
    <div className="space-y-6">
      {/* Header Welcome banner */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            Business Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time financial status, pipeline forecasts, and operational analytics.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Link to="/invoices">
            <Button size="sm" variant="outline">
              <FileText className="mr-1.5 h-4 w-4" /> Invoices
            </Button>
          </Link>
          <Link to="/leads">
            <Button
              size="sm"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              <TrendingUp className="mr-1.5 h-4 w-4" /> Sales Pipeline
            </Button>
          </Link>
        </div>
      </div>

      {/* Row 1: Premium Financial KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Cash Balance */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Cash Balance</span>
            <IndianRupee className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.cashBalance)}
          </p>
          <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1 font-semibold">
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> Total Liquid Capital
          </div>
        </div>

        {/* Revenue */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Revenue</span>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.revenue)}
          </p>
          <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
            Verified Payments Collected
          </div>
        </div>

        {/* Expenses */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Expenses</span>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.expenses)}
          </p>
          <div className="mt-2 text-[10px] text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
            Category Expenditures
          </div>
        </div>

        {/* Revenue Booked */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Revenue Booked</span>
            <Briefcase className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.revenueBooked)}
          </p>
          <div className="mt-2 text-[10px] text-primary flex items-center gap-1 font-semibold">
            Contracts + recurring revenue received
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding</span>
            <FileText className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.outstandingReceivables)}
          </p>
          <div className="mt-2 text-[10px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-semibold">
            Outstanding client balances
          </div>
        </div>

        {/* Active MRR */}
        <Link
          to="/accounts/retainers"
          className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:border-primary/30 hover:shadow-md transition-all"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Active MRR</span>
            <TrendingUp className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">
            {formatINRWhole(dashboardData.activeMrr)}
          </p>
          <div className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-semibold">
            Started retainers / month
          </div>
        </Link>
      </div>

      {/* Meetings, calls, and follow-up reminders */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Meetings, Calls & Reminders</h2>
              <p className="text-xs text-muted-foreground">
                Upcoming schedules and follow-ups (e.g. call a client after a date)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/reminders">
              <Button size="sm" variant="outline">
                Reminders
              </Button>
            </Link>
            <Link to="/calendar">
              <Button size="sm" variant="outline">
                Open Calendar
              </Button>
            </Link>
          </div>
        </div>

        {upcomingSchedule.length === 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              No upcoming meetings, calls, or reminders.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/reminders"
                search={{ new: true }}
                className="text-xs font-bold text-primary hover:underline"
              >
                Add a reminder
              </Link>
              <Link
                to="/calendar"
                search={{ new: true }}
                className="text-xs font-bold text-primary hover:underline"
              >
                Create a schedule
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcomingSchedule.map((event) => {
              const reminderState = scheduleReminderState(event, new Date(reminderClock));
              const href = event.type === "reminder" ? "/reminders" : "/calendar";
              return (
                <Link
                  key={event.id}
                  to={href}
                  className={`rounded-lg border bg-card p-3 transition-colors hover:border-primary/50 ${
                    reminderState === "due"
                      ? "border-rose-500/50 ring-1 ring-rose-500/20"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-foreground">{event.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {event.type === "call" ? (
                          <Phone className="h-3 w-3" />
                        ) : event.type === "reminder" ? (
                          <BellRing className="h-3 w-3" />
                        ) : (
                          <CalendarDays className="h-3 w-3" />
                        )}
                        {event.type === "call"
                          ? "Call"
                          : event.type === "reminder"
                            ? "Reminder"
                            : "Meeting"}
                        {event.contact ? ` · ${event.contact}` : ""}
                      </p>
                    </div>
                    {reminderState === "due" && (
                      <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-rose-600">
                        Due
                      </span>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-primary">
                    <Clock3 className="h-3.5 w-3.5" />
                    {formatScheduleDateTime(event)}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Row 2: Charts & recent activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Revenue Chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
            <span>Monthly Revenue Trend</span>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">
              Last 3 Months
            </span>
          </h2>

          {/* Visual HTML Bar Chart */}
          <div className="mt-6 flex h-40 items-end justify-between gap-2.5 px-2">
            {dashboardData.monthlyChartData.map((d) => {
              const heightPercent = Math.round((d.revenue / dashboardData.maxChartValue) * 100);
              return (
                <div
                  key={d.label}
                  className="flex-1 flex flex-col items-center gap-2 group cursor-pointer"
                >
                  <div className="w-full relative flex items-end justify-center h-28">
                    {/* Revenue Bar */}
                    <div
                      className="w-4 bg-primary rounded-t transition-all duration-300 group-hover:bg-primary/80"
                      style={{ height: `${Math.max(4, heightPercent)}%` }}
                      title={`Revenue: ${formatINRWhole(d.revenue)}`}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground">{d.label}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex justify-center gap-6 text-[10px] font-bold text-muted-foreground border-t border-border/40 pt-3">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded bg-primary" /> Revenue (INR)
            </span>
          </div>
        </div>

        {/* Recent Payments Logs */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
            <span>Recent Payments</span>
            <Link
              to="/accounts"
              hash="transactions"
              className="text-[10px] text-primary hover:underline font-bold uppercase"
            >
              Ledger
            </Link>
          </h2>

          <div className="mt-4 space-y-3">
            {dashboardData.recentPayments.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                No payment transactions found.
              </p>
            ) : (
              dashboardData.recentPayments.map((pay) => (
                <div
                  key={pay.id}
                  className="flex justify-between items-center text-xs border-b border-border/40 pb-2.5"
                >
                  <div>
                    <p className="font-bold text-foreground leading-snug">{pay.description}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">
                      {pay.date} &middot; {pay.paymentMethod.toUpperCase()}
                    </p>
                  </div>
                  <span className="font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{formatINRWhole(pay.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
