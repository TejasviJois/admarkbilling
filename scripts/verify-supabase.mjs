/**
 * Supabase backend verification via REST (no WebSocket). Run: node scripts/verify-supabase.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i <= 0) continue;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* no .env */
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL)?.trim()?.replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function rest(path, opts = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok)
    throw new Error(
      typeof body === "object" && body?.message ? body.message : text || res.statusText,
    );
  return body;
}

async function storage(path, opts = {}) {
  const res = await fetch(`${url}/storage/v1/${path}`, {
    ...opts,
    headers: { ...headers, ...opts.headers },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok)
    throw new Error(
      typeof body === "object" && body?.message ? body.message : text || res.statusText,
    );
  return body;
}

const checks = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
    console.log(`OK  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({ name, ok: false, detail: msg });
    console.log(`FAIL ${name} — ${msg}`);
  }
}

await check("company_settings table", async () => {
  const rows = await rest("company_settings?select=id&limit=5");
  return `${rows.length} row(s): ${rows.map((r) => r.id).join(", ")}`;
});

await check("operations_data rows", async () => {
  const rows = await rest("operations_data?select=id&order=id");
  return `${rows.length} row(s): ${rows.map((r) => r.id).join(", ")}`;
});

await check("invoices table", async () => {
  const rows = await rest("invoices?select=id&limit=1");
  return `accessible (${Array.isArray(rows) ? "ok" : "ok"})`;
});

await check("admark-files bucket", async () => {
  const buckets = await storage("bucket");
  const bucket =
    buckets?.find?.((b) => b.id === "admark-files") ??
    buckets?.find?.((b) => b.name === "admark-files");
  if (!bucket && Array.isArray(buckets)) {
    const found = buckets.find((b) => b.id === "admark-files");
    if (!found)
      throw new Error('Bucket "admark-files" not found — run supabase/complete_admark_database.sql');
    return `public=${found.public}`;
  }
  if (!bucket) throw new Error('Bucket "admark-files" not found — run supabase/complete_admark_database.sql');
  return `public=${bucket.public}`;
});

await check("operations baseline income", async () => {
  const rows = await rest("operations_data?select=payload&id=eq.default");
  const p = rows[0]?.payload;
  if (!p) throw new Error("No default operations row");
  const projects = Array.isArray(p.projects) ? p.projects.length : 0;
  const income = p.financialBaseline?.totalRevenueReceived;
  return `${projects} projects, baseline totalRevenueReceived=${income ?? "missing"}`;
});

await check("storage upload", async () => {
  const path = `_verify/${Date.now()}.txt`;
  const res = await fetch(`${url}/storage/v1/object/admark-files/${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "text/plain",
      "x-upsert": "true",
    },
    body: "admark-verify",
  });
  if (!res.ok) throw new Error(await res.text());
  await fetch(`${url}/storage/v1/object/admark-files/${path}`, { method: "DELETE", headers });
  return "upload + delete works";
});

const failed = checks.filter((c) => !c.ok);
console.log("");
console.log(
  failed.length === 0 ? "All Supabase checks passed." : `${failed.length} check(s) failed.`,
);
process.exit(failed.length === 0 ? 0 : 1);
