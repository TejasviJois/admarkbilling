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

// Trim the uniform dark background down to the logo content (mark + wordmark),
// then keep only the top portion where the "AD" mark sits.
const trimmed = await sharp(source).trim({ threshold: 25 }).toBuffer();
const tmeta = await sharp(trimmed).metadata();

const markHeight = Math.round(tmeta.height * 0.66);
const icon = sharp(trimmed).extract({
  left: 0,
  top: 0,
  width: tmeta.width,
  height: markHeight,
});

const outputs = [
  { file: "favicon.png", size: 48 },
  { file: "favicon-32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  const out = path.join(publicDir, file);
  // Small padding so the mark isn't glued to the icon edge.
  const inner = Math.round(size * 0.86);
  await icon
    .clone()
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 8, g: 9, b: 18, alpha: 1 },
    })
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: { r: 8, g: 9, b: 18, alpha: 1 },
    })
    .png()
    .toFile(out);
  console.log(`Wrote ${out} (${size}x${size})`);
}
