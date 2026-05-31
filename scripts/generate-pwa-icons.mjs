#!/usr/bin/env node
/**
 * Rasterize public/favicon.svg into the PNG icon sizes a PWA needs.
 *
 * iOS uses <link rel="apple-touch-icon"> with a real PNG (180x180); it
 * ignores manifest icons for the home-screen glyph. Android/desktop use the
 * 192/512 manifest icons (incl. a maskable variant with safe-area padding).
 *
 * We render with the Playwright Chromium that's already installed for e2e —
 * no new runtime dependency. Run: node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const svgPath = path.join(repoRoot, "public/favicon.svg");
const outDir = path.join(repoRoot, "public/icons");
mkdirSync(outDir, { recursive: true });

const svg = readFileSync(svgPath, "utf8");
const svgB64 = Buffer.from(svg).toString("base64");
const svgUrl = `data:image/svg+xml;base64,${svgB64}`;

// [filename, size, maskable]. Maskable icons need ~10% safe-area padding so
// Android's circular/squircle mask doesn't clip the mark; our source already
// has a rounded card so we pad it on a matching background.
const BG = "#FBF6E2";
const targets = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-192-maskable.png", 192, true],
  ["icon-512-maskable.png", 512, true],
  ["apple-touch-icon.png", 180, false],
];

const browser = await chromium.launch();
try {
  for (const [name, size, maskable] of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const pad = maskable ? Math.round(size * 0.1) : 0;
    const inner = size - pad * 2;
    await page.setContent(
      `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px;background:${BG};display:flex;align-items:center;justify-content:center">` +
        `<img src="${svgUrl}" width="${inner}" height="${inner}" style="display:block"/>` +
        `</body></html>`,
      { waitUntil: "networkidle" },
    );
    await page.screenshot({ path: path.join(outDir, name), type: "png", clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`  wrote public/icons/${name} (${size}x${size}${maskable ? ", maskable" : ""})`);
  }
} finally {
  await browser.close();
}
console.log("PWA icons generated.");
