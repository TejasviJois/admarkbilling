import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommissionFormDialog } from "@/components/ops/CommissionFormDialog";
import { FixedExpenseFormDialog } from "@/components/ops/FixedExpenseFormDialog";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useOperations } from "@/hooks/use-operations";
import { toLocalISODate } from "@/lib/date-range-filter";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  buildCommissionPayoutTransactions,
  buildFixedExpensePaymentTransaction,
  commissionTotal,
  currentMonthKey,
  dueDateForOpsMonth,
  formatOpsMonthLabel,
  installmentProgress,
  isActiveOpsExpense,
  isOfficeBill,
  isPaidForMonth,
  isRenewalItem,
  monthObligationTotals,
  next30DaysRenewalTotal,
  openCommissionsTotal,
  recurrenceLabel,
  removeFixedExpense,
  removeProjectCommission,
  shiftMonthKey,
  togglePaidMonth,
  upcomingRenewals,
  upsertFixedExpense,
  upsertProjectCommission,
} from "@/lib/ops-costs";
import { cn } from "@/lib/utils";
import type { FixedMonthlyExpense, ProjectCommission } from "@/lib/types";

export const Route = createFileRoute("/ops")({
  component: OpsPage,
});

function OpsPage() {
  const { ops, persist, loading } = useOperations();
  const [month, setMonth] = useState(currentMonthKey);
  const fixed = ops.fixedMonthlyExpenses ?? [];
  const commissions = ops.projectCommissions ?? [];

  const officeBills = useMemo(
    () =>
      fixed
        .filter(isOfficeBill)
        .filter((item) => item.status !== "completed")
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [fixed],
  );
  const renewals = useMemo(
    () =>
      fixed
        .filter(isRenewalItem)
        .filter((item) => item.status !== "completed")
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" })),
    [fixed],
  );
  const upcoming = useMemo(() => upcomingRenewals(renewals, 30), [renewals]);
  const monthTotals = useMemo(
    () => monthObligationTotals([...officeBills, ...renewals], month),
    [officeBills, renewals, month],
  );
  const next30Total = useMemo(() => next30DaysRenewalTotal(renewals), [renewals]);
  const commissionsOpen = useMemo(() => openCommissionsTotal(commissions), [commissions]);

  const [billOpen, setBillOpen] = useState(false);
  const [editingBill, setEditingBill] = useState<FixedMonthlyExpense | null>(null);
  const [billMode, setBillMode] = useState<"office" | "renewal">("office");
  const [commOpen, setCommOpen] = useState(false);
  const [editingComm, setEditingComm] = useState<ProjectCommission | null>(null);

  const saveFixed = (saved: FixedMonthlyExpense) => {
    persist(upsertFixedExpense(ops, saved));
  };

  const deleteFixed = (item: FixedMonthlyExpense) => {
    if (!confirm(`Remove "${item.label}"?`)) return;
    persist(removeFixedExpense(ops, item.id), {
      deleteIds: { fixedMonthlyExpenses: [item.id] },
    });
  };

  const markPaid = (item: FixedMonthlyExpense) => {
    persist(upsertFixedExpense(ops, togglePaidMonth(item, month)));
  };

  const logPaymentToAccounts = (item: FixedMonthlyExpense) => {
    if (
      !confirm(
        `Log ${formatINRWhole(item.amountPerMonth)} for "${item.label}" (${month}) to Accounts as an expense?\n\nMark as paid does not do this automatically.`,
      )
    ) {
      return;
    }
    const txn = buildFixedExpensePaymentTransaction(item, month, toLocalISODate());
    const existing = (ops.transactions ?? []).filter((t) => t.id !== txn.id);
    const marked = isPaidForMonth(item, month) ? item : togglePaidMonth(item, month);
    persist({
      ...upsertFixedExpense(ops, marked),
      transactions: [txn, ...existing],
    });
  };

  const saveCommission = (saved: ProjectCommission) => {
    persist(upsertProjectCommission(ops, saved));
  };

  const deleteCommission = (item: ProjectCommission) => {
    if (!confirm("Remove this commission plan?")) return;
    persist(removeProjectCommission(ops, item.id), {
      deleteIds: { projectCommissions: [item.id] },
    });
  };

  const logCommissionPayout = (item: ProjectCommission) => {
    const project = ops.projects.find((p) => p.id === item.projectId);
    const name = project?.name || project?.client || "Project";
    if (
      !confirm(
        `Log ${formatINRWhole(commissionTotal(item))} commission payout(s) to Accounts for ${name}?\n\nThis does not change project billing, received, or outstanding.`,
      )
    ) {
      return;
    }
    const txns = buildCommissionPayoutTransactions(item, name, toLocalISODate());
    const existingIds = new Set((ops.transactions ?? []).map((t) => t.id));
    const fresh = txns.filter((t) => !existingIds.has(t.id));
    persist(
      upsertProjectCommission(
        {
          ...ops,
          transactions: [...fresh, ...(ops.transactions ?? [])],
        },
        {
          ...item,
          status: "paid",
          paidAt: toLocalISODate(),
          updatedAt: Date.now(),
        },
      ),
    );
  };

  const openAdd = (kind: "office" | "renewal" | "commission") => {
    if (kind === "commission") {
      setEditingComm(null);
      setCommOpen(true);
      return;
    }
    setEditingBill(null);
    setBillMode(kind);
    setBillOpen(true);
  };

  const openEditFixed = (item: FixedMonthlyExpense) => {
    setEditingBill(item);
    setBillMode(isRenewalItem(item) ? "renewal" : "office");
    setBillOpen(true);
  };

  if (loading) return <OperationsLoading />;

  return (
    <div className="space-y-8">
      <OperationsPageHeader
        title="Office & Ops"
        description="Monthly office and infrastructure obligations, renewals, and project commissions — separate from Accounts and payroll."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <MonthSelector month={month} onChange={setMonth} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => openAdd("office")}>Office expense</DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAdd("renewal")}>
                  Software / infrastructure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openAdd("commission")}>
                  Project commission
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="This month" value={formatINRWhole(monthTotals.due)} hint={formatOpsMonthLabel(month)} />
        <Kpi
          label="Unpaid"
          value={formatINRWhole(monthTotals.unpaid)}
          hint={`${monthTotals.unpaidCount} open`}
          emphasize={monthTotals.unpaid > 0}
        />
        <Kpi label="Next 30 days" value={formatINRWhole(next30Total)} hint="Renewals due" />
        <Kpi
          label="Project commissions"
          value={formatINRWhole(commissionsOpen)}
          hint="Open commitments"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        {/* Dominant This Month panel */}
        <section className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card/40">
          <div className="flex items-end justify-between gap-3 border-b border-border/60 px-5 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">This month</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {formatOpsMonthLabel(month)} · office and software obligations
              </p>
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatINRWhole(monthTotals.unpaid)} unpaid of {formatINRWhole(monthTotals.due)}
            </p>
          </div>

          <CategoryBlock
            title="Office expenses"
            empty="No office expenses for this workspace."
            items={officeBills}
            month={month}
            onMarkPaid={markPaid}
            onLogPayment={logPaymentToAccounts}
            onEdit={openEditFixed}
            onDelete={deleteFixed}
          />
          <CategoryBlock
            title="Software & infrastructure"
            empty="No software or infrastructure expenses yet."
            items={renewals}
            month={month}
            onMarkPaid={markPaid}
            onLogPayment={logPaymentToAccounts}
            onEdit={openEditFixed}
            onDelete={deleteFixed}
            bordered
          />
        </section>

        {/* Secondary column */}
        <div className="flex min-w-0 flex-col gap-6">
          <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
            <div className="border-b border-border/60 px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight text-foreground">Upcoming</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Software, domain, and infrastructure renewals · next 30 days
              </p>
            </div>
            {upcoming.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                Nothing due in the next 30 days.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {upcoming.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[item.vendor, recurrenceLabel(item), item.nextDueDate]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {formatINRWhole(item.amountPerMonth)}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 text-[11px] font-medium tabular-nums",
                          item.daysLeft < 0
                            ? "text-rose-400"
                            : item.daysLeft <= 7
                              ? "text-rose-400/90"
                              : "text-muted-foreground",
                        )}
                      >
                        {item.daysLeft < 0
                          ? `${Math.abs(item.daysLeft)}d overdue`
                          : item.daysLeft === 0
                            ? "Due today"
                            : `${item.daysLeft}d left`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border/70 bg-card/40">
            <div className="border-b border-border/60 px-5 py-4">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Project commissions
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Fixed splits · Log payout posts to Accounts only when you confirm
              </p>
            </div>
            {commissions.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted-foreground">
                No project commission commitments yet.
              </p>
            ) : (
              <ul className="divide-y divide-border/50">
                {commissions.map((item) => {
                  const project = ops.projects.find((p) => p.id === item.projectId);
                  const title = project?.name || project?.client || item.projectId;
                  return (
                    <li key={item.id} className="space-y-3 px-5 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{title}</p>
                          {item.label ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">{item.label}</p>
                          ) : null}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-sm font-semibold tabular-nums">
                            {formatINRWhole(commissionTotal(item))}
                          </p>
                          <StatusPill
                            tone={
                              item.status === "paid"
                                ? "paid"
                                : item.status === "partial"
                                  ? "partial"
                                  : "open"
                            }
                          >
                            {item.status}
                          </StatusPill>
                        </div>
                      </div>
                      <ul className="space-y-1.5 border-t border-border/40 pt-2.5">
                        {item.splits.map((split) => (
                          <li
                            key={split.id}
                            className="flex justify-between gap-3 text-xs text-muted-foreground"
                          >
                            <span className="truncate">{split.personName || "—"}</span>
                            <span className="tabular-nums text-foreground">
                              {formatINRWhole(split.amount)}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2">
                        {item.status !== "paid" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => logCommissionPayout(item)}
                          >
                            Log payout
                          </Button>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Paid{item.paidAt ? ` · ${item.paidAt}` : ""}
                          </span>
                        )}
                        <IconBtn
                          label="Edit commission"
                          onClick={() => {
                            setEditingComm(item);
                            setCommOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Remove commission" danger onClick={() => deleteCommission(item)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <FixedExpenseFormDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        item={editingBill}
        mode={billMode}
        onSave={saveFixed}
      />
      <CommissionFormDialog
        open={commOpen}
        onOpenChange={setCommOpen}
        commission={editingComm}
        projects={ops.projects}
        onSave={saveCommission}
      />
    </div>
  );
}

function MonthSelector({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border border-border/70 bg-background">
      <button
        type="button"
        aria-label="Previous month"
        className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        onClick={() => onChange(shiftMonthKey(month, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9.5rem] select-none text-center text-sm font-medium tabular-nums text-foreground">
        {formatOpsMonthLabel(month)}
      </span>
      <button
        type="button"
        aria-label="Next month"
        className="inline-flex h-9 w-9 items-center justify-center text-muted-foreground hover:text-foreground"
        onClick={() => onChange(shiftMonthKey(month, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums tracking-tight",
          emphasize ? "text-rose-400" : "text-foreground",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function CategoryBlock({
  title,
  empty,
  items,
  month,
  onMarkPaid,
  onLogPayment,
  onEdit,
  onDelete,
  bordered,
}: {
  title: string;
  empty: string;
  items: FixedMonthlyExpense[];
  month: string;
  onMarkPaid: (item: FixedMonthlyExpense) => void;
  onLogPayment: (item: FixedMonthlyExpense) => void;
  onEdit: (item: FixedMonthlyExpense) => void;
  onDelete: (item: FixedMonthlyExpense) => void;
  bordered?: boolean;
}) {
  return (
    <div className={cn(bordered && "border-t border-border/60")}>
      <div className="px-5 pb-2 pt-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
      </div>
      {items.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border/40 pb-1">
          {items.map((item) => {
            const paid = isPaidForMonth(item, month);
            const active = isActiveOpsExpense(item);
            const due = dueDateForOpsMonth(item, month);
            const progress = installmentProgress(item);
            return (
              <li
                key={item.id}
                className={cn(
                  "flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between",
                  paid && "bg-muted/20",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        paid ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {item.label}
                    </p>
                    <StatusPill tone={!active ? "paused" : paid ? "paid" : "open"}>
                      {!active ? (item.status ?? "paused") : paid ? "Paid" : "Unpaid"}
                    </StatusPill>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[
                      item.payee || item.vendor,
                      recurrenceLabel(item),
                      due ? `Due ${due}` : null,
                      item.kind,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {progress ? (
                    <div className="mt-2.5 max-w-md rounded-md border border-border/60 bg-background/50 px-3 py-2.5">
                      {progress.totalAmount != null ? (
                        <div className="flex items-baseline justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Remaining
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 text-base font-semibold tabular-nums",
                                progress.complete ? "text-muted-foreground" : "text-foreground",
                              )}
                            >
                              {progress.complete
                                ? "Fully paid"
                                : formatINRWhole(progress.remainingAmount ?? 0)}
                            </p>
                          </div>
                          <div className="text-right text-xs tabular-nums text-muted-foreground">
                            <p>
                              Paid {formatINRWhole(progress.paidAmount)} /{" "}
                              {formatINRWhole(progress.totalAmount)}
                            </p>
                            {!progress.complete ? (
                              <p className="mt-0.5">
                                {progress.nextPaymentAmount != null
                                  ? `Next ${formatINRWhole(progress.nextPaymentAmount)}`
                                  : null}
                                {progress.finalPaymentAmount != null &&
                                progress.nextPaymentAmount != null &&
                                progress.nextPaymentAmount !== progress.finalPaymentAmount
                                  ? ` · Final ${formatINRWhole(progress.finalPaymentAmount)}`
                                  : progress.finalPaymentAmount != null &&
                                      progress.nextPaymentAmount === progress.finalPaymentAmount
                                    ? " · final due"
                                    : null}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ) : progress.totalCount != null ? (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {progress.paidCount}/{progress.totalCount} installments
                          {progress.remainingCount != null
                            ? ` · ${progress.remainingCount} left`
                            : ""}
                        </p>
                      ) : null}
                      {progress.totalAmount != null && progress.totalAmount > 0 ? (
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/60">
                          <div
                            className="h-full rounded-full bg-foreground/70"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((progress.paidAmount / progress.totalAmount) * 100),
                              )}%`,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="text-right">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {formatINRWhole(
                        !paid && progress?.nextPaymentAmount != null
                          ? progress.nextPaymentAmount
                          : item.amountPerMonth,
                      )}
                    </span>
                    {progress ? (
                      <p className="text-[10px] text-muted-foreground">
                        {!paid &&
                        progress.nextPaymentAmount != null &&
                        progress.nextPaymentAmount < progress.installmentAmount
                          ? "/ final"
                          : !paid && progress.nextPaymentAmount != null
                            ? "/ due"
                            : "/ installment"}
                      </p>
                    ) : null}
                  </div>
                  {active ? (
                    paid ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => onMarkPaid(item)}
                      >
                        Paid
                      </Button>
                    ) : (
                      <Button type="button" size="sm" onClick={() => onMarkPaid(item)}>
                        {progress?.nextPaymentAmount != null &&
                        progress.nextPaymentAmount < progress.installmentAmount
                          ? `Mark as paid · ${formatINRWhole(progress.nextPaymentAmount)}`
                          : "Mark as paid"}
                      </Button>
                    )
                  ) : null}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" size="sm" variant="ghost" className="h-8 w-8 px-0">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">More actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {active ? (
                        <DropdownMenuItem onClick={() => onLogPayment(item)}>
                          Log payment to Accounts…
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onClick={() => onEdit(item)}>Edit</DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-rose-400 focus:text-rose-400"
                        onClick={() => onDelete(item)}
                      >
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "paid" | "open" | "partial" | "paused";
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        tone === "paid" && "border-border/80 text-muted-foreground",
        tone === "open" && "border-rose-500/40 text-rose-400",
        tone === "partial" && "border-border text-foreground",
        tone === "paused" && "border-border/60 text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary",
        danger && "hover:bg-rose-500/10 hover:text-rose-400",
      )}
    >
      {children}
    </button>
  );
}
