// Run: node e2e/blur-tracking.e2e.mjs
// Verifies ELEMENT-LEVEL blur: click an element → CSS filter on the element
// itself (cannot lag behind scroll — it renders in the same paint) + tb-mask
// for the rrweb replay. Click again unblurs; Undo works; Cancel clears all.
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4177, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 520 } });

let failures = 0;
// Output only: counts every check, but stays quiet while they all pass. The
// moment one fails it flushes the run so far and streams the rest — a failing
// check is only legible next to the ones that got that far. `--verbose` prints
// everything from the start. Assertions, timeouts and order are untouched.
const VERBOSE = process.argv.includes("--verbose");
let passes = 0;
let _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++;
  else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;

const couponState = () => page.evaluate(() => {
  const el = document.getElementById("coupon");
  return {
    filter: getComputedStyle(el).filter,
    masked: el.classList.contains("tb-mask"),
    marked: el.hasAttribute("data-tb-blurred"),
  };
});

try {
  await page.goto("http://localhost:4177/try.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  // try.html deliberately does not load the SDK on page load any more (see
  // its own comment: loading it unconditionally would race the extension's
  // injected copy and lock the page into page mode) — the "No extension? Try
  // the in-page demo" button is what loads it now. Without this click
  // window.TraceBug stays undefined and every call below throws.
  await page.click("#inPageDemoBtn");
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.TraceBug.prepareRecording({ blurFirst: true }));
  await page.waitForTimeout(400);

  // Click the coupon field → blurred on the element itself.
  const c = await page.locator("#coupon").boundingBox();
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForTimeout(200);
  let s = await couponState();
  check("click blurs the element (CSS filter on the element)", s.filter.includes("blur"), s.filter);
  check("element text-masked for the rrweb replay (tb-mask)", s.masked);

  // Scroll fast — the blur is part of the element's own rendering, so it
  // must still be exactly on the element (no overlay to lag).
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(100);
  s = await couponState();
  check("still blurred after scrolling (same-paint, zero lag)", s.filter.includes("blur"));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  // Re-measure: clicking #inPageDemoBtn earlier left the page scrolled ~226px
  // (a pre-existing quirk of this demo page, unrelated to blur mode), so `c`
  // was captured at that offset. scrollTo(0, 0) moves the viewport but not
  // the element, so reusing the stale box here would click the wrong element
  // entirely — exactly what silently broke this check before.
  const cAfterScroll = await page.locator("#coupon").boundingBox();

  // Click again → unblur.
  await page.mouse.click(cAfterScroll.x + cAfterScroll.width / 2, cAfterScroll.y + cAfterScroll.height / 2);
  await page.waitForTimeout(200);
  s = await couponState();
  check("second click unblurs", !s.filter.includes("blur") && !s.masked, s.filter);

  // Blur two elements, Undo removes only the last.
  const btn = await page.locator("#orderBtn").boundingBox();
  await page.mouse.click(cAfterScroll.x + cAfterScroll.width / 2, cAfterScroll.y + cAfterScroll.height / 2);
  await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.waitForTimeout(200);
  const twoBlurred = await page.evaluate(() => document.querySelectorAll("[data-tb-blurred]").length);
  check("two elements blurred", twoBlurred === 2, String(twoBlurred));
  await page.click('#tracebug-record-armbar [data-tb-arm="undo"]');
  await page.waitForTimeout(200);
  const afterUndo = await page.evaluate(() => ({
    count: document.querySelectorAll("[data-tb-blurred]").length,
    couponStill: document.getElementById("coupon").hasAttribute("data-tb-blurred"),
  }));
  check("Undo removes only the last blur", afterUndo.count === 1 && afterUndo.couponStill, JSON.stringify(afterUndo));

  // Cancel clears everything.
  await page.click('#tracebug-record-armbar [data-tb-arm="cancel"]');
  await page.waitForTimeout(200);
  const cleared = await page.evaluate(() => ({
    blurred: document.querySelectorAll("[data-tb-blurred]").length,
    mode: window.TraceBugSDK.isBlurModeActive(),
    filter: getComputedStyle(document.getElementById("coupon")).filter,
  }));
  check("cancel unblurs everything and exits", cleared.blurred === 0 && !cleared.mode && !cleared.filter.includes("blur"), JSON.stringify(cleared));
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await browser.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
