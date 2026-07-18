import { useState, useEffect } from "react";
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
import { formatINR } from "@/lib/invoice-calc";
import type { Payment } from "@/lib/types";

export type PaymentProjectOption = {
  id: string;
  label: string;
  outstanding: number | null;
};

const EMPTY_FORM = {
  amount: "",
  date: "",
  method: "upi",
  referenceNumber: "",
  transactionId: "",
  screenshotDataUrl: "",
  notes: "",
  projectId: "",
};

export function PaymentFormDialog({
  open,
  onOpenChange,
  invoiceId,
  onSave,
  outstandingBalance,
  projectOptions = [],
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSave: (payment: Payment) => void;
  /** Remaining balance on this invoice — positive payments cannot exceed it. */
  outstandingBalance?: number;
  /** The client's revenue projects this payment can be applied to. */
  projectOptions?: PaymentProjectOption[];
  defaultProjectId?: string;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_FORM,
        date: new Date().toISOString().slice(0, 10),
        projectId: defaultProjectId ?? projectOptions[0]?.id ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId]);

  const handleScreenshotChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm((f) => ({ ...f, screenshotDataUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(form.amount);
    if (isNaN(amountNum) || amountNum === 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (
      amountNum > 0 &&
      outstandingBalance != null &&
      amountNum > outstandingBalance + 0.005
    ) {
      alert(
        `This payment (${formatINR(amountNum)}) is more than the invoice's outstanding balance of ${formatINR(outstandingBalance)}. Reduce the amount, or create a new invoice for the extra work.`,
      );
      return;
    }
    const saved: Payment = {
      id: "pay-" + crypto.randomUUID().slice(0, 8),
      invoiceId,
      projectId: form.projectId || undefined,
      amount: amountNum,
      date: form.date,
      method: form.method,
      referenceNumber: form.referenceNumber.trim() || undefined,
      transactionId: form.transactionId.trim() || undefined,
      screenshotDataUrl: form.screenshotDataUrl || undefined,
      notes: form.notes.trim() || undefined,
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log Payment</DialogTitle>
          <DialogDescription>Record full/partial payment, advance, or refunds against this invoice.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Amount (₹) *" id="pay-amount">
            <Input
              id="pay-amount"
              type="number"
              step="any"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="e.g. 50000 (negative values for refunds)"
              required
            />
          </Field>
          {projectOptions.length > 0 && (
            <Field label="Apply to project *" id="pay-project">
              <Select
                value={form.projectId}
                onValueChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
              >
                <SelectTrigger id="pay-project">
                  <SelectValue placeholder="Choose the project this payment belongs to" />
                </SelectTrigger>
                <SelectContent>
                  {projectOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                      {option.outstanding != null
                        ? ` · ${formatINR(option.outstanding)} outstanding`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projectOptions.length > 1 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  This client has multiple projects — pick the one this money is for.
                </p>
              )}
            </Field>
          )}
          <Field label="Payment Date *" id="pay-date">
            <Input
              id="pay-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </Field>
          <Field label="Payment Method *" id="pay-method">
            <Select
              value={form.method}
              onValueChange={(v) => setForm((f) => ({ ...f, method: v }))}
            >
              <SelectTrigger id="pay-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upi">UPI</SelectItem>
                <SelectItem value="bank_transfer">Bank Transfer (NEFT/IMPS)</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reference Number" id="pay-ref">
            <Input
              id="pay-ref"
              value={form.referenceNumber}
              onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
              placeholder="e.g. Bank Ref No."
            />
          </Field>
          <Field label="Transaction ID" id="pay-txid">
            <Input
              id="pay-txid"
              value={form.transactionId}
              onChange={(e) => setForm((f) => ({ ...f, transactionId: e.target.value }))}
              placeholder="e.g. UPI transaction ID"
            />
          </Field>
          <Field label="Upload Screenshot Proof" id="pay-screenshot">
            <Input
              id="pay-screenshot"
              type="file"
              accept="image/*"
              onChange={handleScreenshotChange}
            />
            {form.screenshotDataUrl && (
              <img
                src={form.screenshotDataUrl}
                alt="Payment proof preview"
                className="mt-2 h-20 w-auto rounded border border-border object-contain"
              />
            )}
          </Field>
          <Field label="Notes" id="pay-notes">
            <Textarea
              id="pay-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Payment remarks or reference details…"
              rows={2}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
