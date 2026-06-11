import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pdf } from "pdf-to-img";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const pdfPath = path.join(root, "src/assets/admark-letterhead.pdf");
const outPath = path.join(root, "src/assets/admark-letterhead.png");
const publicOut = path.join(root, "public/admark-letterhead.png");

const doc = await pdf(pdfPath, { scale: 2 });
let pageNum = 0;
for await (const image of doc) {
  pageNum += 1;
  if (pageNum === 1) {
    fs.writeFileSync(outPath, image);
    fs.writeFileSync(publicOut, image);
    console.log(`Wrote ${outPath} (${image.length} bytes)`);
    break;
  }
}
