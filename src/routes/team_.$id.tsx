import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StartPayrollDialog } from "@/components/team/StartPayrollDialog";
import { TeamMemberFormDialog } from "@/components/team/TeamMemberFormDialog";
import { DeleteMemberDialog } from "@/components/team/DeleteMemberDialog";
import { MemberAvatar } from "@/components/team/team-ui";
import { OperationsLoading, OperationsPageHeader } from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { writeClientCache } from "@/lib/client-data-cache";
import { logClientError } from "@/lib/client-logger";
import { queryKeys } from "@/lib/query-keys";
import { saveCompany } from "@/lib/storage";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  deleteCompanyMember,
  formatSalary,
  isPayrollStarted,
  memberTypeLabel,
  removeSalarySchedule,
  startPayroll,
  teamGroupLabel,
  totalSalaryPaidUntilToday,
  upsertSalarySchedule,
  withDirectoryCatalogs,
} from "@/lib/team-payroll";
import type { CompanyMember, CompanySettings } from "@/lib/types";

export const Route = createFileRoute("/team_/$id")({
  component: TeamMemberDetailPage,
});

function TeamMemberDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { company, loading: companyLoading, invalidate } = useCompany();
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const members = useMemo(() => company.companyMembers ?? [], [company.companyMembers]);
  const member = useMemo(() => members.find((candidate) => candidate.id === id), [members, id]);

  const started = member ? isPayrollStarted(member) : false;
  const paidUntilToday = member ? totalSalaryPaidUntilToday(ops, member.id) : 0;

  const persistMember = async (next: CompanyMember) => {
    const nextMembers = members.map((candidate) => (candidate.id === next.id ? next : candidate));
    const nextCompany: CompanySettings = {
      ...company,
      companyMembers: nextMembers,
      ...withDirectoryCatalogs(company, nextMembers),
    };
    queryClient.setQueryData(queryKeys.company, nextCompany);
    writeClientCache("company", nextCompany);
    await saveCompany(nextCompany);
    await persist(upsertSalarySchedule(ops, next));
    await invalidate();
  };

  const saveMember = async (next: CompanyMember) => {
    setSaving(true);
    try {
      await persistMember(next);
      setDialogOpen(false);
      toast.success("Member updated.");
    } catch (error) {
      logClientError("team.detail.saveMember", error);
      toast.error(error instanceof Error ? error.message : "Could not save member.");
      await invalidate();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    setDeleting(true);
    try {
      const { nextCompany } = deleteCompanyMember(company, member.id);
      const { nextOps, removedScheduleIds } = removeSalarySchedule(ops, member.id);

      queryClient.setQueryData(queryKeys.company, nextCompany);
      writeClientCache("company", nextCompany);
      queryClient.setQueryData(queryKeys.operations, nextOps);
      writeClientCache("operations", nextOps);

      await saveCompany(nextCompany);
      if (removedScheduleIds.length > 0) {
        await persist(nextOps, {
          deleteIds: {
            fixedMonthlyExpenses: removedScheduleIds,
          },
        });
      } else {
        await persist(nextOps);
      }
      await invalidate();
      toast.success(`${member.name || "Member"} removed from team.`);
      navigate({ to: "/team" });
    } catch (error) {
      logClientError("team.detail.deleteMember", error);
      toast.error(error instanceof Error ? error.message : "Could not delete member.");
      await invalidate();
    } finally {
      setDeleting(false);
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
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Team
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 glass-panel p-6 shadow-xl">
          <div className="flex min-w-0 items-center gap-4">
            <MemberAvatar name={member.name} className="h-14 w-14 text-base font-bold border border-white/10 bg-white/5 text-[#ff6b2b]" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-black tracking-tight text-white md:text-3xl">
                {member.name || "Unnamed member"}
              </h1>
              <p className="mt-1 truncate text-xs text-white/50">
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
              <Button
                variant="destructive"
                className="rounded-xl font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30"
                onClick={() => setStartOpen(true)}
              >
                Start Payroll
              </Button>
            )}
            <Button
              variant="outline"
              className="gap-2 rounded-xl border border-white/10 glass-card text-white hover:border-white/25 hover:bg-white/5"
              onClick={() => setDialogOpen(true)}
            >
              <Pencil className="h-4 w-4" /> Edit profile
            </Button>
            <Button
              variant="outline"
              className="gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete member
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <DetailStat label="Salary / month" value={formatSalary(member.baseMonthlySalary)} />
        <DetailStat
          label="Salary paid until today"
          value={started ? formatINRWhole(paidUntilToday) : "—"}
        />
      </div>

      <section className="rounded-2xl border border-white/10 glass-panel p-6 shadow-xl">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#ff6b2b] border-b border-white/10 pb-3">
          Member Profile
        </h2>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
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
        onDelete={() => setDeleteOpen(true)}
      />
      <DeleteMemberDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteOpen(false);
        }}
        member={member}
        deleting={deleting}
        onConfirm={handleDelete}
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
    <div className="rounded-2xl border border-white/10 glass-panel p-5 shadow-lg">
      <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">
        {label}
      </p>
      <p className="mt-2.5 text-2xl font-black tabular-nums text-white">{value}</p>
    </div>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 glass-card p-3.5">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-white/40">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold text-white">{value}</dd>
    </div>
  );
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
