import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/operations/operations-ui";
import {
  FIXED_MONTHLY_EXPENSE_KINDS,
  FIXED_MONTHLY_EXPENSE_KIND_LABELS,
} from "@/lib/fixed-monthly-expenses";
import type { FixedMonthlyExpense, FixedMonthlyExpenseKind } from "@/lib/types";

function newFixedId(): string {
  return `fix_${crypto.randomUUID().slice(0, 8)}`;
}

const EMPTY = {
  label: "",
  amount: "",
  kind: "other" as FixedMonthlyExpenseKind,
  startDate: new Date().toISOString().slice(0, 10),
  notes: "",
};

export function FixedMonthlyExpenseDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (entry: FixedMonthlyExpense) => void;
}) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm({ ...EMPTY, startDate: new Date().toISOString().slice(0, 10) });
  }, [open]);

  const submit = () => {
    if (!form.label.trim() || !form.amount || !form.startDate) return;
    onSave({
      id: newFixedId(),
      label: form.label.trim(),
      amountPerMonth: Number(form.amount),
      kind: form.kind,
      startDate: form.startDate,
      notes: form.notes.trim() || undefined,
      active: true,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add monthly retainer</DialogTitle>
          <DialogDescription>
            Recurring outflows — salary, EMI, rent, subscriptions, and other fixed monthly costs.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Field label="Type" id="fixed-dialog-kind">
            <Select
              value={form.kind}
              onValueChange={(v) => setForm((f) => ({ ...f, kind: v as FixedMonthlyExpenseKind }))}
            >
              <SelectTrigger id="fixed-dialog-kind">
                <SelectValue placeholder="Choose type" />
              </SelectTrigger>
              <SelectContent>
                {FIXED_MONTHLY_EXPENSE_KINDS.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {FIXED_MONTHLY_EXPENSE_KIND_LABELS[kind]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" id="fixed-dialog-label">
            <Input
              id="fixed-dialog-label"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Office rent, team salary, SaaS stack"
            />
          </Field>
          <Field label="Amount / month (₹)" id="fixed-dialog-amount">
            <Input
              id="fixed-dialog-amount"
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="20000"
            />
          </Field>
          <Field label="Starts on" id="fixed-dialog-start">
            <Input
              id="fixed-dialog-start"
              type="date"
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            />
          </Field>
          <Field label="Notes (optional)" id="fixed-dialog-notes">
            <Input
              id="fixed-dialog-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Lender, contract ref…"
            />
          </Field>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={!form.label.trim() || !form.amount || !form.startDate}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
