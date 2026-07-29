// Run: node scripts/amo-screenshots.mjs
// Regenerates the AMO listing screenshots that show browser-identifying
// content, using REAL Firefox (Playwright) so the ticket modal's Info tab
// honestly reads "Firefox …" instead of the Chrome string baked into the
// original Chrome Web Store captures. Scenes mirror store-assets
// screenshot-3 (Info tab) and screenshot-4 (Network tab).
import { firefox } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = join(ROOT, "website", "public");
const OUT_DIR = join(ROOT, "releases", "store-assets");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4178, r));

const browser = await firefox.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.goto("http://localhost:4178/try.html", { waitUntil: "load" });
  await page.waitForTimeout(1800); // SDK init + toolbar mount

  // Capture is idle-until-armed: arm event tracking from the toolbar first,
  // trigger the demo bug (Place order → POST /api/orders 404), then stop —
  // stopping finalizes the session and auto-opens the ticket modal.
  await page.click("#tracebug-toolbar-track-btn");
  await page.waitForTimeout(800);
  await page.click("#orderBtn");
  await page.waitForTimeout(1800);
  await page.click("#tracebug-toolbar-track-btn");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await page.waitForTimeout(1500); // tabs + auto-fill settle

  // Scene 3 — Info tab (default): shows BROWSER: Firefox …
  await page.screenshot({ path: join(OUT_DIR, "firefox-screenshot-3.jpg"), type: "jpeg", quality: 90 });
  console.log("[OK] firefox-screenshot-3.jpg (ticket modal — Info tab)");

  // Scene 4 — Network tab with the failing request.
  await page.click('#tracebug-quick-bug-modal [data-tab="network"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, "firefox-screenshot-4.jpg"), type: "jpeg", quality: 90 });
  console.log("[OK] firefox-screenshot-4.jpg (ticket modal — Network tab)");
} finally {
  await browser.close();
  server.close();
}
