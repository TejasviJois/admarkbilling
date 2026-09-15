import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEgressAck } from './lib/egress-guard.mjs';
requireEgressAck("inspect-doc-payload-size.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});
const db = sb.schema("admark");
const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { data: rows, error } = await db
  .from("documents")
  .select("legacy_id, title, document_type, file_url, external_url")
  .eq("organization_id", org.id)
  .is("deleted_at", null)
  .like("document_type", "archive:%");

if (error) {
  console.error(error);
  process.exit(1);
}

let total = 0;
const sized = (rows ?? []).map((r) => {
  const len = (r.file_url ?? "").length + (r.external_url ?? "").length;
  total += len;
  return {
    title: r.title,
    type: r.document_type,
    kb: Math.round(len / 1024),
    isDataUrl: String(r.file_url ?? "").startsWith("data:"),
    isHttp: String(r.file_url ?? "").startsWith("http"),
  };
});
sized.sort((a, b) => b.kb - a.kb);
console.log("archive docs", sized.length, "totalMB", (total / 1024 / 1024).toFixed(2));
console.log(sized.slice(0, 15));
console.log(
  "dataUrl count",
  sized.filter((s) => s.isDataUrl).length,
  "http count",
  sized.filter((s) => s.isHttp).length,
);
