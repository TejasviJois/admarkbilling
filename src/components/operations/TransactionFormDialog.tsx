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
import { useOperations } from "@/hooks/use-operations";
import type { Transaction, TransactionType, Client, Project } from "@/lib/types";

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: "client_payment", label: "Client Payment (Income)" },
  { value: "founder_investment", label: "Founder Investment" },
  { value: "founder_withdrawal", label: "Founder Withdrawal / Salary" },
  { value: "expense", label: "Business Expense" },
  { value: "refund", label: "Refund to Client" },
  { value: "internal_transfer", label: "Internal Account Transfer" },
];

const PAYMENT_METHODS = [
  { value: "upi", label: "UPI (GPay / PhonePe / Paytm)" },
  { value: "bank_transfer", label: "Bank Transfer (NEFT / IMPS / RTGS)" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

const EMPTY_FORM = {
  type: "expense" as TransactionType,
  date: "",
  amount: "",
  description: "",
  category: "",
  paymentMethod: "bank_transfer",
  relatedClientId: "",
  relatedProjectId: "",
  relatedInvoiceId: "",
  relatedFounderId: "",
  relatedVendorId: "",
  notes: "",
  attachmentDataUrl: "",
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  onSave: (tx: Transaction) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const { ops } = useOperations();
  const clients = ops.clients ?? [];
  const projects = ops.projects ?? [];
  const founders = ops.founders ?? [];
  
  const isEdit = Boolean(transaction);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      setForm({
        type: transaction.type,
        date: transaction.date,
        amount: String(transaction.amount),
        description: transaction.description,
        category: transaction.category,
        paymentMethod: transaction.paymentMethod,
        relatedClientId: transaction.relatedClientId ?? "",
        relatedProjectId: transaction.relatedProjectId ?? "",
        relatedInvoiceId: transaction.relatedInvoiceId ?? "",
        relatedFounderId: transaction.relatedFounderId ?? "",
        relatedVendorId: transaction.relatedVendorId ?? "",
        notes: transaction.notes ?? "",
        attachmentDataUrl: transaction.attachmentDataUrl ?? "",
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        date: new Date().toISOString().slice(0, 10),
      });
    }
  }, [open, transaction]);

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

    // FUTURE VALIDATION RULES
    if (!transaction || !transaction.historical) {
      // 1. Encourage payment proof upload for Income (client_payment)
      if (form.type === "client_payment" && !form.attachmentDataUrl) {
        const confirmSave = confirm(
          "Tip: It is highly encouraged to upload a payment proof or screenshot for client payments. Save anyway?"
        );
        if (!confirmSave) return;
      }

      // 2. Payments / Transactions must contain payment method
      if (!form.paymentMethod) {
        alert("Payment Method is required.");
        return;
      }

      // 3. Expenses must contain category
      if (form.type === "expense" && !form.category.trim()) {
        alert("Expense Category is required (e.g., software, rent, office, travel).");
        return;
      }

      // 4. Large Expenses (> ₹10,000) should support attachments
      if (form.type === "expense" && amountNum > 10000 && !form.attachmentDataUrl) {
        const confirmSave = confirm(
          "Large Expense Notice: Expenses above ₹10,000 should have a supporting receipt/attachment. Save anyway?"
        );
        if (!confirmSave) return;
      }
    }

    const saved: Transaction = {
      ...(transaction ?? {}),
      id: transaction?.id ?? "tx-" + crypto.randomUUID().slice(0, 8),
      type: form.type,
      date: form.date,
      amount: amountNum,
      description: form.description.trim(),
      category: form.category.trim(),
      paymentMethod: form.paymentMethod,
      relatedClientId: form.relatedClientId || undefined,
      relatedProjectId: form.relatedProjectId || undefined,
      relatedInvoiceId: form.relatedInvoiceId || undefined,
      relatedFounderId: form.relatedFounderId || undefined,
      relatedVendorId: form.relatedVendorId || undefined,
      notes: form.notes.trim() || undefined,
      attachmentDataUrl: form.attachmentDataUrl || undefined,
      createdAt: transaction?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      historical: transaction?.historical ?? false,
    };
    
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "Log Transaction"}</DialogTitle>
          <DialogDescription>
            Record any movement of funds inside the company. All metrics are computed from this ledger.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Transaction Type *" id="tx-type">
            <Select
              value={form.type}
              onValueChange={(v) => {
                let defaultCat = form.category;
                if (v === "client_payment") defaultCat = "Client Income";
                else if (v === "founder_investment") defaultCat = "Founder Equity";
                else if (v === "founder_withdrawal") defaultCat = "Founder Payout";
                else if (v === "refund") defaultCat = "Refund";
                else if (v === "internal_transfer") defaultCat = "Transfer";
                setForm((f) => ({ ...f, type: v as TransactionType, category: defaultCat }));
              }}
            >
              <SelectTrigger id="tx-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹) *" id="tx-amount">
              <Input
                id="tx-amount"
                type="number"
                step="any"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 5000"
                required
              />
            </Field>

            <Field label="Transaction Date *" id="tx-date">
              <Input
                id="tx-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </Field>
          </div>

          <Field label="Description *" id="tx-desc">
            <Input
              id="tx-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. AWS hosting bill, Client milestone payment"
              required
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category *" id="tx-category">
              <Input
                id="tx-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Software, Salary, Marketing"
                required
              />
            </Field>

            <Field label="Payment Method *" id="tx-method">
              <Select
                value={form.paymentMethod}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
              >
                <SelectTrigger id="tx-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Type-Specific Relations */}
          {form.type === "client_payment" || form.type === "refund" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Related Client" id="tx-client">
                <Select
                  value={form.relatedClientId}
                  onValueChange={(v) => setForm((f) => ({ ...f, relatedClientId: v }))}
                >
                  <SelectTrigger id="tx-client">
                    <SelectValue placeholder="Select client..." />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.companyName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Related Project" id="tx-project">
                <Select
                  value={form.relatedProjectId}
                  onValueChange={(v) => setForm((f) => ({ ...f, relatedProjectId: v }))}
                >
                  <SelectTrigger id="tx-project">
                    <SelectValue placeholder="Select project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          ) : null}

          {form.type === "founder_investment" || form.type === "founder_withdrawal" ? (
            <Field label="Select Founder *" id="tx-founder">
              <Select
                value={form.relatedFounderId}
                onValueChange={(v) => setForm((f) => ({ ...f, relatedFounderId: v }))}
              >
                <SelectTrigger id="tx-founder">
                  <SelectValue placeholder="Select founder..." />
                </SelectTrigger>
                <SelectContent>
                  {founders.map((founder) => (
                    <SelectItem key={founder.id} value={founder.id}>
                      {founder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <Field label="Upload Attachment / Proof Receipt" id="tx-attachment">
            <Input
              id="tx-attachment"
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

          <Field label="Internal Remarks / Notes" id="tx-notes">
            <Textarea
              id="tx-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Any additional accounting notes…"
              rows={2}
            />
          </Field>

          {transaction?.historical && (
            <div className="rounded border border-amber-300 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
              Note: This is a **Historical** transaction. Requirements for supporting proof/attachments are relaxed.
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Transaction</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
