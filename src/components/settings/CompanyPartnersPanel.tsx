import { useMemo, useState } from "react";
import { Edit3, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { SettingsField } from "@/components/settings/settings-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOperations } from "@/hooks/use-operations";
import { formatINR, formatINRWhole } from "@/lib/invoice-calc";
import { isFounderSalary } from "@/lib/founder-ledger";
import type { CompanyMember, Founder } from "@/lib/types";

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * One card per partner: editable contact details merged with the equity
 * ledger (share %, invested, withdrawn, salary, balance). Click a card to see
 * its full transaction statement below.
 */
export function CompanyPartnersPanel({
  partners,
  onAdd,
  onUpdate,
  onRemove,
}: {
  partners: CompanyMember[];
  onAdd: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<CompanyMember, "name" | "email" | "phone" | "role">>,
  ) => void;
  onRemove: (id: string) => void;
}) {
  const { ops, persist } = useOperations();
  const [editingFounder, setEditingFounder] = useState<Founder | null>(null);
  const [sharePct, setSharePct] = useState("");
  const [notes, setNotes] = useState("");
  const [activeId, setActiveId] = useState<string>("member-harshith");

  const founders = ops.founders ?? [];
  const transactions = ops.transactions ?? [];

  // Ledger balances are always derived from transactions (single source of truth).
  const ledgerById = useMemo(() => {
    const map = new Map<
      string,
      {
        founder: Founder;
        totalInvestment: number;
        totalWithdrawals: number;
        totalSalary: number;
        currentBalance: number;
        history: typeof transactions;
      }
    >();
    for (const founder of founders) {
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
      map.set(founder.id, {
        founder,
        totalInvestment,
        totalWithdrawals,
        totalSalary,
        currentBalance: totalInvestment - totalWithdrawals,
        history: [...history].sort((a, b) => b.date.localeCompare(a.date)),
      });
    }
    return map;
  }, [founders, transactions]);

  const activeLedger = ledgerById.get(activeId) ?? [...ledgerById.values()][0];

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
        : f,
    );
    persist({ ...ops, founders: nextFounders });
    setEditingFounder(null);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-base font-bold text-foreground border-b border-border pb-3 flex items-center justify-between">
        <span>Company Partners</span>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-lg border border-dashed border-border px-3 py-1 text-xs font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
        >
          Add Partner
        </button>
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {partners.map((member) => {
          const ledger = ledgerById.get(member.id);
          const isSelected = ledger != null && member.id === activeLedger?.founder.id;
          return (
            <div
              key={member.id}
              onClick={() => ledger && setActiveId(member.id)}
              className={`rounded-xl border p-4 transition-all ${
                ledger ? "cursor-pointer" : ""
              } ${
                isSelected
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-muted/10 hover:border-primary/20"
              }`}
            >
              {/* Contact details */}
              <div className="mb-4 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {memberInitials(member.name || "?")}
                </span>
                <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                  <SettingsField
                    label="Name"
                    value={member.name}
                    onChange={(v) => onUpdate(member.id, { name: v })}
                  />
                </div>
                {ledger && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(ledger.founder);
                    }}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Edit share percentage and notes"
                  >
                    <Edit3 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-3" onClick={(e) => e.stopPropagation()}>
                <SettingsField
                  label="Role"
                  value={member.role || "Partner"}
                  onChange={(v) => onUpdate(member.id, { role: v })}
                  placeholder="Partner"
                />
                <SettingsField
                  label="Email"
                  type="email"
                  value={member.email}
                  onChange={(v) => onUpdate(member.id, { email: v })}
                />
                <SettingsField
                  label="Phone"
                  value={member.phone}
                  onChange={(v) => onUpdate(member.id, { phone: v })}
                />
              </div>

              {/* Equity ledger — same card, no separate section */}
              {ledger && (
                <div className="mt-4 space-y-2 rounded-lg border border-border/70 bg-background/60 p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Equity Share:</span>
                    <span className="font-semibold text-foreground">
                      {ledger.founder.sharePercentage}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Invested:</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatINRWhole(ledger.totalInvestment)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Share Withdrawn:</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {formatINRWhole(ledger.totalWithdrawals)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Salary Paid:</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">
                      {formatINRWhole(ledger.totalSalary)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/80 pt-1.5 text-sm font-semibold">
                    <span className="text-foreground">Share Balance:</span>
                    <span
                      className={ledger.currentBalance >= 0 ? "text-primary" : "text-rose-600"}
                    >
                      {formatINRWhole(ledger.currentBalance)}
                    </span>
                  </div>
                  <p className="text-[10px] leading-snug text-muted-foreground">
                    Salary is company pay — it does not reduce the share balance. Click the card
                    for the full statement.
                  </p>
                  {ledger.founder.notes && (
                    <p className="border-t border-dashed border-border pt-1.5 text-[10px] italic text-muted-foreground line-clamp-2">
                      {ledger.founder.notes}
                    </p>
                  )}
                </div>
              )}

              <div
                className="mt-3 flex flex-wrap items-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                {member.email && (
                  <a
                    href={`mailto:${member.email}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </a>
                )}
                {member.phone && (
                  <a
                    href={`tel:${member.phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(member.id)}
                  className="text-xs text-muted-foreground hover:text-destructive"
                >
                  Remove partner
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Statement for the selected partner */}
      {activeLedger && (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-6 py-4">
            <div>
              <h3 className="text-base font-bold text-foreground">
                Ledger Statement: {activeLedger.founder.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Detailed history of investments and withdrawals.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Equity Balance
              </span>
              <p className="text-lg font-extrabold tabular-nums text-primary">
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
                    <tr key={tx.id} className="transition-colors hover:bg-muted/30">
                      <td className="whitespace-nowrap px-6 py-4 font-medium tabular-nums text-muted-foreground">
                        {tx.date}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            tx.type === "founder_investment"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : isFounderSalary(tx)
                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                : "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          }`}
                        >
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
                          {tx.notes && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{tx.notes}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-semibold uppercase text-muted-foreground">
                        {tx.paymentMethod}
                      </td>
                      <td
                        className={`whitespace-nowrap px-6 py-4 text-right font-bold tabular-nums ${
                          tx.type === "founder_investment"
                            ? "text-emerald-600"
                            : isFounderSalary(tx)
                              ? "text-amber-600"
                              : "text-rose-600"
                        }`}
                      >
                        {tx.type === "founder_investment" ? "+" : "-"}
                        {formatINR(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit share / notes dialog */}
      <Dialog
        open={Boolean(editingFounder)}
        onOpenChange={(open) => !open && setEditingFounder(null)}
      >
        {editingFounder && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Partner Metadata</DialogTitle>
              <DialogDescription>
                Modify the partner's share percentage or private notes.
              </DialogDescription>
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
