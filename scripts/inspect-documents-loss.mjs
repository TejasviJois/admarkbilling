import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

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

const { data: docsRow } = await sb
  .from("operations_data")
  .select("payload, updated_at")
  .eq("id", "documents")
  .maybeSingle();
const payload = docsRow?.payload ?? {};
const agreements = Array.isArray(payload.agreements) ? payload.agreements : [];
const archive = Array.isArray(payload.archiveDocuments) ? payload.archiveDocuments : [];

console.log("=== BLOB operations_data/documents ===");
console.log("updated_at:", docsRow?.updated_at);
console.log("agreements:", agreements.length);
console.log("archiveDocuments:", archive.length);
const byLib = {};
for (const a of archive) {
  const lib = a.library || a.documentType || "?";
  byLib[lib] = (byLib[lib] || 0) + 1;
}
console.log("archive by library/type:", byLib);
for (const a of archive) {
  console.log(
    " ",
    a.id,
    "lib=",
    a.library,
    "type=",
    a.documentType,
    "client=",
    a.clientId || a.companyName || "-",
    "file=",
    Boolean(a.fileUrl || a.fileDataUrl),
    a.fileName || a.title || "",
  );
}

const { data: org } = await db
  .from("organizations")
  .select("id")
  .is("deleted_at", null)
  .limit(1)
  .maybeSingle();

const { count: liveCount } = await db
  .from("documents")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", org.id)
  .is("deleted_at", null);
const { count: delCount } = await db
  .from("documents")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", org.id)
  .not("deleted_at", "is", null);

const { data: allDocs } = await db
  .from("documents")
  .select("legacy_id, title, document_type, file_url, deleted_at, client_id")
  .eq("organization_id", org.id)
  .limit(1000);

const alive = (allDocs ?? []).filter((d) => !d.deleted_at);
const deleted = (allDocs ?? []).filter((d) => d.deleted_at);
const aliveTypes = {};
const delTypes = {};
for (const d of alive) aliveTypes[d.document_type] = (aliveTypes[d.document_type] || 0) + 1;
for (const d of deleted) delTypes[d.document_type] = (delTypes[d.document_type] || 0) + 1;

console.log("\n=== RELATIONAL admark.documents ===");
console.log("liveCount", liveCount, "delCount", delCount);
console.log("alive types", aliveTypes);
console.log("deleted types", delTypes);

const { data: relAgr } = await db
  .from("agreements")
  .select("legacy_id, title, deleted_at")
  .eq("organization_id", org.id);
console.log(
  "agreements alive",
  (relAgr ?? []).filter((a) => !a.deleted_at).length,
  "deleted",
  (relAgr ?? []).filter((a) => a.deleted_at).length,
);

console.log("\nSoft-deleted archive-like:");
for (const d of deleted.filter((x) => String(x.document_type).startsWith("archive:"))) {
  console.log("  DEL", d.document_type, d.legacy_id, d.title);
}
