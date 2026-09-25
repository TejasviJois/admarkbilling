/**
 * Business-sector taxonomy for the sales Directory.
 * Orthogonal to Lead List tech/non-tech (service track).
 */

export const SALES_SECTORS = [
  "Tourism & Travel",
  "Hospitality & Stay",
  "Real Estate & Construction",
  "Healthcare",
  "Retail & Fashion",
  "Food & Beverage",
  "Automotive",
  "Finance & Lending",
  "Education",
  "Events & Media",
  "Technology & SaaS",
  "Manufacturing & Trade",
  "Professional Services",
  "Other",
] as const;

export type SalesSector = (typeof SALES_SECTORS)[number];

export const UNCATEGORIZED_SECTOR = "Uncategorized";

const SECTOR_ALIASES: Record<string, SalesSector> = {
  tourism: "Tourism & Travel",
  travel: "Tourism & Travel",
  travels: "Tourism & Travel",
  tours: "Tourism & Travel",
  tour: "Tourism & Travel",
  safari: "Tourism & Travel",
  hospitality: "Hospitality & Stay",
  hotel: "Hospitality & Stay",
  resort: "Hospitality & Stay",
  "farm stay": "Hospitality & Stay",
  stay: "Hospitality & Stay",
  "real estate": "Real Estate & Construction",
  realtor: "Real Estate & Construction",
  construction: "Real Estate & Construction",
  builder: "Real Estate & Construction",
  builders: "Real Estate & Construction",
  architect: "Real Estate & Construction",
  healthcare: "Healthcare",
  health: "Healthcare",
  dental: "Healthcare",
  hospital: "Healthcare",
  clinic: "Healthcare",
  retail: "Retail & Fashion",
  fashion: "Retail & Fashion",
  clothing: "Retail & Fashion",
  apparel: "Retail & Fashion",
  food: "Food & Beverage",
  restaurant: "Food & Beverage",
  canteen: "Food & Beverage",
  cafe: "Food & Beverage",
  automotive: "Automotive",
  motors: "Automotive",
  auto: "Automotive",
  finance: "Finance & Lending",
  fintech: "Finance & Lending",
  lending: "Finance & Lending",
  loan: "Finance & Lending",
  banking: "Finance & Lending",
  stocks: "Finance & Lending",
  investor: "Finance & Lending",
  education: "Education",
  school: "Education",
  events: "Events & Media",
  media: "Events & Media",
  ads: "Events & Media",
  marketing: "Events & Media",
  branding: "Events & Media",
  technology: "Technology & SaaS",
  saas: "Technology & SaaS",
  software: "Technology & SaaS",
  tech: "Technology & SaaS",
  it: "Technology & SaaS",
  manufacturing: "Manufacturing & Trade",
  granite: "Manufacturing & Trade",
  mining: "Manufacturing & Trade",
  paints: "Manufacturing & Trade",
  hardware: "Manufacturing & Trade",
  trade: "Manufacturing & Trade",
  dealer: "Manufacturing & Trade",
  professional: "Professional Services",
  agency: "Professional Services",
  ca: "Professional Services",
  consulting: "Professional Services",
  legal: "Professional Services",
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Map free-text / spreadsheet sector labels onto the controlled list. */
export function normalizeSalesSector(raw: string | undefined | null): string {
  if (!raw?.trim()) return UNCATEGORIZED_SECTOR;
  const key = normalizeKey(raw);
  for (const sector of SALES_SECTORS) {
    if (normalizeKey(sector) === key) return sector;
  }
  if (SECTOR_ALIASES[key]) return SECTOR_ALIASES[key];
  for (const [alias, sector] of Object.entries(SECTOR_ALIASES)) {
    if (key.includes(alias) || alias.includes(key)) return sector;
  }
  // Title-case unknown labels so custom sectors still group together.
  return raw.trim().replace(/\s+/g, " ");
}

/** Infer sector from company / title / category text when no explicit sector is set. */
export function inferSalesSector(...parts: Array<string | undefined | null>): string {
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return UNCATEGORIZED_SECTOR;
  // Prefer longer aliases first so "farm stay" beats "stay".
  const aliases = Object.entries(SECTOR_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, sector] of aliases) {
    if (hay.includes(alias)) return sector;
  }
  return UNCATEGORIZED_SECTOR;
}

