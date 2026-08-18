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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Field } from "@/components/operations/operations-ui";
import { formatINRWhole } from "@/lib/invoice-calc";
import { MONTH_LABELS } from "@/lib/team-payroll";
import type { CompanyMember, SalaryMonthPayment, SalaryPaymentMode } from "@/lib/types";

export function SalaryMonthPaymentDialog({
  open,
  onOpenChange,
  member,
  month,
  existing,
  onSave,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: CompanyMember | null;
  month: string;
  existing?: SalaryMonthPayment;
  onSave: (payment: SalaryMonthPayment) => void;
  onClear?: () => void;
}) {
  const base = member?.baseMonthlySalary ?? 0;
  const [mode, setMode] = useState<SalaryPaymentMode>("full");
  const [salaryAmount, setSalaryAmount] = useState("");
  const [bonusAmount, setBonusAmount] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open) return;
    setMode(existing?.mode ?? "full");
    setSalaryAmount(existing ? String(existing.salaryAmount) : base > 0 ? String(base) : "");
    setBonusAmount(existing?.bonusAmount ? String(existing.bonusAmount) : "");
    setNote(existing?.note ?? "");
  }, [open, existing, base]);

  const monthLabel = useMemo(() => {
    const index = Number(month.slice(5, 7)) - 1;
    return `${MONTH_LABELS[index] ?? month} ${month.slice(0, 4)}`;
  }, [month]);

  const submit = () => {
    if (!member) return;
    const salary = Number(salaryAmount);
    const bonus = Number(bonusAmount || 0);
    if (!Number.isFinite(salary) || salary < 0) return;
    if (mode === "partial" && !(salary > 0)) return;
    if (mode === "extra" && !(bonus > 0)) return;
    onSave({
      month,
      mode,
      salaryAmount: mode === "full" ? (base > 0 ? base : salary) : salary,
      bonusAmount: mode === "extra" ? bonus : undefined,
      note: note.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record salary · {monthLabel}</DialogTitle>
          <DialogDescription>
            {member?.name ?? "Team member"} — how much was paid this month? This stays on Team and
            is not added to Accounts.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={mode}
          onValueChange={(value) => {
            const next = value as SalaryPaymentMode;
            setMode(next);
            if (next === "full" && base > 0) setSalaryAmount(String(base));
            if (next !== "extra") setBonusAmount("");
          }}
          className="grid gap-2"
        >
          <ModeOption
            value="full"
            title="Full salary"
            hint={base > 0 ? formatINRWhole(base) : "Mark the configured monthly amount as paid"}
          />
          <ModeOption value="partial" title="Partial / half" hint="Enter the exact amount paid" />
          <ModeOption
            value="extra"
            title="Extra / bonus"
            hint="Salary plus a separate bonus amount"
          />
        </RadioGroup>
        {mode !== "full" && (
          <Field label="Salary paid (₹)" id="salary-paid-amount">
            <Input
              id="salary-paid-amount"
              type="number"
              min={0}
              value={salaryAmount}
              onChange={(event) => setSalaryAmount(event.target.value)}
              placeholder={base > 0 ? String(base) : "0"}
            />
          </Field>
        )}
        {mode === "extra" && (
          <Field label="Bonus / extra (₹)" id="salary-bonus-amount">
            <Input
              id="salary-bonus-amount"
              type="number"
              min={0}
              value={bonusAmount}
              onChange={(event) => setBonusAmount(event.target.value)}
              placeholder="0"
            />
          </Field>
        )}
        <Field label="Note (optional)" id="salary-note">
          <Input
            id="salary-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Advance, leftover days, festival bonus…"
          />
        </Field>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          {existing && onClear ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                onClear();
                onOpenChange(false);
              }}
            >
              Clear payment
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit}>
              Save payment
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  value,
  title,
  hint,
}: {
  value: SalaryPaymentMode;
  title: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
      <RadioGroupItem value={value} className="mt-0.5" />
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
