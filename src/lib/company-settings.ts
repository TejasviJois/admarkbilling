import { DEFAULT_COMPANY } from "./constants";
import { normalizeFormOptions } from "./form-options";
import {
  applyTeamDirectoryDefaults,
  collectCustomMemberTypes,
  collectCustomTeamGroups,
} from "./team-payroll";
import type { CompanyMember, CompanySettings } from "./types";

function missingDefaultMembers(existing: CompanyMember[]): CompanyMember[] {
  const defaults = DEFAULT_COMPANY.companyMembers ?? [];
  return defaults.filter(
    (candidate) =>
      !existing.some(
        (member) =>
          member.id === candidate.id ||
          member.name.trim().toLowerCase() === candidate.name.toLowerCase(),
      ),
  );
}

/** Ensures required company fields and default partners always exist. */
export function normalizeCompanySettings(
  raw: Partial<CompanySettings> | null | undefined,
): CompanySettings {
  const merged: CompanySettings = { ...DEFAULT_COMPANY, ...(raw ?? {}) };
  if (!merged.name?.trim()) merged.name = DEFAULT_COMPANY.name;
  if (!merged.address?.trim()) merged.address = DEFAULT_COMPANY.address;
  if (!merged.email?.trim()) merged.email = DEFAULT_COMPANY.email;
  if (!merged.companyMembers?.length) {
    merged.companyMembers = DEFAULT_COMPANY.companyMembers;
  }
  if (raw?.teamDirectoryMigrationApplied !== true) {
    const defaults = DEFAULT_COMPANY.companyMembers ?? [];
    const existing = merged.companyMembers ?? [];
    const defaultById = new Map(defaults.map((member) => [member.id, member]));
    const upgraded: CompanyMember[] = existing.map((member) => ({
      ...defaultById.get(member.id),
      ...member,
      memberType: member.memberType ?? defaultById.get(member.id)?.memberType,
      status: member.status ?? "active",
      baseMonthlySalary: member.baseMonthlySalary ?? defaultById.get(member.id)?.baseMonthlySalary,
      monthlyBonusCap: member.monthlyBonusCap ?? defaultById.get(member.id)?.monthlyBonusCap,
      employeeId: member.employeeId ?? defaultById.get(member.id)?.employeeId,
      salaryStartDate: member.salaryStartDate ?? defaultById.get(member.id)?.salaryStartDate,
    }));
    upgraded.push(...missingDefaultMembers(upgraded));
    merged.companyMembers = upgraded;
    merged.teamDirectoryMigrationApplied = true;
  } else {
    const existing = merged.companyMembers ?? [];
    const withMissing = [...existing, ...missingDefaultMembers(existing)];
    merged.companyMembers = withMissing;
  }
  merged.companyMembers = applyTeamDirectoryDefaults(merged.companyMembers ?? []);
  merged.customMemberTypes = collectCustomMemberTypes(
    merged.companyMembers,
    raw?.customMemberTypes ?? merged.customMemberTypes,
  );
  merged.customTeamGroups = collectCustomTeamGroups(
    merged.companyMembers,
    raw?.customTeamGroups ?? merged.customTeamGroups,
  );
  merged.formOptions = normalizeFormOptions(raw?.formOptions ?? merged.formOptions);
  // Replace the old generic Net 30 default with Admark's actual project terms.
  if (!raw?.paymentTerms?.trim() || raw.paymentTerms.trim().toLowerCase() === "net 30") {
    merged.paymentTerms = DEFAULT_COMPANY.paymentTerms;
  }
  merged.paymentProofUploadsEnabled = raw?.paymentProofUploadsEnabled === true;
  merged.companyValuationEnabled = raw?.companyValuationEnabled === true;
  merged.projectAssignmentsEnabled = raw?.projectAssignmentsEnabled === true;
  return merged;
}
