import { useMemo, useState, useEffect } from "react";
import { Check, ChevronsUpDown, Sparkles } from "lucide-react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/operations/operations-ui";
import { ResolvedFileImage } from "@/components/ResolvedFileImage";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { projectsForClientRelationship } from "@/lib/client-projects";
import { projectLabel } from "@/lib/document-vault";
import { FOUNDER_SALARY_CATEGORY, FOUNDER_SHARE_WITHDRAWAL_CATEGORY } from "@/lib/founder-ledger";
import {
  expenseCategoriesFor,
  incomeCategoriesFor,
  matchCatalogCategory,
  paymentMethodLabelsFor,
  resolvePaymentMethodLabel,
} from "@/lib/form-options";
import { projectStatusLabel } from "@/lib/project-status";
import type { Client, Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Same roster rule as /clients — child companies (Kapila under Safewheels) are not separate picks. */
function rootClientOf(clientId: string | undefined, allClients: Client[]): Client | null {
  if (!clientId) return null;
  const client = allClients.find((entry) => entry.id === clientId);
  if (!client) return null;
  if (!client.parentClientId) return client;
  return allClients.find((entry) => entry.id === client.parentClientId) ?? client;
}

function projectOptionLabel(
  project: {
    projectType?: string;
    name?: string;
    client: string;
    status: Parameters<typeof projectStatusLabel>[0];
  },
  relationshipRootName?: string,
): string {
  const company = (project.client ?? "").trim();
  const typeOrName =
    project.projectType?.trim() ||
    (project.name?.trim() && project.name.trim() !== company ? project.name.trim() : null) ||
    company ||
    "Project";
  const status = projectStatusLabel(project.status);
  // Under Safewheels, show "Kapila Management Software · …" so child brands stay clear.
  if (
    company &&
    relationshipRootName &&
    company.toLowerCase() !== relationshipRootName.trim().toLowerCase()
  ) {
    return `${company} · ${typeOrName} · ${status}`;
  }
  return `${typeOrName} · ${status}`;
}

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: "client_payment", label: "Client Payment (Income)" },
  { value: "founder_investment", label: "Founder Investment" },
  { value: "founder_withdrawal", label: "Founder Withdrawal / Salary" },
  { value: "expense", label: "Business Expense" },
  { value: "refund", label: "Refund to Client" },
  { value: "internal_transfer", label: "Internal Account Transfer" },
  { value: "adjustment", label: "Cash Balance Adjustment (+ / −)" },
];

const CUSTOM_TYPES_STORAGE_KEY = "admark.custom_transaction_types";

