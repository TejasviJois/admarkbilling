import type { Invoice, LineItem } from "./types";

export function lineAmount(item: LineItem): number {
  return (Number(item.quantity) || 0) * (Number(item.rate) || 0);
}

export function computeTotals(inv: Pick<Invoice, "items" | "advance" | "taxPercent">) {
  const subtotal = inv.items.reduce((s, it) => s + lineAmount(it), 0);
  const tax = subtotal * ((Number(inv.taxPercent) || 0) / 100);
  const total = subtotal + tax;
  const advance = Number(inv.advance) || 0;
  const payable = Math.max(total - advance, 0);
  return { subtotal, tax, total, advance, payable };
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

/** Whole rupees — for operations tables (no .00). */
export function formatINRWhole(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}

/**
 * INR for jsPDF built-in fonts (Helvetica): ASCII-only — no ₹ or narrow spaces,
 * which WinAnsi cannot encode and show as garbled glyphs in PDFs.
 */
export function formatINRForPdf(n: number): string {
  const x = Number(n) || 0;
  const sign = x < 0 ? "-" : "";
  const abs = Math.abs(x);
  const num = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return `${sign}Rs. ${num}`;
}
