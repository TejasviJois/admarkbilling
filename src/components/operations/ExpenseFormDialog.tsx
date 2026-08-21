import { useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  expenseCategoriesFor,
  matchCatalogCategory,
  paymentMethodLabelsFor,
  resolvePaymentMethodLabel,
} from "@/lib/form-options";
import type { Transaction } from "@/lib/types";

/** @deprecated Prefer expenseCategoriesFor(company) — kept for callers that need defaults. */
export const EXPENSE_CATEGORIES = [...DEFAULT_EXPENSE_CATEGORIES];

/** Match against defaults; unknown values stay as-is (no longer forced to Miscellaneous). */
export function matchExpenseCategory(raw: string | undefined): string {
  return matchCatalogCategory(raw, EXPENSE_CATEGORIES);
}

const EMPTY_FORM = {
  vendor: "",
  category: "",
  amount: "",
  gst: "",
  paymentMethod: "",
  date: "",
  notes: "",
  attachmentDataUrl: "",
};

export function ExpenseFormDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (tx: Transaction) => void;
}) {
  const { company } = useCompany();
  const expenseCategories = useMemo(() => expenseCategoriesFor(company), [company]);
  const paymentMethods = useMemo(() => paymentMethodLabelsFor(company), [company]);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (!open) return;
    const defaultCategory =
      expenseCategories.find((cat) => cat.toLowerCase() === "miscellaneous") ??
      expenseCategories[0] ??
      "Miscellaneous";
    setForm({
      ...EMPTY_FORM,
      category: defaultCategory,
      paymentMethod: resolvePaymentMethodLabel("bank_transfer", paymentMethods),
      date: new Date().toISOString().slice(0, 10),
    });
  }, [open, expenseCategories, paymentMethods]);

  const categoryOptions = useMemo(() => {
    const current = form.category.trim();
    if (
      current &&
      !expenseCategories.some((cat) => cat.toLowerCase() === current.toLowerCase())
    ) {
      return [...expenseCategories, current];
    }
    return expenseCategories;
  }, [expenseCategories, form.category]);

  const paymentOptions = useMemo(() => {
    const current = form.paymentMethod.trim();
    if (
      current &&
      !paymentMethods.some((method) => method.toLowerCase() === current.toLowerCase())
    ) {
      return [...paymentMethods, current];
    }
    return paymentMethods;
  }, [paymentMethods, form.paymentMethod]);

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, attachmentDataUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }

    if (!form.vendor.trim()) {
      alert("Vendor name is required.");
      return;
    }

    if (!form.category.trim()) {
      alert("Category is required.");
      return;
    }

    const gstNum = form.gst ? Number(form.gst) : 0;
    if (isNaN(gstNum) || gstNum < 0) {
      alert("Please enter a valid GST amount.");
      return;
    }

    const newTx: Transaction = {
      id: "tx-" + crypto.randomUUID().slice(0, 8),
      type: "expense",
      date: form.date,
      amount: amountNum,
      description: `Expense: ${form.vendor.trim()} (${form.category})`,
      category: form.category,
      paymentMethod: form.paymentMethod,
      vendor: form.vendor.trim(),
      gst: gstNum || undefined,
      notes: form.notes.trim() || undefined,
      attachmentDataUrl: form.attachmentDataUrl || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      historical: false,
    };

    onSave(newTx);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log Business Expense</DialogTitle>
          <DialogDescription>
            Record expenditures, invoices, or contractor fees. GST payments are compiled for tax
            audits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor Name *" id="exp-vendor">
              <Input
                id="exp-vendor"
                value={form.vendor}
                onChange={(e) => setForm((f) => ({ ...f, vendor: e.target.value }))}
                placeholder="e.g. Amazon Web Services, Coworking Rent"
                required
              />
            </Field>

            <Field label="Category *" id="exp-category">
              <Select
                value={matchCatalogCategory(form.category, categoryOptions) || form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger id="exp-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount Paid (₹) *" id="exp-amount">
              <Input
                id="exp-amount"
                type="number"
                step="any"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="Total amount paid"
                required
              />
            </Field>

            <Field label="GST Share Paid (₹)" id="exp-gst">
              <Input
                id="exp-gst"
                type="number"
                step="any"
                value={form.gst}
                onChange={(e) => setForm((f) => ({ ...f, gst: e.target.value }))}
                placeholder="e.g. 2160 (if included)"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment Method *" id="exp-method">
              <Select
                value={resolvePaymentMethodLabel(form.paymentMethod, paymentOptions)}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
              >
                <SelectTrigger id="exp-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentOptions.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Date of Expense *" id="exp-date">
              <Input
                id="exp-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Upload Invoice / Receipt" id="exp-attachment">
            <Input
              id="exp-attachment"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleAttachmentChange}
            />
            {form.attachmentDataUrl && (
              <div className="mt-2 flex items-center gap-2">
                <img
                  src={form.attachmentDataUrl}
                  alt="Receipt Preview"
                  className="h-16 w-auto rounded border border-border object-contain"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, attachmentDataUrl: "" }))}
                  className="text-destructive text-xs"
                >
                  Remove
                </Button>
              </div>
            )}
          </Field>

          <Field label="Notes" id="exp-notes">
            <Textarea
              id="exp-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional details"
              rows={2}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Expense</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
