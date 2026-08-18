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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/operations/operations-ui";
import {
  CUSTOM_TYPE_VALUE,
  MEMBER_TYPE_SECTIONS,
  TEAM_GROUP_OPTIONS,
  collectCustomMemberTypes,
  collectCustomTeamGroups,
  nextEmployeeId,
} from "@/lib/team-payroll";
import type { CompanyMember, TeamMemberType } from "@/lib/types";

export function TeamMemberFormDialog({
  open,
  onOpenChange,
  member,
  existingMembers,
  customMemberTypes = [],
  customTeamGroups = [],
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: CompanyMember | null;
  existingMembers: CompanyMember[];
  customMemberTypes?: string[];
  customTeamGroups?: string[];
  saving: boolean;
  onSave: (member: CompanyMember) => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    employeeId: "",
    role: "",
    memberType: "employee" as string,
    customMemberType: "",
    teamGroup: "",
    customTeamGroup: "",
    joinDate: "",
    status: "active" as "active" | "inactive",
    baseSalary: "",
    bonusCap: "",
    salaryDueDay: "1",
  });

  const memberTypeOptions = useMemo(() => {
    const extras = collectCustomMemberTypes(existingMembers, customMemberTypes);
    return [
      ...MEMBER_TYPE_SECTIONS.map((type) => ({ value: type.value, label: type.formLabel })),
      ...extras.map((label) => ({ value: label, label })),
    ];
  }, [existingMembers, customMemberTypes]);

  const teamGroupOptions = useMemo(() => {
    const extras = collectCustomTeamGroups(existingMembers, customTeamGroups);
    return [...TEAM_GROUP_OPTIONS, ...extras.map((label) => ({ value: label, label }))];
  }, [existingMembers, customTeamGroups]);

  useEffect(() => {
    if (!open) return;
    const memberType = member?.memberType ?? "employee";
    const knownMemberType = memberTypeOptions.some((option) => option.value === memberType);
    const teamGroup = member?.teamGroup ?? "";
    const knownTeamGroup =
      teamGroup === "" || teamGroupOptions.some((option) => option.value === teamGroup);
    setForm({
      name: member?.name ?? "",
      email: member?.email ?? "",
      phone: member?.phone ?? "",
      employeeId: member?.employeeId ?? nextEmployeeId(existingMembers),
      role: member?.role ?? "",
      memberType: knownMemberType ? memberType : CUSTOM_TYPE_VALUE,
      customMemberType: knownMemberType ? "" : memberType,
      teamGroup: knownTeamGroup ? teamGroup : CUSTOM_TYPE_VALUE,
      customTeamGroup: knownTeamGroup ? "" : teamGroup,
      joinDate: member?.joinDate ?? "",
      status: member?.status ?? "active",
      baseSalary: member?.baseMonthlySalary != null ? String(member.baseMonthlySalary) : "",
      bonusCap: member?.monthlyBonusCap != null ? String(member.monthlyBonusCap) : "",
      salaryDueDay: String(member?.salaryDueDay ?? 1),
    });
  }, [open, member, existingMembers, memberTypeOptions, teamGroupOptions]);

  const resolvedMemberType = (
    form.memberType === CUSTOM_TYPE_VALUE ? form.customMemberType.trim() : form.memberType.trim()
  ) as TeamMemberType;
  const resolvedTeamGroup =
    form.teamGroup === CUSTOM_TYPE_VALUE ? form.customTeamGroup.trim() : form.teamGroup.trim();

  const submit = () => {
    if (!form.name.trim() || !resolvedMemberType) return;
    const baseSalary = form.baseSalary ? Number(form.baseSalary) : undefined;
    const bonusCap = form.bonusCap ? Number(form.bonusCap) : undefined;
    const dueDay = Number(form.salaryDueDay);
    if ((baseSalary != null && baseSalary < 0) || (bonusCap != null && bonusCap < 0)) return;
    void onSave({
      ...(member ?? {}),
      id: member?.id ?? `member-${crypto.randomUUID().slice(0, 8)}`,
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      employeeId: form.employeeId.trim() || nextEmployeeId(existingMembers),
      role: form.role.trim() || undefined,
      memberType: resolvedMemberType,
      teamGroup: resolvedTeamGroup || undefined,
      joinDate: form.joinDate || undefined,
      status: form.status,
      baseMonthlySalary: baseSalary,
      monthlyBonusCap: bonusCap,
      salaryStartDate: member?.salaryStartDate,
      salaryDueDay: Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : 1,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{member ? "Edit Team Member" : "Register New Team Member"}</DialogTitle>
          <DialogDescription>
            Record profile, role, working team, and monthly salary. After adding someone new you
            will be asked whether payroll has started.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee ID *" id="team-employee-id">
            <Input
              id="team-employee-id"
              value={form.employeeId}
              onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
              placeholder="ADM-007"
            />
          </Field>
          <Field label="Full name *" id="team-name">
            <Input
              id="team-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Rahul Sharma"
            />
          </Field>
          <Field label="Job position / role" id="team-role">
            <Input
              id="team-role"
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              placeholder="e.g. Lead Backend Engineer"
            />
          </Field>
          <Field label="Member type *" id="team-type">
            <Select
              value={form.memberType}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  memberType: value,
                  customMemberType: value === CUSTOM_TYPE_VALUE ? form.customMemberType : "",
                })
              }
            >
              <SelectTrigger id="team-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {memberTypeOptions.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_TYPE_VALUE}>Add another type…</SelectItem>
              </SelectContent>
            </Select>
            {form.memberType === CUSTOM_TYPE_VALUE && (
              <Input
                className="mt-2"
                value={form.customMemberType}
                onChange={(event) => setForm({ ...form, customMemberType: event.target.value })}
                placeholder="e.g. Advisor"
              />
            )}
          </Field>
          <Field label="Team" id="team-group">
            <Select
              value={form.teamGroup || "__none__"}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  teamGroup: value === "__none__" ? "" : value,
                  customTeamGroup: value === CUSTOM_TYPE_VALUE ? form.customTeamGroup : "",
                })
              }
            >
              <SelectTrigger id="team-group">
                <SelectValue placeholder="Select a team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not specified</SelectItem>
                {teamGroupOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_TYPE_VALUE}>Add another team…</SelectItem>
              </SelectContent>
            </Select>
            {form.teamGroup === CUSTOM_TYPE_VALUE && (
              <Input
                className="mt-2"
                value={form.customTeamGroup}
                onChange={(event) => setForm({ ...form, customTeamGroup: event.target.value })}
                placeholder="e.g. Operations"
              />
            )}
          </Field>
          <Field label="Status *" id="team-status">
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
          <Field label="Email address" id="team-email">
            <Input
              id="team-email"
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="name@company.com"
            />
          </Field>
          <Field label="Phone number" id="team-phone">
            <Input
              id="team-phone"
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
              placeholder="+91 98765 43210"
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
          <Field label="Base monthly salary (₹)" id="team-base-salary">
            <Input
              id="team-base-salary"
              type="number"
              min={0}
              value={form.baseSalary}
              onChange={(event) => setForm({ ...form, baseSalary: event.target.value })}
              placeholder="e.g. 85000"
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
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving || !form.name.trim() || !resolvedMemberType}
            onClick={submit}
          >
            {saving ? "Saving…" : "Save member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
