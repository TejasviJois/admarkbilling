/**
 * Export clients with ongoing (active) projects only.
 * Usage: node scripts/export-active-client-projects.mjs
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");

const { data: org, error: orgErr } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();
if (orgErr || !org) throw new Error(orgErr?.message ?? "No organization");

const [{ data: clients, error: clientErr }, { data: projects, error: projectErr }] =
  await Promise.all([
    db
      .from("clients")
      .select("id, legacy_id, company_name, contact_person, phone, email, status")
      .eq("organization_id", org.id)
      .is("deleted_at", null),
    db
      .from("projects")
      .select(
        "id, legacy_id, display_name, status, client_id, start_date, end_date, project_type, monthly_amount, contract_value, budget",
      )
      .eq("organization_id", org.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("display_name"),
  ]);

if (clientErr) throw clientErr;
if (projectErr) throw projectErr;

const clientById = new Map((clients ?? []).map((c) => [c.id, c]));
const grouped = new Map();

for (const project of projects ?? []) {
  const client = clientById.get(project.client_id);
  const key = project.client_id ?? "unknown";
  if (!grouped.has(key)) {
    grouped.set(key, {
      clientId: client?.legacy_id ?? null,
      clientName: client?.company_name ?? "Unknown",
      contactPerson: client?.contact_person ?? null,
      phone: client?.phone ?? null,
      email: client?.email ?? null,
      clientStatus: client?.status ?? null,
      projects: [],
    });
  }
  grouped.get(key).projects.push({
    id: project.legacy_id,
    name: project.display_name,
    status: project.status,
    projectType: project.project_type,
    startDate: project.start_date,
    endDate: project.end_date,
    monthlyAmount: project.monthly_amount,
    contractValue: project.contract_value,
    budget: project.budget,
  });
}

const output = [...grouped.values()].sort((a, b) =>
  a.clientName.localeCompare(b.clientName),
);

const outPath = resolve(root, "active-clients-projects.json");
writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote ${outPath}`);
console.log(`Clients: ${output.length}`);
console.log(`Active projects: ${output.reduce((n, c) => n + c.projects.length, 0)}`);
console.log(JSON.stringify(output, null, 2));
