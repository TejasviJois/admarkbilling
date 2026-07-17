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
  // Replace the old generic Net 30 default with Admark's actual project terms.
  if (!raw?.paymentTerms?.trim() || raw.paymentTerms.trim().toLowerCase() === "net 30") {
    merged.paymentTerms = DEFAULT_COMPANY.paymentTerms;
  }
  merged.paymentProofUploadsEnabled = raw?.paymentProofUploadsEnabled === true;
  merged.companyValuationEnabled = raw?.companyValuationEnabled === true;
  return merged;
}