interface CustomTypeOption {
  name: string;
  flow: "income" | "expense";
}

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
  const [isCustomType, setIsCustomType] = useState(false);
  const [customTypeName, setCustomTypeName] = useState("");
  const [customTypeFlow, setCustomTypeFlow] = useState<"income" | "expense">("income");
  const [savedCustomTypes, setSavedCustomTypes] = useState<CustomTypeOption[]>([]);

  const { ops } = useOperations();
  const { company } = useCompany();
  const allClients = ops.clients ?? [];
  const clients = useMemo(() => {
    // Match Clients page: only relationship roots (not Kapila-under-Safewheels children).
    const roots = allClients
      .filter(
        (client) =>
          !client.parentClientId &&
          client.status !== "inactive" &&
          Boolean(client.companyName?.trim()),
      )
      .slice()
      .sort((a, b) =>
        (a.companyName ?? "").localeCompare(b.companyName ?? "", undefined, {
          sensitivity: "base",
        }),
      );
    const linkedRoot = rootClientOf(form.relatedClientId, allClients);
    if (linkedRoot && !roots.some((client) => client.id === linkedRoot.id)) {
      return [linkedRoot, ...roots];
    }
    return roots;
  }, [allClients, form.relatedClientId]);
  const projects = ops.projects ?? [];
  const founders = ops.founders ?? [];
  const selectedClientId = rootClientOf(form.relatedClientId, allClients)?.id ?? form.relatedClientId;
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const clientProjects = useMemo(() => {
    if (!selectedClient) return [];
    const linked = projectsForClientRelationship(projects, selectedClient, allClients).sort(
      (a, b) => projectLabel(a).localeCompare(projectLabel(b)),
    );
    const linkedId = form.relatedProjectId;
    if (linkedId && !linked.some((project) => project.id === linkedId)) {
      const existing = projects.find((project) => project.id === linkedId);
      if (existing) return [existing, ...linked];
    }
    return linked;
  }, [projects, selectedClient, allClients, form.relatedProjectId]);
  const expenseCategories = useMemo(() => expenseCategoriesFor(company), [company]);
  const incomeCategories = useMemo(() => incomeCategoriesFor(company), [company]);
  const paymentMethods = useMemo(() => paymentMethodLabelsFor(company), [company]);

  const isEdit = Boolean(transaction);

  // Load custom transaction types from local storage and existing ledger
  useEffect(() => {
    let stored: CustomTypeOption[] = [];
    try {
      const raw = localStorage.getItem(CUSTOM_TYPES_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {}

    const fromLedger: CustomTypeOption[] = [];
    (ops.transactions ?? []).forEach((t) => {
      if (t.customType?.trim()) {
        const name = t.customType.trim();
        const flow =
          t.type === "expense" || t.type === "founder_withdrawal" || t.type === "refund"
            ? "expense"
            : "income";
        fromLedger.push({ name, flow });
      }
    });

    const map = new Map<string, CustomTypeOption>();
    [...stored, ...fromLedger].forEach((item) => {
      if (item && item.name?.trim() && !map.has(item.name.trim().toLowerCase())) {
        map.set(item.name.trim().toLowerCase(), { name: item.name.trim(), flow: item.flow });
      }
    });
    setSavedCustomTypes(Array.from(map.values()));
  }, [ops.transactions]);

  useEffect(() => {
    if (!open) return;
    if (transaction) {
      const isCustom = Boolean(transaction.customType?.trim());
      setIsCustomType(isCustom);
      setCustomTypeName(transaction.customType?.trim() ?? "");
      const flow =
        transaction.type === "expense" ||
        transaction.type === "founder_withdrawal" ||
        transaction.type === "refund"
          ? "expense"
          : "income";
      setCustomTypeFlow(flow);

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

    setIsCustomType(false);
    setCustomTypeName("");
    setCustomTypeFlow(initialType === "expense" ? "expense" : "income");

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
    if (isCustomType && !customTypeName.trim()) {
      alert("Please enter a name for your custom transaction type.");
      return;
    }
    const amountNum = Number(form.amount);
    if (!isCustomType && form.type === "adjustment") {
      if (isNaN(amountNum) || amountNum === 0) {
        alert("Please enter a non-zero adjustment amount.");
        return;
      }
    } else {
      if (isNaN(amountNum) || amountNum <= 0) {
        alert("Please enter a valid amount greater than 0.");
        return;
      }
    }
    if (!form.description.trim()) {
      alert("Description is required.");
      return;
    }
    if (!form.paymentMethod) {
      alert("Payment method is required.");
      return;
    }
    if (!isCustomType && form.type === "expense" && !form.category.trim()) {
      alert("Category is required for expenses.");
      return;
    }
    if (
      !isCustomType &&
      (form.type === "founder_investment" || form.type === "founder_withdrawal") &&
      !form.relatedFounderId
    ) {
      alert("Please select a founder.");
      return;
    }

    if (isCustomType && customTypeName.trim()) {
      const trimmedName = customTypeName.trim();
      const newCustom: CustomTypeOption = { name: trimmedName, flow: customTypeFlow };
      const updated = [
        newCustom,
        ...savedCustomTypes.filter((c) => c.name.toLowerCase() !== trimmedName.toLowerCase()),
      ];
      try {
        localStorage.setItem(CUSTOM_TYPES_STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      setSavedCustomTypes(updated);
    }

    const effectiveType: TransactionType = isCustomType
      ? customTypeFlow === "income"
        ? "client_payment"
        : "expense"
      : form.type;

    const effectiveCategory = form.category.trim()
      ? form.category.trim()
      : isCustomType
        ? customTypeFlow === "income"
          ? "Client Income"
          : "Miscellaneous"
        : "";

    const saved: Transaction = {
      id: transaction?.id ?? "tx-" + crypto.randomUUID().slice(0, 8),
      type: effectiveType,
      customType: isCustomType && customTypeName.trim() ? customTypeName.trim() : undefined,
      date: form.date,
      amount: amountNum,
      description: form.description.trim(),
      category: effectiveCategory,
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

  const selectedTypeValue = useMemo(() => {
    if (isCustomType) {
      const match = savedCustomTypes.find(
        (s) => s.name.toLowerCase() === customTypeName.trim().toLowerCase(),
      );
      if (match) return `custom_${match.name.toLowerCase()}`;
      return "__custom_new__";
    }
    return form.type;
  }, [isCustomType, customTypeName, savedCustomTypes, form.type]);

  const usesIncomeCatalog =
    (!isCustomType &&
      (form.type === "client_payment" ||
        form.type === "founder_investment" ||
        form.type === "refund")) ||
    (isCustomType && customTypeFlow === "income");

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
              value={selectedTypeValue}
              onValueChange={(v) => {
                if (v === "__custom_new__") {
                  setIsCustomType(true);
                  setCustomTypeName("");
                  setCustomTypeFlow("income");
                  setForm((f) => ({
                    ...f,
                    type: "client_payment",
                    category: incomeCategories[0] ?? "Client Income",
                  }));
                  return;
                }
                if (v.startsWith("custom_")) {
                  const match = savedCustomTypes.find(
                    (s) => `custom_${s.name.toLowerCase()}` === v,
                  );
                  if (match) {
                    setIsCustomType(true);
                    setCustomTypeName(match.name);
                    setCustomTypeFlow(match.flow);
                    setForm((f) => ({
                      ...f,
                      type: match.flow === "income" ? "client_payment" : "expense",
                      category:
                        match.flow === "income"
                          ? (incomeCategories[0] ?? "Client Income")
                          : (expenseCategories[0] ?? "Miscellaneous"),
                    }));
                  }
                  return;
                }
                setIsCustomType(false);
                setCustomTypeName("");
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
                <SelectGroup>
                  <SelectLabel>Standard Types</SelectLabel>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectGroup>

                {savedCustomTypes.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>Custom Types</SelectLabel>
                      {savedCustomTypes.map((t) => (
                        <SelectItem
                          key={`custom_${t.name.toLowerCase()}`}
                          value={`custom_${t.name.toLowerCase()}`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                t.flow === "income" ? "bg-emerald-400" : "bg-rose-400",
                              )}
                            />
                            <span>{t.name}</span>
                            <span className="text-white/40 text-xs">
                              ({t.flow === "income" ? "Income" : "Expense"})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}

                <SelectSeparator />
                <SelectItem value="__custom_new__" className="text-orange-400 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>
                      {isCustomType && customTypeName.trim()
                        ? `Custom: ${customTypeName.trim()}`
                        : "+ Custom Type (Name anything…)"}
                    </span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {isCustomType && (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/[0.04] p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orange-400" /> Custom Type Details
                </span>
                <button
                  type="button"
                  className="text-[11px] text-white/40 hover:text-white transition-colors cursor-pointer"
                  onClick={() => {
                    setIsCustomType(false);
                    setCustomTypeName("");
                    setForm((f) => ({ ...f, type: "client_payment" }));
                  }}
                >
                  Switch to standard
                </button>
              </div>

              <Field label="Custom Type Name *" id="tx-custom-name">
                <Input
                  id="tx-custom-name"
                  value={customTypeName}
                  onChange={(e) => setCustomTypeName(e.target.value)}
                  placeholder="e.g. Sponsorship, Royalty, Subscription, Advisory Fee..."
                  className="border-orange-500/30 focus-visible:ring-orange-500/30"
                  autoFocus
                  required
                />
              </Field>

              <Field label="Cashflow Nature (Accounting Flow) *" id="tx-custom-flow">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTypeFlow("income");
                      setForm((f) => ({ ...f, type: "client_payment" }));
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2 px-3 text-xs font-medium transition-all cursor-pointer",
                      customTypeFlow === "income"
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 font-semibold shadow-sm"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    Money In (Income / Inflow)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomTypeFlow("expense");
                      setForm((f) => ({ ...f, type: "expense" }));
                    }}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-xl border py-2 px-3 text-xs font-medium transition-all cursor-pointer",
                      customTypeFlow === "expense"
                        ? "border-rose-500/60 bg-rose-500/15 text-rose-300 font-semibold shadow-sm"
                        : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white hover:bg-white/[0.06]",
                    )}
                  >
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    Money Out (Expense / Outflow)
                  </button>
                </div>
              </Field>
            </div>
          )}

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
            ) : (!isCustomType && form.type === "expense") ||
              (isCustomType && customTypeFlow === "expense") ? (
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

          {form.type === "client_payment" || form.type === "refund" || isCustomType ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={isCustomType ? "Related Client (Optional)" : "Related Client"}
                id="tx-client"
              >
                <Select
                  value={selectedClientId || undefined}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      relatedClientId: v,
                      // Changing client clears a project that belongs to someone else.
                      relatedProjectId: "",
                    }))
                  }
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
                  value={form.relatedProjectId || undefined}
                  onValueChange={(v) => setForm((f) => ({ ...f, relatedProjectId: v }))}
                  disabled={!selectedClient}
                >
                  <SelectTrigger id="tx-project">
                    <SelectValue
                      placeholder={
                        selectedClient ? "Select project..." : "Select a client first"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {clientProjects.length === 0 ? (
                      <SelectItem value="__none" disabled>
                        No projects for this client
                      </SelectItem>
                    ) : (
                      clientProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {projectOptionLabel(p, selectedClient?.companyName)}
                        </SelectItem>
                      ))
                    )}
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
