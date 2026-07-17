import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Plus,
  Search,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  DollarSign,
  FileSpreadsheet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransactionFormDialog } from "@/components/operations/TransactionFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { isFounderSalary } from "@/lib/founder-ledger";
import { statusBadgeClassDark } from "@/lib/invoice-status";
import type { Transaction, TransactionType } from "@/lib/types";

export const Route = createFileRoute("/transactions")({ component: TransactionsPage });

function TransactionsPage() {
  const { ops, persist, loading } = useOperations();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  const transactions = useMemo(() => ops.transactions ?? [], [ops.transactions]);
  const clients = ops.clients ?? [];
  const projects = ops.projects ?? [];

  const handleAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (tx: Transaction) => {
    setEditing(tx);
    setFormOpen(true);
  };

  const handleSave = (saved: Transaction) => {
    const nextTxs = editing
      ? transactions.map((t) => (t.id === saved.id ? saved : t))
      : [saved, ...transactions];
    persist({ ...ops, transactions: nextTxs });
  };

  const handleDelete = (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this transaction record? This will instantly recalculate all financial statistics.",
      )
    )
      return;
    persist({ ...ops, transactions: transactions.filter((t) => t.id !== id) });
  };

  // Filtered Transactions
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (typeFilter !== "all" && tx.type !== typeFilter) return false;
      if (methodFilter !== "all" && tx.paymentMethod !== methodFilter) return false;
      if (!q) return true;
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.notes?.toLowerCase().includes(q) ||
        tx.date.includes(q)
      );
    });
  }, [transactions, search, typeFilter, methodFilter]);

  // Aggregate Stats from FILTERED transactions
  const stats = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    let investments = 0;
    let withdrawals = 0;

    for (const tx of filtered) {
      if (tx.type === "client_payment" || tx.type === "founder_investment") {
        inflow += tx.amount;
      } else {
        outflow += tx.amount;
      }

      if (tx.type === "founder_investment") {
        investments += tx.amount;
      } else if (tx.type === "founder_withdrawal") {
        withdrawals += tx.amount;
      }
    }

    return {
      inflow,
      outflow,
      netFlow: inflow - outflow,
      investments,
      withdrawals,
    };
  }, [filtered]);

  const clientNameOf = (clientId?: string) => {
    if (!clientId) return "";
    return clients.find((c) => c.id === clientId)?.companyName ?? "";
  };

  const projectNameOf = (projectId?: string) => {
    if (!projectId) return "";
    return projects.find((p) => p.id === projectId)?.name ?? "";
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <OperationsPageHeader
        title="Transactions"
        description="The primary financial ledger for business accounts, payouts, transfers, and client collections."
        action={
          <Button type="button" onClick={handleAdd} className="inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Add Transaction
          </Button>
        }
      />

      {/* Stats KPI Widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Inflow</span>
            <ArrowDownRight className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatINRWhole(stats.inflow)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Outflow</span>
            <ArrowUpRight className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatINRWhole(stats.outflow)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">Net Cash Flow</span>
            <Wallet className="h-5 w-5 text-blue-500" />
          </div>
          <p
            className={`mt-2 text-2xl font-bold tabular-nums ${stats.netFlow >= 0 ? "text-blue-600" : "text-rose-600"}`}
          >
            {formatINRWhole(stats.netFlow)}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Founder Withdrawals
            </span>
            <DollarSign className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
            {formatINRWhole(stats.withdrawals)}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions by description, category, remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Types</option>
          <option value="client_payment">Client Payments</option>
          <option value="expense">Expenses</option>
          <option value="founder_investment">Founder Investments</option>
          <option value="founder_withdrawal">Founder Withdrawals</option>
          <option value="refund">Refunds</option>
          <option value="internal_transfer">Internal Transfers</option>
        </select>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="all">All Methods</option>
          <option value="upi">UPI</option>
          <option value="bank_transfer">Bank Transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Transactions Data Table */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/80 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Reference / Proof</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  No transaction records matched your search.
                </td>
              </tr>
            ) : (
              filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-muted/40 transition-colors">
                  <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                    {tx.date}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        tx.type === "client_payment"
                          ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                          : tx.type === "expense"
                            ? "bg-rose-500/20 text-rose-700 dark:text-rose-300"
                            : tx.type === "founder_investment"
                              ? "bg-blue-500/20 text-blue-700 dark:text-blue-300"
                              : tx.type === "founder_withdrawal"
                                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
                                : tx.type === "refund"
                                  ? "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300"
                                  : "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300"
                      }`}
                    >
                      {tx.type === "founder_withdrawal"
                        ? isFounderSalary(tx)
                          ? "founder salary"
                          : "share withdrawal"
                        : tx.type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-semibold text-foreground">{tx.description}</p>
                      {tx.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{tx.notes}</p>
                      )}
                      <div className="flex flex-wrap gap-1.5 mt-1 text-[10px]">
                        {tx.relatedClientId && (
                          <span className="text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            Client: {clientNameOf(tx.relatedClientId)}
                          </span>
                        )}
                        {tx.relatedProjectId && (
                          <span className="text-indigo-600 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                            Proj: {projectNameOf(tx.relatedProjectId)}
                          </span>
                        )}
                        {tx.historical && (
                          <span className="text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Historical
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-medium">{tx.category}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-bold tabular-nums text-foreground">
                    {formatINR(tx.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground uppercase font-medium">
                        {tx.paymentMethod}
                      </p>
                      {tx.attachmentDataUrl && (
                        <a
                          href={tx.attachmentDataUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          View receipt proof
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(tx)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(tx.id)}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        onSave={handleSave}
      />
    </div>
  );
}
