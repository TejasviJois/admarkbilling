/* Read-only: scan ALL encrypted fields across live tables; report which decrypt.
   Masked previews only. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../shared/encryption-core.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("full-cipher-scan.mjs");

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
const secret = process.env.APP_SESSION_SECRET;

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  return v.length <= 4 ? "****" : v.slice(0, 2) + "***" + v.slice(-2);
}

const stuck = [];
let encryptedCount = 0;
let okCount = 0;

function check(label, value) {
  if (typeof value !== "string" || !CIPHER_RE.test(value)) return;
  encryptedCount++;
  const out = decrypt(value, { NODE_ENV: "development", APP_SESSION_SECRET: secret });
  // Reject false positives: valid decrypt should be mostly printable
  const printable = out !== value && /^[\x20-\x7E\u00A0-\uFFFF]*$/.test(out) && !/[\uFFFD]/.test(out);
  if (printable) okCount++;
  else stuck.push({ label, sample: value.slice(0, 20) + "..." });
}

const { data: opsRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const ops = opsRow?.payload ?? {};

for (const cl of ops.clients ?? []) {
  for (const f of ["phone", "email", "gstNumber", "pan", "billingAddress", "shippingAddress"]) {
    check(`client[${cl.name ?? cl.id}].${f}`, cl[f]);
  }
}
for (const c of ops.contacts ?? []) check(`contact[${c.name ?? c.id}].phone`, c.phone);
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
  const label = inv.number ?? row.id;
  for (const f of ["clientAddress", "clientPhone", "clientEmail", "clientGstin"]) {
    check(`invoice[${label}].${f}`, inv[f]);
  }
}

console.log(
  JSON.stringify(
    {
      encrypted_fields_total: encryptedCount,
      decrypt_ok: okCount,
      stuck_count: stuck.length,
      stuck,
    },
    null,
    2,
  ),
);
