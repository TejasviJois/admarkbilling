/**
 * Verifies which of the 5 SQL files have actually been applied to the live
 * Supabase database. Read-only. Run: node scripts/check-all-sql-deployed.mjs
 */
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

// 1. admark_billing.sql — base public tables + seed rows
{
  const ops = await tableOk(pub, "operations_data", "id, payload, updated_at");
  const inv = await tableOk(pub, "invoices", "id");
  const co = await tableOk(pub, "company_settings", "id");
  results.push({
    file: "supabase/admark_billing.sql",
    deployed: ops === true && inv === true && co === true,
    detail: { operations_data: ops, invoices: inv, company_settings: co },
  });
}

// 2. multi_tenant_setup.sql — organizations table + organization_id columns
{
  const orgs = await tableOk(pub, "organizations", "id, name");
  const opsOrg = await tableOk(pub, "operations_data", "organization_id");
  results.push({
    file: "supabase/multi_tenant_setup.sql",
    deployed: orgs === true && opsOrg === true,
    detail: { organizations: orgs, "operations_data.organization_id": opsOrg },
  });
}

// 3. 20260718120000_create_admark_relational_schema.sql — admark.* relational schema
{
  const projects = await tableOk(adm, "projects", "id");
  const leads = await tableOk(adm, "leads", "id");
  const clients = await tableOk(adm, "clients", "id");
  results.push({
    file: "migrations/20260718120000_create_admark_relational_schema.sql",
    deployed: projects === true && leads === true && clients === true,
    detail: { "admark.projects": projects, "admark.leads": leads, "admark.clients": clients },
  });
}

// 4. 20260718220000_link_projects_to_leads.sql — projects.lead_id column
{
  const leadId = await tableOk(adm, "projects", "id, lead_id");
  results.push({
    file: "migrations/20260718220000_link_projects_to_leads.sql",
    deployed: leadId === true,
    detail: { "admark.projects.lead_id": leadId },
  });
}

// 5. 20260719100000_safe_operations_mutations.sql — CAS RPCs
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
  results.push({
    file: "migrations/20260719100000_safe_operations_mutations.sql",
    deployed: a === true && b === true,
    detail: { mutate_operations_data: a, mutate_operations_aux_data: b },
  });
}

console.log(JSON.stringify(results, null, 2));
const deployedCount = results.filter((r) => r.deployed).length;
console.log(`\n${deployedCount}/5 SQL files deployed.`);
process.exitCode = deployedCount === 5 ? 0 : 1;
