import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DEFAULT_LETTERHEAD_URL,
  DEFAULT_PUBLIC_LOGO_PATH,
  DEFAULT_PUBLIC_LOGO_URL,
} from "./constants";
import type { CompanySettings, Invoice } from "./types";
import { computeTotals, formatINRForPdf, lineAmount } from "./invoice-calc";
import { rupeesInWords } from "./number-to-words";
import { statusPdfTextColor } from "./invoice-status";

/** Letterhead layout — matches `src/assets/admark-letterhead.png` on A4. */
const LETTERHEAD_HEADER_H = 195;
const LETTERHEAD_FOOTER_H = 115;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Failed to read image"));
    r.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blobToDataUrl(blob);
  } catch {
    return null;
  }
}

/** jsPDF needs a data URL; fetch default `/public` logo when none is stored. */
async function companyWithResolvedLogoForPdf(c: CompanySettings): Promise<CompanySettings> {
  const existing = c.logoDataUrl?.trim();
  if (existing?.startsWith("data:image")) {
    return c;
  }
  const url = existing || DEFAULT_PUBLIC_LOGO_URL;
  const urls = [url, DEFAULT_PUBLIC_LOGO_PATH];
  for (const tryUrl of urls) {
    const dataUrl = await fetchImageDataUrl(tryUrl);
    if (dataUrl) return { ...c, logoDataUrl: dataUrl };
  }
  return c;
}

export async function resolveLetterheadForPdf(): Promise<string | null> {
  return fetchImageDataUrl(DEFAULT_LETTERHEAD_URL);
}

const RED: [number, number, number] = [196, 30, 38];
const INK: [number, number, number] = [12, 12, 12];
const LINE: [number, number, number] = [200, 200, 200];
const SUBTLE: [number, number, number] = [52, 52, 52];
const PAYABLE_BG: [number, number, number] = [255, 246, 246];
const BANK_FILL: [number, number, number] = [252, 252, 252];
const BANK_BORDER: [number, number, number] = [228, 228, 228];

