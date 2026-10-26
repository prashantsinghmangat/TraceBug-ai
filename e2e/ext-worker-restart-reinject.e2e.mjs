// Run: node e2e/ext-worker-restart-reinject.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// Found by hand-testing the real unpacked extension: inject on an ordinary
// page, wait long enough for the MV3 worker to go idle and die (or just
// reload the extension), click Capture Bug again — "This site runs its own
// TraceBug" on a page that had been working a moment earlier.
//
// Root cause: `injectedTabs` (background.js) is in-memory only and does not
// survive a worker restart, even though the tab's content script and
// page-world SDK do (they are tied to the page, not the worker).
// handleComboAction trusted `injectedTabs.has(tabId)` alone to decide between
// the repair path (ensureAlive) and the fresh-injection path (injectSDK),
// whose host-UI check assumes any TraceBug DOM it finds belongs to a host
// page — true for a tab never touched before, false for our own surviving
// instance. A restarted worker couldn't tell those apart and always guessed
// wrong.
//
// Fix: handleComboAction now also trusts `activeTabs` (which IS persisted)
// plus a live ping before falling through to injectSDK()'s host-UI check.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "worker-restart-reinject");
const PORT = 4305;

const PLAIN = `<!DOCTYPE html><html><head><title>Plain site</title></head>
<body><h1>Plain site</h1></body></html>`;
const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(PLAIN); });
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-worker-restart-"));
const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`,
]));

const VERBOSE = process.argv.includes("--verbose");
let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await sleep(300);

  // First capture, through the real combo-action path (not a harness
  // shortcut): this is what populates activeTabs, the persisted signal the
  // fix relies on.
  const started = await sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    return handleComboAction({
      type: "TB_START_RECORDING", tabId: tab.id,
      video: false, withMic: false, blurFirst: false, delaySec: 0,
    }, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e && e.message) }));
  }, PORT);
  check("the first capture starts cleanly", started.ok === true, JSON.stringify(started));
  await sleep(1000);

  // Stop it — a worker restart should be tested on an IDLE tab, the common
  // case (open the popup, wait, click again), not mid-capture.
  await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
  await sleep(1500);

  // Kill the service worker for real and confirm it actually restarted
  // (blank module state), the same sentinel technique as
  // ext-cross-site-capture.e2e.mjs.
  await sw.evaluate(() => { globalThis.__tbRestartProbe = "alive"; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await sleep(800);

  // Wake the worker WITHOUT touching the original tab — a navigation there
  // would reset its DOM and content scripts too, which is not what a worker
  // restart does in real life and would make this test meaningless (it
  // would pass by accident, not because the fix works).
  const wakePage = await ctx.newPage();
  await wakePage.goto(`http://localhost:${PORT}/wake`, { waitUntil: "load" });
  let swAfter = ctx.serviceWorkers()[0];
  if (!swAfter) swAfter = await ctx.waitForEvent("serviceworker", { timeout: 8000 });
  let wiped = false;
  try { wiped = (await swAfter.evaluate(() => globalThis.__tbRestartProbe ?? null)) === null; }
  catch { wiped = true; }
  check("the worker really was restarted (blank module state)", wiped);
  await wakePage.close();

  // The exact user flow: click Capture Bug again on the SAME tab, the page
  // it had been working on a moment before the restart.
  const secondAttempt = await swAfter.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    return handleComboAction({
      type: "TB_START_RECORDING", tabId: tab.id,
      video: false, withMic: false, blurFirst: false, delaySec: 0,
    }, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e && e.message) }));
  }, PORT);
  check("capturing again after the restart does NOT get misdiagnosed as a host UI",
    secondAttempt.ok === true, JSON.stringify(secondAttempt));

  await sleep(1500);
  const hudBack = await page.evaluate(() => !!document.getElementById("tracebug-recording-hud"));
  check("the HUD is back, proving a real capture (not just a non-throwing no-op)", hudBack);

} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
