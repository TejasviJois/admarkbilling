import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { TransactionFormDialog } from "@/components/operations/TransactionFormDialog";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOperations } from "@/hooks/use-operations";
import {
  removeAccountTransactionFromProjects,
  syncAccountTransactionToProjects,
} from "@/lib/project-payment-sync";
import { liveCashflowMonths } from "@/lib/analytics";
import { calendarMonthKey, formatCalendarMonthLabel, isInCalendarMonth } from "@/lib/date-range-filter";
import { paymentSummary } from "@/lib/project-payments";
import { formatINR } from "@/lib/invoice-calc";
import type { Project, Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts/")({ component: AccountsPage });

type MovementFilter = "all" | "income" | "expenses" | "transfers";

const INFLOW_TYPES: TransactionType[] = ["client_payment", "founder_investment"];
const OUTFLOW_TYPES: TransactionType[] = ["expense", "founder_withdrawal", "refund"];

const MOVEMENT_OPTIONS: { value: MovementFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expenses", label: "Expenses" },
  { value: "transfers", label: "Transfers" },
];

function movementAmount(transaction: Transaction): number {
  if (transaction.type === "adjustment") return transaction.amount;
  if (INFLOW_TYPES.includes(transaction.type)) return transaction.amount;
  if (OUTFLOW_TYPES.includes(transaction.type)) return -Math.abs(transaction.amount);
  return 0;
}

function transactionLabel(transaction: Transaction): string {
  const labels: Record<TransactionType, string> = {
    client_payment: "Client payment",
    founder_investment: "Founder investment",
    founder_withdrawal: "Founder payout",
    expense: "Expense",
    refund: "Refund",
    internal_transfer: "Transfer",
    adjustment: "Adjustment",
  };
  return labels[transaction.type];
}

function formatDisplayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
}

const dateInputClass =
  "h-8 w-full rounded-md border border-border/80 bg-transparent px-2 text-xs text-foreground outline-none focus:border-primary [color-scheme:dark]";

const filterSelectClass =
  "h-8 w-full rounded-md border border-border/80 bg-transparent px-2 text-xs text-foreground outline-none focus:border-primary";

