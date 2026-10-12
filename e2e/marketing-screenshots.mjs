// Run: npm run build:ext && node e2e/marketing-screenshots.mjs
// Generates real product screenshots into D:/tmp/tracebug-shots/:
//   Part 1-3  the originals: the exported .html report viewer (replay + each
//             evidence tab) and try.html with the Quick Bug modal open
//   Part 4    store-ready ELEMENT CROPS from a real video-recording session —
//             hud*.png and shot-0*.png. Tight locator/clip screenshots, not
//             full-page frames, so they drop into a store listing as-is.
//   Part 5    the extension popup (packaged MV3 build, loaded for real)
// Uses Playwright's bundled Chromium. 1440x900 viewport, deviceScaleFactor 2
// so the shots stay sharp when dev.to scales them down.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";

const OUT = "D:/tmp/tracebug-shots";
mkdirSync(OUT, { recursive: true });

const REPORT = "D:/Project/TraceBug-ai/demo-bug-reports/tracebug-replay-93e6615d-2026-07-19T08-07-00.html";
const PUBLIC_DIR = "D:/Project/TraceBug-ai/website/public";
const EXT_DIR = "D:/Project/TraceBug-ai/tracebug-extension/dist/chrome";
const SANDBOX_URL = "http://localhost:4173/try.html";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webm": "video/webm", ".svg": "image/svg+xml" };
function servePublic(port) {
  const srv = createServer((req, res) => {
    const path = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!existsSync(path)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(readFileSync(path));
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}

// ── Store-crop helpers ────────────────────────────────────────────────────
// Every store crop goes through these so a renamed selector aborts the run
// naming the selector, instead of silently writing a wrong or empty image.
const written = [];
function record(name) { written.push(name); console.log("  saved " + name); }

class MissingTarget extends Error {}

/** Resolve a selector or abort naming it. Returns a visible locator. */
async function must(pg, sel, what, timeout = 10000) {
  const loc = pg.locator(sel).first();
  try {
    await loc.waitFor({ state: "visible", timeout });
  } catch {
    throw new MissingTarget(`missing target: ${sel}   (needed for: ${what})`);
  }
  return loc;
}

/** Tight element crop via locator.screenshot. */
async function cropEl(pg, sel, name, what) {
  const loc = await must(pg, sel, what);
  await loc.screenshot({ path: join(OUT, name) });
  record(name);
}

/**
 * Crop the union of several elements' boxes. Needed where the thing that must
 * be in frame overflows its parent: the More menu is `position:absolute;
 * bottom:calc(100% + 6px)`, so it renders ABOVE .tb-qb-footer and a footer
 * element crop would slice it off. Still a crop, never a full page.
 */
async function cropUnion(pg, sels, name, what, pad = 0) {
  const boxes = [];
  for (const sel of sels) {
    const box = await (await must(pg, sel, what)).boundingBox();
    if (!box) throw new MissingTarget(`no box for: ${sel}   (needed for: ${what})`);
    boxes.push(box);
  }
  const vp = pg.viewportSize() || { width: 1440, height: 900 };
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const right = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const bottom = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  await pg.screenshot({ path: join(OUT, name), clip: { x, y, width: right - x, height: bottom - y } });
  record(name);
}

/**
 * Crop an element clamped to the viewport. section.tb-vright is taller than
 * the window, and locator.screenshot() captures an element's FULL height —
 * which yields a tall strip of dead space below the content. Clamping keeps
 * the crop to what is actually on screen.
 */
async function cropVisible(pg, sel, name, what, pad = 0) {
  const box = await (await must(pg, sel, what)).boundingBox();
  if (!box) throw new MissingTarget(`no box for: ${sel}   (needed for: ${what})`);
  const vp = pg.viewportSize();
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  const width = Math.min(vp.width, box.x + box.width + pad) - x;
  const height = Math.min(vp.height, box.y + box.height + pad) - y;
  await pg.screenshot({ path: join(OUT, name), clip: { x, y, width, height } });
  record(name);
}

/**
 * Abort unless every marker is on screen inside `within`. Stronger than a
 * text check: the console panel scrolls internally, so innerText reports rows
 * that are clipped out of the scrollport and would be absent from the crop.
 */
async function mustBeVisibleIn(pg, within, markers, what) {
  await must(pg, within, what);
  // Hit-test rather than compare boxes: the feed list overflows its panel and
  // is clipped by an ancestor, so a row can report a perfectly good
  // boundingBox while being painted nowhere. elementFromPoint only ever
  // returns something actually on screen.
  const offscreen = await pg.evaluate(
    ({ within, markers }) => {
      const root = document.querySelector(within);
      const bad = [];
      for (const m of markers) {
        const row = [...root.querySelectorAll("*")].find(
          (e) => e.children.length === 0 && (e.textContent || "").includes(m)
        );
        if (!row) { bad.push(m); continue; }
        // Probe the FIRST LINE BOX, not the bounding box: a wrapped inline
        // span's geometric centre can fall in the leading between its lines,
        // where elementFromPoint returns the parent and a perfectly visible
        // row looks hidden.
        const r = row.getClientRects()[0] || row.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) { bad.push(m); continue; }
        // Only the row itself (or something inside it) counts as a hit. An
        // ANCESTOR coming back means the row is clipped out of its scroller —
        // and ancestors trivially .contains(row), so testing that direction
        // would wave every clipped row through.
        const hit = document.elementFromPoint(cx, cy);
        if (!hit || !(hit === row || row.contains(hit))) bad.push(m);
      }
      return bad;
    },
    { within, markers }
  );
  if (offscreen.length) {
    throw new MissingTarget(
      `${within} does not show ${JSON.stringify(offscreen)} in the visible crop   (needed for: ${what})`
    );
  }
}

/**
 * Wait until an element stops growing rows. The viewer's evidence feed paints
 * progressively, so measuring straight after a tab click can report rows that
 * have not been laid out yet — the measurement passes and the screenshot that
 * follows is still missing the tail entries.
 */
async function settle(pg, sel, what, tries = 20) {
  let last = -1, stable = 0;
  for (let i = 0; i < tries; i++) {
    const n = await pg.locator(`${sel} > *`).count();
    stable = n === last ? stable + 1 : 0;
    last = n;
    if (stable >= 3 && n > 0) return n;
    await pg.waitForTimeout(300);
  }
  if (last <= 0) throw new MissingTarget(`${sel} never rendered any rows   (needed for: ${what})`);
  return last;
}

/** Abort unless every marker is present in the element's text. */
async function mustContain(pg, sel, markers, what) {
  const txt = (await (await must(pg, sel, what)).innerText()) || "";
  const missing = markers.filter((m) => !txt.includes(m));
  if (missing.length) {
    throw new MissingTarget(
      `${sel} is missing expected evidence ${JSON.stringify(missing)}   (needed for: ${what})`
    );
  }
}

/** Drive the sandbox's own documented bugs + the redaction-bait evidence. */
async function seedEvidence(pg) {
  // try.html documents these under "Reproduce the bugs":
  //   SAVE20 + Apply coupon -> uncaught TypeError (coupons[code] is undefined)
  //   Place order           -> POST /api/orders 404
  // Click ONLY the demo page's own buttons — blind-clicking all <button>s hits
  // TraceBug's toolbar Stop button and ends the session (learned the hard way).
  await pg.fill("#coupon", "SAVE20");
  await pg.waitForTimeout(300);
  for (const sel of ["#applyBtn", "#orderBtn"]) {
    try { await pg.click(sel, { timeout: 2000 }); } catch {}
    await pg.waitForTimeout(700);
  }
  await pg.evaluate(() => {
    // Second 404, and a URL whose token param the capture path strips.
    try { fetch("/api/checkout?token=secret_abc123&user=42").catch(() => {}); } catch {}
    // Scrubbed at capture by sanitizeTokenShapes -> "Bearer [REDACTED]".
    try { console.error("Payment failed: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV"); } catch {}
    try { console.warn("cart state stale after coupon apply"); } catch {}
  });
  await pg.waitForTimeout(2000);
}

const browser = await chromium.launch({
  headless: true,
  // Part 4 drives the real startVideoRecording() path, which is what mounts
  // the recording HUD. getDisplayMedia needs a secure context (localhost is
  // one) plus these flags so no picker UI blocks a headless run.
  args: [
    "--auto-accept-this-tab-capture",
    "--use-fake-ui-for-media-stream",
    "--auto-select-desktop-capture-source=Entire screen",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

let server;
let extCtx;
try {

// ── Part 1: the exported report viewer ────────────────────────────────────
console.log("Part 1: report viewer…");
await page.goto("file:///" + REPORT.replace(/\\/g, "/"), { waitUntil: "load" });
// Give the viewer time to inflate the gzipped rrweb stream and mount the player.
await page.waitForTimeout(4000);

await page.screenshot({ path: join(OUT, "1-report-replay.png") });
console.log("  saved 1-report-replay.png");

for (const tab of ["console", "network", "actions", "ai", "events"]) {
  await page.click(`[data-tab="${tab}"]`);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, `1-report-${tab}.png`) });
  console.log(`  saved 1-report-${tab}.png`);
}

// ── Part 2: try.html + Quick Bug modal ────────────────────────────────────
console.log("Part 2: try.html sandbox…");
server = await servePublic(4173);

await page.goto(SANDBOX_URL, { waitUntil: "load" });
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
    for (const tab of ["console", "network", "ai", "events"]) {
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

// ── Part 4: store crops, from one real video-recording session ────────────
// Its own page so Parts 1-3 keep producing exactly what they always did.
// This pass uses startVideoRecording() because that is the only code path
// that mounts the recording HUD — and the HUD is where the blur tool lives.
// Everything stays inside the live recording: hideRecordingHUD() calls
// removeAllBlurBoxes(), so stopping first would strip the blur off the page
// before it could reach a screenshot. Hence Ctrl+Shift+B (not Stop) to open
// the ticket while the HUD and the blur boxes are still up.
console.log("Part 4: store crops…");
const store = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await store.goto(SANDBOX_URL, { waitUntil: "load" });
await store.waitForTimeout(2000);

const vidOk = await store.evaluate(() =>
  window.TraceBug.startVideoRecording({ mode: "rolling", surfaceMode: "tab" })
);
if (!vidOk) throw new MissingTarget("startVideoRecording() returned false — getDisplayMedia blocked, so no HUD");
await store.waitForTimeout(1500);

// hud.png — the HUD alone, clean (no draw toolbar, no blur hint overlay).
await cropEl(store, "#tracebug-recording-hud", "hud.png", "recording HUD: timer / Draw / Blur / Stop");
// hud-context.png — wider crop pairing the HUD with the checkout card it is
// recording, so it reads as "over the page" not as a floating fragment.
await cropUnion(store, [".shop", "#tracebug-recording-hud"], "hud-context.png", "HUD over the Acme Checkout card", 28);

await seedEvidence(store);

// Blur the coupon field with the real blur tool: HUD Blur button ->
// activateBlurMode (hover outline + click-to-toggle via elementFromPoint) ->
// Esc to finish. _blur() also adds .tb-mask, which masks the recorded DOM,
// so the blur lands in the rrweb replay too, not just in the pixels.
await (await must(store, '#tracebug-recording-hud [data-tb-hud="blur"]', "HUD Blur button")).click();
await store.waitForTimeout(500);
await (await must(store, "#coupon", "coupon input to blur")).click();
await store.waitForTimeout(400);
await store.keyboard.press("Escape");
await store.waitForTimeout(500);
if (!(await store.locator('#coupon[data-tb-blurred="1"]').count())) {
  throw new MissingTarget('blur tool did not blur #coupon (no [data-tb-blurred="1"]) — blur-tool code path changed?');
}
console.log("  blurred #coupon via the HUD blur tool");

// shot-04b — the blur as the user actually sees it, on the live page. This
// one exists because the blur does NOT survive into either exported artifact:
//   * the attached screenshot goes through html2canvas, which does not
//     implement CSS `filter`, so the blur is dropped;
//   * the rrweb replay masks via maskTextClass: "tb-mask", which covers text
//     NODES — an <input>'s value is not one, so it replays in the clear.
// So a live-page crop is the only honest "blurred element" image available.
await cropUnion(store, [".shop"], "shot-04b-blurred-element.png", "live page with #coupon blurred", 20);

await store.keyboard.press("Control+Shift+KeyB");
await must(store, "#tracebug-quick-bug-modal", "Quick Bug modal");
await store.waitForTimeout(3000);

// Region screenshot over the checkout card — rect derived from the card's own
// box so the blurred coupon row is guaranteed to be inside the capture.
const shopBox = await (await must(store, ".shop", "checkout card")).boundingBox();
await (await must(store, '#tracebug-quick-bug-modal [data-action="add-screenshot"]', "Add screenshot button")).click();
await store.waitForTimeout(1200);
await store.mouse.move(Math.max(2, shopBox.x - 12), Math.max(2, shopBox.y - 12));
await store.mouse.down();
await store.mouse.move(shopBox.x + shopBox.width + 12, shopBox.y + shopBox.height + 12, { steps: 12 });
await store.mouse.up();
await must(store, "#tracebug-quick-bug-modal", "Quick Bug modal after region capture");
await store.waitForTimeout(2500);

// shot-04 — both halves of the privacy story in one frame: the blurred coupon
// field inside the attached capture, and the 🛡 redaction line in the footer
// tip row. Asserted, because an empty 🛡 line is the silent failure mode here
// (no redactions found -> the generic tip text renders instead).
await must(store, "#tracebug-quick-bug-modal .tb-qb-privacy", "privacy (🛡) summary line");
await cropEl(store, "#tracebug-quick-bug-modal", "shot-04-privacy.png", "modal: blurred field + privacy line");

// shot-05a — footer action bar with More ▾ open. Union crop: the menu opens
// upward out of the footer box, so a footer-only crop clips it.
await (await must(store, '#tracebug-quick-bug-modal [data-action="more-toggle"]', "More toggle")).click();
await store.waitForTimeout(500);
await cropUnion(
  store,
  ["#tracebug-quick-bug-modal .tb-qb-footer", '#tracebug-quick-bug-modal .tb-qb-more-menu[data-open="true"]'],
  "shot-05a-export-menu.png",
  "footer action bar with More ▾ open",
  10
);
await (await must(store, '#tracebug-quick-bug-modal [data-action="more-toggle"]', "More toggle")).click();
await store.waitForTimeout(300);

// Export this session and crop the viewer shots from it.
{
  const [download] = await Promise.all([
    store.waitForEvent("download", { timeout: 60000 }),
    store.click('#tracebug-quick-bug-modal [data-action="export-replay"]'),
  ]);
  const storeReport = join(OUT, "store-report.html");
  await download.saveAs(storeReport);
  console.log("  exported store-report.html");

  await store.goto("file:///" + storeReport.replace(/\\/g, "/"), { waitUntil: "load" });
  await store.waitForTimeout(5000);

  // shot-01 — hero: viewer header + replay stage. Union crop because they are
  // separate siblings (header.tb-vh, then the stage inside section.tb-vleft).
  const replaySel = (await store.locator("#rrweb-wrap").isVisible()) ? "#rrweb-wrap" : "#preview-wrap";
  await (await must(store, '[data-tab="info"]', "viewer Info tab")).click();
  await store.waitForTimeout(500);
  await cropUnion(store, ["header.tb-vh", replaySel], "shot-01-report-hero.png", "viewer header + replay area");

  // shot-02 — right panel on Console, holding the TypeError, both 404s and
  // the scrubbed Bearer token in ONE frame. The console panel scrolls
  // internally and 11 entries do not fit a 900px window, so the viewport is
  // grown for this crop; mustBeVisibleIn then proves every marker really is
  // inside the frame rather than clipped out of the scrollport.
  await store.setViewportSize({ width: 1440, height: 2000 });
  await (await must(store, '[data-tab="console"]', "viewer Console tab")).click();
  await store.waitForTimeout(1200);
  await settle(store, "#panel-console .tb-vfeed-list", "console feed rows");
  const consoleMarkers = ["TypeError", "/api/orders", "/api/checkout", "[REDACTED]"];
  await mustContain(store, "#panel-console", consoleMarkers, "shot-02 console evidence");
  // .tb-vtabpanels is a 500px-tall overflow-y:auto scrollport and the 11-entry
  // feed is 665 tall, so no scroll offset puts the TypeError, both 404s and the
  // scrubbed token in one frame. Relax the clip for the crop only — this is a
  // render-time style on the loaded page; the exported .html on disk is
  // untouched, and every row shown is the report's own content.
  await store.addStyleTag({
    content: ".tb-vtabpanels{overflow:visible !important;max-height:none !important;height:auto !important}",
  });
  await store.waitForTimeout(600);
  await mustBeVisibleIn(store, "#panel-console", consoleMarkers, "shot-02 console evidence in one frame");
  // With the clip relaxed the panel is its true content height, so framing on
  // the tabstrip + panel is tight with no dead space.
  await cropUnion(
    store,
    [".tb-vtabstrip", "#panel-console"],
    "shot-02-console.png",
    "right panel, Console tab",
    12
  );
  await store.setViewportSize({ width: 1440, height: 900 });
}

server.close();
server = null;

// ── Part 5: the extension popup ───────────────────────────────────────────
// Needs a persistent context with the packaged MV3 build loaded. Run
// `npm run build:ext` first — asserted rather than silently skipped.
console.log("Part 5: extension popup…");
if (!existsSync(join(EXT_DIR, "manifest.json"))) {
  throw new MissingTarget(`no packaged extension at ${EXT_DIR} — run: npm run build:ext`);
}
server = await servePublic(4173);

const USER_DATA = join(OUT, ".chrome-profile");
try { rmSync(USER_DATA, { recursive: true, force: true }); } catch {}

extCtx = await chromium.launchPersistentContext(USER_DATA, {
  channel: "chromium", // new headless — the old headless mode ignores extensions
  headless: true,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
  ],
});

// MV3 -> the background is a service worker; its origin carries the id.
let sw = extCtx.serviceWorkers()[0];
if (!sw) sw = await extCtx.waitForEvent("serviceworker", { timeout: 30000 });
const extId = new URL(sw.url()).host;
console.log("  extension id: " + extId);

// The sandbox tab the popup should describe.
const sandboxTab = extCtx.pages()[0] || (await extCtx.newPage());
await sandboxTab.goto(SANDBOX_URL, { waitUntil: "load" });
await sandboxTab.waitForTimeout(1500);

// popup.js resolves its target with chrome.tabs.query({active:true,
// currentWindow:true}). Opened as a normal tab, that query returns the popup
// tab itself (a chrome-extension:// URL), which popup.js correctly rejects as
// "Can't run on this page" — useless for a store image. So hand it the real
// sandbox tab record, read back through the extension's own service worker;
// every other popup code path (messaging currentTabId, the SDK-loaded probe,
// the redaction UI) then runs for real against that tab.
const realTab = await sw.evaluate(async () => {
  const tabs = await chrome.tabs.query({ url: "http://localhost:4173/*" });
  const t = tabs[0];
  return t ? { id: t.id, url: t.url, title: t.title, windowId: t.windowId, active: true } : null;
});
if (!realTab) throw new MissingTarget("extension cannot see the sandbox tab (host permissions, or the build failed to load)");

const popup = await extCtx.newPage();
await popup.setViewportSize({ width: 460, height: 840 });
await popup.addInitScript((tab) => {
  const wait = setInterval(() => {
    if (!globalThis.chrome || !chrome.tabs || !chrome.tabs.query) return;
    clearInterval(wait);
    const orig = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = (info, cb) => {
      if (info && info.active && info.currentWindow) {
        if (cb) { cb([tab]); return undefined; }
        return Promise.resolve([tab]);
      }
      return orig(info, cb);
    };
  }, 1);
}, realTab);
await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "load" });
await popup.waitForTimeout(2500);

// Fail loudly rather than shipping the "Can't run on this page" state.
if (await popup.locator("#unavailable").isVisible()) {
  throw new MissingTarget("popup rendered the \"Can't run on this page\" state — the active-tab shim did not take");
}
await must(popup, "#mainContent", "popup main content");
await must(popup, "#hostname", "popup hostname row");
await cropEl(popup, ".popup", "popup.png", "extension popup body");

} finally {
  console.log("\nStore crops written (" + written.length + "):");
  for (const f of written) console.log("  " + join(OUT, f).replace(/\\/g, "/"));
  try { if (extCtx) await extCtx.close(); } catch {}
  try { if (server) server.close(); } catch {}
  try { await browser.close(); } catch {}
}
console.log("Done → " + OUT);
