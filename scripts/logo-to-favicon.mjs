import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.join(root, "public/admark-logo-2026.png");
const publicDir = path.join(root, "public");

if (!fs.existsSync(source)) {
  console.error("Missing logo:", source);
  process.exit(1);
}

const sourceMeta = await sharp(source).metadata();
const markW = Math.round(sourceMeta.width * (163 / 858));
const icon = sharp(source).extract({
  left: 0,
  top: 0,
  width: markW,
  height: sourceMeta.height,
});

const outputs = [
  { file: "favicon.png", size: 48 },
  { file: "favicon-32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  const out = path.join(publicDir, file);
  const pad = Math.round(size * 0.14);
  const innerSize = size - pad * 2;
  await icon
    .clone()
    .resize(innerSize, innerSize, {
      fit: "contain",
      background: { r: 14, g: 14, b: 20, alpha: 1 },
    })
    .flatten({ background: { r: 14, g: 14, b: 20 } })
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 14, g: 14, b: 20, alpha: 1 },
    })
    .png()
    .toFile(out);
  console.log(`Wrote ${out} (${size}x${size})`);
}
