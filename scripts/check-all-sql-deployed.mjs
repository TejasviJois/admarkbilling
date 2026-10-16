/**
 * Verifies which of the 5 SQL files have actually been applied to the live
 * Supabase database. Read-only. Run: node scripts/check-all-sql-deployed.mjs
 */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const pub = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const adm = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: "admark" },
});

const results = [];
const STALE = "1970-01-01T00:00:00.000Z";

async function tableOk(client, table, columns = "*") {
  const { error } = await client.from(table).select(columns).limit(1);
  return !error ? true : error.message;
}

// 1. Base public tables + seed rows + storage bucket
{
  const ops = await tableOk(pub, "operations_data", "id, payload, updated_at");
  const inv = await tableOk(pub, "invoices", "id");
  const co = await tableOk(pub, "company_settings", "id");
  results.push({
    component: "Public Tables (operations_data, invoices, company_settings)",
    deployed: ops === true && inv === true && co === true,
    detail: { operations_data: ops, invoices: inv, company_settings: co },
  });
}

// 2. Organizations table + organization_id columns
{
  const orgs = await tableOk(pub, "organizations", "id, name");
  const opsOrg = await tableOk(pub, "operations_data", "organization_id");
  const invOrg = await tableOk(pub, "invoices", "organization_id");
  const coOrg = await tableOk(pub, "company_settings", "organization_id");
  results.push({
    component: "Multi-Tenant Architecture (organizations table + organization_id)",
    deployed: orgs === true && opsOrg === true && invOrg === true && coOrg === true,
    detail: { organizations: orgs, "operations_data.organization_id": opsOrg, "invoices.organization_id": invOrg, "company_settings.organization_id": coOrg },
  });
}

// 3. Admark relational schema
{
  const projects = await tableOk(adm, "projects", "id");
  const leads = await tableOk(adm, "leads", "id");
  const clients = await tableOk(adm, "clients", "id");
  const portalUsers = await tableOk(adm, "portal_users", "id");
  results.push({
    component: "Admark Relational Schema (projects, leads, clients, portal_users)",
    deployed: projects === true && leads === true && clients === true && portalUsers === true,
    detail: { "admark.projects": projects, "admark.leads": leads, "admark.clients": clients, "admark.portal_users": portalUsers },
  });
}

// 4. Extended columns (employee_code, lead_id, recurring expenses metadata)
{
  const leadId = await tableOk(adm, "projects", "id, lead_id");
  const empCode = await tableOk(adm, "team_members", "id, employee_code, member_type");
  const recExp = await tableOk(adm, "recurring_expenses", "id, next_due_date, billing_cycle");
  results.push({
    component: "Extended Relational Columns (team employee_code, projects lead_id, recurring metadata)",
    deployed: leadId === true && empCode === true && recExp === true,
    detail: { "admark.projects.lead_id": leadId, "admark.team_members.employee_code": empCode, "admark.recurring_expenses.next_due_date": recExp },
  });
}

// 5. Stored Procedures / RPCs
{
  async function rpcExists(name, args) {
    const { error } = await pub.rpc(name, args);
    if (!error) return true;
    return error.code === "PGRST202" ? `MISSING (${error.code})` : true;
  }
  const a = await rpcExists("mutate_operations_data", {
    p_expected_updated_at: STALE,
    p_upserts: {},
    p_deletes: {},
    p_sets: {},
  });
  const b = await rpcExists("mutate_operations_aux_data", {
    p_row_id: "documents",
    p_expected_updated_at: STALE,
    p_entity_key: "agreements",
    p_upserts: [],
    p_deletes: [],
  });
  const c = await rpcExists("cloud_usage_bytes", {});
  results.push({
    component: "Stored Procedures (mutate_operations_data, mutate_operations_aux_data, cloud_usage_bytes)",
    deployed: a === true && b === true && c === true,
    detail: { mutate_operations_data: a, mutate_operations_aux_data: b, cloud_usage_bytes: c },
  });
}

console.log(JSON.stringify(results, null, 2));
const deployedCount = results.filter((r) => r.deployed).length;
console.log(`\n${deployedCount}/5 components verified for supabase/complete_admark_database.sql.`);
process.exitCode = deployedCount === 5 ? 0 : 1;
