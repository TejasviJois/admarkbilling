import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { FixedMonthlyExpenseDialog } from "@/components/operations/FixedMonthlyExpenseDialog";
import {
  Field,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
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
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import {
  addMonthsToKey,
  fixedMonthlyDueDate,
  fixedMonthlyKindLabel,
  fixedMonthlyMonthsRemaining,
  fixedMonthlyPaidCount,
  fixedMonthlyScheduleMonths,
  fixedMonthlyStatus,
  fixedMonthlyStatusLabel,
  formatFinancialINR,
  monthKeyFromDate,
  monthLabel,
  sumActiveFixedMonthlyExpenses,
} from "@/lib/fixed-monthly-expenses";
import type { CompanyMember, FixedMonthlyExpense, Transaction } from "@/lib/types";

export const Route = createFileRoute("/accounts/monthly-payments")({
  component: MonthlyPaymentsPage,
});

/** Base salary recorded so far against one schedule for one month — bonuses excluded. */
function salaryBasePaid(transactions: Transaction[], expenseId: string, month: string): number {
  return transactions
    .filter(
      (transaction) =>
        transaction.fixedMonthlyExpenseId === expenseId && transaction.payrollMonth === month,
    )
    .reduce((sum, transaction) => sum + (transaction.salaryBaseAmount ?? transaction.amount), 0);
}

function statusClasses(status: ReturnType<typeof fixedMonthlyStatus>): string {
  if (status === "completed") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-500";
  }
  if (status === "paused") return "border-amber-500/30 bg-amber-500/10 text-amber-500";
  return "border-sky-500/30 bg-sky-500/10 text-sky-500";
}

