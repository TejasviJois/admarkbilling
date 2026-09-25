import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PayrollOnboardingDialog, StartPayrollDialog } from "@/components/team/StartPayrollDialog";
import { SalaryMonthPaymentDialog } from "@/components/team/SalaryMonthPaymentDialog";
import { TeamMemberFormDialog } from "@/components/team/TeamMemberFormDialog";
import { MemberAvatar, PayrollMonthCell } from "@/components/team/team-ui";
import { OperationsLoading } from "@/components/operations/operations-ui";
import { useCompany } from "@/hooks/use-company";
import { useOperations } from "@/hooks/use-operations";
import { logClientError } from "@/lib/client-logger";
import { writeClientCache } from "@/lib/client-data-cache";
import { queryKeys } from "@/lib/query-keys";
import { saveCompany } from "@/lib/storage";
import { formatINRWhole } from "@/lib/invoice-calc";
import {
  COMPANY_START_YEAR,
  clearSalaryPayment,
  compareMembersByPayroll,
  currentMonthKey,
  currentYear,
  ensureSalarySchedules,
  formatSalary,
  groupMembersByType,
  isMonthEligible,
  isPayrollStarted,
  paymentForMonth,
  payrollYearOptions,
  recordSalaryPayment,
  shortMonthLabel,
  startPayroll,
  teamGroupLabel,
  trackerMonthsForYear,
  upsertSalarySchedule,
  withDirectoryCatalogs,
} from "@/lib/team-payroll";
import type { CompanyMember, CompanySettings, SalaryMonthPayment, TeamMemberType } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/team")({ component: TeamPage });

