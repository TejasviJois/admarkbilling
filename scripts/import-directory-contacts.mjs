/* One-time import from the supplied Directory Contact Import Template PDF.
   Adds contacts only — never leads, clients, projects, or transactions.
   Duplicate person+company pairs are skipped. A backup is written first. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { encrypt } from "../shared/encryption-core.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("import-directory-contacts.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

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

function normalize(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase credentials are missing.");

const sb = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const { data, error } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (error) throw error;
if (!data?.payload) throw new Error("No operations payload found.");

const payload = data.payload;
const existing = payload.contacts ?? [];
const existingKeys = new Set(
  existing.map(
    (contact) => `${normalize(contact.personName)}|${normalize(contact.companyName ?? "")}`,
  ),
);

const now = new Date().toISOString().slice(0, 10);
const added = [];
const skipped = [];

for (const [personName, companyName, phone, contactVia] of rawContacts) {
  const key = `${normalize(personName)}|${normalize(companyName)}`;
  if (existingKeys.has(key)) {
    skipped.push(`${personName} (${companyName || "no company"})`);
    continue;
  }
  existingKeys.add(key);
  added.push({
    id: `contact-${crypto.randomUUID().slice(0, 8)}`,
    personName,
    companyName: companyName || undefined,
    phone: phone ? encrypt(phone) : undefined,
    contactVia: contactVia || undefined,
    createdAt: now,
  });
}

mkdirSync(resolve(root, "backups"), { recursive: true });
const backupPath = resolve(root, `backups/operations-before-contact-import-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify(payload));

payload.contacts = [...existing, ...added];

const { error: saveError } = await sb.from("operations_data").upsert({
  id: "default",
  payload,
  updated_at: new Date().toISOString(),
});
if (saveError) throw saveError;

console.log(`Backup: ${backupPath}`);
console.log(`Imported: ${added.length}`);
console.log(`Skipped duplicates: ${skipped.length}`);
console.log(`Directory total: ${payload.contacts.length}`);
if (skipped.length) console.log("Skipped:", skipped);
