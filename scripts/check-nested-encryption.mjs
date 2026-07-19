/* Read-only: detect multi-pass (nested) encryption across live fields. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../shared/encryption-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const CIPHER_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  return (v.length <= 4 ? "****" : v.slice(0, 2) + "***" + v.slice(-2)) + ` (len=${v.length})`;
}

function peel(value) {
  let current = value;
  let passes = 0;
  while (CIPHER_RE.test(current) && passes < 6) {
    const out = decrypt(current);
    if (out === current) break; // cannot decrypt further
    current = out;
    passes++;
  }
  return { passes, final: current, stillCipher: CIPHER_RE.test(current) };
}

const rows = [];
function check(label, value) {
  if (typeof value !== "string" || !CIPHER_RE.test(value)) return;
  const { passes, final, stillCipher } = peel(value);
  rows.push({
    label,
    passes,
    stuck: stillCipher,
    preview: stillCipher ? "<CIPHERTEXT>" : mask(final),
  });
}

const { data: opsRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const ops = opsRow?.payload ?? {};
for (const cl of ops.clients ?? []) {
  for (const f of ["phone", "email", "gstNumber", "pan", "billingAddress", "shippingAddress"]) {
    check(`client[${cl.id}].${f}`, cl[f]);
  }
}
for (const c of ops.contacts ?? []) check(`contact[${c.personName ?? c.id}].phone`, c.phone);
for (const l of ops.leads ?? []) check(`lead[${l.company ?? l.id}].phone`, l.phone);

const { data: companyRow } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const company = companyRow?.payload ?? {};
for (const f of ["address", "pan", "gstin", "bankName", "accountName", "accountNumber", "ifsc", "branch", "upi"]) {
  check(`company.${f}`, company[f]);
}

const { data: invRows } = await sb.from("invoices").select("id, payload");
for (const row of invRows ?? []) {
  const inv = row.payload ?? {};
  for (const f of ["clientAddress", "clientPhone", "clientEmail", "clientGstin"]) {
    check(`invoice[${inv.number ?? row.id}].${f}`, inv[f]);
  }
}

const byPasses = {};
for (const r of rows) {
  const key = r.stuck ? "stuck" : `${r.passes}-pass`;
  byPasses[key] = (byPasses[key] ?? 0) + 1;
}
console.log(JSON.stringify({ summary: byPasses, fields: rows }, null, 2));
