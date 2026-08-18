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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/operations/operations-ui";
import {
  COMPANY_PAYROLL_EPOCH,
  COMPANY_START_YEAR,
  MONTH_LABELS,
  currentMonthKey,
  currentYear,
} from "@/lib/team-payroll";
import type { CompanyMember } from "@/lib/types";

function monthOptions(): string[] {
  const latestYear = Math.max(currentYear() + 1, COMPANY_START_YEAR);
  const options: string[] = [];
  for (let year = COMPANY_START_YEAR; year <= latestYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const key = `${year}-${String(month).padStart(2, "0")}`;
      if (key >= COMPANY_PAYROLL_EPOCH) options.push(key);
    }
  }
  return options;
}

function monthLabel(month: string): string {
  const index = Number(month.slice(5, 7)) - 1;
  return `${MONTH_LABELS[index] ?? month} ${month.slice(0, 4)}`;
}

export function StartPayrollDialog({
  open,
  onOpenChange,
  member,
  title = "Start payroll",
  description,
  confirmLabel = "Start payroll",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: CompanyMember | null;
  title?: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: (month: string) => void;
}) {
  const options = useMemo(() => monthOptions(), []);
  const defaultMonth =
    currentMonthKey() >= COMPANY_PAYROLL_EPOCH ? currentMonthKey() : COMPANY_PAYROLL_EPOCH;
  const [month, setMonth] = useState(defaultMonth);

  useEffect(() => {
    if (!open) return;
    setMonth(defaultMonth);
  }, [open, defaultMonth]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ??
              `Choose the first month ${member?.name ?? "this member"} should appear on the payroll tracker. Months before June 2026 are not used.`}
          </DialogDescription>
        </DialogHeader>
        <Field label="Payroll starts" id="payroll-start-month">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="payroll-start-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {monthLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => onConfirm(month)}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PayrollOnboardingDialog({
  open,
  onOpenChange,
  memberName,
  onStartNow,
  onLater,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName: string;
  onStartNow: () => void;
  onLater: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Is {memberName || "this member"} on payroll yet?</DialogTitle>
          <DialogDescription>
            If payroll has not started, the month tracker stays blank until you press Start Payroll.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={onLater}>
            Not yet
          </Button>
          <Button type="button" onClick={onStartNow}>
            Yes, start payroll
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
