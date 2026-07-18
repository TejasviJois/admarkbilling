import jsPDF from "jspdf";
import type { CompanySettings, Invoice, Payment } from "./types";
import { computeTotals, formatINRForPdf } from "./invoice-calc";
import { rupeesInWords } from "./number-to-words";
import { resolveLetterheadForPdf } from "./pdf";

const RED: [number, number, number] = [196, 30, 38];
const INK: [number, number, number] = [12, 12, 12];
const MUTED: [number, number, number] = [80, 80, 80];
const LINE: [number, number, number] = [218, 218, 218];
const HEADER_H = 195;
const FOOTER_H = 115;

type ReceiptOptions = {
  invoice: Invoice;
  payment: Payment;
  invoicePayments: Payment[];
  company: CompanySettings;
  isInvoiceAdvance?: boolean;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function receiptNumber(invoice: Invoice, payment: Payment, isAdvance: boolean): string {
  const suffix = isAdvance ? "ADV" : payment.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase();
  return `RCPT/${invoice.number}/${suffix}`;
}

function paymentMethodLabel(method: string): string {
  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function receiptTotals({
  invoice,
  payment,
  invoicePayments,
  isInvoiceAdvance = false,
}: Pick<ReceiptOptions, "invoice" | "payment" | "invoicePayments" | "isInvoiceAdvance">) {
  const invoiceTotal = computeTotals(invoice).total;
  const advance = Number(invoice.advance) || 0;
  if (isInvoiceAdvance) {
    return {
      invoiceTotal,
      previouslyReceived: 0,
      receivedNow: advance,
      totalReceived: advance,
      outstanding: Math.max(invoiceTotal - advance, 0),
    };
  }

  const ordered = [...invoicePayments].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const selectedIndex = ordered.findIndex((entry) => entry.id === payment.id);
  const included = selectedIndex >= 0 ? ordered.slice(0, selectedIndex + 1) : ordered;
  const loggedTotal = included.reduce((sum, entry) => sum + entry.amount, 0);
  const totalReceived = advance + loggedTotal;

  return {
    invoiceTotal,
    previouslyReceived: totalReceived - payment.amount,
    receivedNow: payment.amount,
    totalReceived,
    outstanding: Math.max(invoiceTotal - totalReceived, 0),
  };
}

async function buildPaymentReceiptPdf(options: ReceiptOptions): Promise<jsPDF> {
  const { invoice, payment, company, isInvoiceAdvance = false } = options;
  const totals = receiptTotals(options);
  const letterhead = await resolveLetterheadForPdf();
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 48;

  if (letterhead) {
    doc.addImage(letterhead, "PNG", 0, 0, width, height);
  } else {
    doc.setFillColor(...RED);
    doc.rect(0, 0, width, 6, "F");
  }

  const top = letterhead ? HEADER_H + 8 : 58;
  doc.setTextColor(...RED);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(payment.amount < 0 ? "REFUND RECEIPT" : "PAYMENT RECEIPT", margin, top);

  const number = receiptNumber(invoice, payment, isInvoiceAdvance);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.text(number, margin, top + 22);
  doc.text(`Date: ${formatDate(payment.date)}`, width - margin, top + 22, { align: "right" });

  let y = top + 58;
  doc.setDrawColor(...LINE);
  doc.line(margin, y, width - margin, y);
  y += 30;

  doc.setTextColor(...RED);
  doc.setFontSize(9);
  doc.text("RECEIVED FROM", margin, y);
  doc.text("AGAINST INVOICE", width / 2 + 20, y);

  doc.setTextColor(...INK);
  doc.setFontSize(13);
  doc.text(invoice.clientName || "—", margin, y + 22);
  doc.setFontSize(10);
  doc.text(invoice.number, width / 2 + 20, y + 22);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  if (invoice.clientContact) doc.text(invoice.clientContact, margin, y + 39);
  doc.text(`Invoice date: ${formatDate(invoice.date)}`, width / 2 + 20, y + 39);
  y += 74;

  doc.setFillColor(252, 252, 252);
  doc.setDrawColor(...LINE);
  doc.roundedRect(margin, y, width - margin * 2, 88, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.text("AMOUNT RECEIVED", margin + 18, y + 24);
  doc.setTextColor(...RED);
  doc.setFontSize(25);
  doc.text(formatINRForPdf(Math.abs(totals.receivedNow)), margin + 18, y + 57);
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(`Payment method: ${paymentMethodLabel(payment.method)}`, width / 2 + 10, y + 27);
  if (payment.referenceNumber) {
    doc.text(`Reference: ${payment.referenceNumber}`, width / 2 + 10, y + 45);
  }
  if (payment.transactionId) {
    doc.text(`Transaction ID: ${payment.transactionId}`, width / 2 + 10, y + 63);
  }
  y += 120;

  const rows: Array<[string, number]> = [
    ["Original invoice total", totals.invoiceTotal],
    ["Previously received", totals.previouslyReceived],
    ["Received with this receipt", totals.receivedNow],
    ["Total received to date", totals.totalReceived],
    ["Remaining balance", totals.outstanding],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + index * 25;
    doc.setFont("helvetica", index >= 3 ? "bold" : "normal");
    const rowColor = index === 4 ? RED : INK;
    doc.setTextColor(...rowColor);
    doc.setFontSize(index === 4 ? 11 : 10);
    doc.text(label, margin, rowY);
    doc.text(formatINRForPdf(value), width - margin, rowY, { align: "right" });
    if (index < rows.length - 1) {
      doc.setDrawColor(...LINE);
      doc.line(margin, rowY + 9, width - margin, rowY + 9);
    }
  });
  y += rows.length * 25 + 20;

  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const words = `Amount in words: ${rupeesInWords(Math.abs(totals.receivedNow))}`;
  doc.text(doc.splitTextToSize(words, width - margin * 2), margin, y);

  if (payment.notes) {
    y += 30;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text("Notes", margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(payment.notes, width - margin * 2), margin, y + 16);
  }

  const signatureY = height - FOOTER_H - 70;
  doc.setDrawColor(...INK);
  doc.line(width - margin - 180, signatureY, width - margin, signatureY);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(`For ${company.name}`, width - margin, signatureY + 17, { align: "right" });
  doc.text(company.authorizedName || "Authorized Signatory", width - margin, signatureY + 31, {
    align: "right",
  });

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text("This is a computer generated receipt.", width / 2, height - FOOTER_H - 30, {
    align: "center",
  });
  doc.text(
    "This receipt acknowledges the payment above and references the original invoice; it is not a new invoice.",
    width / 2,
    height - FOOTER_H - 18,
    { align: "center" },
  );

  return doc;
}

function receiptFileName(invoice: Invoice, payment: Payment, isAdvance: boolean): string {
  const invoiceNo = invoice.number.replace(/[^a-z0-9-]+/gi, "_");
  const suffix = isAdvance ? "advance" : payment.id.replace(/[^a-z0-9-]+/gi, "_");
  return `Receipt_${invoiceNo}_${suffix}.pdf`;
}

export async function downloadPaymentReceiptPdf(options: ReceiptOptions): Promise<void> {
  const doc = await buildPaymentReceiptPdf(options);
  doc.save(receiptFileName(options.invoice, options.payment, options.isInvoiceAdvance === true));
}

export async function sharePaymentReceiptPdf(options: ReceiptOptions): Promise<void> {
  const doc = await buildPaymentReceiptPdf(options);
  const file = new File(
    [doc.output("blob")],
    receiptFileName(options.invoice, options.payment, options.isInvoiceAdvance === true),
    { type: "application/pdf" },
  );

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        title: `Payment receipt — ${options.invoice.clientName}`,
        text: `Payment receipt against invoice ${options.invoice.number}`,
        files: [file],
      });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  doc.save(file.name);
}
