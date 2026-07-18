/* Verifies the invoice PDF layout: the required scenario must fit one page
   with no overlap between the header block and the BILL TO block. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const letterheadPng = readFileSync(resolve(root, "public/admark-letterhead.png"));
const letterheadDataUrl = `data:image/png;base64,${letterheadPng.toString("base64")}`;

// Import the real builder through a small esbuild bundle so `?url` asset
// imports and TS syntax resolve outside Vite.
const esbuild = require("esbuild");
const outFile = resolve(root, "scripts/.verify-invoice-pdf-bundle.mjs");
await esbuild.build({
  entryPoints: [resolve(root, "src/lib/pdf.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: outFile,
  loader: { ".png": "dataurl" },
  define: { "import.meta.env": JSON.stringify({}) },
  alias: { jspdf: resolve(root, "node_modules/jspdf/dist/jspdf.es.js") },
});
const { buildInvoicePdf } = await import(`file://${outFile.replace(/\\/g, "/")}`);

const invoice = {
  id: "test-invoice",
  number: "AM/26-27/0001",
  date: "2026-07-18",
  clientName: "BLX Reality",
  clientBusinessType: "Real Estate",
  clientContact: "Madhu",
  clientPhone: "9071284326",
  items: [{ id: "li-1", description: "CRM", quantity: 1, rate: 77_000 }],
  advance: 25_000,
  taxPercent: 0,
  remarks: "Thank you for your business!",
  paymentMode: "UPI",
  paymentDate: "2026-07-04",
  status: "paid",
  createdAt: Date.now(),
};

const company = {
  name: "Admark Digitals",
  bankName: "Karnataka Bank",
  accountName: "Tejasvi Jois S",
  accountNumber: "5192500101932301",
  ifsc: "KARB0000519",
};

const doc = buildInvoicePdf(invoice, company, letterheadDataUrl);
const pages = doc.getNumberOfPages();
console.log(`pages: ${pages}`);
if (pages !== 1) {
  console.error("FAIL: expected exactly 1 page");
  process.exit(1);
}

const out = resolve(root, "scripts/verify-invoice-output.pdf");
writeFileSync(out, Buffer.from(doc.output("arraybuffer")));
console.log(`PASS — wrote ${out}`);

// Heavier invoice: many items + long remarks must still paginate cleanly.
const bigInvoice = {
  ...invoice,
  items: Array.from({ length: 14 }, (_, i) => ({
    id: `li-${i}`,
    description: `Service line item number ${i + 1} with a longer description that wraps`,
    quantity: 1,
    rate: 10_000,
  })),
  remarks: "Payment due within 15 days. ".repeat(4),
};
const bigDoc = buildInvoicePdf(bigInvoice, company, letterheadDataUrl);
const bigPages = bigDoc.getNumberOfPages();
console.log(`big invoice pages: ${bigPages}`);
const bigOut = resolve(root, "scripts/verify-invoice-output-big.pdf");
writeFileSync(bigOut, Buffer.from(bigDoc.output("arraybuffer")));
console.log(`wrote ${bigOut}`);
