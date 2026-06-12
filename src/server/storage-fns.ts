import { createServerFn } from "@tanstack/react-start";
import { assertAppSession } from "./app-session";
import { requireServerSupabase } from "./supabase-admin";
import { uploadDataUrlToStorage } from "./file-storage";

export const uploadFileFn = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string; folder: string; fileName?: string }) => {
    if (!data?.dataUrl || typeof data.dataUrl !== "string" || !data.dataUrl.startsWith("data:")) {
      throw new Error("Invalid file payload.");
    }
    if (!data.folder?.trim()) throw new Error("Upload folder is required.");
    return data;
  })
  .handler(async ({ data }) => {
    await assertAppSession();
    const sb = requireServerSupabase();
    const url = await uploadDataUrlToStorage(sb, data.dataUrl, data.folder.trim(), data.fileName);
    return { url };
  });
