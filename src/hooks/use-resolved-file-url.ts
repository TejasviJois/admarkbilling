import { useEffect, useState } from "react";
import { isAdmarkStorageUrl } from "@/lib/admark-file-ref";
import { logClientError } from "@/lib/client-logger";
import { resolveFileAccessFn } from "@/server/storage-fns";

export { isAdmarkStorageUrl } from "@/lib/admark-file-ref";

/**
 * Resolve a stored file ref to a browser-usable signed HTTPS URL.
 * Always refreshes signed URLs — private-bucket tokens expire.
 */
export function useResolvedFileUrl(raw: string | undefined | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(raw ?? undefined);

  useEffect(() => {
    const next = raw?.trim() || undefined;
    setUrl(next);
    if (!next || !isAdmarkStorageUrl(next)) return;

    let cancelled = false;
    void resolveFileAccessFn({ data: { url: next } })
      .then((result) => {
        if (!cancelled && result.url) setUrl(result.url);
      })
      .catch((err) => logClientError("files.resolveUrl", err));

    return () => {
      cancelled = true;
    };
  }, [raw]);

  return url;
}
