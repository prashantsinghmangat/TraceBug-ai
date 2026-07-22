// Run: node e2e/inspect-mode.e2e.mjs
// End-to-end check of inspect mode + style evidence on the live sandbox:
// activate → hover paints the box-model overlay + tooltip → click attaches
// an "inspect" annotation with computed styles → the export carries the
// evidence (payload.elementAnnotations + "Element evidence" in description).
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
await new Promise((r) => server.listen(4175, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

let failures = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
  if (!ok) failures++;
};

try {
  await page.goto("http://localhost:4175/try.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.TraceBug.startRecording());
  await page.waitForTimeout(300);
  // A real interaction first, so the session has events and persists.
  await page.click("#applyBtn");
  await page.waitForTimeout(500);
  await page.evaluate(() => window.TraceBug.activateInspectMode());
  check("inspect mode reports active", await page.evaluate(() => window.TraceBug.isInspectModeActive()));

  // Hover the Place order button → overlay + tooltip paint.
  const btn = await page.locator("#orderBtn").boundingBox();
  await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.waitForTimeout(300);
  const overlay = await page.evaluate(() => {
    const layer = document.getElementById("tracebug-inspect-layer");
    if (!layer) return null;
    const tip = layer.querySelector('[data-tb-i="tip"]');
    const content = layer.querySelector('[data-tb-i="content"]');
    return {
      tipShown: tip && tip.style.display !== "none" ? tip.textContent : null,
      contentShown: content && content.style.display !== "none",
    };
  });
  check("box-model overlay paints on hover", !!overlay?.contentShown);
  check("tooltip shows the style summary", !!overlay?.tipShown && /color #|px/.test(overlay.tipShown), (overlay?.tipShown || "").split("\n")[1] || "");

  // Click → annotation with styles lands in the store.
  await page.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await page.waitForTimeout(400);
  const ann = await page.evaluate(() => {
    const r = window.TraceBug.getAnnotationReport();
    const a = r.elementAnnotations[r.elementAnnotations.length - 1];
    return a ? { intent: a.intent, selector: a.selector, hasStyles: !!a.styles, color: a.styles?.colors?.color, contrast: a.styles?.contrast?.ratio ?? null } : null;
  });
  check("click attaches an inspect annotation", ann?.intent === "inspect", ann?.selector);
  check("annotation carries computed styles", !!ann?.hasStyles, `color=${ann?.color} contrast=${ann?.contrast}`);

  // Esc exits.
  await page.keyboard.press("Escape");
  const stillActive = await page.evaluate(() => window.TraceBug.isInspectModeActive());
  check("Esc exits inspect mode", stillActive === false);

  // Export path end-to-end: the GitHub markdown flows through buildReport →
  // elementAnnotations → the Element Evidence section. Give the session
  // buffer a moment to flush to storage first.
  await page.waitForTimeout(2500);
  const md = await page.evaluate(() => window.TraceBug.getGitHubIssue());
  check("GitHub markdown includes Element Evidence", !!md && md.includes("Element Evidence"), md ? "" : "no markdown");
  check("markdown carries the style receipt", !!md && /contrast \d/.test(md));
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await browser.close();
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
