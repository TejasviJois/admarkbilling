import type { SupabaseClient } from "@supabase/supabase-js";
import { syncPaymentStatusFromPayments } from "@/lib/project-payments";
import type { OperationsData, ProjectPayment } from "@/lib/types";
import { ADMARK_FILES_BUCKET } from "./file-storage";

const PAYMENT_ADDED = /^Payment ₹([\d,]+) recorded for /;

type StoredFile = { path: string; updated: string };

type ActivityPayment = { amount: number; date: string; ts: number };

async function listFolder(
  sb: SupabaseClient,
  prefix: string,
): Promise<Array<{ name: string; id: string | null; updated_at: string | null }>> {
  const { data, error } = await sb.storage.from(ADMARK_FILES_BUCKET).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;
  return data ?? [];
}

async function walkStorage(sb: SupabaseClient, prefix: string, depth = 0): Promise<StoredFile[]> {
  const items = await listFolder(sb, prefix);
  let files: StoredFile[] = [];

  for (const item of items) {
    const fullPath = `${prefix}${item.name}`;
    if (item.id) {
      files.push({ path: fullPath, updated: item.updated_at ?? new Date().toISOString() });
    } else if (depth < 5) {
      files = files.concat(await walkStorage(sb, `${fullPath}/`, depth + 1));
    }
  }

  return files;
}

function groupProofFiles(files: StoredFile[]): Map<string, Map<string, StoredFile[]>> {
  const byProject = new Map<string, Map<string, StoredFile[]>>();

  for (const file of files) {
    const match = file.path.match(/^proofs\/projects\/([^/]+)\/payments\/([^/]+)\//);
    if (!match) continue;

    const [, projectId, paymentId] = match;
    if (!byProject.has(projectId)) byProject.set(projectId, new Map());
    const byPayment = byProject.get(projectId)!;
    if (!byPayment.has(paymentId)) byPayment.set(paymentId, []);
    byPayment.get(paymentId)!.push(file);
  }

  return byProject;
}

async function loadActivityPaymentAdds(
  sb: SupabaseClient,
): Promise<Map<string, ActivityPayment[]>> {
  const { data, error } = await sb
    .from("operations_data")
    .select("payload")
    .eq("id", "activity_logs")
    .maybeSingle();
  if (error) throw error;

  const entries = (data?.payload as { entries?: unknown[] } | null)?.entries ?? [];
  const map = new Map<string, ActivityPayment[]>();

  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as {
      action?: string;
      entity?: string;
      entityId?: string;
      summary?: string;
      timestamp?: number;
    };
    if (entry.action !== "payment_added" || entry.entity !== "project" || !entry.entityId) continue;

    const match = PAYMENT_ADDED.exec(entry.summary ?? "");
    if (!match) continue;

    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;

    const ts = typeof entry.timestamp === "number" ? entry.timestamp : Date.now();
    if (!map.has(entry.entityId)) map.set(entry.entityId, []);
    map.get(entry.entityId)!.push({
      amount,
      date: new Date(ts).toISOString().slice(0, 10),
      ts,
    });
  }

  for (const payments of map.values()) {
    payments.sort((a, b) => a.ts - b.ts);
  }

  return map;
}

function mimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  return "image/jpeg";
}

function paymentsNeedRelink(
  existing: ProjectPayment[],
  storagePaymentIds: string[],
): boolean {
  if (storagePaymentIds.length === 0) return false;
  if (existing.length === 0) return true;
  return storagePaymentIds.some(
    (paymentId) => !existing.some((p) => p.id === paymentId && p.proof?.imageDataUrl),
  );
}

/**
 * Reconnect orphaned payment proof files in Storage to project payment rows.
 * Uses activity log amounts/dates when available; preserves existing payment rows that already have proofs.
 */
export async function relinkOrphanedPaymentProofs(
  sb: SupabaseClient,
  ops: OperationsData,
): Promise<{ data: OperationsData; changed: boolean }> {
  const proofFiles = await walkStorage(sb, "proofs/projects/");
  const byProject = groupProofFiles(proofFiles);
  if (byProject.size === 0) return { data: ops, changed: false };

  const activity = await loadActivityPaymentAdds(sb);
  let changed = false;

  const projects = ops.projects.map((project) => {
    const storagePayments = byProject.get(project.id);
    if (!storagePayments) return project;

    const paymentIds = [...storagePayments.keys()].sort((a, b) => {
      const aDate = storagePayments
        .get(a)!
        .map((f) => f.updated)
        .sort()[0];
      const bDate = storagePayments
        .get(b)!
        .map((f) => f.updated)
        .sort()[0];
      return aDate.localeCompare(bDate);
    });

    const existing = project.payments ?? [];
    if (!paymentsNeedRelink(existing, paymentIds)) return project;

    const activityForProject = activity.get(project.id) ?? [];
    const rebuilt: ProjectPayment[] = [];

    paymentIds.forEach((paymentId, index) => {
      const files = storagePayments.get(paymentId)!;
      const latest = [...files].sort((a, b) => b.updated.localeCompare(a.updated))[0];
      const existingPayment = existing.find((p) => p.id === paymentId);

      if (existingPayment?.proof?.imageDataUrl) {
        rebuilt.push(existingPayment);
        return;
      }

      const activityPayment = activityForProject[index];
      const fileName = latest.path.split("/").pop() ?? "payment-proof";
      const { data: publicUrl } = sb.storage.from(ADMARK_FILES_BUCKET).getPublicUrl(latest.path);

      rebuilt.push({
        id: paymentId,
        amount: existingPayment?.amount ?? activityPayment?.amount ?? 0,
        date: existingPayment?.date ?? activityPayment?.date ?? latest.updated.slice(0, 10),
        note: existingPayment?.note,
        proof: {
          imageDataUrl: publicUrl.publicUrl,
          fileName,
          mimeType: mimeFromFileName(fileName),
          uploadedAt: latest.updated,
        },
      });
    });

    changed = true;
    return syncPaymentStatusFromPayments({ ...project, payments: rebuilt });
  });

  return { data: { ...ops, projects }, changed };
}
