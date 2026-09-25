/* Import directory contacts into relational admark.leads (source = Directory).
   Skips duplicates by person+company (case-insensitive). Infers sector from company.
   Does not touch leads, clients, projects, or transactions.

   Usage:
     node scripts/import-directory-contacts.mjs --allow-egress
*/
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from "./lib/egress-guard.mjs";

requireEgressAck("import-directory-contacts.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

/** [personName, companyName, phone, contactVia] */
const rawContacts = [
  ["Vivek Kotari", "Hardware Business", "", "Prajwal"],
  ["Suresh", "Stocks", "", "Prajwal"],
  ["Mahaveer", "Detailing Mafia", "", "Prajwal"],
  ["OMG Clothing", "OMG Clothing", "9591234381", "Prajwal"],
  ["Advik", "Farm Stay", "9886798214", "Prajwal"],
  ["Paras", "Farm Stay & Hoarding Company", "9880374862", "Prajwal"],
  ["Sanjana Kajol", "Brand IT", "9845121768", "Prajwal"],
  ["Indo Pest Control", "", "", "Prajwal"],
  ["Abhisheck", "Power Gate", "9448065873", "Prajwal"],
  ["Tirtha", "Dealer", "", "Prajwal"],
  ["Amir Suhali", "Fall Sealing", "7411712292", "Prajwal"],
  ["Pawan Canteen", "Real Estate and Canteen", "8867098981", "Tejasvi"],
  ["BG Stones", "Granite Mining", "", "Karthik"],
  ["Shlokh", "Events", "", "Prajwal"],
  ["Vivek", "Chirag Ads", "", "Prajwal"],
  ["Nisar", "World Air", "8921379419", "Tejasvi"],
  ["Kiran", "Vibha Tours", "8971920816", "Tejasvi"],
  ["Navaneeth", "Heritage", "7829406108", "Tejasvi"],
  ["Ravi", "Birchwood", "8147773551", "Harshith"],
  ["Prajwal", "INIT Minds Marketing Agency", "8277166178", "Tejasvi"],
  ["Chethan", "Architect", "9901303390", "Kannan"],
  ["Naga Bharan", "Panchekattu", "9704547536", "Tejasvi"],
  ["Bhanu Prasad", "VRS Constructions", "9008239293", "Tejasvi"],
  ["Arjun", "Arjun Motors", "", ""],
  ["Shivendra Bhatia", "Investor - AVYUT", "", "Tejasvi"],
  ["Shruthi", "Blue Blocks", "9494409159", "Harshith"],
  ["Chandrachood", "Bhaarath Builder", "9019694817", "Kannan"],
  ["Arjun", "CA", "9945880900", "Kannan"],
  ["Sayed", "Neom Paints", "9980436567", "Tejasvi"],
  ["Shridhar", "Fast Lane", "8861813836", "Kannan"],
  ["Mani", "Decor Planet", "9606271664", "Tejasvi"],
  ["Deepak", "Isha Builders", "8310458456", "Tejasvi"],
  ["Ashwin", "Win Research", "8123784727", "Tejasvi"],
  ["Dhruva", "Sublime", "6363988956", "Harshith"],
  ["Shivu", "Evolve Back", "9113265227", "Prajwal"],
  ["Adarsh", "Health Wealth", "8123660476", "Tejasvi"],
  ["Nagendra", "Nute", "9019421236", "Kannan"],
  ["Temple & Towns", "Temple & Towns", "9944512334", "Tejasvi"],
  ["Varadarajan", "", "9880597037", "Kannan"],
  ["Bharath", "Smile Dental", "9845162272", "Tejasvi"],
  ["Sujay", "Texa", "9964586226", "Prajwal"],
  ["Amit Pandey", "Synclovis", "9980448880", "Kannan"],
  ["Ashitha Yaji", "Avighna", "9483389387", "Kannan"],
  ["Shekar", "Home Makers", "9880708008", "Kannan"],
  ["Ashok", "GoKashi", "8931980937", "Tejasvi"],
  ["Vivek", "Balaji Travels", "8934011111", "Tejasvi"],
  ["Shreya", "Landscape Safari", "9818377244", "Tejasvi"],
  ["Amar", "Travel Parkz", "9535899900", "Tejasvi"],
  ["Swamy", "Suhalaya Travels", "9901555566", "Tejasvi"],
];

const SECTOR_ALIASES = [
  ["farm stay", "Hospitality & Stay"],
  ["real estate", "Real Estate & Construction"],
  ["travels", "Tourism & Travel"],
  ["travel", "Tourism & Travel"],
  ["tours", "Tourism & Travel"],
  ["tour", "Tourism & Travel"],
  ["safari", "Tourism & Travel"],
  ["tourism", "Tourism & Travel"],
  ["hotel", "Hospitality & Stay"],
  ["resort", "Hospitality & Stay"],
  ["builder", "Real Estate & Construction"],
  ["builders", "Real Estate & Construction"],
  ["construction", "Real Estate & Construction"],
  ["architect", "Real Estate & Construction"],
  ["dental", "Healthcare"],
  ["health", "Healthcare"],
  ["clothing", "Retail & Fashion"],
  ["canteen", "Food & Beverage"],
  ["motors", "Automotive"],
  ["investor", "Finance & Lending"],
  ["stocks", "Finance & Lending"],
  ["events", "Events & Media"],
  ["ads", "Events & Media"],
  ["marketing", "Events & Media"],
  ["agency", "Professional Services"],
  ["granite", "Manufacturing & Trade"],
  ["mining", "Manufacturing & Trade"],
  ["paints", "Manufacturing & Trade"],
  ["hardware", "Manufacturing & Trade"],
  ["dealer", "Manufacturing & Trade"],
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeKey(personName, companyName) {
  return `${normalize(personName)}|${normalize(companyName)}`;
}

function inferSector(companyName, personName) {
  const hay = `${companyName ?? ""} ${personName ?? ""}`.toLowerCase();
  for (const [alias, sector] of SECTOR_ALIASES.sort((a, b) => b[0].length - a[0].length)) {
    if (hay.includes(alias)) return sector;
  }
  return null;
}

function encodeNotes(contactVia, sector) {
  const via = String(contactVia ?? "").trim();
  const sec = String(sector ?? "").trim();
  if (!sec) return via || null;
  return via ? `[sector:${sec}] ${via}` : `[sector:${sec}]`;
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase credentials are missing.");

const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const { data: orgs, error: orgError } = await db
  .from("organizations")
  .select("id, legacy_id")
  .limit(5);
if (orgError) throw orgError;
const org =
  (orgs ?? []).find((row) => row.legacy_id === "org_default") ?? (orgs ?? [])[0];
if (!org?.id) throw new Error("No organization row found.");

const { data: existingRows, error: existingError } = await db
  .from("leads")
  .select("id, company_name, contact_person, phone, notes, deleted_at")
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null);
if (existingError) throw existingError;

const existingKeys = new Set();
for (const row of existingRows ?? []) {
  const person = row.contact_person || row.company_name || "";
  const company =
    row.company_name && row.company_name !== person ? row.company_name : "";
  existingKeys.add(dedupeKey(person, company));
  // Also key by person|company_name as stored (covers person == company cases).
  existingKeys.add(dedupeKey(person, row.company_name ?? ""));
}

const now = new Date().toISOString();
const toInsert = [];
const skipped = [];
const seenInBatch = new Set();

for (const [personName, companyName, phone, contactVia] of rawContacts) {
  const company = companyName || personName;
  const key = dedupeKey(personName, companyName);
  const altKey = dedupeKey(personName, company);
  if (existingKeys.has(key) || existingKeys.has(altKey) || seenInBatch.has(key)) {
    skipped.push(`${personName} (${companyName || "no company"})`);
    continue;
  }
  seenInBatch.add(key);
  existingKeys.add(key);
  existingKeys.add(altKey);

  const sector = inferSector(companyName, personName);
  const legacyId = `contact-${randomUUID().slice(0, 8)}`;
  toInsert.push({
    id: randomUUID(),
    organization_id: org.id,
    legacy_id: legacyId,
    company_name: company,
    contact_person: personName,
    email: null,
    phone: phone || null,
    status: "new_lead",
    source: "Directory",
    expected_revenue: null,
    probability: null,
    expected_closing_date: null,
    notes: encodeNotes(contactVia, sector),
    created_at: now,
    deleted_at: null,
  });
}

if (toInsert.length > 0) {
  const { error: insertError } = await db.from("leads").insert(toInsert);
  if (insertError) throw insertError;
}

// Bump ops version so UI caches refresh.
await sb
  .from("operations_data")
  .update({ updated_at: new Date().toISOString() })
  .eq("id", "default");

console.log(`Organization: ${org.id}`);
console.log(`Imported: ${toInsert.length}`);
console.log(`Skipped duplicates: ${skipped.length}`);
console.log(`Directory total after: ${(existingRows?.length ?? 0) + toInsert.length}`);
if (skipped.length) console.log("Skipped:", skipped.join("; "));
if (toInsert.length) {
  const bySector = new Map();
  for (const row of toInsert) {
    const match = String(row.notes ?? "").match(/^\[sector:([^\]]+)\]/);
    const sector = match?.[1] ?? "Uncategorized";
    bySector.set(sector, (bySector.get(sector) ?? 0) + 1);
  }
  console.log(
    "Sectors:",
    [...bySector.entries()].map(([s, n]) => `${s}=${n}`).join(", "),
  );
}
