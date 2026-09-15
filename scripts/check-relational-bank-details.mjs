/* Read-only: check admark.companies for recoverable bank details (masked). */
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck(import.meta.url);
import { readFileSync } from "node:fs";
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

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});
const adm = sb.schema("admark");

const CIPHER_RE = /^[0-9a-f]{32}:[0-9a-f]+$/i;
function mask(v) {
  if (typeof v !== "string" || !v) return v;
  if (CIPHER_RE.test(v)) return "<CIPHERTEXT>";
  return v.length <= 4 ? "****" : v.slice(0, 2) + "***" + v.slice(-2) + ` (len=${v.length})`;
}

const { data, error } = await adm
  .from("companies")
  .select("name, address, bank_name, account_name, account_number, ifsc, branch, upi, updated_at");
if (error) {
  console.log("companies error:", error.message);
} else {
  for (const row of data ?? []) {
    console.log(
      JSON.stringify(
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, mask(v)])),
        null,
        2,
      ),
    );
  }
}
