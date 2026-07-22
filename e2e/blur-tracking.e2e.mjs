// Run: node e2e/blur-tracking.e2e.mjs
// Verifies ELEMENT-LEVEL blur: click an element → CSS filter on the element
// itself (cannot lag behind scroll — it renders in the same paint) + tb-mask
// for the rrweb replay. Click again unblurs; Undo works; Cancel clears all.
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
await new Promise((r) => server.listen(4177, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 520 } });

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

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

  // Click again → unblur.
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
  await page.waitForTimeout(200);
  s = await couponState();
  check("second click unblurs", !s.filter.includes("blur") && !s.masked, s.filter);

  // Blur two elements, Undo removes only the last.
  const btn = await page.locator("#orderBtn").boundingBox();
  await page.mouse.click(c.x + c.width / 2, c.y + c.height / 2);
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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
