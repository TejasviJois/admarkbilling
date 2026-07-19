/* Read-only verification: prove invoices_payload_number_uidx rejects duplicates. */
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

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const { data: rows, error: listError } = await sb
  .from("invoices")
  .select("id, payload")
  .order("created_at", { ascending: true });
if (listError) throw listError;

const beforeCount = rows?.length ?? 0;
const sample = rows?.[0];
const sampleNumber =
  sample && typeof sample.payload?.number === "string" ? sample.payload.number.trim() : "";

if (!sampleNumber) {
  console.error("FAIL: no existing invoice number to probe against");
  process.exit(1);
}

const probeId = `probe-unique-number-${Date.now()}`;
const { error: insertError } = await sb.from("invoices").insert({
  id: probeId,
  payload: {
    id: probeId,
    number: sampleNumber,
    date: "2026-07-19",
    clientName: "INDEX PROBE — DO NOT KEEP",
    items: [],
    advance: 0,
    taxPercent: 0,
    status: "draft",
    createdAt: Date.now(),
  },
  created_at: new Date().toISOString(),
});

const { count: afterCount, error: countError } = await sb
  .from("invoices")
  .select("id", { count: "exact", head: true });
if (countError) throw countError;

// Cleanup if the insert somehow succeeded (index missing).
if (!insertError) {
  await sb.from("invoices").delete().eq("id", probeId);
  console.error("FAIL: duplicate insert succeeded — unique index is NOT active");
  process.exit(1);
}

const code = insertError.code;
const message = `${insertError.message ?? ""} ${insertError.details ?? ""}`;
const looksLikeUnique =
  code === "23505" ||
  /invoices_payload_number_uidx|duplicate key|unique/i.test(message);

console.log(
  JSON.stringify(
    {
      ok: looksLikeUnique,
      beforeCount,
      afterCount,
      probedNumber: sampleNumber,
      errorCode: code,
      errorMessage: insertError.message,
      errorDetails: insertError.details,
      rowCountUnchanged: afterCount === beforeCount,
    },
    null,
    2,
  ),
);

if (!looksLikeUnique || afterCount !== beforeCount) {
  process.exit(1);
}
