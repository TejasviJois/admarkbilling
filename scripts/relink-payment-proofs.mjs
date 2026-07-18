/**
 * One-time recovery: reconnect payment proof files in Storage to operations_data.
 * Run: node scripts/relink-payment-proofs.mjs
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
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const PAYMENT_ADDED = /^Payment ₹([\d,]+) recorded for /;

async function listFolder(prefix) {
  const res = await fetch(`${url}/storage/v1/object/list/admark-files`, {
    method: "POST",
    headers,
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: "name", order: "asc" } }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(body));
  return body;
}

async function walkStorage(prefix, depth = 0) {
  const items = await listFolder(prefix);
  let files = [];
  for (const item of items) {
    const fullPath = `${prefix}${item.name}`;
    if (item.id) {
      files.push({ path: fullPath, updated: item.updated_at ?? new Date().toISOString() });
    } else if (depth < 5) {
      files = files.concat(await walkStorage(`${fullPath}/`, depth + 1));
    }
  }
  return files;
}

function groupProofFiles(files) {
  const byProject = new Map();
  for (const file of files) {
    const match = file.path.match(/^proofs\/projects\/([^/]+)\/payments\/([^/]+)\//);
    if (!match) continue;
    const [, projectId, paymentId] = match;
    if (!byProject.has(projectId)) byProject.set(projectId, new Map());
    const byPayment = byProject.get(projectId);
    if (!byPayment.has(paymentId)) byPayment.set(paymentId, []);
    byPayment.get(paymentId).push(file);
  }
  return byProject;
}

function publicUrl(path) {
  return `${url}/storage/v1/object/public/admark-files/${path}`;
}

function mimeFromFileName(fileName) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function formatInr(amount) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function syncPaymentStatus(project) {
  const payments = project.payments ?? [];
  if (payments.length === 0) return { ...project, payments: [], paymentStatus: undefined };

  const total = payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
  const parts = [`${formatInr(total)} received`];
  if (payments.length > 1) parts.push(`${payments.length} payments`);
  return { ...project, paymentStatus: parts.join(" · ") };
}

async function main() {
  const proofFiles = await walkStorage("proofs/projects/");
  const byProject = groupProofFiles(proofFiles);
  console.log(`Found ${proofFiles.length} proof file(s) across ${byProject.size} project(s).`);

  const opsRes = await fetch(`${url}/rest/v1/operations_data?id=eq.default&select=payload`, {
    headers,
  });
  const opsRows = await opsRes.json();
  if (!opsRes.ok) throw new Error(JSON.stringify(opsRows));

  const activityRes = await fetch(
    `${url}/rest/v1/operations_data?id=eq.activity_logs&select=payload`,
    {
      headers,
    },
  );
  const activityRows = await activityRes.json();
  const activityEntries = activityRows[0]?.payload?.entries ?? [];

  const activity = new Map();
  for (const entry of activityEntries) {
    if (entry.action !== "payment_added" || entry.entity !== "project" || !entry.entityId) continue;
    const match = PAYMENT_ADDED.exec(entry.summary ?? "");
    if (!match) continue;
    const amount = Number(match[1].replace(/,/g, ""));
    const ts = typeof entry.timestamp === "number" ? entry.timestamp : Date.now();
    if (!activity.has(entry.entityId)) activity.set(entry.entityId, []);
    activity.get(entry.entityId).push({
      amount,
      date: new Date(ts).toISOString().slice(0, 10),
      ts,
    });
  }
  for (const payments of activity.values()) payments.sort((a, b) => a.ts - b.ts);

  const payload = opsRows[0]?.payload;
  if (!payload) throw new Error("No operations_data default row found.");

  let relinkedCount = 0;
  const projects = (payload.projects ?? []).map((project) => {
    const storagePayments = byProject.get(project.id);
    if (!storagePayments) return project;

    const paymentIds = [...storagePayments.keys()].sort((a, b) => {
      const aDate = storagePayments
        .get(a)
        .map((file) => file.updated)
        .sort()[0];
      const bDate = storagePayments
        .get(b)
        .map((file) => file.updated)
        .sort()[0];
      return aDate.localeCompare(bDate);
    });

    const existing = project.payments ?? [];
    const needsRelink =
      existing.length === 0 ||
      paymentIds.some(
        (paymentId) =>
          !existing.some((payment) => payment.id === paymentId && payment.proof?.imageDataUrl),
      );
    if (!needsRelink) return project;

    const activityForProject = activity.get(project.id) ?? [];
    const rebuilt = paymentIds.map((paymentId, index) => {
      const files = storagePayments.get(paymentId);
      const latest = [...files].sort((a, b) => b.updated.localeCompare(a.updated))[0];
      const existingPayment = existing.find((payment) => payment.id === paymentId);
      const activityPayment = activityForProject[index];
      const fileName = latest.path.split("/").pop() ?? "payment-proof";

      if (existingPayment?.proof?.imageDataUrl) return existingPayment;

      return {
        id: paymentId,
        amount: existingPayment?.amount ?? activityPayment?.amount ?? 0,
        date: existingPayment?.date ?? activityPayment?.date ?? latest.updated.slice(0, 10),
        note: existingPayment?.note,
        proof: {
          imageDataUrl: publicUrl(latest.path),
          fileName,
          mimeType: mimeFromFileName(fileName),
          uploadedAt: latest.updated,
        },
      };
    });

    relinkedCount += rebuilt.length;
    return syncPaymentStatus({ ...project, payments: rebuilt });
  });

  const next = { ...payload, projects };
  const save = await fetch(`${url}/rest/v1/operations_data?id=eq.default`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ payload: next, updated_at: new Date().toISOString() }),
  });
  const saved = await save.json();
  if (!save.ok) throw new Error(JSON.stringify(saved));

  const withProof = projects.reduce(
    (count, project) =>
      count + (project.payments ?? []).filter((payment) => payment.proof?.imageDataUrl).length,
    0,
  );

  console.log(`Relinked ${relinkedCount} payment row(s).`);
  console.log(
    `Projects with visible proofs: ${withProof} payment(s) now linked in operations_data.`,
  );
  console.log("Hard refresh the live site — Documents → Payments → Clients should show proofs.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
