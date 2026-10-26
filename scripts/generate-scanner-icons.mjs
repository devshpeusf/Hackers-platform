import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// Deterministic derivatives of the approved pixel-art mascot. No logo distortion.
const mascot = await sharp(fileURLToPath(new URL("../public/hackjam-mascot.png", import.meta.url))).trim().png().toBuffer();
const { width, height } = await sharp(mascot).metadata();
const output = new URL("../public/scanner-icons/", import.meta.url);
await mkdir(output, { recursive: true });

for (const [name, size, maskable] of [
  ["icon-192.png", 192, false], ["icon-512.png", 512, false],
  ["maskable-192.png", 192, true], ["maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
]) {
  // The maskable subject's entire bounding box fits inside the 80%-diameter
  // safe circle. Normal icons use a larger subject with breathing room.
  const scale = maskable ? size * 0.76 / Math.hypot(width, height) : size * 0.84 / Math.max(width, height);
  const resized = await sharp(mascot).resize({ width: Math.floor(width * scale), height: Math.floor(height * scale), kernel: "nearest" }).toBuffer({ resolveWithObject: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: "#07060d" } })
    .composite([{ input: resized.data, left: Math.floor((size - resized.info.width) / 2), top: Math.floor((size - resized.info.height) / 2) }])
    .png().toFile(fileURLToPath(new URL(name, output)));
}
console.log("Generated five scanner icons from the existing HackJam mascot.");
