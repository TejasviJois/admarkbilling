/**
 * Soft-delete invoice-recv mirrors that duplicate an Accounts project payment
 * of the same amount (fixes Srivatsanka 10k vs 60k outstanding).
 *
 * Usage: node scripts/dedupe-invoice-recv-mirrors.mjs --apply
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apply = process.argv.includes("--apply");
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
const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: maps } = await db
  .from("legacy_record_map")
  .select("legacy_id, source_collection")
  .eq("organization_id", org.id)
  .eq("target_table", "payments");
const sourceByLegacy = new Map((maps ?? []).map((m) => [m.legacy_id, m.source_collection]));

const { data: payments } = await db
  .from("payments")
  .select("id, legacy_id, amount, project_id, historical")
  .eq("organization_id", org.id)
  .is("deleted_at", null);

const byProject = new Map();
for (const p of payments ?? []) {
  if (!p.project_id) continue;
  const list = byProject.get(p.project_id) ?? [];
  list.push(p);
  byProject.set(p.project_id, list);
}

const toRemove = [];
for (const [, list] of byProject) {
  const mirrors = list.filter(
    (p) =>
      String(p.legacy_id).startsWith("invoice-recv-") &&
      p.historical === false &&
      sourceByLegacy.get(p.legacy_id) === "projectPayments",
  );
  const accounts = list.filter(
    (p) =>
      p.historical === false &&
      sourceByLegacy.get(p.legacy_id) === "projectPayments" &&
      !String(p.legacy_id).startsWith("invoice-recv-"),
  );
  for (const mirror of mirrors) {
    const dup = accounts.find((a) => Number(a.amount) === Number(mirror.amount));
    if (dup) {
      toRemove.push({ mirror, coveredBy: dup.legacy_id });
    }
  }
}

console.log(`Mode: ${apply ? "APPLY" : "dry-run"}`);
for (const row of toRemove) {
  console.log(
    `Remove ${row.mirror.legacy_id} ₹${row.mirror.amount} (covered by Accounts ${row.coveredBy})`,
  );
}

if (!toRemove.length) {
  console.log("No duplicate invoice-recv mirrors found.");
  process.exit(0);
}

if (apply) {
  const deletedAt = new Date().toISOString();
  for (const row of toRemove) {
    const { error } = await db
      .from("payments")
      .update({ deleted_at: deletedAt })
      .eq("id", row.mirror.id);
    if (error) throw error;
  }
  console.log(`Soft-deleted ${toRemove.length} duplicate mirror(s).`);
} else {
  console.log("Re-run with --apply to write.");
}
