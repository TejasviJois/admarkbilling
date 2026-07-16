import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search, Filter, TrendingUp, TrendingDown, DollarSign, PieChart, Landmark, FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpenseFormDialog, EXPENSE_CATEGORIES } from "@/components/operations/ExpenseFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINR, formatINRWhole } from "@/lib/invoice-calc";
import type { Transaction } from "@/lib/types";

export const Route = createFileRoute("/expenses")({ component: ExpensesDashboardPage });

function ExpensesDashboardPage() {
  const { ops, persist, loading } = useOperations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const transactions = ops.transactions ?? [];
  const expenses = useMemo(() => {
    return transactions.filter((t) => t.type === "expense");
  }, [transactions]);

  // Aggregate calculations
  const stats = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalGst = expenses.reduce((sum, e) => sum + (e.gst || 0), 0);

    // Group expenses by category
    const catMap: Record<string, number> = {};
    for (const cat of EXPENSE_CATEGORIES) {
      catMap[cat] = 0;
    }
    for (const e of expenses) {
      const cat = e.category || "Miscellaneous";
      catMap[cat] = (catMap[cat] || 0) + e.amount;
    }

    const categoryBreakdown = Object.entries(catMap)
      .map(([name, amount]) => ({ name, amount, percentage: total > 0 ? (amount / total) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);

    // Group expenses by month (YYYY-MM)
    const monthlyMap: Record<string, { total: number; count: number; gst: number; netBurn: number }> = {};
    
    // Group inflows by month for net cash burn
    const inflowMap: Record<string, number> = {};
    for (const tx of transactions) {
      if (tx.type === "client_payment" || tx.type === "founder_investment") {
        const mKey = tx.date.slice(0, 7); // YYYY-MM
        inflowMap[mKey] = (inflowMap[mKey] || 0) + tx.amount;
      }
    }

    for (const e of expenses) {
      const mKey = e.date.slice(0, 7); // YYYY-MM
      if (!monthlyMap[mKey]) {
        monthlyMap[mKey] = { total: 0, count: 0, gst: 0, netBurn: 0 };
      }
      monthlyMap[mKey].total += e.amount;
      monthlyMap[mKey].count += 1;
      monthlyMap[mKey].gst += e.gst || 0;
    }

    // Calculate net cash burn per month (expense total - inflows total)
    const months = Object.keys({ ...monthlyMap, ...inflowMap }).sort();
    const monthlySummary = months.map((mKey) => {
      const expTotal = monthlyMap[mKey]?.total || 0;
      const inflowTotal = inflowMap[mKey] || 0;
      const netBurn = Math.max(0, expTotal - inflowTotal); // amount of expenses exceeding inflows
      
      if (monthlyMap[mKey]) {
        monthlyMap[mKey].netBurn = netBurn;
      }

      return {
        month: mKey,
        total: expTotal,
        count: monthlyMap[mKey]?.count || 0,
        gst: monthlyMap[mKey]?.gst || 0,
        inflow: inflowTotal,
        netBurn,
      };
    }).reverse(); // newest month first

    // Calculate Average Cash Burn (gross & net)
    const activeMonthsCount = months.length || 1;
    const averageGrossBurn = total / activeMonthsCount;
    
    const totalInflows = transactions
      .filter((t) => t.type === "client_payment" || t.type === "founder_investment")
      .reduce((sum, t) => sum + t.amount, 0);
    const averageInflow = totalInflows / activeMonthsCount;
    const averageNetBurn = Math.max(0, averageGrossBurn - averageInflow);

    return {
      total,
      totalGst,
      categoryBreakdown,
      monthlySummary,
      averageGrossBurn,
      averageNetBurn,
      topCategory: categoryBreakdown[0]?.name || "None",
    };
  }, [expenses, transactions]);

  // Handle Log Expense Save
  const handleSave = (newTx: Transaction) => {
    persist({ ...ops, transactions: [newTx, ...transactions] });
  };

  // Handle Delete Expense
  const handleDelete = (id: string) => {
    if (!confirm("Are you sure you want to delete this expense record?")) return;
    persist({ ...ops, transactions: transactions.filter((t) => t.id !== id) });
  };

  // Filtered Expense list for table
  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (categoryFilter !== "all" && e.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        e.vendor?.toLowerCase().includes(q) ||
        e.notes?.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.date.includes(q)
      );
    });
  }, [expenses, search, categoryFilter]);

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Expenses Dashboard"
        description="Comprehensive analysis of corporate cash burn, monthly outlays, vendor cost share, and tax tracking."
        action={
          <Button type="button" onClick={() => setDialogOpen(true)} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Log Expense
          </Button>
        }
      />

      {/* Stats Summary Widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Total Expenditures</span>
            <DollarSign className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatINRWhole(stats.total)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Avg Gross Cash Burn</span>
            <TrendingUp className="h-5 w-5 text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatINRWhole(stats.averageGrossBurn)}
            <span className="text-xs text-muted-foreground font-normal"> /mo</span>
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">Avg Net Cash Burn</span>
            <TrendingDown className="h-5 w-5 text-blue-500" />
          </div>
          <p className={`mt-2 text-2xl font-bold tabular-nums ${stats.averageNetBurn > 0 ? "text-rose-600" : "text-emerald-500"}`}>
            {formatINRWhole(stats.averageNetBurn)}
            <span className="text-xs text-muted-foreground font-normal"> /mo</span>
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase">GST Outflow Paid</span>
            <Landmark className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {formatINRWhole(stats.totalGst)}
          </p>
        </div>
      </div>

      {/* Main Charts & Breakdown Panel */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Category Breakdown */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
            <PieChart className="h-5 w-5 text-primary" /> Cost Share & Breakdown
          </h2>
          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
            {stats.categoryBreakdown.map((cat) => (
              <div key={cat.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-foreground">{cat.name}</span>
                  <div className="text-right">
                    <span className="text-muted-foreground">{cat.percentage.toFixed(1)}% &middot; </span>
                    <span className="tabular-nums text-foreground">{formatINR(cat.amount)}</span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${cat.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Month-over-Month & Trends */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6 space-y-4">
          <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Monthly Expense Trend & Burn
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="pb-2">Month</th>
                  <th className="pb-2 text-right">Outflow (Gross)</th>
                  <th className="pb-2 text-right">Inflow</th>
                  <th className="pb-2 text-right">Net Cash Burn</th>
                  <th className="pb-2 text-right">GST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stats.monthlySummary.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground italic">No monthly logs found.</td>
                  </tr>
                ) : (
                  stats.monthlySummary.map((m) => (
                    <tr key={m.month} className="hover:bg-muted/20">
                      <td className="py-2.5 font-bold text-foreground tabular-nums">{m.month}</td>
                      <td className="py-2.5 text-right font-semibold tabular-nums text-foreground">{formatINRWhole(m.total)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatINRWhole(m.inflow)}</td>
                      <td className={`py-2.5 text-right font-bold tabular-nums ${m.netBurn > 0 ? "text-rose-600" : "text-emerald-500"}`}>
                        {formatINRWhole(m.netBurn)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{formatINRWhole(m.gst)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Expense Listing Board */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search expenses by vendor, notes, date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          >
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Vendor / Label</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-right">GST Paid</th>
                <th className="px-4 py-3">Method / Proof</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground italic">
                    No expense records matching the filters.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-muted-foreground tabular-nums">
                      {exp.date}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold text-foreground">{exp.vendor || exp.description.replace("Expense: ", "")}</p>
                        {exp.notes && <p className="text-xs text-muted-foreground mt-0.5">{exp.notes}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <span className="inline-flex rounded bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600 dark:text-rose-400 font-bold uppercase tracking-wider">
                        {exp.category}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-foreground tabular-nums">
                      {formatINR(exp.amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-muted-foreground tabular-nums font-semibold">
                      {exp.gst ? formatINR(exp.gst) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs">
                        <p className="uppercase font-semibold text-muted-foreground">{exp.paymentMethod || "bank_transfer"}</p>
                        {exp.attachmentDataUrl && (
                          <a
                            href={exp.attachmentDataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline font-medium"
                          >
                            <FileText className="h-3 w-3" /> View receipt
                          </a>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(exp.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />
    </div>
  );
}
