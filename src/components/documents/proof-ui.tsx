import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { readImageAsDataUrl } from "@/lib/payment-proof";

export function ProofThumbnail({
  imageUrl,
  label,
  onView,
  onUpload,
}: {
  imageUrl?: string;
  label: string;
  onView: (src: string) => void;
  onUpload?: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  if (!imageUrl) {
    if (!onUpload) {
      return <span className="text-xs text-amber-400/90">Missing</span>;
    }

    return (
      <div className="flex flex-col items-start gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-500/40 px-2 py-1 text-xs font-medium text-amber-400/90 transition-colors hover:border-amber-500/70 hover:bg-amber-500/5 disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {busy ? "Uploading…" : "Upload"}
        </button>
        {error && <span className="text-[10px] text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onView(imageUrl)}
      className="group/proof overflow-hidden rounded-md border border-border bg-muted/20 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      aria-label={`View proof for ${label}`}
    >
      <img
        src={imageUrl}
        alt=""
        className="h-14 w-auto max-w-[7rem] cursor-pointer object-cover object-top transition-opacity group-hover/proof:opacity-90"
      />
    </button>
  );
}

export function proofCountLabel(proofCount: number, paymentCount: number): string | undefined {
  if (paymentCount === 0) return undefined;
  if (proofCount === 0) return "No proofs uploaded yet";
  if (proofCount === paymentCount) {
    return `${proofCount} proof${proofCount === 1 ? "" : "s"} attached`;
  }
  return `${proofCount} of ${paymentCount} with proof`;
}

export async function proofFromFile(file: File) {
  const { dataUrl, fileName, mimeType } = await readImageAsDataUrl(file);
  return { imageDataUrl: dataUrl, fileName, mimeType };
}
