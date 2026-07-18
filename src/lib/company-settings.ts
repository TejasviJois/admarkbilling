import { DEFAULT_COMPANY } from "./constants";
import type { CompanyMember, CompanySettings } from "./types";

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
    }));
    const chetan = defaults.find((member) => member.id === "member-chetan");
    if (
      chetan &&
      !upgraded.some(
        (member) =>
          member.id === chetan.id || member.name.trim().toLowerCase() === chetan.name.toLowerCase(),
      )
    ) {
      upgraded.push(chetan);
    }
    merged.companyMembers = upgraded;
    merged.teamDirectoryMigrationApplied = true;
  }
  // Replace the old generic Net 30 default with Admark's actual project terms.
  if (!raw?.paymentTerms?.trim() || raw.paymentTerms.trim().toLowerCase() === "net 30") {
    merged.paymentTerms = DEFAULT_COMPANY.paymentTerms;
  }
  merged.paymentProofUploadsEnabled = raw?.paymentProofUploadsEnabled === true;
  merged.companyValuationEnabled = raw?.companyValuationEnabled === true;
  return merged;
}
