/** True when payment status looks like money received / settled — triggers proof upload prompt. */
export function shouldPromptForPaymentProof(paymentStatus: string | undefined): boolean {
  if (!paymentStatus?.trim()) return false;
  const s = paymentStatus.trim().toLowerCase();
  if (s === "-" || s === "tbd" || s === "n/a") return false;
  return (
    /\breceived\b/.test(s) ||
    /\badvance\b/.test(s) ||
    /\btoken\b/.test(s) ||
    s === "done" ||
    s === "paid" ||
    s === "complete" ||
    s === "completed" ||
    /^₹?\s*[\d,]+(\.\d+)?\s*(received|paid|done)?$/i.test(paymentStatus.trim())
  );
}

export function readImageAsDataUrl(file: File): Promise<{ dataUrl: string; fileName: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Please choose an image file (PNG, JPG, or screenshot)."));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Image must be under 5 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }
      resolve({ dataUrl: reader.result, fileName: file.name, mimeType: file.type });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}
