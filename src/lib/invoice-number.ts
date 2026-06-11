import { loadInvoices } from "./storage";

/** Indian financial year: Apr 1 → Mar 31. */
export function financialYear(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(`${date}T12:00:00`) : date;
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-based
  const startYear = m >= 3 ? y : y - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

/**
 * Enterprise-style format: `AM/26-27/0001` (FY in the middle, 4-digit sequence).
 * Legacy `AM 0001/26-27` is still parsed for sequencing.
 */
export function formatInvoiceNumber(seq: number, fy: string): string {
  return `AM/${fy}/${String(seq).padStart(4, "0")}`;
}

/** Parse sequence from stored invoice number for a given FY, or null if not matched. */
export function parseInvoiceSequence(number: string, fy: string): number | null {
  const trimmed = number.trim();
  const newRe = new RegExp(`^AM/${fy}/(\\d{4})$`, "i");
  let m = trimmed.match(newRe);
  if (m) return parseInt(m[1], 10);
  const oldRe = new RegExp(`^AM\\s+(\\d+)/${fy}$`, "i");
  m = trimmed.match(oldRe);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Sync: next sequence from an in-memory invoice list (no network). */
export function nextInvoiceNumberFromList(
  invoices: { number: string }[],
  date: Date | string = new Date(),
): string {
  const fy = financialYear(date);
  let max = 0;
  for (const inv of invoices) {
    const n = parseInvoiceSequence(inv.number, fy);
    if (n != null && n > max) max = n;
  }
  return formatInvoiceNumber(max + 1, fy);
}

/** Look at existing invoices to find next sequence for the invoice date's FY. */
export async function nextInvoiceNumber(date: Date | string = new Date()): Promise<string> {
  const invoices = await loadInvoices();
  return nextInvoiceNumberFromList(invoices, date);
}
