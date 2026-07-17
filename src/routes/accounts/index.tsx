import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  BarChart3,
  FilePlus2,
  Landmark,
  Pencil,
  Plus,
  Search,
  Trash2,
  WalletCards,
} from "lucide-react";
import { AssetsSection } from "@/components/operations/AssetsSection";
import { ExpensesSection } from "@/components/operations/ExpensesSection";
import { FixedMonthlyExpensesSection } from "@/components/operations/FixedMonthlyExpensesSection";
import { TransactionFormDialog } from "@/components/operations/TransactionFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInvoices } from "@/hooks/use-invoices";
import { useOperations } from "@/hooks/use-operations";
import {
  calculateInvoicePayments,
  deriveInvoiceStatus,
  formatINR,
  formatINRWhole,
} from "@/lib/invoice-calc";
import type { Transaction, TransactionType } from "@/lib/types";

export const Route = createFileRoute("/accounts/")({ component: AccountsPage });

type AccountsTab = "overview" | "transactions" | "analytics";
type MovementFilter = "all" | "income" | "expenses" | "transfers";

const INFLOW_TYPES: TransactionType[] = ["client_payment", "founder_investment"];
const OUTFLOW_TYPES: TransactionType[] = ["expense", "founder_withdrawal", "refund"];

function movementAmount(transaction: Transaction): number {
  if (transaction.type === "adjustment") return transaction.amount;
  if (INFLOW_TYPES.includes(transaction.type)) return transaction.amount;
  if (OUTFLOW_TYPES.includes(transaction.type)) return -Math.abs(transaction.amount);
  return 0;
}

function transactionLabel(transaction: Transaction): string {
  const labels: Record<TransactionType, string> = {
    client_payment: "Client Payment",
    founder_investment: "Founder Investment",
    founder_withdrawal: "Founder Payout",
    expense: "Expense",
    refund: "Refund",
    internal_transfer: "Internal Transfer",
    adjustment: "Adjustment",
  };
  return labels[transaction.type];
}

function monthKeys(count = 6): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (count - index - 1));
    return date.toISOString().slice(0, 7);
  });
}

