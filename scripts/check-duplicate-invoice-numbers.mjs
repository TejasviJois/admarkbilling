/* Read-only: report duplicate invoice numbers in public.invoices. */
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

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const { data, error } = await sb
  .from("invoices")
  .select("id, payload, created_at")
  .order("created_at", { ascending: true });
if (error) throw error;

const rows = data ?? [];
const byNumber = new Map();
for (const row of rows) {
  const raw = row.payload?.number;
  const number = typeof raw === "string" ? raw.trim() : "";
  if (!number) continue;
  if (!byNumber.has(number)) byNumber.set(number, []);
  byNumber.get(number).push({ id: row.id, created_at: row.created_at });
}

const duplicates = [...byNumber.entries()]
  .filter(([, list]) => list.length > 1)
  .sort(([a], [b]) => a.localeCompare(b));

console.log(
  JSON.stringify(
    {
      total_invoices: rows.length,
      distinct_numbers: byNumber.size,
      duplicate_number_count: duplicates.length,
      duplicates: duplicates.map(([invoice_number, list]) => ({
        invoice_number,
        duplicate_count: list.length,
        invoice_ids: list.map((r) => r.id),
      })),
    },
    null,
    2,
  ),
);
