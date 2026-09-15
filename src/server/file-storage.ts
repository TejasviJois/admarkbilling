import type { SupabaseClient } from "@supabase/supabase-js";

/** Single bucket for logos, proofs, agreements, compliance PDFs, etc. */
export const ADMARK_FILES_BUCKET = "admark-files";

/** Signed URL lifetime for newly uploaded private objects (1 year). */
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 365;
/** Short refresh TTL when resolving stored public/signed URLs on read. */
const REFRESH_SIGNED_TTL_SEC = 60 * 60;

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

export function isDataUrl(value: string | undefined | null): value is string {
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

/** Extract object path from a public or signed Supabase storage URL for this bucket. */
export function extractAdmarkFilesPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(`${ADMARK_FILES_BUCKET}/`)) {
    return trimmed.slice(ADMARK_FILES_BUCKET.length + 1);
  }
  try {
    const parsed = new URL(trimmed);
    const publicMarker = `/storage/v1/object/public/${ADMARK_FILES_BUCKET}/`;
    const signMarker = `/storage/v1/object/sign/${ADMARK_FILES_BUCKET}/`;
    const authMarker = `/storage/v1/object/authenticated/${ADMARK_FILES_BUCKET}/`;
    for (const marker of [publicMarker, signMarker, authMarker]) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx >= 0) {
        const path = decodeURIComponent(parsed.pathname.slice(idx + marker.length));
        return path.split("?")[0] || null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function createAdmarkSignedUrl(
  sb: SupabaseClient,
  path: string,
  expiresIn = REFRESH_SIGNED_TTL_SEC,
): Promise<string> {
  const { data, error } = await sb.storage
    .from(ADMARK_FILES_BUCKET)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign file URL: ${error?.message ?? "unknown error"}`);
  }
  return data.signedUrl;
}

/** Refresh access for a stored admark-files URL; leave other URLs unchanged. */
export async function resolveStoredFileUrl(
  sb: SupabaseClient,
  value: string | undefined | null,
): Promise<string | undefined> {
  if (!value?.trim()) return value ?? undefined;
  const path = extractAdmarkFilesPath(value);
  if (!path) return value;
  try {
    return await createAdmarkSignedUrl(sb, path, REFRESH_SIGNED_TTL_SEC);
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

  // Bucket is private — always return a signed URL (no public URL fallback).
  return createAdmarkSignedUrl(sb, path, SIGNED_URL_TTL_SEC);
}

/** Upload embedded data URLs; leave https URLs unchanged. */
export async function externalizeDataUrl(
  sb: SupabaseClient,
  value: string | undefined,
  folder: string,
  fileName?: string,
): Promise<string | undefined> {
  if (!value?.trim()) return value;
  if (!isDataUrl(value)) return value;
  return uploadDataUrlToStorage(sb, value, folder, fileName);
}

export async function ensureStorageBucket(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.storage.listBuckets();
  if (error) return false;
  return data?.some((b) => b.id === ADMARK_FILES_BUCKET) ?? false;
}
