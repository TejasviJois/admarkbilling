import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMARK_FILES_BUCKET,
  extractAdmarkFilesPath,
  toStableAdmarkFileRef,
} from "@/lib/admark-file-ref";

export { ADMARK_FILES_BUCKET, extractAdmarkFilesPath, toStableAdmarkFileRef };

/** Signed URL lifetime for newly uploaded private objects (1 year). */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;
/** Display TTL for URLs handed to the client after a private-bucket read. */
const DISPLAY_SIGNED_TTL_SEC = 60 * 60 * 24 * 7; // 7 days

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export function isDataUrl(value: string | undefined | null): boolean {
  return typeof value === "string" && value.startsWith("data:");
}

export function isRemoteFileUrl(value: string | undefined | null): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function extensionFromMime(mime: string, fileName?: string): string {
  if (fileName?.includes(".")) {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext && ext.length <= 8) return ext;
  }
  return MIME_EXT[mime.toLowerCase()] ?? "bin";
}

export function dataUrlToBuffer(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) throw new Error("Invalid file data — expected a base64 data URL.");
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function objectPath(folder: string, fileName: string | undefined, mimeType: string): string {
  const id = crypto.randomUUID();
  const safeFolder = folder
    .split("/")
    .map((part) => sanitizeSegment(part))
    .filter(Boolean)
    .join("/");
  const ext = extensionFromMime(mimeType, fileName);
  const base = fileName ? sanitizeSegment(fileName.replace(/\.[^.]+$/, "")) : "file";
  return `${safeFolder}/${id}-${base}.${ext}`;
}

export async function createAdmarkSignedUrl(
  sb: SupabaseClient,
  path: string,
  expiresIn = DISPLAY_SIGNED_TTL_SEC,
): Promise<string> {
  const { data, error } = await sb.storage
    .from(ADMARK_FILES_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign file URL: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Refresh access for a stored admark-files URL; leave other URLs unchanged. */
export async function resolveStoredFileUrl(
  sb: SupabaseClient,
  value: string | undefined | null,
  expiresIn = DISPLAY_SIGNED_TTL_SEC,
): Promise<string | undefined> {
  if (!value?.trim()) return value ?? undefined;
  const path = extractAdmarkFilesPath(value);
  if (!path) return value;

  const now = Date.now();
  const cached = signedUrlCache.get(path);
  // Re-use cached URL if it still has at least 1 hour of validity remaining
  if (cached && cached.expiresAt > now + 3600_000) {
    return cached.url;
  }

  try {
    const signed = await createAdmarkSignedUrl(sb, path, expiresIn);
    signedUrlCache.set(path, {
      url: signed,
      expiresAt: now + expiresIn * 1000,
    });
    return signed;
  } catch {
    return value;
  }
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

export async function uploadDataUrlToStorage(
  sb: SupabaseClient,
  dataUrl: string,
  folder: string,
  fileName?: string,
): Promise<string> {
  const { mimeType, buffer } = dataUrlToBuffer(dataUrl);
  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error("File size exceeds the maximum limit of 15MB.");
  }
  const path = objectPath(folder, fileName, normalizedMime);

  const { error } = await sb.storage.from(ADMARK_FILES_BUCKET).upload(path, buffer, {
    contentType: normalizedMime,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // Long-lived signed URL for immediate client preview; save paths stabilize to path refs.
  return createAdmarkSignedUrl(sb, path, SIGNED_URL_TTL_SEC);
}

/** Upload embedded data URLs; leave https / stable refs unchanged (stabilize signed URLs). */
export async function externalizeDataUrl(
  sb: SupabaseClient,
  value: string | undefined,
  folder: string,
  fileName?: string,
): Promise<string | undefined> {
  if (!value?.trim()) return value;
  if (!isDataUrl(value)) return toStableAdmarkFileRef(value) ?? value;
  return uploadDataUrlToStorage(sb, value, folder, fileName);
}

export async function ensureStorageBucket(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.storage.listBuckets();
  if (error) return false;
  return data?.some((b) => b.id === ADMARK_FILES_BUCKET) ?? false;
}
