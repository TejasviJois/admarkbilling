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
import type { Payment } from "@/lib/types";

const EMPTY_FORM = {
  amount: "",
  date: "",
  method: "upi",
  referenceNumber: "",
  transactionId: "",
  screenshotDataUrl: "",
  notes: "",
};

export function PaymentFormDialog({
  open,
  onOpenChange,
  invoiceId,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onSave: (payment: Payment) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_FORM,
        date: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open]);

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
    const saved: Payment = {
      id: "pay-" + crypto.randomUUID().slice(0, 8),
      invoiceId,
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
