import { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  Users,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  FileText,
  Percent,
  ListTodo,
  CalendarDays,
  Clock3,
  Phone,
} from "lucide-react";
import { useOperations } from "@/hooks/use-operations";
import { useInvoices } from "@/hooks/use-invoices";
import { computeFinancialSummary } from "@/lib/financial";
import {
  formatINR,
  formatINRWhole,
  computeTotals,
  calculateInvoicePayments,
} from "@/lib/invoice-calc";
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
  const { invoices, loading: invoicesLoading } = useInvoices();
  const [mounted, setMounted] = useState(false);
  const [reminderClock, setReminderClock] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const timer = window.setInterval(() => setReminderClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loading = opsLoading || invoicesLoading;
  const upcomingSchedule = useMemo(() => {
    const now = new Date(reminderClock);
    return sortScheduleEvents(
      (ops.scheduleEvents ?? []).filter((event) => isUpcomingScheduleEvent(event, now)),
    ).slice(0, 5);
  }, [ops.scheduleEvents, reminderClock]);

  // Dynamic calculations
  const dashboardData = useMemo(() => {
    if (!ops) return null;

    const transactions = ops.transactions ?? [];
    const projects = ops.projects ?? [];
    const leads = ops.leads ?? [];
    const payments = ops.payments ?? [];

    // 1. Core KPIs
    const financial = computeFinancialSummary(ops);
    const cashBalance = financial.currentCashBalance;

    const revenue = transactions
      .filter((t) => t.type === "client_payment")
      .reduce((sum, t) => sum + t.amount, 0);

    const expenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => sum + t.amount, 0);

    const netProfit = revenue - expenses;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    const outstandingReceivables = invoices.reduce((sum, inv) => {
      const { outstandingBalance } = calculateInvoicePayments(inv, payments);
      return sum + outstandingBalance;
    }, 0);

    // 2. Upcoming Payments / Milestone Targets
    const upcomingPayments = projects.reduce((sum, p) => {
      const ms = p.milestones ?? [];
      const pendingMilestonesValue = ms.filter(
        (m) => m.status !== "completed" && m.paymentTrigger,
      ).length;

      // Pro-rate upcoming from remaining budget
      const received = transactions
        .filter((t) => t.relatedProjectId === p.id && t.type === "client_payment")
        .reduce((s, t) => s + t.amount, 0);
      const remaining = Math.max(0, (p.budget || 0) - received);

      return sum + (pendingMilestonesValue > 0 ? remaining : 0);
    }, 0);

    // 3. Active Projects & Margins
    const activeProjectsList = projects.filter((p) => p.status === "active");
    const activeProjectsCount = activeProjectsList.length;

    const projectProfit = activeProjectsList.reduce((sum, p) => {
      const budget = p.budget || 0;
      const projectTxs = transactions.filter((t) => t.relatedProjectId === p.id);
      const projectExpenses = projectTxs
        .filter((t) => t.type === "expense")
        .reduce((s, t) => s + t.amount, 0);
      const estimated = p.estimatedCost || 0;
      return sum + (budget - projectExpenses - estimated);
    }, 0);

    // 4. Sales Pipeline Forecast
    const activeDeals = leads.filter((l) => l.status !== "won" && l.status !== "lost");
    const pipelineValue = activeDeals.reduce((sum, l) => sum + (l.expectedRevenue || 0), 0);
    const weightedPipeline = activeDeals.reduce((sum, l) => {
      const prob = l.probability != null ? l.probability : 50;
      return sum + (l.expectedRevenue || 0) * (prob / 100);
    }, 0);

    // 5. Today's Milestone Tasks
    const upcomingTasks = projects
      .flatMap((p) => (p.milestones ?? []).map((m) => ({ ...m, projectName: p.client })))
      .filter((m) => m.status !== "completed")
      .sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 5);

    // 6. Recent Payments
    const recentPayments = transactions
      .filter((t) => t.type === "client_payment")
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 4);

    // 7. Monthly Revenue & Profit Chart (Last 6 Months)
    const monthKeys = Array.from({ length: 6 }, (_, i) => {
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

    // 8. Expense Category Allocation
    const expenseCategoriesMap: Record<string, number> = {};
    const totalExpenses = transactions
      .filter((t) => t.type === "expense")
      .reduce((sum, t) => {
        const cat = t.category || "Miscellaneous";
        expenseCategoriesMap[cat] = (expenseCategoriesMap[cat] || 0) + t.amount;
        return sum + t.amount;
      }, 0);

    const expenseBreakdown = Object.entries(expenseCategoriesMap)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 9. Top Clients by Revenue
    const clientRevenueMap: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type === "client_payment") {
        const clientName =
          t.description.replace("Payment from ", "").split(" (")[0] || "General Client";
        clientRevenueMap[clientName] = (clientRevenueMap[clientName] || 0) + t.amount;
      }
    }

    const topClients = Object.entries(clientRevenueMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    return {
      cashBalance,
      revenue,
      expenses,
      netProfit,
      profitMargin,
      outstandingReceivables,
      upcomingPayments,
      activeProjectsCount,
      projectProfit,
      pipelineValue,
      weightedPipeline,
      upcomingTasks,
      recentPayments,
      monthlyChartData,
      maxChartValue,
      expenseBreakdown,
      topClients,
    };
  }, [ops, invoices]);

  if (!mounted || loading || !dashboardData) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        <Activity className="mr-2 h-5 w-5 animate-spin text-primary" />
        Loading dashboard…
      </div>
    );
  }

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

      {/* Meetings and calls reminder strip */}
      <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-foreground">Meetings & Calls</h2>
              <p className="text-xs text-muted-foreground">Your next scheduled reminders</p>
            </div>
          </div>
          <Link to="/calendar">
            <Button size="sm" variant="outline">
              Open Calendar
            </Button>
          </Link>
        </div>

        {upcomingSchedule.length === 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-background/60 px-4 py-3">
            <p className="text-xs text-muted-foreground">No upcoming meetings or calls.</p>
            <Link to="/calendar" className="text-xs font-bold text-primary hover:underline">
              Create a schedule
            </Link>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {upcomingSchedule.map((event) => {
              const reminderState = scheduleReminderState(event, new Date(reminderClock));
              return (
                <Link
                  key={event.id}
                  to="/calendar"
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
                        ) : (
                          <CalendarDays className="h-3 w-3" />
                        )}
                        {event.type === "call" ? "Call" : "Meeting"}
                        {event.contact ? ` · ${event.contact}` : ""}
                      </p>
                    </div>
                    {reminderState === "due" && (
                      <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase text-rose-600">
                        Reminder
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

      {/* Row 1: Premium Financial KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Cash Balance */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Cash Balance</span>
            <DollarSign className="h-5 w-5 text-emerald-500" />
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

        {/* Net Profit */}
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-sm hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Profit</span>
            <span
              className={`p-0.5 rounded ${dashboardData.netProfit >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"}`}
            >
              {dashboardData.netProfit >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
            </span>
          </div>
          <p
            className={`mt-3 text-2xl font-bold tracking-tight tabular-nums ${dashboardData.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}
          >
            {formatINRWhole(dashboardData.netProfit)}
          </p>
          <div className="mt-2 text-[10px] text-muted-foreground flex justify-between font-semibold">
            <span>Margin: {dashboardData.profitMargin.toFixed(1)}%</span>
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
            Receivables Pending Invoice
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Grid (Desktop First: Left Content, Middle Ops, Right Feeds) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column: Visual Charts & Analytics */}
        <div className="space-y-6">
          {/* Monthly Revenue Chart */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
              <span>Monthly Revenue Trend</span>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase">
                Last 6 Months
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

          {/* Expense Allocation */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Percent className="h-4 w-4 text-rose-500" /> Expense Summary
            </h2>
            <div className="mt-4 space-y-3">
              {dashboardData.expenseBreakdown.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  No categories logged yet.
                </p>
              ) : (
                dashboardData.expenseBreakdown.map((item) => (
                  <div key={item.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-foreground">{item.category}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {item.percentage.toFixed(1)}% &middot; {formatINRWhole(item.amount)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Top Clients */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Top Clients
            </h2>
            <div className="mt-4 space-y-3">
              {dashboardData.topClients.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  No client payments recorded yet.
                </p>
              ) : (
                dashboardData.topClients.map((client, idx) => (
                  <div
                    key={client.name}
                    className="flex items-center justify-between text-xs border-b border-border/40 pb-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-5 w-5 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <span className="font-bold text-foreground">{client.name}</span>
                    </div>
                    <span className="font-bold tabular-nums text-foreground">
                      {formatINR(client.total)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Middle Column: Operational Pipeline */}
        <div className="space-y-6">
          {/* Sales Pipeline Forecast */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
              <span>Sales Pipeline</span>
              <Link
                to="/leads"
                className="text-[10px] text-primary hover:underline font-bold uppercase"
              >
                Pipeline View
              </Link>
            </h2>
            <div className="mt-4 grid gap-3 grid-cols-2">
              <div className="rounded border border-border bg-muted/20 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Pipeline Value
                </p>
                <p className="text-lg font-bold tabular-nums text-foreground mt-1">
                  {formatINRWhole(dashboardData.pipelineValue)}
                </p>
              </div>
              <div className="rounded border border-border bg-muted/20 p-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase">
                  Expected (Weighted)
                </p>
                <p className="text-lg font-bold tabular-nums text-primary mt-1">
                  {formatINRWhole(dashboardData.weightedPipeline)}
                </p>
              </div>
            </div>
          </div>

          {/* Active Projects List */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
              <span>Active Projects</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded font-bold uppercase">
                {dashboardData.activeProjectsCount} Ongoing
              </span>
            </h2>

            <div className="mt-4 space-y-4 max-h-[300px] overflow-y-auto pr-1">
              {ops.projects.filter((p) => p.status === "active").length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  No active projects logged.
                </p>
              ) : (
                ops.projects
                  .filter((p) => p.status === "active")
                  .map((project) => {
                    // Completion percentage calculation
                    let progress = 0;
                    const ms = project.milestones ?? [];
                    if (ms.length > 0) {
                      progress = Math.round(
                        (ms.filter((m) => m.status === "completed").length / ms.length) * 100,
                      );
                    } else {
                      progress = 50; // active fallback
                    }

                    return (
                      <div
                        key={project.id}
                        className="space-y-1.5 border border-border/60 rounded p-3 bg-muted/10"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <Link
                              to="/projects/$id"
                              params={{ id: project.id }}
                              className="font-bold text-xs text-primary hover:underline"
                            >
                              {project.client}
                            </Link>
                            <p className="text-[10px] text-muted-foreground">
                              {project.projectType || "General Work"}
                            </p>
                          </div>
                          <span className="text-[10px] font-semibold tabular-nums text-foreground">
                            {project.budget ? formatINRWhole(project.budget) : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span>Progress: {progress}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            <div className="mt-4 border-t border-border/40 pt-3 flex justify-between text-xs text-muted-foreground">
              <span>Active Project Margin Forecast:</span>
              <span className="font-bold text-foreground">
                {formatINRWhole(dashboardData.projectProfit)}
              </span>
            </div>
          </div>

          {/* Today's Tasks / Milestone Deadlines */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" /> Upcoming Milestones
            </h2>
            <div className="mt-4 space-y-3">
              {dashboardData.upcomingTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">
                  All milestones completed!
                </p>
              ) : (
                dashboardData.upcomingTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex justify-between items-center text-xs border border-border/40 rounded p-2.5 bg-muted/20"
                  >
                    <div>
                      <p className="font-bold text-foreground">{task.name}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {task.projectName} &middot; {task.dueDate || "No deadline"}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] text-amber-600 dark:text-amber-400 font-bold uppercase">
                      {task.status.replace("_", " ")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Feeds & Recent Activity Logs */}
        <div className="space-y-6">
          {/* Upcoming Payments / Receivables Targets */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-indigo-500" /> Expected Payments
            </h2>
            <div className="mt-4 rounded bg-indigo-500/5 border border-indigo-500/15 p-4 text-center">
              <p className="text-xs text-muted-foreground font-semibold">
                Forecast Inflows (Unreleased Milestones)
              </p>
              <p className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums mt-1.5">
                {formatINRWhole(dashboardData.upcomingPayments)}
              </p>
            </div>
          </div>

          {/* Recent Payments Logs */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
              <span>Recent Payments</span>
              <Link
                to="/transactions"
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
    </div>
  );
}