function jsPdfImageFormatFromDataUrl(src: string): "PNG" | "JPEG" | "WEBP" {
  const head = src.slice(0, 48).toLowerCase();
  if (head.includes("image/jpeg") || head.includes("image/jpg")) return "JPEG";
  if (head.includes("image/webp")) return "WEBP";
  return "PNG";
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function paintLetterhead(doc: jsPDF, letterheadDataUrl: string, w: number, h: number) {
  try {
    doc.addImage(letterheadDataUrl, "PNG", 0, 0, w, h);
  } catch {
    /* ignore */
  }
}

export function buildInvoicePdf(
  invoice: Invoice,
  company: CompanySettings,
  letterheadDataUrl?: string | null,
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const useLetterhead = Boolean(letterheadDataUrl);

  if (useLetterhead && letterheadDataUrl) {
    paintLetterhead(doc, letterheadDataUrl, W, H);
  } else {
    doc.setFillColor(...RED);
    doc.rect(0, 0, W, 6, "F");
  }

  const headerTop = useLetterhead ? LETTERHEAD_HEADER_H - 8 : 34;
  const contentBottom = useLetterhead ? H - LETTERHEAD_FOOTER_H - 8 : H - 40;

  if (!useLetterhead) {
    const logoW = 118;
    const logoH = 46;
    const nameX = M + (company.logoDataUrl ? logoW + 14 : 0);

    if (company.logoDataUrl) {
      try {
        const fmt = jsPdfImageFormatFromDataUrl(company.logoDataUrl);
        doc.addImage(company.logoDataUrl, fmt, M, headerTop - 4, logoW, logoH);
      } catch {
        /* ignore */
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...INK);
    doc.text(company.name || "Admark", nameX, headerTop + 20);

    if (company.tagline) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...SUBTLE);
      doc.text(company.tagline, nameX, headerTop + 42);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(useLetterhead ? 32 : 36);
  doc.setTextColor(...RED);
  doc.text("INVOICE", M, headerTop + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text(invoice.number, M, headerTop + 36);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Date: ${formatDate(invoice.date)}`, M, headerTop + 50);

  // The header block ends at the date baseline — everything below is computed
  // from it so the BILL TO block can never collide with the number/date lines.
  const headerBottom = headerTop + 50;
  let cursorY = headerBottom + 52;

  if (!useLetterhead) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const companyLines = [
      company.address,
      company.email && `Email: ${company.email}`,
      company.phone && `Phone: ${company.phone}`,
      company.pan && `PAN: ${company.pan}`,
      company.gstin && `GSTIN: ${company.gstin}`,
    ].filter(Boolean) as string[];
    companyLines.forEach((l, i) => doc.text(l, M, cursorY + i * 12));
    cursorY += companyLines.length * 12 + 32;
    doc.setDrawColor(...LINE);
    doc.line(M, cursorY, W - M, cursorY);
    cursorY += 30;
  } else {
    cursorY = headerBottom + 24;
  }

  const billBlockTop = cursorY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text("BILL TO", M, billBlockTop);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(invoice.clientName || "—", M, billBlockTop + 22);

  let clientDetailsStartY = billBlockTop + 44;
  if (invoice.clientBusinessType) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(`Type of business: ${invoice.clientBusinessType}`, M, billBlockTop + 40);
    clientDetailsStartY = billBlockTop + 58;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  const clientLines = [
    invoice.clientAddress,
    invoice.clientContact,
    invoice.clientPhone,
    invoice.clientEmail,
    invoice.clientGstin && `GSTIN: ${invoice.clientGstin}`,
  ].filter(Boolean) as string[];
  clientLines.forEach((l, i) => doc.text(String(l), M, clientDetailsStartY + i * 14));

  const metaX = W / 2 + 24;
  let metaY = billBlockTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text("DETAILS", metaX, metaY);
  metaY += 22;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const metaRows: Array<[string, string]> = [
    ["Invoice No.", invoice.number],
    ["Date", formatDate(invoice.date)],
    invoice.paymentMode ? ["Payment Mode", invoice.paymentMode] : null,
    invoice.paymentDate ? ["Payment Date", formatDate(invoice.paymentDate)] : null,
    invoice.paymentTerms ? ["Terms", invoice.paymentTerms] : null,
    ["Status", invoice.status.toUpperCase()],
  ].filter(Boolean) as Array<[string, string]>;
  metaRows.forEach(([k, v]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(k, metaX, metaY);
    if (k === "Status") {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...statusPdfTextColor(invoice.status));
      doc.text(String(v), W - M, metaY, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...INK);
      doc.text(String(v), W - M, metaY, { align: "right" });
    }
    metaY += 16;
  });

  const tableTop = Math.max(clientDetailsStartY + clientLines.length * 14 + 20, metaY + 14);

  autoTable(doc, {
    startY: tableTop,
    head: [["#", "Description", "Qty", "Rate", "Amount"]],
    body: invoice.items.map((it, i) => [
      String(i + 1),
      it.description || "—",
      String(it.quantity || 0),
      formatINRForPdf(Number(it.rate) || 0),
      formatINRForPdf(lineAmount(it)),
    ]),
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 7, lineColor: LINE, textColor: INK, fontStyle: "normal" },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 30, halign: "center", fontStyle: "bold" },
      1: { halign: "left", fontStyle: "normal" },
      2: { cellWidth: 50, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 90, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 100, halign: "right", fontStyle: "bold" },
    },
    margin: {
      left: M,
      right: M,
      top: useLetterhead ? LETTERHEAD_HEADER_H + 16 : 40,
      bottom: useLetterhead ? LETTERHEAD_FOOTER_H + 16 : 40,
    },
    // Paint the letterhead *before* rows are drawn on continuation pages,
    // otherwise the full-page image covers the table content.
    willDrawPage: (data) => {
      if (useLetterhead && letterheadDataUrl && data.pageNumber > 1) {
        paintLetterhead(doc, letterheadDataUrl, W, H);
      }
    },
    pageBreak: "auto",
    rowPageBreak: "avoid",
  });

  const totals = computeTotals(invoice);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ty = (doc as any).lastAutoTable.finalY + 16;

  const tx = W - M - 240;
  const rowTotals = (label: string, value: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    doc.text(label, tx, ty);
    doc.text(value, W - M, ty, { align: "right" });
    ty += 13;
  };

  rowTotals("Subtotal", formatINRForPdf(totals.subtotal));
  if (totals.tax > 0) rowTotals(`Tax (${invoice.taxPercent}%)`, formatINRForPdf(totals.tax));
  if (totals.advance > 0) rowTotals("Advance Received", `- ${formatINRForPdf(totals.advance)}`);

  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(1);
  doc.line(tx, ty + 2, W - M, ty + 2);
  doc.setLineWidth(0.2);
  doc.setDrawColor(...LINE);
  ty += 14;

  const payLabel = "Amount Payable";
  const payVal = formatINRForPdf(totals.payable);
  const boxPadX = 12;
  const boxH = 34;
  const boxTop = ty;
  const boxW = W - M - tx + boxPadX * 2;
  doc.setFillColor(...PAYABLE_BG);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.85);
  doc.roundedRect(tx - boxPadX, boxTop, boxW, boxH, 6, 6, "FD");
  doc.setLineWidth(0.2);
  doc.setDrawColor(...LINE);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text(payLabel, tx, boxTop + 14);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...RED);
  doc.text(payVal, W - M - 10, boxTop + 27, { align: "right" });
  ty = boxTop + boxH + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  const words = `Amount in words: ${rupeesInWords(totals.payable)}`;
  const wrapped = doc.splitTextToSize(words, W - 2 * M);
  doc.text(wrapped, M, ty + 10);
  ty += 10 + wrapped.length * 11;

  if (invoice.remarks) {
    ty += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("Remarks", M, ty);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const r = doc.splitTextToSize(invoice.remarks, W - 2 * M);
    doc.text(r, M, ty + 14);
    ty += 14 + r.length * 11;
  }

  const bankLines = [
    company.bankName && `Bank: ${company.bankName}`,
    company.accountName && `Account Name: ${company.accountName}`,
    company.accountNumber && `A/C Number: ${company.accountNumber}`,
    company.ifsc && `IFSC: ${company.ifsc}`,
    company.branch && `Branch: ${company.branch}`,
    company.upi && `UPI: ${company.upi}`,
  ].filter(Boolean) as string[];

  const bankPad = 12;
  const bankLineGap = 12;
  const bankBoxH = 24 + bankLines.length * bankLineGap + 10;
  // Signature column: optional image, then rule + two label lines.
  const sigImageH = company.signatureDataUrl ? 48 : 0;
  const sigRuleOffset = sigImageH > 0 ? sigImageH + 6 : 44;
  const sigBlockH = sigRuleOffset + 27;
  const footerBlockH = Math.max(bankBoxH, sigBlockH) + 8;

  let footerTop = ty + 16;
  if (footerTop + footerBlockH > contentBottom) {
    doc.addPage();
    if (useLetterhead && letterheadDataUrl) {
      paintLetterhead(doc, letterheadDataUrl, W, H);
    }
    footerTop = useLetterhead ? LETTERHEAD_HEADER_H + 16 : M + 40;
  } else {
    // Pin the footer block to the bottom of the content area, like the preview.
    footerTop = Math.max(footerTop, contentBottom - footerBlockH);
  }

  const bankBoxY = footerTop + 8;
  const bankBoxW = W * 0.48;

  if (!useLetterhead) {
    doc.setDrawColor(...LINE);
    doc.line(M, footerTop, W - M, footerTop);
  }

  doc.setFillColor(...BANK_FILL);
  doc.setDrawColor(...BANK_BORDER);
  doc.roundedRect(M, bankBoxY, bankBoxW, bankBoxH, 5, 5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...RED);
  doc.text("BANK DETAILS", M + bankPad, bankBoxY + 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  bankLines.forEach((l, i) => doc.text(l, M + bankPad, bankBoxY + 33 + i * bankLineGap));

  const sigX = W - M - 180;
  const sigY = bankBoxY + 4;
  if (company.signatureDataUrl) {
    try {
      const fmt = jsPdfImageFormatFromDataUrl(company.signatureDataUrl);
      doc.addImage(company.signatureDataUrl, fmt, sigX, sigY, 160, sigImageH);
    } catch {
      /* ignore */
    }
  }
  const sigLineY = sigY + sigRuleOffset;
  doc.setDrawColor(...INK);
  doc.line(sigX, sigLineY, W - M, sigLineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(`For ${company.name}`, W - M, sigLineY + 13, { align: "right" });
  doc.text(company.authorizedName || "Authorized Signatory", W - M, sigLineY + 25, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(95, 95, 95);
  doc.text("This is a computer generated invoice.", W / 2, footerTop - 5, {
    align: "center",
  });

  if (!useLetterhead) {
    doc.setFillColor(...RED);
    doc.rect(0, H - 4, W, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text("We appreciate the opportunity to work with you.", M, H - 30);
    doc.text("For queries, contact us anytime.", M, H - 18);
    doc.text(`Generated ${new Date().toLocaleDateString("en-IN")}`, W - M, H - 18, {
      align: "right",
    });
  }

  return doc;
}

export async function downloadInvoicePdf(
  invoice: Invoice,
  company: CompanySettings,
): Promise<void> {
  const [c, letterhead] = await Promise.all([
    companyWithResolvedLogoForPdf(company),
    resolveLetterheadForPdf(),
  ]);
  const doc = buildInvoicePdf(invoice, c, letterhead);
  const safe = invoice.number.replace(/[\s/]+/g, "_");
  doc.save(`${safe}.pdf`);
}
