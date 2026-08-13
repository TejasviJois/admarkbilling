import { getDataBackendStatus } from "@/server/invoice-fns";
import { uploadFileFn } from "@/server/storage-fns";
import { logClientError } from "@/lib/client-logger";

let backendConfigured: boolean | null = null;

const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
};

/** Windows often leaves `file.type` empty; infer from the extension so uploads aren't rejected. */
export function mimeTypeForFile(file: File): string {
  const type = file.type.toLowerCase();
  if (type && type !== "application/octet-stream") return type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] || type || "application/octet-stream";
}

function withMimeType(dataUrl: string, mimeType: string): string {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  return dataUrl.replace(/^data:[^;]*;base64,/, `data:${mimeType};base64,`);
}

async function remoteEnabled(): Promise<boolean> {
  if (backendConfigured !== null) return backendConfigured;
  try {
    const status = await getDataBackendStatus();
    backendConfigured = status.configured;
    return backendConfigured;
  } catch {
    backendConfigured = false;
    return false;
  }
}

/** When Supabase is configured, upload a data URL to Storage and return its public URL. */
export async function persistDataUrl(
  dataUrl: string,
  folder: string,
  fileName?: string,
): Promise<string> {
  if (!dataUrl.startsWith("data:")) return dataUrl;
  if (!(await remoteEnabled())) return dataUrl;
  try {
    const { url } = await uploadFileFn({ data: { dataUrl, folder, fileName } });
    return url;
  } catch (e) {
    logClientError("remote-file.upload", e);
    // When the backend is configured, never silently embed multi-MB data URLs into
    // JSON payloads — that causes DB bloat and false "saved" UX.
    throw e instanceof Error ? e : new Error("Could not upload file to storage.");
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/** Read a file and store it in Supabase Storage when the backend is configured. */
export async function readAndPersistFile(
  file: File,
  folder: string,
): Promise<{ url: string; fileName: string; mimeType: string }> {
  const mimeType = mimeTypeForFile(file);
  const dataUrl = withMimeType(await readFileAsDataUrl(file), mimeType);
  const url = await persistDataUrl(dataUrl, folder, file.name);
  return { url, fileName: file.name, mimeType };
}
