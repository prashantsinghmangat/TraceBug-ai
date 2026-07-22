// Run: node e2e/pre-record.e2e.mjs
// Verifies the pre-recording flow on the live sandbox SDK:
//   prepareRecording({blurFirst}) → arming bar appears with blur mode on
//   → Cancel exits cleanly and clears boxes → countdown counts and resolves.
// (The actual getDisplayMedia recording needs a headful picker — out of scope.)
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";

const PUBLIC_DIR = "D:/Project/TraceBug-ai/website/public";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4176, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

try {
  await page.goto("http://localhost:4176/try.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  // Blur-first arming: bar + blur mode active.
  await page.evaluate(() => window.TraceBug.prepareRecording({ blurFirst: true }));
  await page.waitForTimeout(400);
  const armed = await page.evaluate(() => ({
    bar: !!document.getElementById("tracebug-record-armbar"),
    blurActive: window.TraceBugSDK.isBlurModeActive(),
  }));
  check("arming bar appears", armed.bar);
  check("blur mode active while armed", armed.blurActive);

  // Cancel: bar gone, blur mode off, no leftover boxes.
  await page.click('#tracebug-record-armbar [data-tb-arm="cancel"]');
  await page.waitForTimeout(300);
  const cancelled = await page.evaluate(() => ({
    bar: !!document.getElementById("tracebug-record-armbar"),
    blurActive: window.TraceBugSDK.isBlurModeActive(),
    blurred: document.querySelectorAll("[data-tb-blurred]").length,
  }));
  check("cancel removes the bar", !cancelled.bar);
  check("cancel exits blur mode", !cancelled.blurActive);
  check("cancel clears blurred elements", cancelled.blurred === 0);

  // Countdown: overlay shows a number, resolves, overlay gone.
  const t0 = Date.now();
  const during = await page.evaluate(() => {
    const p = window.TraceBugSDK.runRecordCountdown(2);
    return new Promise((resolve) => {
      setTimeout(() => {
        const el = document.getElementById("tracebug-record-countdown");
        const shown = el ? el.textContent : null;
        p.then(() => resolve({ shown, done: true, remains: !!document.getElementById("tracebug-record-countdown") }));
      }, 500);
    });
  });
  const elapsed = Date.now() - t0;
  check("countdown shows digits", /\d/.test(during.shown || ""), `showed "${during.shown}"`);
  check("countdown resolves and cleans up", during.done && !during.remains, `${elapsed}ms`);
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
