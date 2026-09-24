import type { CredentialCategory, CredentialEntry } from "@/lib/types";

export const CREDENTIAL_CATEGORIES: CredentialCategory[] = [
  "Email",
  "Social",
  "Domain",
  "Cloud",
  "Development",
  "Hosting",
  "Database",
  "Other",
];

function newCredentialId(): string {
  return `cred_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/** Starter Admark operating accounts — imported once into the vault when empty. */
export function buildDefaultCredentialEntries(
  now = new Date().toISOString(),
): CredentialEntry[] {
  const rows: Omit<CredentialEntry, "id" | "updatedAt">[] = [
    {
      category: "Email",
      service: "Google",
      email: "admarkkagency@gmail.com",
      password: "Suppy@2305",
      linkedTo: "9632092273",
      otpMethod: "Mobile",
    },
    {
      category: "Email",
      service: "Titan",
      email: "info@admarkdigitals.com",
      password: "Admark@2126",
      linkedTo: "9686658055",
      otpMethod: "Mobile",
    },
    {
      category: "Social",
      service: "LinkedIn",
      email: "tejasvijois@gmail.com",
      username: "TejasviJois",
      password: "Tejasvi@2112",
      linkedTo: "9686658055",
      otpMethod: "Mobile",
    },
    {
      category: "Social",
      service: "LinkedIn",
      email: "info@admarkdigitals.com",
      username: "Admark Digitals",
      password: "Admark@2026",
      linkedTo: "9686658055",
      otpMethod: "Mobile",
    },
    {
      category: "Domain",
      service: "GoDaddy",
      email: "admarkkagency@gmail.com",
      username: "Admark Digitals",
      password: "Kariya@12_",
      linkedTo: "9686658055",
      otpMethod: "Mobile",
    },
    {
      category: "Cloud",
      service: "AWS",
      email: "info@admarkdigitals.com",
      password: "Admark@2026",
      linkedTo: "revanthkumars64@gmail.com",
      otpMethod: "G - Auth",
    },
    {
      category: "Social",
      service: "Instagram",
      username: "admarkdigitals",
      password: "Admark@2026",
      linkedTo: "9686658055",
    },
    {
      category: "Development",
      service: "GitHub",
      email: "tejasvijois@gmail.com",
      username: "TejasviJois",
      password: "Tejasvi@2112",
      linkedTo: "tejasvijois@gmail.com",
      otpMethod: "G - Auth",
    },
    {
      category: "Development",
      service: "GitHub",
      email: "info@admarkdigitals.com",
      password: "Admark@12",
    },
    {
      category: "Hosting",
      service: "Vercel",
      email: "admarkkagency@gmail.com",
      linkedTo: "9686658055",
    },
    {
      category: "Database",
      service: "Supabase",
      email: "tejasvijois@gmail.com",
      username: "TejasviJois",
      linkedTo: "9686658055",
    },
  ];

  return rows.map((row) => ({
    ...row,
    id: newCredentialId(),
    updatedAt: now,
  }));
}

export function credentialSearchHaystack(entry: CredentialEntry): string {
  return [
    entry.category,
    entry.service,
    entry.email,
    entry.username,
    entry.linkedTo,
    entry.otpMethod,
    entry.notes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function sortCredentials(entries: CredentialEntry[]): CredentialEntry[] {
  return [...entries].sort((a, b) => {
    const byCategory = a.category.localeCompare(b.category);
    if (byCategory !== 0) return byCategory;
    const byService = a.service.localeCompare(b.service);
    if (byService !== 0) return byService;
    return (a.email ?? a.username ?? "").localeCompare(b.email ?? b.username ?? "");
  });
}

export { newCredentialId };
