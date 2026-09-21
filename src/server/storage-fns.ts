import { createServerFn } from "@tanstack/react-start";
import { assertAppSession } from "./app-session";
import { requireServerSupabase } from "./supabase-admin";
import {
  ADMARK_FILES_BUCKET,
  extractAdmarkFilesPath,
  resolveStoredFileUrl,
  uploadDataUrlToStorage,
} from "./file-storage";

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/avif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_PREVIEW_BYTES = 20 * 1024 * 1024;

export const uploadFileFn = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string; folder: string; fileName?: string }) => {
    if (!data?.dataUrl || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:")) {
      throw new Error("Invalid file payload.");
    }
    if (!data.folder?.trim()) throw new Error("Upload folder is required.");

    // Server-side size & MIME type validation
    const match = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error("Invalid file payload format.");

    const mimeType = match[1].toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(
        `Unsupported file type: ${mimeType}. Only images, PDF, and Word documents are allowed.`,
      );
    }

    const base64Data = match[2];
    const sizeInBytes = Math.round((base64Data.length * 3) / 4);
    if (sizeInBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error("File size exceeds the maximum limit of 15MB.");
    }

    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const url = await uploadDataUrlToStorage(sb, data.dataUrl, data.folder.trim(), data.fileName);
    return { url };
  });

/** Turn a stored public/path/signed admark-files URL into a fresh signed URL for preview. */
export const resolveFileAccessFn = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data?.url || typeof data.url !== "string" || !data.url.trim()) {
      throw new Error("File URL is required.");
    }
    return { url: data.url.trim() };
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const url = (await resolveStoredFileUrl(sb, data.url)) ?? data.url;
    return { url };
  });

/**
 * Download a private admark-files object via service role and return bytes for same-origin preview.
 * Avoids blank cross-origin PDF iframes / browser CORS quirks.
 */
export const fetchFilePreviewFn = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data?.url || typeof data.url !== "string" || !data.url.trim()) {
      throw new Error("File URL is required.");
    }
    return { url: data.url.trim() };
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const path = extractAdmarkFilesPath(data.url);
    if (!path) {
      throw new Error("Only Admark storage files can be previewed this way.");
    }
    const sb = requireServerSupabase();
    const { data: file, error } = await sb.storage.from(ADMARK_FILES_BUCKET).download(path);
    if (error || !file) {
      throw new Error(`Could not load file: ${error?.message ?? "missing object"}`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_PREVIEW_BYTES) {
      throw new Error("File is too large to preview here. Use Open in new tab.");
    }
    const mimeType = file.type || "application/octet-stream";
    return {
      mimeType,
      base64: buffer.toString("base64"),
      byteLength: buffer.byteLength,
    };
  });
