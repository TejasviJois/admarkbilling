/* Backfill [sector:…] on Directory contacts that lack one. Dedupes nothing; updates notes only.
   node scripts/backfill-directory-sectors.mjs --allow-egress
*/
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from "./lib/egress-guard.mjs";

requireEgressAck("backfill-directory-sectors.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

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

function inferSector(companyName, personName) {
  const hay = `${companyName ?? ""} ${personName ?? ""}`.toLowerCase();
  for (const [alias, sector] of [...SECTOR_ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    if (hay.includes(alias)) return sector;
  }
  return null;
}

function decodeVia(notes) {
  if (!notes?.trim()) return "";
  const match = notes.match(/^\[sector:([^\]]+)\]\s*/i);
  if (!match) return notes.trim();
  return notes.slice(match[0].length).trim();
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const { data: orgs, error: orgError } = await db.from("organizations").select("id, legacy_id").limit(5);
if (orgError) throw orgError;
const org = (orgs ?? []).find((o) => o.legacy_id === "org_default") ?? (orgs ?? [])[0];
if (!org?.id) throw new Error("No organization");

const { data: rows, error } = await db
  .from("leads")
  .select("id, company_name, contact_person, notes")
  .eq("organization_id", org.id)
  .eq("source", "Directory")
  .is("deleted_at", null);
if (error) throw error;

let updated = 0;
let already = 0;
let noMatch = 0;

for (const row of rows ?? []) {
  if (/^\[sector:/i.test(row.notes ?? "")) {
    already += 1;
    continue;
  }
  const person = row.contact_person || row.company_name || "";
  const company =
    row.company_name && row.company_name !== person ? row.company_name : row.company_name || "";
  const sector = inferSector(company, person);
  if (!sector) {
    noMatch += 1;
    continue;
  }
  const via = decodeVia(row.notes);
  const notes = via ? `[sector:${sector}] ${via}` : `[sector:${sector}]`;
  const { error: upError } = await db.from("leads").update({ notes }).eq("id", row.id);
  if (upError) throw upError;
  updated += 1;
}

await sb
  .from("operations_data")
  .update({ updated_at: new Date().toISOString() })
  .eq("id", "default");

console.log(`Already tagged: ${already}`);
console.log(`Updated with sector: ${updated}`);
console.log(`No keyword match (left Uncategorized in UI): ${noMatch}`);
console.log(`Total directory: ${rows?.length ?? 0}`);
