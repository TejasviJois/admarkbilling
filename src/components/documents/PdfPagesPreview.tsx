import { useEffect, useRef, useState } from "react";
import { logClientError } from "@/lib/client-logger";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * Renders a PDF from a blob/https URL as canvases (pdf.js).
 * Avoids Chromium's blank PDF-plugin-inside-dialog bug.
 */
export function PdfPagesPreview({
  src,
  title,
}: {
  src: string;
  title?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !src) return;

    host.innerHTML = "";
    setLoading(true);
    setError(null);
    setPageCount(0);

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

        const task = pdfjs.getDocument({ url: src, withCredentials: false });
        const pdf = await task.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }
        setPageCount(pdf.numPages);
        setLoading(false);

        const maxPages = Math.min(pdf.numPages, 40);
        for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const width = host.clientWidth || 720;
          const scale = Math.min(1.5, Math.max(0.8, width / baseViewport.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className =
            "mb-3 w-full rounded border border-border/40 bg-white shadow-sm last:mb-0";
          canvas.setAttribute("aria-label", `${title ?? "PDF"} page ${pageNumber}`);
          const context = canvas.getContext("2d");
          if (!context) continue;
          host.appendChild(canvas);
          await page.render({ canvasContext: context, viewport }).promise;
        }
        await pdf.destroy();
      } catch (err) {
        logClientError("documents.pdfjsPreview", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not render PDF.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      host.innerHTML = "";
    };
  }, [src, title]);

  if (error) {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-6 text-center">
        <p className="text-sm text-destructive">Could not render PDF preview.</p>
        <p className="text-xs text-muted-foreground">Use Open in new tab or Download instead.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/10">
      {loading ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/20">
          <p className="text-sm text-muted-foreground">Loading PDF…</p>
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="relative min-h-[min(70vh,640px)] flex-1 overflow-y-auto bg-muted/20 p-3"
        style={{ maxHeight: "min(70vh, 640px)" }}
      />
      {!loading && pageCount > 40 ? (
        <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
          Showing first 40 of {pageCount} pages. Open in a new tab for the full file.
        </p>
      ) : null}
    </div>
  );
}