function MonthlyPaymentsPage() {
  const { ops, persist, loading } = useOperations();
  const { company } = useCompany();
  const items = useMemo(
    () =>
      [...(ops.fixedMonthlyExpenses ?? [])].sort((a, b) => {
        const statusOrder = { active: 0, paused: 1, completed: 2 };
        const statusDifference =
          statusOrder[fixedMonthlyStatus(a)] - statusOrder[fixedMonthlyStatus(b)];
        return statusDifference || a.startDate.localeCompare(b.startDate);
      }),
    [ops.fixedMonthlyExpenses],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FixedMonthlyExpense | null>(null);
  const [payrollTarget, setPayrollTarget] = useState<{
    item: FixedMonthlyExpense;
    month: string;
  } | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = monthKeyFromDate(today);

  const saveItems = (next: FixedMonthlyExpense[]) => {
    persist({ ...ops, fixedMonthlyExpenses: next });
  };

  const saveEntry = (saved: FixedMonthlyExpense) => {
    const exists = items.some((item) => item.id === saved.id);
    saveItems(
      exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items],
    );
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (item: FixedMonthlyExpense) => {
    setEditing(item);
    setDialogOpen(true);
  };

  const setStatus = (item: FixedMonthlyExpense, status: "active" | "paused" | "completed") => {
    saveEntry({ ...item, status, active: status === "active" });
  };

  const togglePaidMonth = (item: FixedMonthlyExpense, month: string) => {
    const paid = new Set(item.paidMonths ?? []);
    if (paid.has(month)) paid.delete(month);
    else paid.add(month);

    const validPaidCount = [...paid].filter((key) =>
      fixedMonthlyScheduleMonths(item, today, 0).includes(key),
    ).length;
    const completed = item.totalMonths != null && validPaidCount >= item.totalMonths;
    const wasCompleted = fixedMonthlyStatus(item) === "completed";
    const status = completed ? "completed" : wasCompleted ? "active" : (item.status ?? "active");

    saveEntry({
      ...item,
      paidMonths: [...paid].sort(),
      status,
      active: status === "active",
    });
  };

  const recordPayroll = ({
    item,
    month,
    member,
    baseAmount,
    bonusAmount,
    paymentDate,
    paymentMethod,
  }: {
    item: FixedMonthlyExpense;
    month: string;
    member: CompanyMember;
    baseAmount: number;
    bonusAmount: number;
    paymentDate: string;
    paymentMethod: string;
  }) => {
    const total = baseAmount + bonusAmount;
    const now = Date.now();
    const founderId = (ops.founders ?? []).some((founder) => founder.id === member.id)
      ? member.id
      : undefined;
    const alreadyPaidBase = salaryBasePaid(ops.transactions ?? [], item.id, month);
    const fullyPaid = alreadyPaidBase + baseAmount >= item.amountPerMonth;
    const isPartial = !fullyPaid || alreadyPaidBase > 0;
    const transaction: Transaction = {
      id: `tx-payroll-${crypto.randomUUID().slice(0, 8)}`,
      type: "expense",
      date: paymentDate,
      amount: total,
      description: `${member.name} salary · ${monthLabel(month)}${isPartial ? " (part payment)" : ""}`,
      category: "Salary",
      paymentMethod,
      vendor: member.name,
      relatedFounderId: founderId,
      relatedTeamMemberId: member.id,
      payrollMonth: month,
      salaryBaseAmount: baseAmount,
      salaryBonusAmount: bonusAmount,
      fixedMonthlyExpenseId: item.id,
      notes:
        bonusAmount > 0
          ? `Salary ${formatFinancialINR(baseAmount)} + performance bonus ${formatFinancialINR(bonusAmount)}`
          : `Salary ${formatFinancialINR(baseAmount)} of ${formatFinancialINR(item.amountPerMonth)} for ${monthLabel(month)}`,
      createdAt: now,
      updatedAt: now,
      historical: false,
    };
    const paid = new Set(item.paidMonths ?? []);
    if (fullyPaid) paid.add(month);
    const validPaidCount = [...paid].filter((key) =>
      fixedMonthlyScheduleMonths(item, today, 0).includes(key),
    ).length;
    const completed = item.totalMonths != null && validPaidCount >= item.totalMonths;
    const updatedItem: FixedMonthlyExpense = {
      ...item,
      paidMonths: [...paid].sort(),
      status: completed ? "completed" : (item.status ?? "active"),
      active: completed ? false : item.active,
    };
    persist({
      ...ops,
      transactions: [transaction, ...(ops.transactions ?? [])],
      fixedMonthlyExpenses: items.map((candidate) =>
        candidate.id === item.id ? updatedItem : candidate,
      ),
    });
    setPayrollTarget(null);
  };

  const removeItem = (item: FixedMonthlyExpense) => {
    if (!confirm(`Delete monthly payment “${item.label}”?`)) return;
    persist(
      {
        ...ops,
        fixedMonthlyExpenses: items.filter((candidate) => candidate.id !== item.id),
      },
      { deleteIds: { fixedMonthlyExpenses: [item.id] } },
    );
  };

  const isApplicableThisMonth = (item: FixedMonthlyExpense) =>
    fixedMonthlyScheduleMonths(item, today, 0).includes(currentMonth);
  const dueThisMonth = items.filter(
    (item) =>
      fixedMonthlyStatus(item) === "active" &&
      isApplicableThisMonth(item) &&
      !(item.paidMonths ?? []).includes(currentMonth),
  );
  const paidThisMonth = items.filter((item) => (item.paidMonths ?? []).includes(currentMonth));

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/accounts"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Accounts
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <OperationsPageHeader
            title="Fixed Costs"
            description="Recurring outflows — EMIs, salaries, rent, subscriptions. Set reminder days and manually check off each paid month."
          />
          <Button onClick={openAdd} className="gap-2">
            <Plus className="h-4 w-4" /> Add Fixed Cost
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={CalendarClock}
          label="Active monthly total"
          value={formatFinancialINR(sumActiveFixedMonthlyExpenses(items))}
        />
        <SummaryCard
          icon={Clock3}
          label={`Due in ${monthLabel(currentMonth)}`}
          value={String(dueThisMonth.length)}
          detail={formatFinancialINR(
            dueThisMonth.reduce((sum, item) => sum + item.amountPerMonth, 0),
          )}
        />
        <SummaryCard
          icon={CalendarCheck}
          label={`Checked paid in ${monthLabel(currentMonth)}`}
          value={String(paidThisMonth.length)}
          detail={formatFinancialINR(
            paidThisMonth.reduce((sum, item) => sum + item.amountPerMonth, 0),
          )}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Completed schedules"
          value={String(items.filter((item) => fixedMonthlyStatus(item) === "completed").length)}
        />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/10 px-6 py-14 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-semibold text-foreground">No fixed costs yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a salary, EMI, rent, subscription, utility, or other recurring cost.
          </p>
          <Button onClick={openAdd} className="mt-4 gap-2">
            <Plus className="h-4 w-4" /> Add Fixed Cost
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Payment schedules</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every recurring outflow and its remaining term.
              </p>
            </div>
            {items.map((item) => {
              const status = fixedMonthlyStatus(item);
              const remaining = fixedMonthlyMonthsRemaining(item);
              const paidCount = fixedMonthlyPaidCount(item);
              return (
                <article
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">{item.label}</h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${statusClasses(status)}`}
                        >
                          {fixedMonthlyStatusLabel(item)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fixedMonthlyKindLabel(item.kind)}
                        {item.payee ? ` · pay to ${item.payee}` : ""} · starts {item.startDate}
                      </p>
                    </div>
                    <p className="shrink-0 font-bold tabular-nums text-rose-500">
                      {formatFinancialINR(item.amountPerMonth)}/mo
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <p className="rounded-md bg-muted/30 px-2.5 py-2 text-muted-foreground">
                      Paid: <span className="font-semibold text-foreground">{paidCount}</span>
                    </p>
                    <p className="rounded-md bg-muted/30 px-2.5 py-2 text-muted-foreground">
                      Left:{" "}
                      <span className="font-semibold text-foreground">
                        {remaining == null ? "Ongoing" : remaining}
                      </span>
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Bell className="h-3.5 w-3.5" /> Due day{" "}
                      {item.reminderDay ?? (Number(item.startDate.slice(8, 10)) || 1)} · alert a day
                      before
                    </span>
                    <div className="flex gap-1">
                      {status !== "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setStatus(item, status === "active" ? "paused" : "active")}
                        >
                          {status === "active" ? "Pause" : "Activate"}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => openEdit(item)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeItem(item)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <CurrentMonthChecklist
            items={items}
            today={today}
            onToggle={togglePaidMonth}
            members={company.companyMembers ?? []}
            transactions={ops.transactions ?? []}
            onRecordPayroll={(item, month) => setPayrollTarget({ item, month })}
          />
        </div>
      )}

      <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
        Salary rows use “Record payment” and create the Accounts expense automatically. Other
        fixed-cost checkboxes are reminders only; after paying, also use{" "}
        <Link to="/accounts" className="font-semibold underline underline-offset-2">
          Accounts → Add Expense
        </Link>{" "}
        so cash balance and expense totals update.
      </p>

      <FixedMonthlyExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        onSave={saveEntry}
      />
      <SalaryPaymentDialog
        target={payrollTarget}
        paidSoFar={
          payrollTarget
            ? salaryBasePaid(ops.transactions ?? [], payrollTarget.item.id, payrollTarget.month)
            : 0
        }
        member={
          payrollTarget?.item.teamMemberId
            ? (company.companyMembers?.find(
                (member) => member.id === payrollTarget.item.teamMemberId,
              ) ?? null)
            : null
        }
        onOpenChange={(open) => !open && setPayrollTarget(null)}
        onSave={recordPayroll}
      />
    </div>
  );
}

function CurrentMonthChecklist({
  items,
  today,
  onToggle,
  members,
  transactions,
  onRecordPayroll,
}: {
  items: FixedMonthlyExpense[];
  today: string;
  onToggle: (item: FixedMonthlyExpense, month: string) => void;
  members: CompanyMember[];
  transactions: Transaction[];
  onRecordPayroll: (item: FixedMonthlyExpense, month: string) => void;
}) {
  const currentMonth = monthKeyFromDate(today);
  const nextMonth = addMonthsToKey(currentMonth, 1);
  const [showUpcoming, setShowUpcoming] = useState(false);

  const inMonth = (item: FixedMonthlyExpense, month: string) =>
    fixedMonthlyScheduleMonths(item, today, 1).includes(month) &&
    (fixedMonthlyStatus(item) === "active" || (item.paidMonths ?? []).includes(month));

  const thisMonthItems = items.filter((item) => inMonth(item, currentMonth));
  const nextMonthItems = items.filter((item) => inMonth(item, nextMonth));

  const pendingTotal = thisMonthItems
    .filter((item) => !(item.paidMonths ?? []).includes(currentMonth))
    .reduce((sum, item) => {
      const partPaid =
        item.kind === "salary" && item.teamMemberId
          ? salaryBasePaid(transactions, item.id, currentMonth)
          : 0;
      return sum + Math.max(item.amountPerMonth - partPaid, 0);
    }, 0);

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            This month&rsquo;s checklist
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">{monthLabel(currentMonth)}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {thisMonthItems.length === 0
              ? "No fixed costs fall in this month."
              : pendingTotal > 0
                ? `${formatFinancialINR(pendingTotal)} still to pay this month.`
                : "Everything for this month is checked off."}
          </p>
        </div>
      </div>

      {thisMonthItems.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Nothing due in {monthLabel(currentMonth)}.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {thisMonthItems.map((item) => (
            <ChecklistRow
              key={item.id}
              item={item}
              month={currentMonth}
              onToggle={() => onToggle(item, currentMonth)}
              member={members.find((member) => member.id === item.teamMemberId)}
              salaryPaid={salaryBasePaid(transactions, item.id, currentMonth)}
              onRecordPayroll={() => onRecordPayroll(item, currentMonth)}
            />
          ))}
        </div>
      )}

      {nextMonthItems.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowUpcoming((visible) => !visible)}
            aria-expanded={showUpcoming}
            className="flex w-full items-center justify-between border-t border-border bg-muted/20 px-5 py-2.5 text-left transition-colors hover:bg-muted/40"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Coming up in {monthLabel(nextMonth)} ({nextMonthItems.length})
            </span>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                showUpcoming ? "rotate-180" : ""
              }`}
            />
          </button>
          {showUpcoming && (
            <div className="divide-y divide-border">
              {nextMonthItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  month={nextMonth}
                  onToggle={() => onToggle(item, nextMonth)}
                  member={members.find((member) => member.id === item.teamMemberId)}
                  salaryPaid={salaryBasePaid(transactions, item.id, nextMonth)}
                  onRecordPayroll={() => onRecordPayroll(item, nextMonth)}
                  muted
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ChecklistRow({
  item,
  month,
  onToggle,
  member,
  salaryPaid,
  onRecordPayroll,
  muted,
}: {
  item: FixedMonthlyExpense;
  month: string;
  onToggle: () => void;
  member?: CompanyMember;
  /** Base salary already recorded for this month (salaries can be paid in parts). */
  salaryPaid: number;
  onRecordPayroll: () => void;
  muted?: boolean;
}) {
  const checked = (item.paidMonths ?? []).includes(month);
  const dueDate = fixedMonthlyDueDate(item, month);

  const isSalary = item.kind === "salary" && Boolean(item.teamMemberId);
  const partial = isSalary && !checked && salaryPaid > 0;
  const salaryRemaining = Math.max(item.amountPerMonth - salaryPaid, 0);

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/20 ${
        muted ? "opacity-70" : ""
      }`}
    >
      {isSalary ? (
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] ${
            checked
              ? "border-emerald-500 bg-emerald-500 text-white"
              : partial
                ? "border-amber-500 bg-amber-500/20 text-amber-600"
                : "border-input"
          }`}
        >
          {checked ? "✓" : partial ? "·" : ""}
        </span>
      ) : (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 rounded border-input accent-primary"
        />
      )}
      <div className="min-w-0 flex-1">
        <span
          className={`font-semibold ${checked ? "text-muted-foreground line-through" : "text-foreground"}`}
        >
          {item.label}
        </span>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {member ? `${member.role || member.memberType || "Team"} · ` : ""}
          {item.payee ? `Pay to ${item.payee} · ` : ""}Due {dueDate}
          {isSalary ? " · can be paid in parts" : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="font-semibold tabular-nums text-rose-500">
          {partial
            ? `${formatFinancialINR(salaryRemaining)} left`
            : formatFinancialINR(item.amountPerMonth)}
        </p>
        <p
          className={`text-[10px] font-bold uppercase ${
            checked ? "text-emerald-500" : partial ? "text-amber-500" : "text-muted-foreground"
          }`}
        >
          {checked
            ? isSalary
              ? "Fully paid"
              : "Paid"
            : partial
              ? `${formatFinancialINR(salaryPaid)} of ${formatFinancialINR(item.amountPerMonth)} paid`
              : "Pending"}
        </p>
        {isSalary && !checked && (
          <Button size="sm" className="mt-1.5 h-7 text-xs" onClick={onRecordPayroll}>
            {partial ? "Add payment" : "Record payment"}
          </Button>
        )}
      </div>
    </div>
  );
}

function SalaryPaymentDialog({
  target,
  member,
  paidSoFar,
  onOpenChange,
  onSave,
}: {
  target: { item: FixedMonthlyExpense; month: string } | null;
  member: CompanyMember | null;
  /** Base salary already recorded for this month. */
  paidSoFar: number;
  onOpenChange: (open: boolean) => void;
  onSave: (input: {
    item: FixedMonthlyExpense;
    month: string;
    member: CompanyMember;
    baseAmount: number;
    bonusAmount: number;
    paymentDate: string;
    paymentMethod: string;
  }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("0");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");

  useEffect(() => {
    if (!target) return;
    setAmount(String(Math.max(target.item.amountPerMonth - paidSoFar, 0)));
    setBonus("0");
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("bank_transfer");
  }, [target, paidSoFar]);

  if (!target || !member) return null;
  const monthlySalary = target.item.amountPerMonth;
  const remaining = Math.max(monthlySalary - paidSoFar, 0);
  const baseAmount = Number(amount) || 0;
  const bonusAmount = Number(bonus) || 0;
  const bonusCap = member.monthlyBonusCap ?? 0;
  const total = baseAmount + bonusAmount;

  const submit = () => {
    if (baseAmount <= 0 && bonusAmount <= 0) return;
    if (baseAmount < 0 || bonusAmount < 0) return;
    if (baseAmount > remaining) {
      alert(
        `Only ${formatFinancialINR(remaining)} of ${member.name}'s ${monthLabel(target.month)} salary is left. Enter that or less; use the bonus field for anything extra.`,
      );
      return;
    }
    if (bonusCap > 0 && bonusAmount > bonusCap) {
      alert(`The configured bonus limit for ${member.name} is ${formatFinancialINR(bonusCap)}.`);
      return;
    }
    onSave({
      item: target.item,
      month: target.month,
      member,
      baseAmount,
      bonusAmount,
      paymentDate,
      paymentMethod,
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record Salary Payment</DialogTitle>
          <DialogDescription>
            Salaries can be paid in parts, any time. Each payment becomes an Accounts expense;{" "}
            {monthLabel(target.month)} is marked paid once the full{" "}
            {formatFinancialINR(monthlySalary)} is covered.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly salary</span>
              <span className="font-semibold tabular-nums">
                {formatFinancialINR(monthlySalary)}
              </span>
            </div>
            {paidSoFar > 0 && (
              <div className="mt-1.5 flex justify-between">
                <span className="text-muted-foreground">Already paid this month</span>
                <span className="font-semibold tabular-nums text-emerald-500">
                  {formatFinancialINR(paidSoFar)}
                </span>
              </div>
            )}
            <div className="mt-1.5 flex justify-between">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-semibold tabular-nums">{formatFinancialINR(remaining)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-border pt-2">
              <span className="font-semibold">Paying now</span>
              <span className="font-bold tabular-nums text-primary">
                {formatFinancialINR(total)}
              </span>
            </div>
          </div>
          <Field label="Amount to pay now (₹)" id="payroll-amount">
            <Input
              id="payroll-amount"
              type="number"
              min={0}
              max={remaining}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Pay any part of the salary — the rest stays pending for this month.
            </p>
          </Field>
          <Field
            label={`Performance bonus (₹) · limit ${formatFinancialINR(bonusCap)}`}
            id="payroll-bonus"
          >
            <Input
              id="payroll-bonus"
              type="number"
              min={0}
              max={bonusCap || undefined}
              value={bonus}
              onChange={(event) => setBonus(event.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Defaults to ₹0. Enter a bonus only when you decide the month qualifies.
            </p>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment date" id="payroll-date">
              <Input
                id="payroll-date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
              />
            </Field>
            <Field label="Payment method" id="payroll-method">
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="payroll-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!paymentDate || total <= 0}>
            Record {formatFinancialINR(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 text-muted-foreground">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {detail && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{detail}</p>}
    </div>
  );
}