function TeamPage() {
  const queryClient = useQueryClient();
  const { company, loading: companyLoading, invalidate } = useCompany();
  const { ops, persist, loading: operationsLoading } = useOperations();
  const [editing, setEditing] = useState<CompanyMember | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(() => Math.max(currentYear(), COMPANY_START_YEAR));
  const [paymentTarget, setPaymentTarget] = useState<{
    member: CompanyMember;
    month: string;
  } | null>(null);
  const [startTarget, setStartTarget] = useState<CompanyMember | null>(null);
  const [onboardingMember, setOnboardingMember] = useState<CompanyMember | null>(null);
  const [directoryType, setDirectoryType] = useState<TeamMemberType>("founder");

  const members = useMemo(
    () => [...(company.companyMembers ?? [])].sort(compareMembersByPayroll),
    [company.companyMembers],
  );
  const directoryGroups = useMemo(
    () => groupMembersByType(members, company.customMemberTypes),
    [members, company.customMemberTypes],
  );
  const selectedDirectory =
    directoryGroups.find((group) => group.type === directoryType) ?? directoryGroups[0];

  // If the selected type tab disappears (e.g. after an edit), land on a real group.
  useEffect(() => {
    if (!directoryGroups.some((group) => group.type === directoryType) && directoryGroups[0]) {
      setDirectoryType(directoryGroups[0].type);
    }
  }, [directoryGroups, directoryType]);

  const opsRef = useRef(ops);
  opsRef.current = ops;

  useEffect(() => {
    if (companyLoading || operationsLoading || members.length === 0) return;
    const currentOps = opsRef.current;
    const missing = members
      .filter(isPayrollStarted)
      .some(
        (member) =>
          !(currentOps.fixedMonthlyExpenses ?? []).some(
            (item) => item.kind === "salary" && item.teamMemberId === member.id,
          ),
      );
    if (!missing) return;
    void persist(ensureSalarySchedules(currentOps, members));
  }, [companyLoading, operationsLoading, members, persist]);

  const yearOptions = useMemo(() => payrollYearOptions(year), [year]);
  const monthKeys = useMemo(() => trackerMonthsForYear(year), [year]);
  const thisMonth = currentMonthKey();
  const activeMembers = members.filter((member) => member.status !== "inactive");
  const onPayroll = activeMembers.filter(isPayrollStarted);
  const monthlyBase = onPayroll.reduce((sum, member) => sum + (member.baseMonthlySalary ?? 0), 0);
  const markedThisMonth = onPayroll.filter((member) =>
    Boolean(paymentForMonth(ops, member.id, thisMonth)),
  ).length;

  const persistMember = async (member: CompanyMember, nextMembers: CompanyMember[]) => {
    const nextCompany: CompanySettings = {
      ...company,
      companyMembers: nextMembers,
      ...withDirectoryCatalogs(company, nextMembers),
    };
    // Paint the Team page immediately — don't wait on the server round-trip.
    queryClient.setQueryData(queryKeys.company, nextCompany);
    writeClientCache("company", nextCompany);
    await saveCompany(nextCompany);
    await persist(upsertSalarySchedule(ops, member));
    await invalidate();
  };

  const saveMember = async (member: CompanyMember) => {
    setSaving(true);
    try {
      const exists = members.some((candidate) => candidate.id === member.id);
      const nextMembers = exists
        ? members.map((candidate) => (candidate.id === member.id ? member : candidate))
        : [...members, member];
      await persistMember(member, nextMembers);
      setDialogOpen(false);
      setEditing(null);
      if (member.memberType) setDirectoryType(member.memberType);
      if (!exists) setOnboardingMember(member);
      toast.success(exists ? "Member updated." : "Member added.");
    } catch (error) {
      logClientError("team.saveMember", error);
      toast.error(error instanceof Error ? error.message : "Could not save member.");
      // Roll back optimistic paint if the server rejected the write.
      await invalidate();
    } finally {
      setSaving(false);
    }
  };

  const applyStartPayroll = async (member: CompanyMember, month: string) => {
    try {
      const next = startPayroll(member, month);
      const nextMembers = members.map((candidate) => (candidate.id === next.id ? next : candidate));
      await persistMember(next, nextMembers);
      setStartTarget(null);
      setOnboardingMember(null);
      toast.success(`Payroll started for ${next.name}.`);
    } catch (error) {
      logClientError("team.startPayroll", error);
      toast.error(error instanceof Error ? error.message : "Could not start payroll.");
      await invalidate();
    }
  };

  if (companyLoading || operationsLoading) return <OperationsLoading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-[27px] font-semibold leading-tight tracking-tight text-foreground">
            Team
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Salary tracker from June 2026 onward. Record what you actually paid each month — kept
            separate from Accounts.
          </p>
        </div>
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
        <Stat label="Active team" value={String(activeMembers.length)} />
        <Stat
          label="Monthly base payroll"
          value={formatINRWhole(monthlyBase)}
          hint={`${onPayroll.length} on payroll`}
        />
        <Stat label="This month marked paid" value={`${markedThisMonth} of ${onPayroll.length}`} />
      </div>

      {company.projectAssignmentsEnabled === true && (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/team/assignments">Open Project Assignments</Link>
          </Button>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Salary tracker · {year}</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Click a month to record full, partial, or extra pay.
            </p>
          </div>
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5">
            {yearOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setYear(option)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                  option === year
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-border/60 text-left text-[11px] font-medium text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Employee</th>
                <th className="px-3 py-2.5 font-medium">Monthly pay</th>
                {monthKeys.map((month) => (
                  <th
                    key={month}
                    className={cn(
                      "px-1.5 py-2.5 text-center font-medium",
                      month === thisMonth && "bg-muted/40 text-foreground",
                    )}
                  >
                    {shortMonthLabel(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td
                    colSpan={monthKeys.length + 2}
                    className="px-5 py-12 text-center text-muted-foreground"
                  >
                    No team members yet. Add someone to start tracking months.
                  </td>
                </tr>
              ) : (
                members.map((member) => {
                  const started = isPayrollStarted(member);
                  return (
                    <tr
                      key={member.id}
                      className={cn(
                        "border-b border-border/50 last:border-b-0",
                        member.status === "inactive" && "opacity-60",
                      )}
                    >
                      <td className="px-5 py-3.5">
                        <Link
                          to="/team/$id"
                          params={{ id: member.id }}
                          className="group flex min-w-0 items-center gap-2.5"
                        >
                          <MemberAvatar name={member.name} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-foreground group-hover:text-primary">
                              {member.name || "Unnamed member"}
                            </p>
                            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                              {member.role || "Team member"}
                              {member.employeeId ? ` · ${member.employeeId}` : ""}
                              {member.status === "inactive" ? " · Inactive" : ""}
                            </p>
                          </div>
                          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-[13px] font-medium tabular-nums text-foreground">
                        {formatSalary(member.baseMonthlySalary)}
                      </td>
                      {started ? (
                        monthKeys.map((month) => {
                          const eligible = isMonthEligible(member, month);
                          const payment = paymentForMonth(ops, member.id, month);
                          const isCurrent = month === thisMonth;
                          return (
                            <td
                              key={month}
                              className={cn("px-1 py-3.5 text-center", isCurrent && "bg-muted/25")}
                            >
                              <PayrollMonthCell
                                payment={payment}
                                eligible={eligible}
                                isCurrent={isCurrent}
                                onClick={
                                  eligible ? () => setPaymentTarget({ member, month }) : undefined
                                }
                                title={`${shortMonthLabel(month)} ${year}`}
                              />
                            </td>
                          );
                        })
                      ) : (
                        <td colSpan={monthKeys.length} className="px-3 py-3.5 align-middle">
                          <div className="flex h-8 items-center">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-7 px-2.5 text-[11px] shadow-none"
                              onClick={() => setStartTarget(member)}
                            >
                              Start Payroll
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-semibold text-foreground">Member directory</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Choose a type to see its members, sorted by employee ID.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 px-5 py-3">
          {directoryGroups.map((group) => (
            <button
              key={group.type}
              type="button"
              onClick={() => setDirectoryType(group.type)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                group.type === selectedDirectory?.type
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {group.label}
              <span
                className={cn(
                  "ml-1.5 text-[12px]",
                  group.type === selectedDirectory?.type
                    ? "text-background/70"
                    : "text-muted-foreground",
                )}
              >
                {group.members.length}
              </span>
            </button>
          ))}
        </div>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {!selectedDirectory || selectedDirectory.members.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              No members in this section yet.
            </p>
          ) : (
            selectedDirectory.members.map((member) => {
              const salaryLabel = formatSalary(member.baseMonthlySalary);
              const payrollStarted = isPayrollStarted(member);
              const teamLabel = teamGroupLabel(member.teamGroup);
              return (
                <div
                  key={member.id}
                  className={cn(
                    "flex flex-wrap items-center gap-2.5 px-5 py-3",
                    member.status === "inactive" && "opacity-60",
                  )}
                >
                  <MemberAvatar name={member.name} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to="/team/$id"
                      params={{ id: member.id }}
                      className="text-[13px] font-medium text-foreground hover:text-primary"
                    >
                      {member.name || "Unnamed member"}
                    </Link>
                    <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                      {member.role || "Team member"}
                      {member.employeeId ? ` · ${member.employeeId}` : ""}
                      {teamLabel ? ` · ${teamLabel}` : ""}
                      {member.email ? (
                        <>
                          {" · "}
                          <span className="text-muted-foreground/60">{member.email}</span>
                        </>
                      ) : null}
                      {member.status === "inactive" ? " · Inactive" : ""}
                      {!payrollStarted ? " · Payroll not started" : ""}
                    </p>
                  </div>
                  <div className="flex min-w-[7.5rem] items-center justify-end">
                    <p
                      className={cn(
                        "text-[13px] font-medium tabular-nums",
                        salaryLabel === "—" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {salaryLabel === "—" ? "—" : `${salaryLabel} / mo`}
                    </p>
                  </div>
                  {!payrollStarted && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] shadow-none"
                      onClick={() => setStartTarget(member)}
                    >
                      Start Payroll
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground"
                    onClick={() => {
                      setEditing(member);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </section>

      <TeamMemberFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        member={editing}
        existingMembers={members}
        customMemberTypes={company.customMemberTypes}
        customTeamGroups={company.customTeamGroups}
        saving={saving}
        onSave={saveMember}
      />
      <SalaryMonthPaymentDialog
        open={paymentTarget != null}
        onOpenChange={(open) => {
          if (!open) setPaymentTarget(null);
        }}
        member={paymentTarget?.member ?? null}
        month={paymentTarget?.month ?? ""}
        existing={
          paymentTarget
            ? paymentForMonth(ops, paymentTarget.member.id, paymentTarget.month)
            : undefined
        }
        onSave={(payment: SalaryMonthPayment) => {
          if (!paymentTarget) return;
          void persist(recordSalaryPayment(ops, paymentTarget.member, payment)).then(() => {
            setPaymentTarget(null);
            toast.success("Salary payment saved.");
          });
        }}
        onClear={() => {
          if (!paymentTarget) return;
          void persist(clearSalaryPayment(ops, paymentTarget.member, paymentTarget.month)).then(
            () => {
              setPaymentTarget(null);
              toast.success("Salary payment cleared.");
            },
          );
        }}
      />
      <StartPayrollDialog
        open={startTarget != null}
        onOpenChange={(open) => {
          if (!open) setStartTarget(null);
        }}
        member={startTarget}
        onConfirm={(month) => {
          if (!startTarget) return;
          void applyStartPayroll(startTarget, month);
        }}
      />
      <PayrollOnboardingDialog
        open={onboardingMember != null && startTarget == null}
        onOpenChange={(open) => {
          if (!open) setOnboardingMember(null);
        }}
        memberName={onboardingMember?.name ?? ""}
        onLater={() => setOnboardingMember(null)}
        onStartNow={() => {
          if (!onboardingMember) return;
          setStartTarget(onboardingMember);
        }}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-5 py-5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
