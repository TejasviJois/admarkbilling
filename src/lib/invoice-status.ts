import type { Invoice } from "./types";

/** Colored circle + label for invoice UI (browser renders emoji reliably). */
export function statusIndicatorEmoji(status: Invoice["status"]): string {
  const map: Record<Invoice["status"], string> = {
    draft: "⚪",
    generated: "📄",
    sent: "📤",
    viewed: "👁️",
    partially_paid: "🔵",
    paid: "🟢",
    cancelled: "🚫",
    overdue: "🔴",
  };
  return map[status] || "⚪";
}

/** Simple text color for status on light invoice surface. */
export function statusTextClassLight(status: Invoice["status"]): string {
  const map: Record<Invoice["status"], string> = {
    draft: "text-slate-500",
    generated: "text-blue-500",
    sent: "text-indigo-500",
    viewed: "text-purple-500",
    partially_paid: "text-sky-700",
    paid: "text-emerald-700",
    cancelled: "text-slate-400 line-through",
    overdue: "text-red-700",
  };
  return map[status] || "text-slate-500";
}

/** RGB text color for simple status label in PDF. */
export function statusPdfTextColor(status: string): [number, number, number] {
  const s = status.toLowerCase();
  if (s === "paid") return [21, 128, 61];
  if (s === "partially_paid" || s === "partial") return [29, 78, 216];
  if (s === "overdue") return [185, 28, 28];
  if (s === "cancelled") return [100, 116, 139];
  return [52, 52, 52];
}

/** Solid fill for status pill in PDF (white label text on top). */
export function statusPdfPillFill(status: string): [number, number, number] {
  const s = status.toLowerCase();
  if (s === "paid") return [22, 163, 74];
  if (s === "partially_paid" || s === "partial") return [37, 99, 235];
  if (s === "overdue") return [220, 38, 38];
  if (s === "cancelled") return [148, 163, 184];
  return [71, 85, 105];
}

/** Tailwind classes for status chips (light invoice surface + dark dashboard). */
export function statusBadgeClassLight(status: Invoice["status"]): string {
  const map: Record<Invoice["status"], string> = {
    draft: "border border-slate-300/80 bg-slate-50 text-slate-950 shadow-sm",
    generated: "border border-blue-300/80 bg-blue-50 text-blue-950 shadow-sm",
    sent: "border border-indigo-300/80 bg-indigo-50 text-indigo-950 shadow-sm",
    viewed: "border border-purple-300/80 bg-purple-50 text-purple-950 shadow-sm",
    partially_paid: "border border-sky-300/80 bg-sky-50 text-sky-950 shadow-sm",
    paid: "border border-emerald-300/80 bg-emerald-50 text-emerald-950 shadow-sm",
    cancelled: "border border-slate-200/80 bg-slate-100 text-slate-400 shadow-sm line-through",
    overdue: "border border-red-300/80 bg-red-50 text-red-950 shadow-sm",
  };
  return map[status] || map.draft;
}

export function statusBadgeClassDark(status: Invoice["status"]): string {
  const map: Record<Invoice["status"], string> = {
    draft: "border border-slate-400/40 bg-slate-500/20 text-slate-50 shadow-sm",
    generated: "border border-blue-400/40 bg-blue-500/20 text-blue-50 shadow-sm",
    sent: "border border-indigo-400/40 bg-indigo-500/20 text-indigo-50 shadow-sm",
    viewed: "border border-purple-400/40 bg-purple-500/20 text-purple-50 shadow-sm",
    partially_paid: "border border-sky-400/40 bg-sky-500/20 text-sky-50 shadow-sm",
    paid: "border border-emerald-400/40 bg-emerald-500/20 text-emerald-50 shadow-sm",
    cancelled:
      "border border-slate-400/20 bg-slate-500/10 text-slate-400/50 shadow-sm line-through",
    overdue: "border border-red-400/40 bg-red-500/20 text-red-50 shadow-sm",
  };
  return map[status] || map.draft;
}