export function resolveContactSector(input: {
  sector?: string | null;
  companyName?: string | null;
  personName?: string | null;
}): string {
  if (input.sector?.trim()) return normalizeSalesSector(input.sector);
  return inferSalesSector(input.companyName, input.personName);
}

export function resolveLeadListSector(entry: {
  sector?: string | null;
  category?: string | null;
  companyName?: string | null;
  title?: string | null;
  oneLiner?: string | null;
}): string {
  if (entry.sector?.trim()) return normalizeSalesSector(entry.sector);
  const fromCategory = entry.category?.trim()
    ? normalizeSalesSector(entry.category)
    : UNCATEGORIZED_SECTOR;
  if (fromCategory !== UNCATEGORIZED_SECTOR) return fromCategory;
  return inferSalesSector(entry.companyName, entry.title, entry.oneLiner, entry.category);
}

/**
 * Pull a company name out of Inner Circle-style titles:
 * "SEO Agency – Loanwalle (Lending / Fintech)" → "Loanwalle"
 */
export function extractCompanyFromLeadTitle(title: string | undefined | null): string | undefined {
  if (!title?.trim()) return undefined;
  const dashSplit = title.split(/\s+[–—-]\s+/);
  if (dashSplit.length >= 2) {
    const right = dashSplit.slice(1).join(" – ").trim();
    const withoutParen = right.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return withoutParen || undefined;
  }
  const paren = title.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1] && !/fintech|lending|saas|agency/i.test(paren[1])) {
    return paren[1].trim();
  }
  return undefined;
}

export function resolveLeadListCompany(entry: {
  companyName?: string | null;
  title?: string | null;
}): string {
  if (entry.companyName?.trim()) return entry.companyName.trim();
  return extractCompanyFromLeadTitle(entry.title) ?? "No company";
}

export function normalizeCompanyKey(value: string | undefined | null): string {
  return normalizeKey(value ?? "") || "no company";
}

export type SectorCompanyGroup<T> = {
  sector: string;
  companies: Array<{ company: string; items: T[] }>;
  count: number;
};

/** Group items by sector, then by company (A→Z within each level). */
export function groupBySectorThenCompany<T>(
  items: T[],
  resolve: (item: T) => { sector: string; company: string },
): SectorCompanyGroup<T>[] {
  const sectors = new Map<string, Map<string, T[]>>();
  for (const item of items) {
    const { sector, company } = resolve(item);
    const sectorKey = sector || UNCATEGORIZED_SECTOR;
    const companyKey = company.trim() || "No company";
    let companies = sectors.get(sectorKey);
    if (!companies) {
      companies = new Map();
      sectors.set(sectorKey, companies);
    }
    const bucket = companies.get(companyKey) ?? [];
    bucket.push(item);
    companies.set(companyKey, bucket);
  }

  const knownOrder = new Map<string, number>(SALES_SECTORS.map((s, i) => [s, i]));
  knownOrder.set(UNCATEGORIZED_SECTOR, SALES_SECTORS.length + 50);

  return [...sectors.entries()]
    .map(([sector, companies]) => {
      const companyList = [...companies.entries()]
        .map(([company, list]) => ({ company, items: list }))
        .sort((a, b) => a.company.localeCompare(b.company, undefined, { sensitivity: "base" }));
      return {
        sector,
        companies: companyList,
        count: companyList.reduce((sum, c) => sum + c.items.length, 0),
      };
    })
    .sort((a, b) => {
      const ai = knownOrder.get(a.sector) ?? SALES_SECTORS.length;
      const bi = knownOrder.get(b.sector) ?? SALES_SECTORS.length;
      if (ai !== bi) return ai - bi;
      return a.sector.localeCompare(b.sector, undefined, { sensitivity: "base" });
    });
}

