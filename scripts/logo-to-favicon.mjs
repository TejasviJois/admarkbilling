import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = path.join(root, "public/admark-default-logo.png");
const publicDir = path.join(root, "public");

if (!fs.existsSync(source)) {
  console.error("Missing logo:", source);
  process.exit(1);
}

const meta = await sharp(source).metadata();
const cropHeight = Math.round(meta.height * 0.58);

const icon = sharp(source).extract({
  left: 0,
  top: 0,
  width: meta.width,
  height: cropHeight,
});

const outputs = [
  { file: "favicon.png", size: 48 },
  { file: "favicon-32.png", size: 32 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of outputs) {
  const out = path.join(publicDir, file);
  await icon
    .clone()
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    })
    .png()
    .toFile(out);
  console.log(`Wrote ${out} (${size}x${size})`);
}
