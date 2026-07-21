// Run: node e2e/marketing-screenshots.mjs
// Generates real product screenshots into D:/tmp/tracebug-shots/:
//   1) The exported .html report viewer (replay + each evidence tab)
//   2) try.html with the Quick Bug modal open (current SDK build, incl.
//      the redaction summary + More menu with the .zip export)
// Uses Playwright's bundled Chromium. 1440x900 viewport, deviceScaleFactor 2
// so the shots stay sharp when dev.to scales them down.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";

const OUT = "D:/tmp/tracebug-shots";
mkdirSync(OUT, { recursive: true });

const REPORT = "D:/Project/TraceBug-ai/demo-bug-reports/tracebug-replay-93e6615d-2026-07-19T08-07-00.html";
const PUBLIC_DIR = "D:/Project/TraceBug-ai/website/public";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

// ── Part 1: the exported report viewer ────────────────────────────────────
console.log("Part 1: report viewer…");
await page.goto("file:///" + REPORT.replace(/\\/g, "/"), { waitUntil: "load" });
// Give the viewer time to inflate the gzipped rrweb stream and mount the player.
await page.waitForTimeout(4000);

await page.screenshot({ path: join(OUT, "1-report-replay.png") });
console.log("  saved 1-report-replay.png");

for (const tab of ["console", "network", "actions", "events"]) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `1-report-${tab}.png`) });
  console.log(`  saved 1-report-${tab}.png`);
}

// ── Part 2: try.html + Quick Bug modal ────────────────────────────────────
console.log("Part 2: try.html sandbox…");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webm": "video/webm", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const path = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
  res.end(readFileSync(path));
});
await new Promise(r => server.listen(4173, r));

await page.goto("http://localhost:4173/try.html", { waitUntil: "load" });
await page.waitForTimeout(2000);
await page.screenshot({ path: join(OUT, "2-try-page.png") });
console.log("  saved 2-try-page.png");

// Start a real recording session FIRST — collectors and rrweb only capture
// while a session is active. Then interact so the session has evidence:
// page-button clicks, a sensitive-looking request (URL-param redaction),
// and a console error carrying a token (capture-time scrub → 🛡 summary).
await page.evaluate(() => window.TraceBug.startRecording());
await page.waitForTimeout(500);
// Click ONLY the demo page's own buttons — blind-clicking all <button>s hits
// TraceBug's toolbar Stop button and ends the session (learned the hard way).
for (const sel of ["#applyBtn", "#orderBtn"]) {
  try { await page.click(sel, { timeout: 2000 }); } catch {}
  await page.waitForTimeout(600);
}
await page.evaluate(() => {
  try { fetch("/api/checkout?token=secret_abc123&user=42").catch(() => {}); } catch {}
  try { console.error("Payment failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV"); } catch {}
  try { console.warn("cart state stale after coupon apply"); } catch {}
});
await page.waitForTimeout(2000);

// Open the Quick Bug modal (Ctrl+Shift+B).
await page.keyboard.press("Control+Shift+KeyB");
try {
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await page.waitForTimeout(3000); // replay mount + screenshot strip

  // Add a page screenshot so the preview area isn't empty. The button opens
  // region-select mode (modal hides, page shows "Drag to select an area") —
  // perform the drag over the checkout card, then the modal re-mounts.
  const addShot = await page.$('#tracebug-quick-bug-modal [data-action="add-screenshot"]');
  if (addShot) {
    await addShot.click();
    await page.waitForTimeout(1000);
    await page.mouse.move(340, 190);
    await page.mouse.down();
    await page.mouse.move(1100, 600, { steps: 10 });
    await page.mouse.up();
    await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 10000 });
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: join(OUT, "3-quick-bug-modal.png") });
  console.log("  saved 3-quick-bug-modal.png");

  // Open the More menu so the .zip export item is visible. Fresh selector
  // clicks — element handles from before the re-mount are stale.
  await page.click('#tracebug-quick-bug-modal [data-action="more-toggle"]', { timeout: 5000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, "4-modal-more-menu.png") });
  console.log("  saved 4-modal-more-menu.png");
  await page.click('#tracebug-quick-bug-modal [data-action="more-toggle"]'); // toggle closed
  await page.waitForTimeout(300);

  // Export the .html from THIS session — a current-build report (Privacy
  // row, warn/info timeline) beats the checked-in demo file.
  {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.click('#tracebug-quick-bug-modal [data-action="export-replay"]'),
    ]);
    const fresh = join(OUT, "fresh-report.html");
    await download.saveAs(fresh);
    console.log("  exported fresh-report.html");

    // Part 3: screenshot the freshly exported report in the viewer.
    console.log("Part 3: fresh report viewer…");
    await page.goto("file:///" + fresh.replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: join(OUT, "5-fresh-report-replay.png") });
    console.log("  saved 5-fresh-report-replay.png");
    for (const tab of ["console", "network", "events"]) {
      await page.click(`[data-tab="${tab}"]`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `5-fresh-report-${tab}.png`) });
      console.log(`  saved 5-fresh-report-${tab}.png`);
    }
  }
} catch (e) {
  console.log("  Quick Bug flow failed:", e.message);
  await page.screenshot({ path: join(OUT, "3-quick-bug-FAILED.png") });
}

server.close();
await browser.close();
console.log("Done → " + OUT);