/** Encode Directory contact extras into the leads.notes column. */
export function encodeDirectoryNotes(input: {
  contactVia?: string;
  sector?: string;
  contacted?: boolean;
  salesWon?: boolean;
  designation?: string;
}): string | null {
  const via = (input.contactVia ?? "").trim();
  const sec = (input.sector ?? "").trim();
  const role = (input.designation ?? "").trim();
  const parts: string[] = [];
  if (sec && sec !== UNCATEGORIZED_SECTOR) parts.push(`[sector:${sec}]`);
  if (role) parts.push(`[role:${role}]`);
  if (input.contacted) parts.push("[contacted:1]");
  if (input.salesWon) parts.push("[sales-won:1]");
  if (via) parts.push(via);
  if (parts.length === 0) return null;
  return parts.join(" ");
}

const SECTOR_NOTES_MARKER = /^\[sector:([^\]]+)\]\s*/i;
const ROLE_NOTES_MARKER = /^\[role:([^\]]+)\]\s*/i;
const CONTACTED_NOTES_MARKER = /^\[contacted:1\]\s*/i;
const SALES_WON_NOTES_MARKER = /^\[sales-won:1\]\s*/i;

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Split legacy "Role · email · business type" blobs written by earlier imports. */
function parseLegacyViaBlob(rest: string): {
  designation?: string;
  email?: string;
  contactVia?: string;
} {
  if (!rest.trim()) return {};
  const chunks = rest
    .split(/\s*·\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
  if (chunks.length === 0) return {};

  let designation: string | undefined;
  let email: string | undefined;
  const leftover: string[] = [];

  for (const chunk of chunks) {
    if (!email && looksLikeEmail(chunk)) {
      email = chunk;
      continue;
    }
    if (!designation && !looksLikeEmail(chunk) && chunk.length <= 80) {
      // First short non-email chunk is usually designation/role.
      designation = chunk;
      continue;
    }
    leftover.push(chunk);
  }

  return {
    designation,
    email,
    contactVia: leftover.length > 0 ? leftover.join(" · ") : undefined,
  };
}

export function decodeDirectoryNotes(notes: string | null | undefined): {
  contactVia?: string;
  sector?: string;
  contacted?: boolean;
  salesWon?: boolean;
  designation?: string;
  /** Email recovered from legacy note blobs when the email column is empty. */
  emailFromNotes?: string;
} {
  if (!notes?.trim()) return {};
  let rest = notes.trim();
  let sector: string | undefined;
  let designation: string | undefined;
  let contacted: boolean | undefined;
  let salesWon: boolean | undefined;

  const sectorMatch = rest.match(SECTOR_NOTES_MARKER);
  if (sectorMatch) {
    sector = sectorMatch[1]?.trim() || undefined;
    rest = rest.slice(sectorMatch[0].length).trim();
  }
  const roleMatch = rest.match(ROLE_NOTES_MARKER);
  if (roleMatch) {
    designation = roleMatch[1]?.trim() || undefined;
    rest = rest.slice(roleMatch[0].length).trim();
  }
  const contactedMatch = rest.match(CONTACTED_NOTES_MARKER);
  if (contactedMatch) {
    contacted = true;
    rest = rest.slice(contactedMatch[0].length).trim();
  }
  const salesWonMatch = rest.match(SALES_WON_NOTES_MARKER);
  if (salesWonMatch) {
    salesWon = true;
    rest = rest.slice(salesWonMatch[0].length).trim();
  }

  if (designation) {
    return {
      sector,
      designation,
      contacted,
      salesWon,
      contactVia: rest.length > 0 ? rest : undefined,
    };
  }

  const legacy = parseLegacyViaBlob(rest);
  return {
    sector,
    contacted,
    salesWon,
    designation: legacy.designation,
    emailFromNotes: legacy.email,
    contactVia: legacy.contactVia ?? (legacy.designation || legacy.email ? undefined : rest || undefined),
  };
}
