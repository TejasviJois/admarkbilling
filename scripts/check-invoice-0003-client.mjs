/* Read-only: can invoice AM/26-27/0003's clientPhone be recovered from its client? */
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

function mask(v) {
  if (typeof v !== "string" || !v) return v;
  return v.length <= 4 ? "****" : v.slice(0, 2) + "***" + v.slice(-2) + ` (len=${v.length})`;
}

const { data: invRow } = await sb
  .from("invoices")
  .select("payload")
  .eq("id", "eaptcoswh76mrrhthvz")
  .maybeSingle();
const inv = invRow?.payload ?? {};
console.log({
  number: inv.number,
  clientId: inv.clientId ?? null,
  clientName: inv.clientName,
  clientContact: inv.clientContact ?? null,
  clientEmailState: inv.clientEmail ? "set" : "empty",
});

const { data: opsRow } = await sb
  .from("operations_data")
  .select("payload")
  .eq("id", "default")
  .maybeSingle();
const ops = opsRow?.payload ?? {};
const matches = (ops.clients ?? []).filter(
  (c) =>
    c.id === inv.clientId ||
    (inv.clientName && c.name?.toLowerCase().includes(String(inv.clientName).toLowerCase())) ||
    (inv.clientName && String(inv.clientName).toLowerCase().includes(c.name?.toLowerCase() ?? "@@")),
);
for (const c of matches) {
  const phone = c.phone ? decrypt(c.phone) : "";
  console.log({
    matchedClientId: c.id,
    matchedClientName: c.name,
    phoneDecrypts: phone !== c.phone,
    phonePreview: mask(phone),
  });
}
if (matches.length === 0) console.log("No matching client found in operations_data.");
