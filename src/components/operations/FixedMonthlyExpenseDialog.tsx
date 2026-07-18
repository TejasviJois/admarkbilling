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
import { useCompany } from "@/hooks/use-company";
import {
  FIXED_MONTHLY_EXPENSE_KINDS,
  FIXED_MONTHLY_EXPENSE_KIND_LABELS,
  fixedMonthlyStatus,
} from "@/lib/fixed-monthly-expenses";
import type { FixedMonthlyExpense, FixedMonthlyExpenseKind } from "@/lib/types";

function newFixedId(): string {
  return `fix_${crypto.randomUUID().slice(0, 8)}`;
}

type FormState = {
  label: string;
  payee: string;
  teamMemberId: string;
  amount: string;
  kind: FixedMonthlyExpenseKind;
  startDate: string;
  totalMonths: string;
  status: "active" | "paused" | "completed";
  notes: string;
};

const emptyForm = (): FormState => ({
  label: "",
  payee: "",
  teamMemberId: "",
  amount: "",
  kind: "other",
  startDate: new Date().toISOString().slice(0, 10),
  totalMonths: "",
  status: "active",
  notes: "",
});

export function FixedMonthlyExpenseDialog({
  open,
  onOpenChange,
  entry,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: FixedMonthlyExpense | null;
  onSave: (entry: FixedMonthlyExpense) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const { company } = useCompany();
  const activeMembers = (company.companyMembers ?? []).filter(
    (member) => member.status !== "inactive",
  );

  useEffect(() => {
    if (!open) return;
    if (!entry) {
      setForm(emptyForm());
      return;
    }
    setForm({
      label: entry.label,
      payee: entry.payee ?? "",
      teamMemberId: entry.teamMemberId ?? "",
      amount: String(entry.amountPerMonth),
      kind: entry.kind ?? "other",
      startDate: entry.startDate,
      totalMonths: entry.totalMonths != null ? String(entry.totalMonths) : "",
      status: fixedMonthlyStatus(entry),
      notes: entry.notes ?? "",
    });
  }, [open, entry]);

  const submit = () => {
    const amount = Number(form.amount);
    const totalMonths = form.totalMonths.trim() ? Number(form.totalMonths) : undefined;
    if (!form.label.trim() || !(amount > 0) || !form.startDate) return;
    if (form.kind === "salary" && !form.teamMemberId) {
      alert("Select the team member receiving this salary.");
      return;
    }
    if (totalMonths != null && (!Number.isInteger(totalMonths) || totalMonths < 1)) {
      alert("Number of months must be a whole number greater than zero, or left blank.");
      return;
    }

    onSave({
      ...(entry ?? {}),
      id: entry?.id ?? newFixedId(),
      label: form.label.trim(),
      payee: form.payee.trim() || undefined,
      teamMemberId: form.kind === "salary" ? form.teamMemberId || undefined : undefined,
      amountPerMonth: amount,
      kind: form.kind,
      startDate: form.startDate,
      totalMonths,
      // Payments fall due on the same day each month as the start date; the
      // system alerts one day before.
      reminderDay: Number(form.startDate.slice(8, 10)) || 1,
      status: form.status,
      paidMonths: entry?.paidMonths ?? [],
      notes: form.notes.trim() || undefined,
      active: form.status === "active",
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit fixed cost" : "Add fixed cost"}</DialogTitle>
          <DialogDescription>
            Track salary, EMI, rent, subscriptions, and other recurring outflows. Checking a month
            as paid does not create an Accounts transaction; log the actual expense separately.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" id="fixed-dialog-kind">
            <Select
              value={form.kind}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  kind: value as FixedMonthlyExpenseKind,
                  teamMemberId: value === "salary" ? current.teamMemberId : "",
                }))
              }
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
          <Field label="Status" id="fixed-dialog-status">
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  status: value as FormState["status"],
                }))
              }
            >
              <SelectTrigger id="fixed-dialog-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Description" id="fixed-dialog-label">
            <Input
              id="fixed-dialog-label"
              value={form.label}
              onChange={(event) =>
                setForm((current) => ({ ...current, label: event.target.value }))
              }
              placeholder="e.g. Office rent, team salary, SaaS stack"
            />
          </Field>
          {form.kind === "salary" ? (
            <Field label="Team member" id="fixed-dialog-team-member">
              <Select
                value={form.teamMemberId}
                onValueChange={(value) => {
                  const member = activeMembers.find((candidate) => candidate.id === value);
                  setForm((current) => ({
                    ...current,
                    teamMemberId: value,
                    payee: member?.name ?? current.payee,
                    label: current.label || (member ? `${member.name} salary` : ""),
                    amount:
                      member?.baseMonthlySalary != null
                        ? String(member.baseMonthlySalary)
                        : current.amount,
                  }));
                }}
              >
                <SelectTrigger id="fixed-dialog-team-member">
                  <SelectValue placeholder="Select who is being paid" />
                </SelectTrigger>
                <SelectContent>
                  {activeMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name} · {member.role || member.memberType || "Team"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <Field label="Pay to (person / company)" id="fixed-dialog-payee">
              <Input
                id="fixed-dialog-payee"
                value={form.payee}
                onChange={(event) =>
                  setForm((current) => ({ ...current, payee: event.target.value }))
                }
                placeholder="e.g. Prajwal, landlord, Adobe"
              />
            </Field>
          )}
          <Field label="Amount / month (₹)" id="fixed-dialog-amount">
            <Input
              id="fixed-dialog-amount"
              type="number"
              min={0}
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({ ...current, amount: event.target.value }))
              }
              placeholder="20000"
            />
          </Field>
          <Field label="Starts on" id="fixed-dialog-start">
            <Input
              id="fixed-dialog-start"
              type="date"
              value={form.startDate}
              onChange={(event) =>
                setForm((current) => ({ ...current, startDate: event.target.value }))
              }
            />
            <p className="text-[11px] text-muted-foreground">
              Due the same day every month — you'll be alerted a day before.
            </p>
          </Field>
          <Field label="Number of months" id="fixed-dialog-months">
            <Input
              id="fixed-dialog-months"
              type="number"
              min={1}
              step={1}
              value={form.totalMonths}
              onChange={(event) =>
                setForm((current) => ({ ...current, totalMonths: event.target.value }))
              }
              placeholder="Blank = ongoing"
            />
          </Field>
          <Field label="Notes (optional)" id="fixed-dialog-notes">
            <Input
              id="fixed-dialog-notes"
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({ ...current, notes: event.target.value }))
              }
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
            disabled={
              !form.label.trim() ||
              !(Number(form.amount) > 0) ||
              !form.startDate ||
              (form.kind === "salary" && !form.teamMemberId)
            }
          >
            {entry ? "Save changes" : "Add fixed cost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
