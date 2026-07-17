import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { DollarSign, ShieldAlert, ArrowDownLeft, ArrowUpRight, FileSpreadsheet, Edit3, UserCheck, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOperations } from "@/hooks/use-operations";
import { formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { isFounderSalary } from "@/lib/founder-ledger";
import type { Founder, Transaction } from "@/lib/types";

export const Route = createFileRoute("/founders")({ component: FoundersLedgerPage });

function FoundersLedgerPage() {
  const { ops, persist, loading } = useOperations();
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [sharePct, setSharePct] = useState("");
  const [notes, setNotes] = useState("");
  const [activeFounderId, setActiveFounderId] = useState<string>("member-harshith");

  const founders = ops.founders ?? [];
  const transactions = ops.transactions ?? [];

  // Compute ledger balances for every founder dynamically from transactions (Single Source of Truth)
  const ledgers = useMemo(() => {
    return founders.map((founder) => {
      const history = transactions.filter((t) => t.relatedFounderId === founder.id);
      const totalInvestment = history
        .filter((t) => t.type === "founder_investment")
        .reduce((sum, t) => sum + t.amount, 0);
      // Salary is company pay — only equity draws reduce the founder's share balance.
      const totalWithdrawals = history
        .filter((t) => t.type === "founder_withdrawal" && !isFounderSalary(t))
        .reduce((sum, t) => sum + t.amount, 0);
      const totalSalary = history
        .filter((t) => isFounderSalary(t))
        .reduce((sum, t) => sum + t.amount, 0);
      const currentBalance = totalInvestment - totalWithdrawals;

      return {
        founder,
        totalInvestment,
        totalWithdrawals,
        totalSalary,
        currentBalance,
        history: history.sort((a, b) => b.date.localeCompare(a.date)),
      };
    });
  }, [founders, transactions]);

  const activeLedger = useMemo(() => {
    return ledgers.find((l) => l.founder.id === activeFounderId) || ledgers[0];
  }, [ledgers, activeFounderId]);

  const handleEditClick = (founder: Founder) => {
    setEditingFounder(founder);
    setSharePct(String(founder.sharePercentage));
    setNotes(founder.notes ?? "");
  };

  const handleSaveMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFounder) return;
    const pctNum = Number(sharePct);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      alert("Please enter a valid share percentage between 0 and 100.");
      return;
    }

    const nextFounders = founders.map((f) =>
      f.id === editingFounder.id
        ? { ...f, sharePercentage: pctNum, notes: notes.trim() || undefined }
        : f
    );
    persist({ ...ops, founders: nextFounders });
    setEditingFounder(null);
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <OperationsPageHeader
        title="Founder Ledgers"
        description="Individual equity tracking and payment statement history for each partner."
      />

      {/* Grid of Founders Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {ledgers.map((l) => {
          const isSelected = l.founder.id === activeFounderId;
          return (
            <div
              key={l.founder.id}
              onClick={() => setActiveFounderId(l.founder.id)}
              className={`relative cursor-pointer rounded-xl border p-5 shadow-sm transition-all hover:shadow-md ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:bg-muted/10"
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-foreground">{l.founder.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Share: {l.founder.sharePercentage}%</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditClick(l.founder);
                  }}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Edit metadata"
                >
                  <Edit3 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invested:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatINRWhole(l.totalInvestment)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Share Withdrawn:</span>
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {formatINRWhole(l.totalWithdrawals)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Salary Paid:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {formatINRWhole(l.totalSalary)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border/80 pt-1.5 font-semibold text-sm">
                  <span className="text-foreground">Share Balance:</span>
                  <span className={l.currentBalance >= 0 ? "text-primary" : "text-rose-600"}>
                    {formatINRWhole(l.currentBalance)}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Salary is company pay — it does not reduce the share balance.
                </p>
              </div>
              {l.founder.notes && (
                <p className="mt-3 text-[10px] text-muted-foreground italic border-t border-dashed border-border pt-1.5 line-clamp-2">
                  {l.founder.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Active Founder Statement details */}
      {activeLedger && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Ledger Statement: {activeLedger.founder.name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Detailed history of investments and withdrawals.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-muted-foreground uppercase">Equity Balance</span>
              <p className="text-lg font-extrabold text-primary tabular-nums">
                {formatINR(activeLedger.currentBalance)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/65 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Description</th>
                  <th className="px-6 py-3">Method</th>
                  <th className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {activeLedger.history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No founder transactions logged for {activeLedger.founder.name} yet.
                    </td>
                  </tr>
                ) : (
                  activeLedger.history.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 tabular-nums text-muted-foreground font-medium">
                        {tx.date}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          tx.type === "founder_investment"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : isFounderSalary(tx)
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                        }`}>
                          {tx.type === "founder_investment"
                            ? "Investment"
                            : isFounderSalary(tx)
                            ? "Salary"
                            : "Share Withdrawal"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold text-foreground">{tx.description}</p>
                          {tx.notes && <p className="text-xs text-muted-foreground mt-0.5">{tx.notes}</p>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground uppercase font-semibold text-xs">
                        {tx.paymentMethod}
                      </td>
                      <td className={`whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums ${
                        tx.type === "founder_investment"
                          ? "text-emerald-600"
                          : isFounderSalary(tx)
                          ? "text-amber-600"
                          : "text-rose-600"
                      }`}>
                        {tx.type === "founder_investment" ? "+" : "-"}{formatINR(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Share dialog */}
      <Dialog open={Boolean(editingFounder)} onOpenChange={(open) => !open && setEditingFounder(null)}>
        {editingFounder && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Partner Metadata</DialogTitle>
              <DialogDescription>Modify the partner's share percentage or private notes.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveMetadata} className="space-y-4">
              <Field label="Founder Name" id="edit-founder-name">
                <Input id="edit-founder-name" value={editingFounder.name} disabled />
              </Field>

              <Field label="Share Percentage (%)" id="edit-share">
                <Input
                  id="edit-share"
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  value={sharePct}
                  onChange={(e) => setSharePct(e.target.value)}
                  required
                />
              </Field>

              <Field label="Ledger Notes / Details" id="edit-notes">
                <Textarea
                  id="edit-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Partner equity agreements, EMI loans, or reference comments…"
                  rows={3}
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingFounder(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
