/* Read-only: determine which secret decrypts live encrypted fields.
   Prints only masked previews — never full plaintext or secrets. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../shared/encryption-core.mjs";
import { DEV_FALLBACK_SECRET } from "../shared/encryption-secret.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("diagnose-encryption-keys.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing Supabase credentials");

const envSecret = process.env.APP_SESSION_SECRET;

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const CIPHER_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;

function looksEncrypted(v) {
  return typeof v === "string" && CIPHER_RE.test(v);
}

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  if (v.length <= 4) return "****";
  return v.slice(0, 2) + "***" + v.slice(-2);
}

function tryDecrypt(value, secret) {
  const out = decrypt(value, { NODE_ENV: "development", APP_SESSION_SECRET: secret });
  return out !== value ? out : null;
}

function classify(label, value) {
  if (!value) return { label, state: "empty" };
  if (!looksEncrypted(value)) return { label, state: "plaintext", preview: mask(value) };
  const withEnv = envSecret ? tryDecrypt(value, envSecret) : null;
  const withDev = tryDecrypt(value, DEV_FALLBACK_SECRET);
  return {
    label,
    state: "encrypted",
    decrypts_with_env_secret: withEnv !== null,
    decrypts_with_dev_fallback: withDev !== null,
    preview_env: withEnv ? mask(withEnv) : null,
    preview_dev: withDev ? mask(withDev) : null,
  };
}

const results = [];

const { data: companyRow, error: companyErr } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (companyErr) throw companyErr;
const company = companyRow?.payload ?? {};
for (const field of ["bankName", "accountName", "accountNumber", "ifsc", "branch", "upi", "address", "pan", "gstin"]) {
  results.push(classify(`company.${field}`, company[field]));
}

const { data: opsRow, error: opsErr } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (opsErr) throw opsErr;
const ops = opsRow?.payload ?? {};
for (const cl of (ops.clients ?? []).slice(0, 5)) {
  results.push(classify(`client[${cl.id}].phone`, cl.phone));
  results.push(classify(`client[${cl.id}].email`, cl.email));
}
for (const contact of (ops.contacts ?? []).slice(0, 5)) {
  results.push(classify(`contact[${contact.id}].phone`, contact.phone));
}

const { data: invRows, error: invErr } = await sb
  .from("invoices")
  .select("id, payload")
  .limit(5);
if (invErr) throw invErr;
for (const row of invRows ?? []) {
  const inv = row.payload ?? {};
  results.push(classify(`invoice[${row.id}].clientPhone`, inv.clientPhone));
  results.push(classify(`invoice[${row.id}].clientAddress`, inv.clientAddress));
}

const encrypted = results.filter((r) => r.state === "encrypted");
const summary = {
  env_secret_present: Boolean(envSecret),
  env_secret_is_dev_fallback: envSecret === DEV_FALLBACK_SECRET,
  total_fields_checked: results.length,
  encrypted_fields: encrypted.length,
  decryptable_with_env_secret: encrypted.filter((r) => r.decrypts_with_env_secret).length,
  decryptable_with_dev_fallback: encrypted.filter((r) => r.decrypts_with_dev_fallback).length,
  undecryptable_with_either: encrypted.filter(
    (r) => !r.decrypts_with_env_secret && !r.decrypts_with_dev_fallback,
  ).length,
};

console.log(JSON.stringify({ summary, results }, null, 2));
