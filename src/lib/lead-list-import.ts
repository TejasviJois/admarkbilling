import type { LeadListEntry } from "@/lib/types";

type XlsxModule = typeof import("xlsx");
type WorkBook = import("xlsx").WorkBook;
type WorkSheet = import("xlsx").WorkSheet;

const HEADER_MAP: Record<string, keyof Omit<LeadListEntry, "id" | "importedAt" | "organizationId">> =
  {
    "lead id": "externalId",
    "date/time": "dateTime",
    "contact phone": "phone",
    "contact email": "email",
    "lead title": "title",
    "one-liner": "oneLiner",
    "real x-factor": "xFactor",
    "what they actually want": "whatTheyWant",
    "platform modules": "platformModules",
    "technical stack": "technicalStack",
    "key notes": "keyNotes",
    "engagement / commercial": "engagementCommercial",
    "application / dm requirements": "applicationRequirements",
    "application includes": "applicationIncludes",
    "most valuable proof": "mostValuableProof",
    "frame expertise around": "frameExpertiseAround",
    intent: "intent",
    urgency: "urgency",
    "close window": "closeWindow",
    competition: "competition",
    "project type": "projectType",
    complexity: "complexity",
    "engagement type": "engagementType",
    focus: "focus",
    category: "category",
    location: "location",
    "information level": "informationLevel",
    "website / product status": "websiteStatus",
    "growth path": "growthPath",
    "tech focus": "techFocus",
    "key differentiator": "keyDifferentiator",
    "decision driver": "decisionDriver",
    "lead score": "leadScore",
    "red flags": "redFlags",
    "how to win": "howToWin",
    angle: "angle",
    "why this scores this way": "whyScore",
    "strategic insight": "strategicInsight",
    "excellent fit": "excellentFit",
    "poor fit": "poorFit",
    "final assessment": "finalAssessment",
    "full original lead": "fullOriginal",
  };

function cleanCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date) return value.toISOString();
  return String(value).replace(/\u0000/g, "").trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function newLeadListId(): string {
  return `ll_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function parseScore(raw: string): number | undefined {
  const n = Number(String(raw).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

/** Prefer the "Lead Master" sheet; fall back to the first sheet with a Lead ID column. */
function pickLeadSheet(workbook: WorkBook, XLSX: XlsxModule): WorkSheet {
  const preferred = workbook.Sheets["Lead Master"];
  if (preferred) return preferred;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
    });
    const header = (rows[0] ?? []).map(normalizeHeader);
    if (header.includes("lead id") || header.includes("lead title")) return sheet;
  }
  throw new Error('No "Lead Master" sheet (or Lead ID column) found in this workbook.');
}

export type LeadListImportResult = {
  entries: LeadListEntry[];
  sheetName: string;
  rowCount: number;
};

/**
 * Parse an Inner Circle–style Excel workbook into Lead List entries.
 * Only the Lead Master (or equivalent) sheet is imported.
 */
export async function parseLeadListWorkbook(
  file: File,
): Promise<LeadListImportResult> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName =
    workbook.SheetNames.find((name) => name === "Lead Master") ??
    workbook.SheetNames.find((name) => {
      const sheet = workbook.Sheets[name];
      if (!sheet) return false;
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      });
      const header = (rows[0] ?? []).map(normalizeHeader);
      return header.includes("lead id");
    }) ??
    workbook.SheetNames[0];
  const sheet = pickLeadSheet(workbook, XLSX);
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (matrix.length < 2) {
    throw new Error("The lead sheet has a header but no data rows.");
  }

  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const fieldIndex = new Map<keyof LeadListEntry, number>();
  headers.forEach((header, index) => {
    const field = HEADER_MAP[header];
    if (field) fieldIndex.set(field, index);
  });
  if (!fieldIndex.has("externalId") && !fieldIndex.has("title")) {
    throw new Error('Missing required columns "Lead ID" or "Lead Title".');
  }

  const importedAt = new Date().toISOString();
  const entries: LeadListEntry[] = [];
  for (let rowIndex = 1; rowIndex < matrix.length; rowIndex++) {
    const row = matrix[rowIndex] ?? [];
    const read = (field: keyof LeadListEntry): string => {
      const index = fieldIndex.get(field);
      if (index == null) return "";
      return cleanCell(row[index]);
    };
    const externalId = read("externalId") || `ROW-${rowIndex}`;
    const title = read("title");
    if (!title && !read("oneLiner") && !read("phone") && !read("email")) continue;
    const scoreRaw = read("leadScore");
    entries.push({
      id: newLeadListId(),
      externalId,
      dateTime: read("dateTime") || undefined,
      phone: read("phone") || undefined,
      email: read("email") || undefined,
      title: title || externalId,
      oneLiner: read("oneLiner") || undefined,
      xFactor: read("xFactor") || undefined,
      whatTheyWant: read("whatTheyWant") || undefined,
      platformModules: read("platformModules") || undefined,
      technicalStack: read("technicalStack") || undefined,
      keyNotes: read("keyNotes") || undefined,
      engagementCommercial: read("engagementCommercial") || undefined,
      applicationRequirements: read("applicationRequirements") || undefined,
      applicationIncludes: read("applicationIncludes") || undefined,
      mostValuableProof: read("mostValuableProof") || undefined,
      frameExpertiseAround: read("frameExpertiseAround") || undefined,
      intent: read("intent") || undefined,
      urgency: read("urgency") || undefined,
      closeWindow: read("closeWindow") || undefined,
      competition: read("competition") || undefined,
      projectType: read("projectType") || undefined,
      complexity: read("complexity") || undefined,
      engagementType: read("engagementType") || undefined,
      focus: read("focus") || undefined,
      category: read("category") || undefined,
      location: read("location") || undefined,
      informationLevel: read("informationLevel") || undefined,
      websiteStatus: read("websiteStatus") || undefined,
      growthPath: read("growthPath") || undefined,
      techFocus: read("techFocus") || undefined,
      keyDifferentiator: read("keyDifferentiator") || undefined,
      decisionDriver: read("decisionDriver") || undefined,
      leadScore: scoreRaw ? parseScore(scoreRaw) : undefined,
      redFlags: read("redFlags") || undefined,
      howToWin: read("howToWin") || undefined,
      angle: read("angle") || undefined,
      whyScore: read("whyScore") || undefined,
      strategicInsight: read("strategicInsight") || undefined,
      excellentFit: read("excellentFit") || undefined,
      poorFit: read("poorFit") || undefined,
      finalAssessment: read("finalAssessment") || undefined,
      fullOriginal: read("fullOriginal") || undefined,
      importedAt,
      sourceFileName: file.name,
    });
  }

  if (entries.length === 0) {
    throw new Error("No lead rows found in the spreadsheet.");
  }

  return { entries, sheetName, rowCount: entries.length };
}

/** Merge imported rows into existing list — same externalId updates in place. */
export function mergeLeadListEntries(
  existing: LeadListEntry[],
  incoming: LeadListEntry[],
): LeadListEntry[] {
  const byExternal = new Map(existing.map((entry) => [entry.externalId.toLowerCase(), entry]));
  for (const entry of incoming) {
    const key = entry.externalId.toLowerCase();
    const prior = byExternal.get(key);
    byExternal.set(key, prior ? { ...entry, id: prior.id, contacted: prior.contacted } : entry);
  }
  return [...byExternal.values()].sort((a, b) => {
    const score = (b.leadScore ?? 0) - (a.leadScore ?? 0);
    if (score !== 0) return score;
    return a.externalId.localeCompare(b.externalId, undefined, { numeric: true });
  });
}

export type LeadListTrack = "tech" | "non_tech";

const TECH_KEYWORDS = [
  "full-stack",
  "fullstack",
  "full stack",
  "developer",
  "development",
  "software",
  "saas",
  "mern",
  "mean",
  "react",
  "node",
  "laravel",
  "php",
  "python",
  "flutter",
  "ios developer",
  "android",
  "mobile app",
  "app development",
  "web developer",
  "web designer",
  "website designer",
  "website redesign",
  "website rebrand",
  "ui/ux",
  "uiux",
  "ui ux",
  "wordpress",
  "elementor",
  "seo agency",
  "seo ",
  "application developer",
  "backend",
  "frontend engineer",
  "api",
  "mvp",
  "engineer",
  "wordpress developer",
  "next.js",
  "typescript",
  "javascript",
  "database",
  "devops",
];

const NON_TECH_KEYWORDS = [
  "digital marketing",
  "meta ads",
  "google ads",
  "facebook ads",
  "instagram ads",
  "social media",
  "video editor",
  "video production",
  "video shoot",
  "branding",
  "brand identity",
  "brand strategy",
  "brand professional",
  "pr freelancer",
  "media coverage",
  "logo",
  "motion design",
  "ui animations",
  "creative agencies",
  "marketing",
  "performance ads",
  "reels",
  "podcast",
  "ads agency",
];

function haystackForTrack(entry: LeadListEntry): string {
  return [
    entry.title,
    entry.oneLiner,
    entry.projectType,
    entry.category,
    entry.techFocus,
    entry.focus,
    entry.technicalStack,
    entry.engagementType,
    entry.whatTheyWant,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

/**
 * Classify Inner Circle leads into tech delivery vs marketing/creative.
 * Website/SEO/design builds count as tech; ads/branding/video stay non-tech.
 */
export function classifyLeadListTrack(entry: LeadListEntry): LeadListTrack {
  const text = haystackForTrack(entry);
  let techHits = 0;
  let nonTechHits = 0;
  for (const keyword of TECH_KEYWORDS) {
    if (text.includes(keyword)) techHits += 1;
  }
  for (const keyword of NON_TECH_KEYWORDS) {
    if (text.includes(keyword)) nonTechHits += 1;
  }
  // Strong tech title signals — web design / SEO / WordPress count as tech.
  if (
    /\b(developer|full-?stack|saas|flutter|mern|laravel|ios developer|seo|web designer|website designer|ui\/?ux|uiux|wordpress|elementor)\b/i.test(
      entry.title,
    )
  ) {
    techHits += 3;
  }
  if (
    /\b(ads agency|marketing|branding|video editor|pr freelancer|social media)\b/i.test(
      entry.title,
    )
  ) {
    nonTechHits += 2;
  }
  // Website / product design roles are tech delivery.
  if (
    /\b(designer|design agency|ui\/?ux|uiux)\b/i.test(entry.title) &&
    !/\b(brand|logo|motion|video)\b/i.test(entry.title)
  ) {
    techHits += 2;
  }
  if (entry.technicalStack?.trim()) techHits += 1;
  if (techHits === 0 && nonTechHits === 0) {
    return /\b(web|app|software|code|stack|seo|wordpress|website)\b/i.test(text)
      ? "tech"
      : "non_tech";
  }
  return techHits >= nonTechHits ? "tech" : "non_tech";
}
