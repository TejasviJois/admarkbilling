import { useMemo, useState, useEffect } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { ResolvedFileImage } from "@/components/ResolvedFileImage";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { FOUNDER_SALARY_CATEGORY, FOUNDER_SHARE_WITHDRAWAL_CATEGORY } from "@/lib/founder-ledger";
import {
  expenseCategoriesFor,
  incomeCategoriesFor,
  matchCatalogCategory,
  paymentMethodLabelsFor,
  resolvePaymentMethodLabel,
} from "@/lib/form-options";
import type { Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: "client_payment", label: "Client Payment (Income)" },
  { value: "founder_investment", label: "Founder Investment" },
  { value: "founder_withdrawal", label: "Founder Withdrawal / Salary" },
  { value: "expense", label: "Business Expense" },
  { value: "refund", label: "Refund to Client" },
  { value: "internal_transfer", label: "Internal Account Transfer" },
  { value: "adjustment", label: "Cash Balance Adjustment (+ / −)" },
];

const EMPTY_FORM = {
  type: "expense" as TransactionType,
  date: "",
  amount: "",
  description: "",
  category: "",
  paymentMethod: "",
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
  initialType = "expense",
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  initialType?: TransactionType;
  onSave: (tx: Transaction) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const { ops } = useOperations();
  const { company } = useCompany();
  const clients = ops.clients ?? [];
  const projects = ops.projects ?? [];
  const founders = ops.founders ?? [];
  const expenseCategories = useMemo(() => expenseCategoriesFor(company), [company]);
  const incomeCategories = useMemo(() => incomeCategoriesFor(company), [company]);
  const paymentMethods = useMemo(() => paymentMethodLabelsFor(company), [company]);

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
        paymentMethod: resolvePaymentMethodLabel(transaction.paymentMethod, paymentMethods),
        relatedClientId: transaction.relatedClientId ?? "",
        relatedProjectId: transaction.relatedProjectId ?? "",
        relatedInvoiceId: transaction.relatedInvoiceId ?? "",
        relatedFounderId: transaction.relatedFounderId ?? "",
        relatedVendorId: transaction.relatedVendorId ?? "",
        notes: transaction.notes ?? "",
        attachmentDataUrl: transaction.attachmentDataUrl ?? "",
      });
      return;
    }
    const defaultExpense =
      expenseCategories.find((cat) => cat.toLowerCase() === "miscellaneous") ??
      expenseCategories[0] ??
      "";
    const category =
      initialType === "client_payment"
        ? (incomeCategories.find((c) => /client/i.test(c)) ?? incomeCategories[0] ?? "Client Income")
        : initialType === "founder_investment"
          ? (incomeCategories.find((c) => /founder|invest/i.test(c)) ??
            incomeCategories[0] ??
            "Founder Investment")
          : initialType === "refund"
            ? (incomeCategories.find((c) => /refund/i.test(c)) ?? "Refund")
            : initialType === "expense"
              ? defaultExpense
              : "";
    setForm({
      ...EMPTY_FORM,
      type: initialType,
      category,
      paymentMethod: resolvePaymentMethodLabel("bank_transfer", paymentMethods),
      date: new Date().toISOString().slice(0, 10),
    });
  }, [open, transaction, initialType, expenseCategories, incomeCategories, paymentMethods]);

  const expenseCategoryOptions = useMemo(() => {
    const current = form.category.trim();
    if (
      current &&
      !expenseCategories.some((cat) => cat.toLowerCase() === current.toLowerCase())
    ) {
      return [...expenseCategories, current];
    }
    return expenseCategories;
  }, [expenseCategories, form.category]);

  const incomeCategoryOptions = useMemo(() => {
    const current = form.category.trim();
    if (
      current &&
      !incomeCategories.some((cat) => cat.toLowerCase() === current.toLowerCase())
    ) {
      return [...incomeCategories, current];
    }
    return incomeCategories;
  }, [incomeCategories, form.category]);

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
    if (form.type !== "adjustment" && (isNaN(amountNum) || amountNum <= 0)) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }
    if (form.type === "adjustment" && (isNaN(amountNum) || amountNum === 0)) {
      alert("Please enter a non-zero adjustment amount.");
      return;
    }
    if (!form.description.trim()) {
      alert("Description is required.");
      return;
    }
    if (!form.paymentMethod) {
      alert("Payment method is required.");
      return;
    }
    if (form.type === "expense" && !form.category.trim()) {
      alert("Category is required for expenses.");
      return;
    }
    if (
      (form.type === "founder_investment" || form.type === "founder_withdrawal") &&
      !form.relatedFounderId
    ) {
      alert("Please select a founder.");
      return;
    }

    const saved: Transaction = {
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

  const usesIncomeCatalog =
    form.type === "client_payment" ||
    form.type === "founder_investment" ||
    form.type === "refund";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "Log Transaction"}</DialogTitle>
          <DialogDescription>
            Record any movement of funds inside the company. All metrics are computed from this
            ledger.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Transaction Type *" id="tx-type">
            <Select
              value={form.type}
              onValueChange={(v) => {
                let defaultCat = form.category;
                if (v === "client_payment") {
                  defaultCat =
                    incomeCategories.find((c) => /client/i.test(c)) ??
                    incomeCategories[0] ??
                    "Client Income";
                } else if (v === "founder_investment") {
                  defaultCat =
                    incomeCategories.find((c) => /founder|invest/i.test(c)) ??
                    incomeCategories[0] ??
                    "Founder Investment";
                } else if (v === "founder_withdrawal") {
                  defaultCat = FOUNDER_SHARE_WITHDRAWAL_CATEGORY;
                } else if (v === "refund") {
                  defaultCat = incomeCategories.find((c) => /refund/i.test(c)) ?? "Refund";
                } else if (v === "internal_transfer") defaultCat = "Transfer";
                else if (v === "adjustment") defaultCat = "Adjustment";
                else if (v === "expense") {
                  defaultCat =
                    expenseCategories.find((c) => c.toLowerCase() === "miscellaneous") ??
                    expenseCategories[0] ??
                    "";
                }
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
            <Field
              label={form.type === "adjustment" ? "Adjustment Amount (₹, + / −) *" : "Amount (₹) *"}
              id="tx-amount"
            >
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
            {form.type === "founder_withdrawal" ? (
              <Field label="Payout Nature *" id="tx-category">
                <Select
                  value={
                    /salary/i.test(form.category)
                      ? FOUNDER_SALARY_CATEGORY
                      : FOUNDER_SHARE_WITHDRAWAL_CATEGORY
                  }
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger id="tx-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FOUNDER_SHARE_WITHDRAWAL_CATEGORY}>
                      Share Withdrawal (reduces equity balance)
                    </SelectItem>
                    <SelectItem value={FOUNDER_SALARY_CATEGORY}>
                      Salary (company pay — equity untouched)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : form.type === "expense" ? (
              <Field label="Category *" id="tx-category">
                <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      id="tx-category"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={categoryOpen}
                      className="w-full justify-between font-normal"
                    >
                      {matchCatalogCategory(form.category, expenseCategoryOptions) ||
                        "Select category…"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-(--radix-popover-trigger-width) p-0">
                    <Command>
                      <CommandInput placeholder="Search category…" />
                      <CommandList>
                        <CommandEmpty>No category found.</CommandEmpty>
                        <CommandGroup>
                          {expenseCategoryOptions.map((cat) => (
                            <CommandItem
                              key={cat}
                              value={cat}
                              onSelect={() => {
                                setForm((f) => ({ ...f, category: cat }));
                                setCategoryOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  matchCatalogCategory(form.category, expenseCategoryOptions) ===
                                    cat
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {cat}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </Field>
            ) : usesIncomeCatalog ? (
              <Field label="Category *" id="tx-category">
                <Select
                  value={
                    matchCatalogCategory(form.category, incomeCategoryOptions) || form.category
                  }
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
                >
                  <SelectTrigger id="tx-category">
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeCategoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <Field label="Category *" id="tx-category">
                <Input
                  id="tx-category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  placeholder="e.g. Transfer, Adjustment"
                  required
                />
              </Field>
            )}

            <Field label="Payment Method *" id="tx-method">
              <Select
                value={resolvePaymentMethodLabel(form.paymentMethod, paymentOptions)}
                onValueChange={(v) => setForm((f) => ({ ...f, paymentMethod: v }))}
              >
                <SelectTrigger id="tx-method">
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
          </div>

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
                <ResolvedFileImage
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
              placeholder="Optional notes"
              rows={2}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{isEdit ? "Save Changes" : "Log Transaction"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
