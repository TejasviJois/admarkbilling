import { getDataBackendStatus } from "@/server/invoice-fns";
import { uploadFileFn } from "@/server/storage-fns";
import { logClientError } from "@/lib/client-logger";

let backendConfigured: boolean | null = null;

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
    // Supabase unreachable or bucket missing — keep embedded image so local save still works.
    return dataUrl;
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
  const dataUrl = await readFileAsDataUrl(file);
  const url = await persistDataUrl(dataUrl, folder, file.name);
  return { url, fileName: file.name, mimeType: file.type || "application/octet-stream" };
}
