import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StartPayrollDialog } from "@/components/team/StartPayrollDialog";
import { TeamMemberFormDialog } from "@/components/team/TeamMemberFormDialog";
import { MemberAvatar } from "@/components/team/team-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { saveCompany } from "@/lib/storage";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  formatSalary,
  isPayrollStarted,
  memberTypeLabel,
  startPayroll,
  teamGroupLabel,
  totalSalaryPaidUntilToday,
  upsertSalarySchedule,
  withDirectoryCatalogs,
} from "@/lib/team-payroll";
import type { CompanyMember } from "@/lib/types";

export const Route = createFileRoute("/team_/$id")({
  component: TeamMemberDetailPage,
});

function TeamMemberDetailPage() {
  const { id } = Route.useParams();
  const { company, loading: companyLoading, invalidate } = useCompany();
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  const members = useMemo(() => company.companyMembers ?? [], [company.companyMembers]);
  const member = useMemo(() => members.find((candidate) => candidate.id === id), [members, id]);

  const started = member ? isPayrollStarted(member) : false;
  const paidUntilToday = member ? totalSalaryPaidUntilToday(ops, member.id) : 0;

  const persistMember = async (next: CompanyMember) => {
    const nextMembers = members.map((candidate) => (candidate.id === next.id ? next : candidate));
    await saveCompany({
      ...company,
      companyMembers: nextMembers,
      ...withDirectoryCatalogs(company, nextMembers),
    });
    await persist(upsertSalarySchedule(ops, next));
    await invalidate();
  };

  const saveMember = async (next: CompanyMember) => {
    setSaving(true);
    try {
      await persistMember(next);
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (companyLoading || operationsLoading) return <OperationsLoading />;

  if (!member) {
    return (
      <div className="space-y-4">
        <Link
          to="/team"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team
        </Link>
        <OperationsPageHeader
          title="Member not found"
          description="This team member is missing or was removed."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/team"
          className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Team
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <MemberAvatar name={member.name} className="h-12 w-12 text-sm" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
                {member.name || "Unnamed member"}
              </h1>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {`${member.employeeId ? `${member.employeeId} · ` : ""}${
                  member.role || "Team member"
                } · ${memberTypeLabel(member.memberType)}${
                  member.teamGroup ? ` · ${teamGroupLabel(member.teamGroup)}` : ""
                }${member.status === "inactive" ? " · Inactive" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!started && (
              <Button variant="destructive" onClick={() => setStartOpen(true)}>
                Start Payroll
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setDialogOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit profile
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DetailStat label="Salary / month" value={formatSalary(member.baseMonthlySalary)} />
        <DetailStat
          label="Salary paid until today"
          value={started ? formatINRWhole(paidUntilToday) : "—"}
        />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-foreground">Profile</h2>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <ProfileRow label="Employee ID" value={member.employeeId || "—"} />
          <ProfileRow label="Member type" value={memberTypeLabel(member.memberType)} />
          <ProfileRow label="Team" value={teamGroupLabel(member.teamGroup) || "—"} />
          <ProfileRow label="Email" value={member.email || "—"} />
          <ProfileRow label="Phone" value={member.phone || "—"} />
          <ProfileRow
            label="Joining date"
            value={member.joinDate ? formatDate(member.joinDate) : "—"}
          />
          <ProfileRow
            label="Salary due day"
            value={member.salaryDueDay != null ? `Day ${member.salaryDueDay}` : "—"}
          />
        </dl>
      </section>

      <TeamMemberFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={member}
        existingMembers={members}
        customMemberTypes={company.customMemberTypes}
        customTeamGroups={company.customTeamGroups}
        saving={saving}
        onSave={saveMember}
      />
      <StartPayrollDialog
        open={startOpen}
        onOpenChange={setStartOpen}
        member={member}
        onConfirm={(month) => {
          void persistMember(startPayroll(member, month));
          setStartOpen(false);
        }}
      />
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
