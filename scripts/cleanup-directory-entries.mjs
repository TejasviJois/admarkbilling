/* One-time cleanup (2026-07-18): removes the directory entries the user marked
   for deletion — junk seed clients and placeholder leads — from the live
   operations payload. Projects that referenced a deleted client keep running;
   only their clientId link is cleared. A full backup is written first. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const CLIENT_NAMES_TO_DELETE = new Set(
  [
    "BG Stones",
    "Cafe - Chintu Friend",
    "GoKashi",
    "health wealth",
    "Jayanth - Paint",
    "Nagendra - hyd balaji",
    "Panche Kattu",
    "Pawan Refer - Krishna",
    "Powergate energy",
    "Safe Wheels",
    "SS Foundation",
    "Sublime Camps",
    "Suhalya Travels",
    "Texa",
    "Towell",
    "Vibha Tours",
    "Vintage",
  ].map((name) => name.toLowerCase()),
);

const LEAD_IDS_TO_DELETE = new Set([
  // Marked directory rows that were lead-only entries.
  "lead-vivek-chirag", // Chirag Ads
  "lead-tirtha", // Dealer PC — WhatsApp
  "lead-shlokh", // Events
  "lead-amir-suhali", // False ceiling — WhatsApp
  "lead-paras", // Farm stay & hoarding company
  "lead-omg-clothing", // Farm stay and clothing
  "lead-sanjana-kajol", // Marketing person
  "lead-pawan-canteen", // Real estate and canteen
  "lead-indo-pest", // WhatsApp
  "lead-mahaveer", // WhatsApp — Detailing Mafia
  "lead-suresh-stocks", // WhatsApp — FnQ
  "lead-vivek-kotari", // WhatsApp — Hardware
  "lead-advik", // WhatsApp and inventory farm stay
  // Stale leads for entries deleted as clients.
  "lead-577938c7", // Safe Wheels (duplicate of the client)
  "lead-c5494a8c", // Safewheels Group (already a client)
  "lead-bg-stones", // BG Stones
  "lead-kiran", // Vibha Tours
]);

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } },
);

const { data, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload) {
  console.log("No operations payload found — nothing to clean.");
  process.exit(0);
}

const payload = data.payload;

// Full backup before touching anything.
mkdirSync(resolve(root, "backups"), { recursive: true });
const backupPath = resolve(root, `backups/operations-before-directory-cleanup-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify(payload));
console.log(`Backup written: ${backupPath}`);

const clients = payload.clients ?? [];
const removedClients = clients.filter((c) =>
  CLIENT_NAMES_TO_DELETE.has((c.companyName ?? "").trim().toLowerCase()),
);
const removedClientIds = new Set(removedClients.map((c) => c.id));

const leads = payload.leads ?? [];
const removedLeads = leads.filter((l) => LEAD_IDS_TO_DELETE.has(l.id));

payload.clients = clients.filter((c) => !removedClientIds.has(c.id));
payload.leads = leads.filter((l) => !LEAD_IDS_TO_DELETE.has(l.id));
payload.projects = (payload.projects ?? []).map((p) =>
  p.clientId && removedClientIds.has(p.clientId) ? { ...p, clientId: undefined } : p,
);

console.log(`\nRemoving ${removedClients.length} clients:`);
for (const c of removedClients) console.log(`  - ${c.id} (${c.companyName})`);
console.log(`\nRemoving ${removedLeads.length} leads:`);
for (const l of removedLeads) console.log(`  - ${l.id} (${l.company || l.name})`);
const unlinked = (payload.projects ?? []).filter(
  (p) => !p.clientId && removedClients.some((c) => c.companyName === p.client),
);
console.log(`\nProjects kept but unlinked: ${unlinked.length}`);

const { error: saveError } = await sb.from("operations_data").upsert({
  id: "default",
  payload,
  updated_at: new Date().toISOString(),
});
if (saveError) throw saveError;
console.log("\nDone — payload updated.");
