/** Shared admark-files path helpers — safe for browser and server. */

export const ADMARK_FILES_BUCKET = "admark-files";

/** Extract object path from a public, signed, authenticated, or path-style ref. */
export function extractAdmarkFilesPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(`${ADMARK_FILES_BUCKET}/`)) {
    return trimmed.slice(ADMARK_FILES_BUCKET.length + 1);
  }
  try {
    const parsed = new URL(trimmed);
    const markers = [
      `/storage/v1/object/public/${ADMARK_FILES_BUCKET}/`,
      `/storage/v1/object/sign/${ADMARK_FILES_BUCKET}/`,
      `/storage/v1/object/authenticated/${ADMARK_FILES_BUCKET}/`,
    ];
    for (const marker of markers) {
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

/**
 * Stable DB / localStorage form — path only, never an expiring signed token.
 * Leaves non-admark URLs (external https, data:) unchanged.
 */
export function toStableAdmarkFileRef(url: string | undefined | null): string | undefined {
  if (!url?.trim()) return url ?? undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const path = extractAdmarkFilesPath(url);
  if (!path) return url;
  return `${ADMARK_FILES_BUCKET}/${path}`;
}

export function isAdmarkStorageUrl(url: string | undefined | null): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return false;
  return url.includes("/admark-files/") || url.startsWith("admark-files/");
}
