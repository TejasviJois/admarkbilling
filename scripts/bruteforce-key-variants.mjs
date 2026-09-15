/* Read-only: try candidate secret variants against undecryptable fields.
   Prints masked previews only. */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ws from "ws";
import { createClient } from "@supabase/supabase-js";
import { decrypt } from "../shared/encryption-core.mjs";
import { DEV_FALLBACK_SECRET } from "../shared/encryption-secret.mjs";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("bruteforce-key-variants.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const rawEnv = readFileSync(resolve(root, ".env"), "utf8");
for (const line of rawEnv.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

// Raw APP_SESSION_SECRET line diagnostics (no value printed)
const rawLine = rawEnv.split(/\n/).find((l) => l.startsWith("APP_SESSION_SECRET"));
console.log("raw line info:", {
  length: rawLine?.length,
  quoted: rawLine?.includes('"'),
  endsWithCR: rawLine?.endsWith("\r"),
});

const base = DEV_FALLBACK_SECRET;
const pwd = process.env.ADMARK_APP_PASSWORD ?? "";
const user = process.env.ADMARK_APP_USERNAME ?? "";

const candidates = new Map([
  ["fallback", base],
  ["fallback+\\n", base + "\n"],
  ["fallback+\\r\\n", base + "\r\n"],
  ["fallback+\\r", base + "\r"],
  ["fallback+space", base + " "],
  ['"fallback" (quoted)', `"${base}"`],
  ["password", pwd],
  ["password+\\n", pwd + "\n"],
  ["username", user],
  ["HTRP@2026", "HTRP@2026"],
]);

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  if (v.length <= 4) return "****";
  return v.slice(0, 2) + "***" + v.slice(-2);
}

const { data: companyRow } = await sb
  .from("company_settings")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const company = companyRow?.payload ?? {};

const { data: invRow } = await sb
  .from("invoices")
  .select("payload")
  .eq("id", "eaptcoswh76mrrhthvz")
  .maybeSingle();
const invoice = invRow?.payload ?? {};

const targets = {
  "company.bankName": company.bankName,
  "company.accountNumber": company.accountNumber,
  "company.ifsc": company.ifsc,
  "company.address": company.address,
  "invoice.clientPhone": invoice.clientPhone,
};

for (const [tLabel, value] of Object.entries(targets)) {
  if (!value) {
    console.log(tLabel, "=> empty");
    continue;
  }
  let hit = null;
  for (const [cLabel, secret] of candidates) {
    if (!secret) continue;
    const out = decrypt(value, { NODE_ENV: "development", APP_SESSION_SECRET: secret });
    if (out !== value) {
      // Nested ciphertext? then it's double-encrypted
      const looksNested = /^[0-9a-f]{32}:[0-9a-f]+$/i.test(out);
      hit = { candidate: cLabel, preview: mask(out), nestedCiphertext: looksNested };
      break;
    }
  }
  console.log(tLabel, "=>", hit ?? "NO candidate decrypts");
}
