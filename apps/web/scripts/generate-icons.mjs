// Renders the favicons and PWA icons from public/brand/mark.svg. Run after changing the mark:
//   npm run icons -w apps/web
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const path = (relative) => fileURLToPath(new URL(`../${relative}`, import.meta.url));
const mark = path("public/brand/mark.svg");

/** The mark centered on a white square, with a margin so it survives rounded-corner masks. */
async function renderIcon(sizePx, out) {
  const inner = Math.round(sizePx * 0.75);
  const glyph = await sharp(mark, { density: 1200 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: sizePx, height: sizePx, channels: 4, background: "#ffffff" } })
    .composite([{ input: glyph, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path(out));
  console.log(`wrote ${out}`);
}

await mkdir(path("public/icons"), { recursive: true });
await copyFile(mark, path("app/icon.svg"));
console.log("wrote app/icon.svg");
await renderIcon(180, "app/apple-icon.png");
await renderIcon(192, "public/icons/icon-192.png");
await renderIcon(512, "public/icons/icon-512.png");