function AccountsPage() {
  const { ops, persist, loading: operationsLoading } = useOperations();
  const { invoices, loading: invoicesLoading } = useInvoices();
  const [tab, setTab] = useState<AccountsTab>("overview");
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>("client_payment");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const transactions = useMemo(() => ops.transactions ?? [], [ops.transactions]);
  const clients = useMemo(() => ops.clients ?? [], [ops.clients]);
  const projects = useMemo(() => ops.projects ?? [], [ops.projects]);

  useEffect(() => {
    const syncHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash === "transactions" || hash === "expenses" || hash === "income") {
        setTab("transactions");
        setMovementFilter(hash === "expenses" ? "expenses" : hash === "income" ? "income" : "all");
      } else if (hash === "analytics") {
        setTab("analytics");
      } else if (hash === "assets") {
        setTab("overview");
        requestAnimationFrame(() =>
          document.getElementById("assets")?.scrollIntoView({ behavior: "smooth" }),
        );
      } else if (hash === "monthly-retainers") {
        setTab("overview");
        requestAnimationFrame(() =>
          document.getElementById("monthly-retainers")?.scrollIntoView({ behavior: "smooth" }),
        );
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const openTab = (nextTab: AccountsTab) => {
    setTab(nextTab);
    window.history.replaceState(null, "", nextTab === "overview" ? "/accounts" : `#${nextTab}`);
  };

  const openCreate = (type: TransactionType) => {
    setEditing(null);
    setInitialType(type);
    setDialogOpen(true);
  };

  const saveTransaction = (saved: Transaction) => {
    const next = editing
      ? transactions.map((transaction) => (transaction.id === saved.id ? saved : transaction))
      : [saved, ...transactions];
    persist({ ...ops, transactions: next });
  };

  const deleteTransaction = (id: string) => {
    if (!confirm("Delete this financial movement? All account totals will recalculate.")) return;
    persist({ ...ops, transactions: transactions.filter((transaction) => transaction.id !== id) });
  };

  const metrics = useMemo(() => {
    const revenue = transactions
      .filter((transaction) => transaction.type === "client_payment")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const expenses = transactions
      .filter((transaction) => transaction.type === "expense")
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const netCashFlow = transactions.reduce(
      (sum, transaction) => sum + movementAmount(transaction),
      0,
    );
    let outstandingReceivables = 0;
    let pendingInvoiceAmount = 0;
    for (const invoice of invoices) {
      if (invoice.status === "cancelled") continue;
      const { outstandingBalance } = calculateInvoicePayments(invoice, ops.payments ?? []);
      outstandingReceivables += outstandingBalance;
      const status = deriveInvoiceStatus(invoice, ops.payments ?? []);
      if (status !== "overdue" && status !== "paid") pendingInvoiceAmount += outstandingBalance;
    }
    return {
      cashBalance: netCashFlow,
      revenue,
      expenses,
      netCashFlow,
      outstandingReceivables,
      pendingInvoiceAmount,
    };
  }, [transactions, invoices, ops.payments]);

  const monthly = useMemo(() => {
    const keys = monthKeys();
    const openingBalance = transactions
      .filter((transaction) => transaction.date.slice(0, 7) < keys[0])
      .reduce((sum, transaction) => sum + movementAmount(transaction), 0);
    let runningBalance = openingBalance;
    return keys.map((key) => {
      const rows = transactions.filter((transaction) => transaction.date.startsWith(key));
      const revenue = rows
        .filter((transaction) => transaction.type === "client_payment")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const expenses = rows
        .filter((transaction) => transaction.type === "expense")
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const net = rows.reduce((sum, transaction) => sum + movementAmount(transaction), 0);
      runningBalance += net;
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        label: new Date(year, month - 1).toLocaleString("en", { month: "short" }),
        revenue,
        expenses,
        net,
        balance: runningBalance,
      };
    });
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions
      .filter((transaction) => {
        if (movementFilter === "income" && !INFLOW_TYPES.includes(transaction.type)) return false;
        if (movementFilter === "expenses" && transaction.type !== "expense") return false;
        if (movementFilter === "transfers" && transaction.type !== "internal_transfer")
          return false;
        if (clientFilter !== "all" && transaction.relatedClientId !== clientFilter) return false;
        if (projectFilter !== "all" && transaction.relatedProjectId !== projectFilter) return false;
        if (methodFilter !== "all" && transaction.paymentMethod !== methodFilter) return false;
        if (dateFrom && transaction.date < dateFrom) return false;
        if (dateTo && transaction.date > dateTo) return false;
        if (!query) return true;
        return [transaction.description, transaction.category, transaction.notes, transaction.date]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [
    transactions,
    movementFilter,
    clientFilter,
    projectFilter,
    methodFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const analytics = useMemo(() => {
    const expenseMap = new Map<string, number>();
    const clientMap = new Map<string, number>();
    const projectMap = new Map<string, number>();
    const methodMap = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.type === "expense") {
        const category = transaction.category || "Uncategorized";
        expenseMap.set(category, (expenseMap.get(category) ?? 0) + transaction.amount);
      }
      if (transaction.type === "client_payment") {
        const client =
          clients.find((item) => item.id === transaction.relatedClientId)?.companyName ??
          "Unassigned client";
        clientMap.set(client, (clientMap.get(client) ?? 0) + transaction.amount);
        const project =
          projects.find((item) => item.id === transaction.relatedProjectId)?.name ??
          "Unassigned project";
        projectMap.set(project, (projectMap.get(project) ?? 0) + transaction.amount);
      }
      const method = transaction.paymentMethod || "Other";
      methodMap.set(method, (methodMap.get(method) ?? 0) + Math.abs(transaction.amount));
    }
    const sorted = (map: Map<string, number>) =>
      [...map.entries()]
        .map(([label, amount]) => ({ label, amount }))
        .sort((a, b) => b.amount - a.amount);
    return {
      expenses: sorted(expenseMap),
      clients: sorted(clientMap),
      projects: sorted(projectMap),
      methods: sorted(methodMap),
      largestExpenses: transactions
        .filter((transaction) => transaction.type === "expense")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5),
    };
  }, [transactions, clients, projects]);

  if (operationsLoading || invoicesLoading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Accounts"
        description="Understand and manage your company’s money from one founder-friendly workspace."
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => openCreate("client_payment")} className="gap-2">
          <ArrowDownRight className="h-4 w-4" /> Add Income
        </Button>
        <Button variant="outline" onClick={() => openCreate("expense")} className="gap-2">
          <ArrowUpRight className="h-4 w-4" /> Add Expense
        </Button>
        <Button variant="outline" onClick={() => openCreate("internal_transfer")} className="gap-2">
          <ArrowLeftRight className="h-4 w-4" /> Transfer Funds
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link to="/new">
            <FilePlus2 className="h-4 w-4" /> Create Invoice
          </Link>
        </Button>
      </div>

      <div
        role="tablist"
        aria-label="Accounts sections"
        className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/35 p-1"
      >
        {(["overview", "transactions", "analytics"] as AccountsTab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            onClick={() => openTab(item)}
            className={`min-w-28 rounded-md px-4 py-2 text-sm font-semibold capitalize transition-colors ${
              tab === item
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard label="Cash Balance" value={metrics.cashBalance} icon={WalletCards} />
            <MetricCard
              label="Total Revenue"
              value={metrics.revenue}
              icon={ArrowDownRight}
              positive
            />
            <MetricCard
              label="Total Expenses"
              value={metrics.expenses}
              icon={ArrowUpRight}
              negative
            />
            <MetricCard
              label="Outstanding Receivables"
              value={metrics.outstandingReceivables}
              icon={Landmark}
            />
            <MetricCard
              label="Pending Invoice Amount"
              value={metrics.pendingInvoiceAmount}
              icon={FilePlus2}
            />
            <MetricCard
              label="Net Cash Flow"
              value={metrics.netCashFlow}
              icon={BarChart3}
              positive={metrics.netCashFlow >= 0}
              negative={metrics.netCashFlow < 0}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <MonthlyBars rows={monthly} />
            <CashFlowTrend rows={monthly} />
          </div>

          <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
            <Link
              to="/accounts/billing"
              className="text-sm font-semibold text-primary hover:underline"
            >
              Open project billing details
            </Link>
            <span className="text-muted-foreground">·</span>
            <Link to="/invoices" className="text-sm font-semibold text-primary hover:underline">
              Open invoice management
            </Link>
          </div>

          <AssetsSection ops={ops} persist={persist} />
          <ExpensesSection ops={ops} persist={persist} />
          <FixedMonthlyExpensesSection ops={ops} persist={persist} />
        </div>
      )}

      {tab === "transactions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(["all", "income", "expenses", "transfers"] as MovementFilter[]).map((filter) => (
              <Button
                key={filter}
                size="sm"
                variant={movementFilter === filter ? "default" : "outline"}
                onClick={() => setMovementFilter(filter)}
                className="capitalize"
              >
                {filter}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search description, category, notes…"
                className="pl-9"
              />
            </div>
            <FilterSelect value={clientFilter} onChange={setClientFilter}>
              <option value="all">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={projectFilter} onChange={setProjectFilter}>
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect value={methodFilter} onChange={setMethodFilter}>
              <option value="all">All payment methods</option>
              <option value="upi">UPI</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="other">Other</option>
            </FilterSelect>
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setClientFilter("all");
                setProjectFilter("all");
                setMethodFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear filters
            </Button>
          </div>

          <TransactionsTable
            transactions={filteredTransactions}
            clients={clients}
            projects={projects}
            onEdit={(transaction) => {
              setEditing(transaction);
              setInitialType(transaction.type);
              setDialogOpen(true);
            }}
            onDelete={deleteTransaction}
          />
        </div>
      )}

      {tab === "analytics" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <BreakdownCard title="Expense Breakdown" rows={analytics.expenses} />
            <BreakdownCard title="Top Clients by Revenue" rows={analytics.clients} />
            <BreakdownCard title="Project Revenue" rows={analytics.projects} />
            <BreakdownCard title="Payment Method Distribution" rows={analytics.methods} />
          </div>
          <MonthlyBars rows={monthly} />
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-bold">Largest Expenses</h2>
            <div className="mt-4 space-y-3">
              {analytics.largestExpenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expense transactions recorded.</p>
              ) : (
                analytics.largestExpenses.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 text-sm"
                  >
                    <div>
                      <p className="font-semibold">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.category} · {transaction.date}
                      </p>
                    </div>
                    <span className="font-bold tabular-nums text-rose-500">
                      {formatINRWhole(transaction.amount)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        transaction={editing}
        initialType={initialType}
        onSave={saveTransaction}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  positive,
  negative,
}: {
  label: string;
  value: number;
  icon: typeof WalletCards;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
        <Icon className="h-5 w-5" />
      </div>
      <p
        className={`mt-3 text-2xl font-extrabold tabular-nums ${
          positive ? "text-emerald-600" : negative ? "text-rose-600" : "text-foreground"
        }`}
      >
        {formatINRWhole(value)}
      </p>
    </div>
  );
}

function MonthlyBars({
  rows,
}: {
  rows: Array<{ key: string; label: string; revenue: number; expenses: number }>;
}) {
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.revenue, row.expenses]));
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-bold">Income vs Expense</h2>
      <p className="mt-1 text-xs text-muted-foreground">Monthly transaction totals</p>
      <div className="mt-6 flex h-52 items-end gap-3">
        {rows.map((row) => (
          <div key={row.key} className="flex h-full flex-1 flex-col justify-end">
            <div className="flex flex-1 items-end justify-center gap-1">
              <div
                className="w-3 rounded-t bg-emerald-500"
                style={{ height: `${Math.max(2, (row.revenue / maximum) * 100)}%` }}
                title={`Revenue ${formatINRWhole(row.revenue)}`}
              />
              <div
                className="w-3 rounded-t bg-rose-500"
                style={{ height: `${Math.max(2, (row.expenses / maximum) * 100)}%` }}
                title={`Expenses ${formatINRWhole(row.expenses)}`}
              />
            </div>
            <p className="mt-2 text-center text-[10px] font-semibold text-muted-foreground">
              {row.label}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-center gap-5 text-xs text-muted-foreground">
        <span>● Revenue</span>
        <span className="text-rose-500">● Expenses</span>
      </div>
    </section>
  );
}

function CashFlowTrend({
  rows,
}: {
  rows: Array<{ key: string; label: string; net: number; balance: number }>;
}) {
  const maximum = Math.max(1, ...rows.map((row) => Math.abs(row.net)));
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-bold">Cash Flow Trend</h2>
      <p className="mt-1 text-xs text-muted-foreground">Monthly net movement and closing balance</p>
      <div className="mt-5 space-y-4">
        {rows.map((row) => (
          <div key={row.key}>
            <div className="flex justify-between text-xs">
              <span className="font-semibold">{row.label}</span>
              <span className={row.net >= 0 ? "text-emerald-600" : "text-rose-600"}>
                {formatINRWhole(row.net)} · balance {formatINRWhole(row.balance)}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${row.net >= 0 ? "bg-emerald-500" : "bg-rose-500"}`}
                style={{ width: `${Math.max(2, (Math.abs(row.net) / maximum) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
    >
      {children}
    </select>
  );
}

function TransactionsTable({
  transactions,
  clients,
  projects,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  clients: Array<{ id: string; companyName: string }>;
  projects: Array<{ id: string; name?: string }>;
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <table className="w-full min-w-[850px] text-sm">
        <thead className="border-b border-border bg-muted/70 text-left text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Movement</th>
            <th className="px-4 py-3">Description</th>
            <th className="px-4 py-3">Client / Project</th>
            <th className="px-4 py-3">Method</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                No financial movements match these filters.
              </td>
            </tr>
          ) : (
            transactions.map((transaction) => {
              const movement = movementAmount(transaction);
              const client = clients.find((item) => item.id === transaction.relatedClientId);
              const project = projects.find((item) => item.id === transaction.relatedProjectId);
              return (
                <tr key={transaction.id} className="transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{transaction.date}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold uppercase">
                      {transactionLabel(transaction)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">{transaction.category}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {client?.companyName || project?.name || "—"}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted-foreground">
                    {transaction.paymentMethod.replace("_", " ")}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums ${
                      movement > 0
                        ? "text-emerald-600"
                        : movement < 0
                          ? "text-rose-600"
                          : "text-foreground"
                    }`}
                  >
                    {movement > 0 ? "+" : movement < 0 ? "−" : ""}
                    {formatINR(Math.abs(transaction.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => onEdit(transaction)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDelete(transaction.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; amount: number }>;
}) {
  const maximum = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="font-bold">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No transaction data available.</p>
        ) : (
          rows.slice(0, 8).map((row) => (
            <div key={row.label}>
              <div className="flex justify-between gap-3 text-xs">
                <span className="truncate font-semibold">{row.label}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatINRWhole(row.amount)}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${(row.amount / maximum) * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
