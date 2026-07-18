/* One-time cleanup (2026-07-18): fresh start for the pipeline.
   Deletes every project in planning / on_hold / cancelled status, plus client
   records that only existed for those projects. Keeps ongoing (active) and
   done (completed) projects and their clients. Directory contacts stay empty.
   Accounts transactions are never touched. A full backup is written first. */
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

const KEEP_STATUSES = new Set(["active", "completed"]);

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

mkdirSync(resolve(root, "backups"), { recursive: true });
const backupPath = resolve(root, `backups/operations-before-pipeline-cleanup-${Date.now()}.json`);
writeFileSync(backupPath, JSON.stringify(payload));
console.log(`Backup written: ${backupPath}`);

const projects = payload.projects ?? [];
const removedProjects = projects.filter((p) => !KEEP_STATUSES.has(p.status));
const keptProjects = projects.filter((p) => KEEP_STATUSES.has(p.status));

// Clients still referenced by a kept project (by id or by exact name) survive.
const keptClientIds = new Set(keptProjects.map((p) => p.clientId).filter(Boolean));
const keptClientNames = new Set(keptProjects.map((p) => (p.client ?? "").trim().toLowerCase()));

const clients = payload.clients ?? [];
const survives = (client) =>
  keptClientIds.has(client.id) ||
  keptClientNames.has((client.companyName ?? "").trim().toLowerCase()) ||
  // Relationship parents survive when any child survives (checked below).
  clients.some(
    (child) =>
      child.parentClientId === client.id &&
      (keptClientIds.has(child.id) ||
        keptClientNames.has((child.companyName ?? "").trim().toLowerCase())),
  );

const removedClients = clients.filter((c) => !survives(c));
const removedClientIds = new Set(removedClients.map((c) => c.id));

payload.projects = keptProjects.map((p) =>
  p.clientId && removedClientIds.has(p.clientId) ? { ...p, clientId: undefined } : p,
);
payload.clients = clients.filter((c) => !removedClientIds.has(c.id));
payload.contacts = [];

console.log(`\nRemoving ${removedProjects.length} projects:`);
for (const p of removedProjects) console.log(`  - ${p.id} (${p.client} — ${p.status})`);
console.log(`\nRemoving ${removedClients.length} clients:`);
for (const c of removedClients) console.log(`  - ${c.id} (${c.companyName})`);
console.log(`\nKeeping ${keptProjects.length} projects and ${payload.clients.length} clients.`);

const txCount = (payload.transactions ?? []).length;
console.log(`Transactions untouched: ${txCount}`);

const { error: saveError } = await sb.from("operations_data").upsert({
  id: "default",
  payload,
  updated_at: new Date().toISOString(),
});
if (saveError) throw saveError;
console.log("\nDone — payload updated.");
