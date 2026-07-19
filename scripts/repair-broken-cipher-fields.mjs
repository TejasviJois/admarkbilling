/* Repair the 6 undecryptable fields using recovered values:
   - company address/bank fields from admark.companies (plaintext)
   - invoice AM/26-27/0003 clientPhone from its client record (decrypts fine)
   Snapshots both rows to backups/ before writing. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { decrypt, encrypt } from "../shared/encryption-core.mjs";

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
const adm = sb.schema("admark");

const CIPHER_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  return v.length <= 4 ? "****" : v.slice(0, 2) + "***" + v.slice(-2);
}

// ---------- 1. Load current rows ----------
const { data: companyRow, error: cErr } = await sb
  .from("company_settings")
  .select("payload, updated_at")
  .eq("id", "default")
  .maybeSingle();
if (cErr) throw cErr;
if (!companyRow?.payload) throw new Error("company_settings/default missing");

const INVOICE_ID = "eaptcoswh76mrrhthvz";
const { data: invRow, error: iErr } = await sb
  .from("invoices")
  .select("payload, created_at")
  .eq("id", INVOICE_ID)
  .maybeSingle();
if (iErr) throw iErr;
if (!invRow?.payload) throw new Error("invoice row missing");

// ---------- 2. Snapshot before writing ----------
mkdirSync(resolve(root, "backups"), { recursive: true });
const snapshotPath = resolve(root, `backups/pre-cipher-repair-${stamp}.json`);
writeFileSync(
  snapshotPath,
  JSON.stringify({ company_settings: companyRow, invoice: invRow }, null, 2),
);
console.log("Snapshot written:", snapshotPath);

// ---------- 3. Recover values ----------
const { data: companies, error: rErr } = await adm
  .from("companies")
  .select("address, bank_name, account_name, account_number, ifsc")
  .limit(1);
if (rErr) throw rErr;
const rec = companies?.[0];
if (!rec) throw new Error("admark.companies has no row to recover from");
for (const [k, v] of Object.entries(rec)) {
  if (!v || CIPHER_RE.test(v)) throw new Error(`Recovery source ${k} unusable`);
}

const { data: opsRow, error: oErr } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
if (oErr) throw oErr;
const client = (opsRow?.payload?.clients ?? []).find((c) => c.id === "cli-prashanth-unlce");
if (!client?.phone) throw new Error("client cli-prashanth-unlce not found");
const recoveredPhone = decrypt(client.phone);
if (recoveredPhone === client.phone || CIPHER_RE.test(recoveredPhone)) {
  throw new Error("client phone did not decrypt");
}

// ---------- 4. Apply repairs (encrypt with current key) ----------
const payload = { ...companyRow.payload };
const before = {};
const repairs = {
  address: rec.address,
  bankName: rec.bank_name,
  accountName: rec.account_name,
  accountNumber: rec.account_number,
  ifsc: rec.ifsc,
};
for (const [field, plain] of Object.entries(repairs)) {
  before[field] = payload[field];
  if (!CIPHER_RE.test(payload[field] ?? "")) {
    console.log(`SKIP company.${field}: not broken ciphertext, leaving as is`);
    continue;
  }
  payload[field] = encrypt(plain);
  console.log(`REPAIR company.${field} -> ${mask(plain)}`);
}

const { error: saveCompanyErr } = await sb
  .from("company_settings")
  .update({ payload, updated_at: new Date().toISOString() })
  .eq("id", "default");
if (saveCompanyErr) throw saveCompanyErr;

const invPayload = { ...invRow.payload };
if (CIPHER_RE.test(invPayload.clientPhone ?? "")) {
  const check = decrypt(invPayload.clientPhone);
  if (check === invPayload.clientPhone) {
    invPayload.clientPhone = encrypt(recoveredPhone);
    const { error: saveInvErr } = await sb
      .from("invoices")
      .update({ payload: invPayload })
      .eq("id", INVOICE_ID);
    if (saveInvErr) throw saveInvErr;
    console.log(`REPAIR invoice.clientPhone -> ${mask(recoveredPhone)}`);
  } else {
    console.log("SKIP invoice.clientPhone: already decryptable");
  }
}

console.log("Repair complete.");
