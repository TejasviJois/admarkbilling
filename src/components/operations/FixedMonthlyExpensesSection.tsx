import { useState } from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FixedMonthlyExpenseDialog } from "@/components/operations/FixedMonthlyExpenseDialog";
import { DataTable, EmptyRow, RowDelete } from "./operations-ui";
import {
  fixedMonthlyKindLabel,
  formatFinancialINR,
  summarizeFixedMonthlyByKind,
  sumActiveFixedMonthlyExpenses,
} from "@/lib/fixed-monthly-expenses";
import type { FixedMonthlyExpense, OperationsData } from "@/lib/types";

export function FixedMonthlyExpensesSection({
  ops,
  persist,
}: {
  ops: OperationsData;
  persist: (next: OperationsData) => void;
}) {
  const items = ops.fixedMonthlyExpenses ?? [];
  const total = sumActiveFixedMonthlyExpenses(items);
  const byKind = summarizeFixedMonthlyByKind(items);
  const [dialogOpen, setDialogOpen] = useState(false);

  const saveItems = (next: FixedMonthlyExpense[]) => {
    persist({ ...ops, fixedMonthlyExpenses: next });
  };

  const addItem = (entry: FixedMonthlyExpense) => {
    saveItems([entry, ...items]);
  };

  const toggleActive = (id: string) => {
    saveItems(items.map((e) => (e.id === id ? { ...e, active: !e.active } : e)));
  };

  const removeItem = (id: string) => {
    saveItems(items.filter((e) => e.id !== id));
  };

  return (
    <>
      <section
        id="monthly-retainers"
        className="scroll-mt-24 rounded-lg border border-border bg-muted/10 p-4 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div>
              <h3 className="text-base font-semibold text-foreground">Monthly retainers</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Fixed monthly costs — salary, EMI, rent, subscriptions. Log actual payments in the
                ledger when paid.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => setDialogOpen(true)}
            aria-label="Add monthly retainer"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Active total:{" "}
          <span className="font-semibold tabular-nums text-rose-400">{formatFinancialINR(total)}</span>
          /month
        </p>

        {byKind.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {byKind.map((row) => (
              <span
                key={row.kind}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs"
              >
                <span className="font-medium text-foreground">{row.label}</span>
                <span className="tabular-nums text-rose-400">{formatFinancialINR(row.total)}/mo</span>
                <span className="text-muted-foreground">· {row.count}</span>
              </span>
            ))}
          </div>
        )}

        {items.length === 0 ? (
          <EmptyRow message="No monthly retainers yet. Tap + to add salary, rent, EMI, or other fixed costs." />
        ) : (
          <DataTable
            headers={["Type", "Description", "Per month", "Starts", "Status", "Notes", ""]}
            rows={items.map((e) => [
              fixedMonthlyKindLabel(e.kind),
              e.label,
              <span key={`amt-${e.id}`} className="font-medium tabular-nums text-rose-400">
                {formatFinancialINR(e.amountPerMonth)}
              </span>,
              e.startDate,
              <button
                key={`st-${e.id}`}
                type="button"
                onClick={() => toggleActive(e.id)}
                className={`text-xs font-medium ${e.active ? "text-emerald-400" : "text-muted-foreground"}`}
              >
                {e.active ? "Active" : "Paused"}
              </button>,
              e.notes || "—",
              <RowDelete key={`del-${e.id}`} onClick={() => removeItem(e.id)} />,
            ])}
          />
        )}

        {items.some((e) => e.id === "fixed-loan-repayment") && (
          <p className="mt-3 text-xs text-muted-foreground">
            Handout balance (₹1,21,500 baseline) is tracked separately — the loan row is the monthly
            EMI schedule, not the loan itself.
          </p>
        )}
      </section>

      <FixedMonthlyExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} onSave={addItem} />
    </>
  );
}
