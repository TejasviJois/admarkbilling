import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  CalendarClock,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import { TransactionFormDialog } from "@/components/operations/TransactionFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperations } from "@/hooks/use-operations";
import {
  removeAccountTransactionFromProjects,
  syncAccountTransactionToProjects,
} from "@/lib/project-payment-sync";
import { paymentSummary } from "@/lib/project-payments";
import { formatINR } from "@/lib/invoice-calc";
import type { Project, Transaction, TransactionType } from "@/lib/types";

export const Route = createFileRoute("/accounts/")({ component: AccountsPage });

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
function AccountsPage() {
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
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
    persist({
      ...ops,
      transactions: transactions.filter((transaction) => transaction.id !== id),
      projects: removeAccountTransactionFromProjects(ops.projects, id),
    });
  };

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
    <div className="space-y-6">
      <OperationsPageHeader
        title="Accounts"
        description="Add money in or out and review the complete transaction history."
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
          <Link to="/accounts/monthly-payments">
            <CalendarClock className="h-4 w-4" /> Fixed Costs
          </Link>
        </Button>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Transaction history</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every income, expense, transfer, and adjustment in one ledger.
          </p>
        </div>
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

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search description, category, notes…"
                className="pl-9"
              />
            </div>
            <Button
              variant={filtersOpen || activeFilterCount > 0 ? "default" : "outline"}
              onClick={() => setFiltersOpen((open) => !open)}
              className="gap-2"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <span className="rounded-full bg-background/20 px-1.5 text-xs font-bold tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {(activeFilterCount > 0 || search) && (
              <Button variant="ghost" onClick={clearFilters} className="gap-1.5">
                <X className="h-4 w-4" /> Clear
              </Button>
            )}
          </div>

          {filtersOpen && (
            <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <FilterField label="Client">
                <FilterSelect value={clientFilter} onChange={setClientFilter}>
                  <option value="all">All clients</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.companyName}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Project">
                <FilterSelect value={projectFilter} onChange={setProjectFilter}>
                  <option value="all">All projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </FilterSelect>
              </FilterField>
              <FilterField label="Payment method">
                <FilterSelect value={methodFilter} onChange={setMethodFilter}>
                  <option value="all">All methods</option>
                  <option value="upi">UPI</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </FilterSelect>
              </FilterField>
              <FilterField label="From date">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </FilterField>
              <FilterField label="To date">
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </FilterField>
            </div>
          )}
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

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </label>
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
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
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
  projects: Project[];
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
                    {transaction.historical && (
                      <span
                        className="ml-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-400"
                        title="Imported pre-migration context — already reflected in the Opening Balance; does not change any totals."
                      >
                        Historical
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{transaction.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {transaction.historical && project
                        ? `Historical received · Current outstanding ${
                            paymentSummary(project).pending != null
                              ? formatINR(paymentSummary(project).pending!)
                              : "not defined"
                          }`
                        : transaction.category}
                    </p>
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
                    {transaction.historical || transaction.payrollMonth ? (
                      <div className="text-right text-[10px] font-medium uppercase text-muted-foreground">
                        {transaction.payrollMonth ? "Payroll" : "Locked"}
                      </div>
                    ) : (
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
                    )}
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