function AccountsPage() {
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [month, setMonth] = useState(() => calendarMonthKey());
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialType, setInitialType] = useState<TransactionType>("client_payment");
  const [editing, setEditing] = useState<Transaction | null>(null);

  const transactions = useMemo(() => ops.transactions ?? [], [ops.transactions]);
  const clients = useMemo(() => ops.clients ?? [], [ops.clients]);
  const projects = useMemo(() => ops.projects ?? [], [ops.projects]);

  const openCreate = (type: TransactionType) => {
    setEditing(null);
    setInitialType(type);
    setDialogOpen(true);
  };

  const saveTransaction = (saved: Transaction) => {
    const next = editing
      ? transactions.map((transaction) => (transaction.id === saved.id ? saved : transaction))
      : [saved, ...transactions];
    persist({
      ...ops,
      transactions: next,
      projects: syncAccountTransactionToProjects(ops.projects, saved),
    });
  };

  const deleteTransaction = (id: string) => {
    if (!confirm("Delete this financial movement? All account totals will recalculate.")) return;
    persist(
      {
        ...ops,
        transactions: transactions.filter((transaction) => transaction.id !== id),
        projects: removeAccountTransactionFromProjects(ops.projects, id),
      },
      { deleteIds: { transactions: [id] } },
    );
  };

  const monthOptions = useMemo(() => liveCashflowMonths(ops), [ops]);
  const selectedMonth =
    month === "all" || monthOptions.includes(month) ? month : (monthOptions.at(-1) ?? month);

  /** Period + search/detail filters — used for KPIs (ignores movement type tabs). */
  const periodTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return transactions
      .filter((transaction) => {
        if (selectedMonth !== "all" && !isInCalendarMonth(transaction.date, selectedMonth))
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
    clientFilter,
    projectFilter,
    methodFilter,
    dateFrom,
    dateTo,
    search,
    selectedMonth,
  ]);

  /** Same period, then narrowed by All / Income / Expenses / Transfers for the table only. */
  const filteredTransactions = useMemo(() => {
    return periodTransactions.filter((transaction) => {
      if (movementFilter === "income" && !INFLOW_TYPES.includes(transaction.type)) return false;
      if (movementFilter === "expenses" && transaction.type !== "expense") return false;
      if (movementFilter === "transfers" && transaction.type !== "internal_transfer") return false;
      return true;
    });
  }, [periodTransactions, movementFilter]);

  const activeFilterCount = [
    clientFilter !== "all",
    projectFilter !== "all",
    methodFilter !== "all",
    Boolean(dateFrom),
    Boolean(dateTo),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearch("");
    setClientFilter("all");
    setProjectFilter("all");
    setMethodFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  if (operationsLoading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            Accounts
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Money in, money out, and the full ledger.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" onClick={() => openCreate("client_payment")} className="gap-1.5">
            <ArrowDownRight className="h-3.5 w-3.5" />
            Income
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCreate("expense")}
            className="gap-1.5 border-border/80"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Expense
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openCreate("internal_transfer")}
            className="gap-1.5 border-border/80"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Transfer
          </Button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 border-y border-border/80 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-0.5" role="group" aria-label="Movement type">
              {MOVEMENT_OPTIONS.map((option) => {
                const active = movementFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMovementFilter(option.value)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selectedMonth} onValueChange={setMonth}>
                <SelectTrigger
                  id="accounts-month"
                  aria-label="Month"
                  className="h-8 w-auto min-w-[9rem] gap-1.5 rounded-md border-border/80 bg-transparent px-2.5 text-xs font-medium shadow-none"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" className="bg-popover text-foreground">
                  <SelectItem
                    value="all"
                    className="text-foreground focus:bg-accent focus:text-foreground"
                  >
                    All months
                  </SelectItem>
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
              <p className="text-xs tabular-nums text-muted-foreground">
                {movementFilter === "all"
                  ? `${filteredTransactions.length} ${filteredTransactions.length === 1 ? "entry" : "entries"}`
                  : `${filteredTransactions.length} of ${periodTransactions.length}`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={1.5}
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search description, category…"
                className="w-full border-0 bg-transparent py-1.5 pl-7 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-0"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen((open) => !open)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                filtersOpen || activeFilterCount > 0
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 ? (
                <span className="tabular-nums text-muted-foreground">{activeFilterCount}</span>
              ) : null}
            </button>
            {(activeFilterCount > 0 || search) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {filtersOpen && (
            <div className="grid gap-3 border-t border-border/80 pt-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Client
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Project
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">All projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Method
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className={filterSelectClass}
                >
                  <option value="all">All methods</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                From
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={dateInputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                To
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={dateInputClass}
                />
              </label>
            </div>
          )}
        </div>

        <TransactionsLedger
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
      </section>

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

function TransactionsLedger({
  transactions,
  clients,
  projects,
  onEdit,
  onDelete,
}: {
  transactions: Transaction[];
  clients: Array<{ id: string; companyName: string }>;
  projects: Project[];
  onEdit: (transaction: Transaction) => void;
  onDelete: (id: string) => void;
}) {
  if (transactions.length === 0) {
    return (
      <p className="border-y border-dashed border-border/80 py-12 text-center text-sm text-muted-foreground">
        No movements match these filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto border-y border-border/80">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border/80 text-left text-xs text-muted-foreground">
            <th className="py-3 pr-3 font-medium">Date</th>
            <th className="px-3 py-3 font-medium">Type</th>
            <th className="px-3 py-3 font-medium">Details</th>
            <th className="px-3 py-3 font-medium">Linked</th>
            <th className="px-3 py-3 font-medium">Method</th>
            <th className="px-3 py-3 text-right font-medium">Amount</th>
            <th className="py-3 pl-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {transactions.map((transaction) => {
            const movement = movementAmount(transaction);
            const client = clients.find((item) => item.id === transaction.relatedClientId);
            const project = projects.find((item) => item.id === transaction.relatedProjectId);
            const linked = [client?.companyName, project?.name].filter(Boolean).join(" · ") || "—";
            const locked = Boolean(transaction.historical || transaction.payrollMonth);

            return (
              <tr key={transaction.id} className="group transition-colors hover:bg-muted/20">
                <td className="whitespace-nowrap py-3 pr-3 tabular-nums text-muted-foreground">
                  {formatDisplayDate(transaction.date)}
                </td>
                <td className="px-3 py-3">
                  <p className="text-xs font-medium text-foreground">
                    {transactionLabel(transaction)}
                  </p>
                  {transaction.historical ? (
                    <p className="mt-0.5 text-[10px] text-amber-500">Historical</p>
                  ) : null}
                </td>
                <td className="max-w-[16rem] px-3 py-3">
                  <p className="truncate text-foreground">{transaction.description}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {transaction.historical && project
                      ? `Historical · outstanding ${
                          paymentSummary(project).pending != null
                            ? formatINR(paymentSummary(project).pending!)
                            : "n/a"
                        }`
                      : (transaction.category ?? "—")}
                  </p>
                </td>
                <td className="max-w-[10rem] truncate px-3 py-3 text-xs text-muted-foreground">
                  {linked}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-xs capitalize text-muted-foreground">
                  {transaction.paymentMethod.replace("_", " ")}
                </td>
                <td
                  className={cn(
                    "whitespace-nowrap px-3 py-3 text-right font-medium tabular-nums",
                    movement > 0
                      ? "text-emerald-400"
                      : movement < 0
                        ? "text-rose-400"
                        : "text-foreground",
                  )}
                >
                  {movement > 0 ? "+" : movement < 0 ? "−" : ""}
                  {formatINR(Math.abs(transaction.amount))}
                </td>
                <td className="py-3 pl-3">
                  {locked ? (
                    <p className="text-right text-[10px] text-muted-foreground">
                      {transaction.payrollMonth ? "Payroll" : "Locked"}
                    </p>
                  ) : (
                    <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onEdit(transaction)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(transaction.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
