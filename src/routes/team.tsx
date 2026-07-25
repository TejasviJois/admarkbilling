import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { IndianRupee, Pencil, Plus, Users } from "lucide-react";
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
import {
  Field,
  OperationsLoading,
  OperationsPageHeader,
} from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { saveCompany } from "@/lib/storage";
import { formatINRWhole } from "@/lib/invoice-calc";
import type { CompanyMember, FixedMonthlyExpense, TeamMemberType } from "@/lib/types";

export const Route = createFileRoute("/team")({ component: TeamPage });

const MEMBER_TYPES: Array<{ value: TeamMemberType; label: string }> = [
  { value: "founder", label: "Founder" },
  { value: "employee", label: "Employee" },
  { value: "intern", label: "Intern" },
  { value: "contractor", label: "Contractor" },
];

function TeamPage() {
  const { company, loading: companyLoading, invalidate } = useCompany();
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [editing, setEditing] = useState<CompanyMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const members = useMemo(
    () =>
      [...(company.companyMembers ?? [])].sort(
        (a, b) =>
          Number(a.status === "inactive") - Number(b.status === "inactive") ||
          a.name.localeCompare(b.name),
      ),
    [company.companyMembers],
  );

  const payrollByMember = useMemo(() => {
    const totals = new Map<string, number>();
    for (const transaction of ops.transactions ?? []) {
      if (!transaction.relatedTeamMemberId || !transaction.payrollMonth) continue;
      totals.set(
        transaction.relatedTeamMemberId,
        (totals.get(transaction.relatedTeamMemberId) ?? 0) + transaction.amount,
      );
    }
    return totals;
  }, [ops.transactions]);

  const saveMember = async (member: CompanyMember) => {
    setSaving(true);
    try {
      const exists = members.some((candidate) => candidate.id === member.id);
      const nextMembers = exists
        ? members.map((candidate) => (candidate.id === member.id ? member : candidate))
        : [...members, member];
      await saveCompany({ ...company, companyMembers: nextMembers });

      const schedules = ops.fixedMonthlyExpenses ?? [];
      const scheduleIndex = schedules.findIndex(
        (item) => item.kind === "salary" && item.teamMemberId === member.id,
      );
      let nextSchedules = schedules;
      if (member.baseMonthlySalary && member.baseMonthlySalary > 0 && member.salaryStartDate) {
        const existingSchedule = scheduleIndex >= 0 ? schedules[scheduleIndex] : undefined;
        const salarySchedule: FixedMonthlyExpense = {
          ...(existingSchedule ?? {}),
          id: existingSchedule?.id ?? `fix_salary_${member.id}`,
          label: `${member.name} salary`,
          payee: member.name,
          teamMemberId: member.id,
          amountPerMonth: member.baseMonthlySalary,
          kind: "salary",
          startDate: member.salaryStartDate,
          reminderDay: member.salaryDueDay ?? (Number(member.salaryStartDate.slice(8, 10)) || 1),
          paidMonths: existingSchedule?.paidMonths ?? [],
          status: member.status === "inactive" ? "paused" : (existingSchedule?.status ?? "active"),
          active: member.status !== "inactive",
          notes: existingSchedule?.notes,
        };
        nextSchedules =
          scheduleIndex >= 0
            ? schedules.map((item, index) => (index === scheduleIndex ? salarySchedule : item))
            : [...schedules, salarySchedule];
      } else if (scheduleIndex >= 0) {
        nextSchedules = schedules.map((item, index) =>
          index === scheduleIndex ? { ...item, status: "paused", active: false } : item,
        );
      }
      if (nextSchedules !== schedules) {
        persist({ ...ops, fixedMonthlyExpenses: nextSchedules });
      }
      await invalidate();
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (companyLoading || operationsLoading) return <OperationsLoading />;

  const activeMembers = members.filter((member) => member.status !== "inactive");
  const monthlyBase = activeMembers.reduce(
    (sum, member) => sum + (member.baseMonthlySalary ?? 0),
    0,
  );
  const totalPaidToDate = [...payrollByMember.values()].reduce((sum, amount) => sum + amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OperationsPageHeader
          title="Team"
          description="Members, salary schedules, and how much each person has been paid to date."
        />
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Add Team Member
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Active team" value={String(activeMembers.length)} icon={Users} />
        <Stat label="Monthly base payroll" value={formatINRWhole(monthlyBase)} icon={IndianRupee} />
        <Stat label="Paid to date" value={formatINRWhole(totalPaidToDate)} icon={IndianRupee} />
      </div>

      {company.projectAssignmentsEnabled === true && (
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-2">
            <Link to="/team/assignments">Open Project Assignments</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => {
          const paidToDate = payrollByMember.get(member.id) ?? 0;
          return (
            <article
              key={member.id}
              className={`group overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/40 ${
                member.status === "inactive" ? "opacity-65" : ""
              }`}
            >
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-primary/5 text-sm font-bold text-primary ring-1 ring-primary/20">
                  {initials(member.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate font-bold text-foreground">
                      {member.name || "Unnamed member"}
                    </h2>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      {member.memberType ?? "team"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.role || "Team member"}
                    {member.status === "inactive" ? " · Inactive" : ""}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 opacity-60 transition-opacity group-hover:opacity-100"
                  onClick={() => {
                    setEditing(member);
                    setDialogOpen(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-px border-t border-border bg-border">
                <MemberStat label="Salary / mo" value={formatSalary(member.baseMonthlySalary)} />
                <MemberStat
                  label="Paid since"
                  value={
                    member.salaryStartDate
                      ? formatDate(member.salaryStartDate)
                      : member.joinDate
                        ? formatDate(member.joinDate)
                        : "—"
                  }
                />
                <MemberStat
                  label="Paid to date"
                  value={formatINRWhole(paidToDate)}
                  highlight={paidToDate > 0}
                  className="col-span-2"
                />
              </dl>
            </article>
          );
        })}
      </div>

      <TeamMemberDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={editing}
        saving={saving}
        onSave={saveMember}
      />
    </div>
  );
}

function TeamMemberDialog({
  open,
  onOpenChange,
  member,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: CompanyMember | null;
  saving: boolean;
  onSave: (member: CompanyMember) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    memberType: "employee" as TeamMemberType,
    joinDate: "",
    status: "active" as "active" | "inactive",
    baseSalary: "",
    bonusCap: "",
    salaryStartDate: "",
    salaryDueDay: "1",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: member?.name ?? "",
      email: member?.email ?? "",
      phone: member?.phone ?? "",
      role: member?.role ?? "",
      memberType: member?.memberType ?? "employee",
      joinDate: member?.joinDate ?? "",
      status: member?.status ?? "active",
      baseSalary: member?.baseMonthlySalary != null ? String(member.baseMonthlySalary) : "",
      bonusCap: member?.monthlyBonusCap != null ? String(member.monthlyBonusCap) : "",
      salaryStartDate: member?.salaryStartDate ?? "",
      salaryDueDay: String(member?.salaryDueDay ?? 1),
    });
  }, [open, member]);

  const submit = () => {
    if (!form.name.trim()) return;
    const baseSalary = form.baseSalary ? Number(form.baseSalary) : undefined;
    const bonusCap = form.bonusCap ? Number(form.bonusCap) : undefined;
    const dueDay = Number(form.salaryDueDay);
    if ((baseSalary != null && baseSalary < 0) || (bonusCap != null && bonusCap < 0)) return;
    if (baseSalary != null && baseSalary > 0 && !form.salaryStartDate) {
      alert("Set Salary starts when a monthly salary amount is entered.");
      return;
    }
    void onSave({
      ...(member ?? {}),
      id: member?.id ?? `member-${crypto.randomUUID().slice(0, 8)}`,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role.trim() || undefined,
      memberType: form.memberType,
      joinDate: form.joinDate || undefined,
      status: form.status,
      baseMonthlySalary: baseSalary,
      monthlyBonusCap: bonusCap,
      salaryStartDate: form.salaryStartDate || undefined,
      salaryDueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{member ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
          <DialogDescription>
            Set the person and when salary payments start. Paid-to-date accumulates from payroll
            records over time.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name *" id="team-name">
            <Input
              id="team-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Role" id="team-role">
            <Input
              id="team-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              placeholder="Developer, Partner, Intern…"
            />
          </Field>
          <Field label="Member type" id="team-type">
            <Select
              value={form.memberType}
              onValueChange={(value) => setForm({ ...form, memberType: value as TeamMemberType })}
            >
              <SelectTrigger id="team-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMBER_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Status" id="team-status">
            <Select
              value={form.status}
              onValueChange={(value) =>
                setForm({ ...form, status: value as "active" | "inactive" })
              }
            >
              <SelectTrigger id="team-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Email" id="team-email">
            <Input
              id="team-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
          </Field>
          <Field label="Phone" id="team-phone">
            <Input
              id="team-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field label="Joining date" id="team-join-date">
            <Input
              id="team-join-date"
              type="date"
              value={form.joinDate}
              onChange={(event) => setForm({ ...form, joinDate: event.target.value })}
            />
          </Field>
          <Field label="Salary starts *" id="team-salary-start">
            <Input
              id="team-salary-start"
              type="date"
              value={form.salaryStartDate}
              onChange={(event) => setForm({ ...form, salaryStartDate: event.target.value })}
            />
          </Field>
          <Field label="Fixed salary / month (₹)" id="team-base-salary">
            <Input
              id="team-base-salary"
              type="number"
              min={0}
              value={form.baseSalary}
              onChange={(event) => setForm({ ...form, baseSalary: event.target.value })}
              placeholder="5000"
            />
          </Field>
          <Field label="Optional bonus limit (₹)" id="team-bonus-cap">
            <Input
              id="team-bonus-cap"
              type="number"
              min={0}
              value={form.bonusCap}
              onChange={(event) => setForm({ ...form, bonusCap: event.target.value })}
              placeholder="0"
            />
          </Field>
          <Field label="Salary due day" id="team-salary-due">
            <Input
              id="team-salary-due"
              type="number"
              min={1}
              max={31}
              value={form.salaryDueDay}
              onChange={(event) => setForm({ ...form, salaryDueDay: event.target.value })}
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Set salary amount and start date to create the recurring payroll schedule. Paid-to-date
          grows whenever salary/bonus payouts are recorded for this member.
        </p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !form.name.trim()} onClick={submit}>
            {saving ? "Saving…" : member ? "Save" : "Add member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function MemberStat({
  label,
  value,
  highlight,
  className,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`bg-card px-4 py-2.5 ${className ?? ""}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          highlight ? "text-emerald-500" : "text-foreground"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function formatSalary(amount: number | undefined): string {
  return amount != null && amount > 0 ? formatINRWhole(amount) : "—";
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
