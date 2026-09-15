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
import { toLocalISODate } from "@/lib/date-range-filter";
import type {
  FixedMonthlyExpense,
  FixedMonthlyExpenseKind,
  OpsBillingCycle,
} from "@/lib/types";

type Mode = "office" | "renewal";

const OFFICE_KINDS: Array<{ value: FixedMonthlyExpenseKind; label: string }> = [
  { value: "rent", label: "Rent" },
  { value: "utility", label: "Utility (electricity, water…)" },
  { value: "other", label: "Other (groceries, supplies…)" },
];

const RENEWAL_KINDS: Array<{ value: FixedMonthlyExpenseKind; label: string }> = [
  { value: "subscription", label: "Subscription / SaaS" },
  { value: "emi", label: "EMI / installment" },
];

export function FixedExpenseFormDialog({
  open,
  onOpenChange,
  item,
  mode,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FixedMonthlyExpense | null;
  mode: Mode;
  onSave: (saved: FixedMonthlyExpense) => void;
}) {
  const kinds = mode === "office" ? OFFICE_KINDS : RENEWAL_KINDS;
  const [label, setLabel] = useState("");
  const [payee, setPayee] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<FixedMonthlyExpenseKind>(kinds[0].value);
  const [startDate, setStartDate] = useState(toLocalISODate());
  const [totalAmount, setTotalAmount] = useState("");
  const [totalMonths, setTotalMonths] = useState("");
  const [priorPaidAmount, setPriorPaidAmount] = useState("");
  const [reminderDay, setReminderDay] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [billingCycle, setBillingCycle] = useState<OpsBillingCycle>("monthly");
  const [status, setStatus] = useState<"active" | "paused" | "completed">("active");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setLabel(item?.label ?? "");
    setPayee(item?.payee ?? "");
    setVendor(item?.vendor ?? "");
    setAmount(item ? String(item.amountPerMonth) : "");
    setKind(item?.kind && kinds.some((k) => k.value === item.kind) ? item.kind : kinds[0].value);
    setStartDate(item?.startDate ?? toLocalISODate());
    setTotalAmount(item?.totalAmount != null ? String(item.totalAmount) : "");
    setTotalMonths(item?.totalMonths != null ? String(item.totalMonths) : "");
    const priorRupees =
      item?.priorPaidAmount != null
        ? item.priorPaidAmount
        : item?.priorPaidInstallments != null && item.amountPerMonth
          ? item.priorPaidInstallments * item.amountPerMonth
          : undefined;
    setPriorPaidAmount(priorRupees != null ? String(priorRupees) : "");
    setReminderDay(item?.reminderDay != null ? String(item.reminderDay) : "");
    setNextDueDate(item?.nextDueDate ?? "");
    setBillingCycle(item?.billingCycle === "yearly" ? "yearly" : "monthly");
    setStatus(item?.status === "paused" || item?.status === "completed" ? item.status : "active");
    setNotes(item?.notes ?? "");
    setError("");
  }, [open, item, mode]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountPerMonth = Number(amount);
    if (!label.trim()) {
      setError("Label is required.");
      return;
    }
    if (!Number.isFinite(amountPerMonth) || amountPerMonth < 0) {
      setError("Enter a valid monthly amount.");
      return;
    }
    const day = reminderDay.trim() ? Number(reminderDay) : undefined;
    if (day != null && (!Number.isFinite(day) || day < 1 || day > 31)) {
      setError("Reminder day must be 1–31.");
      return;
    }
    const parsedTotal = totalAmount.trim() ? Number(totalAmount) : undefined;
    if (kind === "emi" && (parsedTotal == null || !Number.isFinite(parsedTotal) || parsedTotal <= 0)) {
      setError("EMI needs a total obligation (e.g. 104000).");
      return;
    }
    if (
      parsedTotal != null &&
      (!Number.isFinite(parsedTotal) || parsedTotal <= 0)
    ) {
      setError("Total obligation must be a positive amount.");
      return;
    }
    const parsedMonths = totalMonths.trim() ? Number(totalMonths) : undefined;
    if (
      parsedMonths != null &&
      (!Number.isFinite(parsedMonths) || parsedMonths < 1)
    ) {
      setError("Total installments must be at least 1.");
      return;
    }
    const parsedPriorAmount = priorPaidAmount.trim() ? Number(priorPaidAmount) : undefined;
    if (
      parsedPriorAmount != null &&
      (!Number.isFinite(parsedPriorAmount) || parsedPriorAmount < 0)
    ) {
      setError("Amount already paid must be 0 or more.");
      return;
    }
    if (
      parsedTotal != null &&
      parsedPriorAmount != null &&
      parsedPriorAmount > parsedTotal
    ) {
      setError("Amount already paid cannot exceed total obligation.");
      return;
    }
    const inferredPriorCount =
      parsedPriorAmount != null && amountPerMonth > 0
        ? Math.floor(parsedPriorAmount / amountPerMonth + 1e-9)
        : undefined;
    const saved: FixedMonthlyExpense = {
      id: item?.id ?? `fx-${crypto.randomUUID().slice(0, 8)}`,
      label: label.trim(),
      payee: payee.trim() || undefined,
      vendor: mode === "renewal" ? vendor.trim() || undefined : item?.vendor,
      amountPerMonth,
      kind,
      startDate: startDate || toLocalISODate(),
      totalAmount: parsedTotal,
      totalMonths: parsedMonths != null ? Math.floor(parsedMonths) : undefined,
      priorPaidAmount:
        parsedPriorAmount != null && parsedPriorAmount > 0 ? parsedPriorAmount : undefined,
      priorPaidInstallments:
        inferredPriorCount != null && inferredPriorCount > 0 ? inferredPriorCount : undefined,
      reminderDay: day,
      nextDueDate:
        mode === "renewal" && /^\d{4}-\d{2}-\d{2}$/.test(nextDueDate) ? nextDueDate : undefined,
      billingCycle: mode === "renewal" ? billingCycle : undefined,
      paidMonths: item?.paidMonths,
      monthPayments: item?.monthPayments,
      status,
      notes: notes.trim() || undefined,
      active: status === "active",
    };
    onSave(saved);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {item ? "Edit" : "Add"} {mode === "office" ? "office expense" : "software / infrastructure"}
          </DialogTitle>
          <DialogDescription>
            {mode === "office"
              ? "Recurring office cost. Mark as paid each month on Office & Ops — does not post to Accounts."
              : "Software, domain, or infrastructure renewal. Mark paid separately from logging to Accounts."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label="Label *" id="ops-fx-label">
            <Input
              id="ops-fx-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={mode === "office" ? "e.g. Office rent" : "e.g. Cursor Pro"}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kind" id="ops-fx-kind">
              <Select value={kind} onValueChange={(v) => setKind(v as FixedMonthlyExpenseKind)}>
                <SelectTrigger id="ops-fx-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="₹ / month *" id="ops-fx-amount">
              <Input
                id="ops-fx-amount"
                type="number"
                min={0}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label={kind === "emi" ? "Total obligation ₹ *" : "Total obligation ₹"}
              id="ops-fx-total"
            >
              <Input
                id="ops-fx-total"
                type="number"
                min={0}
                step="1"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="e.g. 104000"
              />
            </Field>
            <Field
              label={kind === "emi" ? "Already paid ₹" : "Already paid ₹"}
              id="ops-fx-prior-amt"
            >
              <Input
                id="ops-fx-prior-amt"
                type="number"
                min={0}
                step="1"
                value={priorPaidAmount}
                onChange={(e) => setPriorPaidAmount(e.target.value)}
                placeholder="e.g. 50000"
              />
            </Field>
            <Field label="Total installments" id="ops-fx-months">
              <Input
                id="ops-fx-months"
                type="number"
                min={1}
                step="1"
                value={totalMonths}
                onChange={(e) => setTotalMonths(e.target.value)}
                placeholder="auto"
              />
            </Field>
          </div>
          <Field label="Payee" id="ops-fx-payee">
            <Input
              id="ops-fx-payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="Who receives this"
            />
          </Field>
          {mode === "renewal" ? (
            <>
              <Field label="Vendor" id="ops-fx-vendor">
                <Input
                  id="ops-fx-vendor"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  placeholder="AWS, Cursor, GoDaddy…"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Billing cycle" id="ops-fx-cycle">
                  <Select
                    value={billingCycle}
                    onValueChange={(v) => setBillingCycle(v as OpsBillingCycle)}
                  >
                    <SelectTrigger id="ops-fx-cycle">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Next due / expiry" id="ops-fx-due">
                  <Input
                    id="ops-fx-due"
                    type="date"
                    value={nextDueDate}
                    onChange={(e) => setNextDueDate(e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date" id="ops-fx-start">
                <Input
                  id="ops-fx-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="Due day (1–31)" id="ops-fx-day">
                <Input
                  id="ops-fx-day"
                  type="number"
                  min={1}
                  max={31}
                  value={reminderDay}
                  onChange={(e) => setReminderDay(e.target.value)}
                  placeholder="e.g. 5"
                />
              </Field>
            </div>
          )}
          <Field label="Status" id="ops-fx-status">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as "active" | "paused" | "completed")}
            >
              <SelectTrigger id="ops-fx-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Notes" id="ops-fx-notes">
            <Input id="ops-fx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-rose-400">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
