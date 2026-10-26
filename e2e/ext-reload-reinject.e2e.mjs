// Run: node e2e/ext-reload-reinject.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// Reported by hand-testing: capture on a tab, then anything that resets the
// EXTENSION's own state (an update, an unpacked reload during dev, or — the
// scenario this test forces — a service-worker restart that ALSO lost
// chrome.storage.session, which is what a real extension reload does and a
// bare worker-idle restart does not) while the tab stays open. Clicking
// Capture Bug again on that same tab showed "This site runs its own
// TraceBug" even though the only TraceBug instance there was the extension's
// own, still-mounted one.
//
// ext-worker-restart-reinject.e2e.mjs already covers the worker-idle case,
// where chrome.storage.session (activeTabs) survives and the live-ping check
// in handleComboAction resolves the ambiguity. This test forces the harder
// case — storage.session gone too, the way it is after a real extension
// reload — where activeTabs can't help, and the fix must come from a signal
// activeTabs doesn't own: EXTENSION_OWNER_KEY, a sessionStorage marker the
// PAGE itself carries (src/dashboard.ts sets it on mount, page-support.js
// names it, content-script.js's TB_PING and background.js's injectSDK() read
// it) — page storage, unlike extension storage, survives this.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "reload-reinject");
const PORT = 4306;

const PLAIN = `<!DOCTYPE html><html><head><title>Plain site</title></head>
<body><h1>Plain site</h1></body></html>`;
const server = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(PLAIN); });
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-reload-reinject-"));
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

  const started = await sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    return handleComboAction({
      type: "TB_START_RECORDING", tabId: tab.id,
      video: false, withMic: false, blurFirst: false, delaySec: 0,
    }, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e && e.message) }));
  }, PORT);
  check("the first capture starts cleanly", started.ok === true, JSON.stringify(started));
  await sleep(1000);

  const rootPresent = await page.evaluate(() => !!document.getElementById("tracebug-root"));
  check("the dashboard root is mounted on the page", rootPresent);
  const markerSet = await page.evaluate(() => window.sessionStorage.getItem("tracebug_ext_owns_ui") === "1");
  check("mounting set the EXTENSION_OWNER_KEY sessionStorage marker", markerSet);

  await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
  await sleep(1500);

  // Force exactly what a real extension reload/update does and a bare
  // worker-idle restart does NOT: wipe chrome.storage.session along with the
  // worker's in-memory state. This is the gap ext-worker-restart-reinject.e2e.mjs
  // does not exercise.
  await sw.evaluate(() => chrome.storage.session.clear());
  await sw.evaluate(() => { globalThis.__tbReloadProbe = "alive"; });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await sleep(800);

  const wakePage = await ctx.newPage();
  await wakePage.goto(`http://localhost:${PORT}/wake`, { waitUntil: "load" });
  let swAfter = ctx.serviceWorkers()[0];
  if (!swAfter) swAfter = await ctx.waitForEvent("serviceworker", { timeout: 8000 });
  let wiped = false;
  try { wiped = (await swAfter.evaluate(() => globalThis.__tbReloadProbe ?? null)) === null; }
  catch { wiped = true; }
  check("the worker really was restarted with blank module AND session state", wiped);
  const sessionWiped = await swAfter.evaluate(() => chrome.storage.session.get("tb_sw_state_v1"));
  check("chrome.storage.session no longer has this tab's activeTabs entry",
    !sessionWiped?.tb_sw_state_v1, JSON.stringify(sessionWiped));
  await wakePage.close();

  // The DOM marker from before the reload is still there — sessionStorage is
  // page-scoped, not extension-scoped, so it survives what storage.session
  // didn't. This is the exact signal the fix depends on.
  const markerSurvived = await page.evaluate(() => window.sessionStorage.getItem("tracebug_ext_owns_ui") === "1");
  check("the sessionStorage marker survived the reload (page-scoped, not extension-scoped)", markerSurvived);

  // The exact user flow this bug was reported from: click Capture Bug again
  // on the SAME tab, with BOTH activeTabs and injectedTabs gone.
  const secondAttempt = await swAfter.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    return handleComboAction({
      type: "TB_START_RECORDING", tabId: tab.id,
      video: false, withMic: false, blurFirst: false, delaySec: 0,
    }, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e && e.message) }));
  }, PORT);
  check("capturing again after the reload does NOT misdiagnose our own root as a host UI",
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
