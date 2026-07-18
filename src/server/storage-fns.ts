import { createServerFn } from "@tanstack/react-start";
import { assertAppSession } from "./app-session";
import { requireServerSupabase } from "./supabase-admin";
import { uploadDataUrlToStorage } from "./file-storage";

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

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
        `Unsupported file type: ${mimeType}. Only PNG, JPG, WEBP, and PDF files are allowed.`,
      );
    }

    const base64Data = match[2];
    const sizeInBytes = Math.round((base64Data.length * 3) / 4);
    if (sizeInBytes > MAX_FILE_SIZE_BYTES) {
      throw new Error("File size exceeds the maximum limit of 5MB.");
    }

    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const url = await uploadDataUrlToStorage(sb, data.dataUrl, data.folder.trim(), data.fileName);
    return { url };
  });
