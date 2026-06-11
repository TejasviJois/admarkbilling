import { DEFAULT_COMPANY } from "./constants";
import type { CompanySettings } from "./types";

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
  return merged;
}
