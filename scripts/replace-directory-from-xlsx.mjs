/* Replace Directory contacts with cleaned_directory_v2.xlsx.
   Soft-deletes existing Directory rows, then inserts deduped rows from the sheet.

   Usage:
     node scripts/replace-directory-from-xlsx.mjs --allow-egress
*/
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import * as XLSX from "xlsx";
import { requireEgressAck } from "./lib/egress-guard.mjs";

requireEgressAck("replace-directory-from-xlsx.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const XLSX_PATH =
  process.argv.find((a) => a.endsWith(".xlsx") || a.endsWith(".xls")) ??
  "C:\\Users\\Tejasvi Jois\\Downloads\\cleaned_directory_v2.xlsx";

const SECTOR_ALIASES = [
  ["farm stay", "Hospitality & Stay"],
  ["real estate", "Real Estate & Construction"],
  ["construction", "Real Estate & Construction"],
  ["builder", "Real Estate & Construction"],
  ["architect", "Real Estate & Construction"],
  ["travels", "Tourism & Travel"],
  ["travel", "Tourism & Travel"],
  ["tours", "Tourism & Travel"],
  ["tour", "Tourism & Travel"],
  ["holiday", "Tourism & Travel"],
  ["vacation", "Tourism & Travel"],
  ["dmc", "Tourism & Travel"],
  ["ticketing", "Tourism & Travel"],
  ["cab service", "Tourism & Travel"],
  ["hotel booking", "Tourism & Travel"],
  ["air ticket", "Tourism & Travel"],
  ["hotel", "Hospitality & Stay"],
  ["resort", "Hospitality & Stay"],
  ["dental", "Healthcare"],
  ["doctor", "Healthcare"],
  ["hospital", "Healthcare"],
  ["medical", "Healthcare"],
  ["pharma", "Healthcare"],
  ["clothing", "Retail & Fashion"],
  ["fashion", "Retail & Fashion"],
  ["canteen", "Food & Beverage"],
  ["restaurant", "Food & Beverage"],
  ["bakery", "Food & Beverage"],
  ["motors", "Automotive"],
  ["tyre", "Automotive"],
  ["auto", "Automotive"],
  ["bank", "Finance & Lending"],
  ["finance", "Finance & Lending"],
  ["insurance", "Finance & Lending"],
  ["ca ", "Professional Services"],
  ["auditor", "Professional Services"],
  ["advocate", "Professional Services"],
  ["lawyer", "Professional Services"],
  ["consultant", "Professional Services"],
  ["events", "Events & Media"],
  ["marketing", "Events & Media"],
  ["ads", "Events & Media"],
  ["media", "Events & Media"],
  ["it ", "Technology & SaaS"],
  ["software", "Technology & SaaS"],
  ["granite", "Manufacturing & Trade"],
  ["hardware", "Manufacturing & Trade"],
  ["dealer", "Manufacturing & Trade"],
  ["solar", "Manufacturing & Trade"],
  ["education", "Education"],
  ["school", "Education"],
  ["college", "Education"],
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanCell(value) {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const text = String(value).replace(/\u0000/g, "").trim();
  const lower = text.toLowerCase();
  if (
    !text ||
    lower === "-" ||
    lower === "—" ||
    lower === "–" ||
    lower === "." ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "null" ||
    lower === "undefined"
  ) {
    return "";
  }
  return text;
}

function firstPhone(raw) {
  const matches = String(raw ?? "").match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? [];
  for (const m of matches) {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10) {
      return digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits.slice(-10);
    }
  }
  // bare 10-digit cell
  const only = String(raw ?? "").replace(/\D/g, "");
  if (only.length >= 10) return only.slice(-10);
  return "";
}

function inferSector(...parts) {
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  for (const [alias, sector] of [...SECTOR_ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    if (hay.includes(alias)) return sector;
  }
  return null;
}

function encodeNotes({ designation, email, businessType, sector }) {
  const parts = [];
  if (sector) parts.push(`[sector:${sector}]`);
  if (designation) parts.push(`[role:${designation}]`);
  if (businessType) parts.push(businessType);
  return parts.length ? parts.join(" ") : null;
}

function dedupeKey(person, company, phone) {
  return `${normalize(person)}|${normalize(company)}|${String(phone ?? "").replace(/\D/g, "").slice(-10)}`;
}

const buf = readFileSync(XLSX_PATH);
const wb = XLSX.read(buf, { type: "buffer" });
const sheetName = wb.SheetNames.includes("Directory") ? "Directory" : wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
if (!sheet) throw new Error("No sheet found");
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const parsed = [];
const seen = new Set();
let skippedDupInFile = 0;
let skippedEmpty = 0;

for (const row of rows) {
  const personName = cleanCell(row["Name"] ?? row["name"]);
  const companyName = cleanCell(row["Company Name"] ?? row["Company"] ?? row["company"]);
  const phoneRaw = cleanCell(row["Phone Number"] ?? row["Phone"] ?? row["phone"]);
  const designation = cleanCell(row["Designation"] ?? row["designation"]);
  const email = cleanCell(row["Email ID"] ?? row["Email"] ?? row["email"]);
  const businessType = cleanCell(
    row["Type of Business"] ?? row["Business Type"] ?? row["Type"] ?? row["Sector"],
  );
  const phone = firstPhone(phoneRaw);
  if (!personName && !companyName && !phone) {
    skippedEmpty += 1;
    continue;
  }
  const person = personName || companyName || "Unknown";
  const company = companyName || person;
  const key = dedupeKey(person, company, phone);
  if (seen.has(key)) {
    skippedDupInFile += 1;
    continue;
  }
  seen.add(key);

  const sector =
    inferSector(businessType, company, person, designation) ??
    (/(tour|travel|holiday|hotel|cab|ticket)/i.test(businessType || company)
      ? "Tourism & Travel"
      : null);

  parsed.push({
    personName: person,
    companyName: companyName || undefined,
    phone: phone || undefined,
    designation: designation || undefined,
    email: email || undefined,
    businessType: businessType || undefined,
    sector: sector || undefined,
  });
}

console.log(`File: ${XLSX_PATH}`);
console.log(`Sheet rows: ${rows.length}`);
console.log(`Unique to import: ${parsed.length}`);
console.log(`Skipped empty: ${skippedEmpty}`);
console.log(`Skipped dupes in file: ${skippedDupInFile}`);

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase credentials missing");

const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const { data: orgs, error: orgError } = await db.from("organizations").select("id, legacy_id").limit(5);
if (orgError) throw orgError;
const org = (orgs ?? []).find((o) => o.legacy_id === "org_default") ?? (orgs ?? [])[0];
if (!org?.id) throw new Error("No organization");

const { data: existing, error: existingError } = await db
  .from("leads")
  .select("id")
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null);
if (existingError) throw existingError;

const now = new Date().toISOString();
const existingIds = (existing ?? []).map((r) => r.id);
if (existingIds.length > 0) {
  // Soft-delete in chunks
  for (let i = 0; i < existingIds.length; i += 200) {
    const chunk = existingIds.slice(i, i + 200);
    const { error: delError } = await db
      .from("leads")
      .update({ deleted_at: now })
      .in("id", chunk);
    if (delError) throw delError;
  }
}
console.log(`Soft-deleted existing Directory contacts: ${existingIds.length}`);

const toInsert = parsed.map((row) => ({
  id: randomUUID(),
  organization_id: org.id,
  legacy_id: `contact-${randomUUID().slice(0, 8)}`,
  company_name: row.companyName || row.personName,
  contact_person: row.personName,
  email: row.email || null,
  phone: row.phone || null,
  status: "new_lead",
  source: "Directory",
  expected_revenue: null,
  probability: null,
  expected_closing_date: null,
  notes: encodeNotes(row),
  created_at: now,
  deleted_at: null,
}));

for (let i = 0; i < toInsert.length; i += 100) {
  const chunk = toInsert.slice(i, i + 100);
  const { error: insertError } = await db.from("leads").insert(chunk);
  if (insertError) throw insertError;
}

await sb
  .from("operations_data")
  .update({ updated_at: new Date().toISOString() })
  .eq("id", "default");

const bySector = new Map();
for (const row of parsed) {
  const s = row.sector || "Uncategorized";
  bySector.set(s, (bySector.get(s) ?? 0) + 1);
}

console.log(`Imported: ${toInsert.length}`);
console.log(
  "Sectors:",
  [...bySector.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s}=${n}`)
    .join(", "),
);
console.log("Done. Refresh Directory.");
