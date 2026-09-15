/* Read-only: check admark.organizations for recoverable company/bank details.
   Masked previews only. */
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

const { data: orgs, error } = await adm.from("organizations").select("*");
if (error) {
  console.log("organizations error:", error.message);
} else {
  for (const org of orgs ?? []) {
    const out = {};
    for (const [k, v] of Object.entries(org)) {
      out[k] = typeof v === "string" && v.length > 30 ? mask(v) : mask(v) ?? v;
    }
    console.log(JSON.stringify(out, null, 2));
  }
}

// Company snapshot on relational invoices (if any rows exist)
const { data: invs, error: invErr } = await adm
  .from("invoices")
  .select("number, client_phone_snapshot, company_snapshot")
  .limit(10);
if (invErr) {
  console.log("invoices error:", invErr.message);
} else {
  for (const inv of invs ?? []) {
    console.log(
      JSON.stringify({
        number: inv.number,
        client_phone_snapshot: mask(inv.client_phone_snapshot),
        company_snapshot: inv.company_snapshot
          ? Object.fromEntries(
              Object.entries(inv.company_snapshot).map(([k, v]) => [k, mask(v)]),
            )
          : null,
      }),
    );
  }
}
