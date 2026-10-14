// Run: node e2e/ext-shipping-path.e2e.mjs   (--headful to watch)
//
// THE 1.11 SHIPPING PATH, IN A REAL BROWSER, FOR THE WORST-CASE USER.
//
// e2e/ext-events-capture.e2e.mjs already walks the happy path on a clean
// profile. This one does it as the user 1.11 is most likely to break:
// somebody who UPDATED from 1.10, whose `tb_record_opts.video` was seeded
// `true` by background.js, and who therefore has a stored preference that
// 1.11 must read and ignore.
//
// That is the guarantee the unit tests cannot make. They assert source text
// and a mocked transport; only a real browser can say whether a stored
// `video: true` still produces an events capture, whether any video or mic
// control renders, and whether an offscreen document gets created now that
// the permission is gone from the manifest.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "shipping-path");
const PORT = 4193;
const SITE = `http://127.0.0.1:${PORT}/`;
const GLOB = `http://127.0.0.1:${PORT}/*`;

// A page that produces exactly the three signals a bug report is made of.
const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Shipping path fixture</title></head>
<body>
  <h1>Checkout</h1>
  <button id="pay">Pay now</button>
  <script>
    document.getElementById("pay").addEventListener("click", () => {
      // A failed request...
      fetch("/api/charge", { method: "POST" }).catch(() => {});
      // ...and a console error, the way a real app throws one.
      console.error("TypeError: Cannot read properties of undefined (reading 'total')");
    });
  </script>
</body></html>`;

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"charge failed"}');
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-shipping-e2e-"));
const ctx = await chromium.launchPersistentContext(
  userDir,
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

const VERBOSE = process.argv.includes("--verbose");
let failures = 0;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  // ── The updater's stored state ───────────────────────────────────────────
  // Exactly what background.js seeds on reason === "update".
  //
  // Seeded AFTER a pause on purpose: this is a fresh profile, so onInstalled
  // fires with reason "install" and seedRecordOptsDefault writes
  // {video:false}. Writing first meant the worker clobbered the seed a moment
  // later and this suite reported a product failure that was its own.
  await sleep(1200);
  const seeded = await sw.evaluate(async () => {
    await chrome.storage.local.set({
      tb_record_opts: { video: true, videoSetBy: "default", surfaceMode: "tab", delaySec: 0 },
    });
    return chrome.storage.local.get("tb_record_opts");
  });
  check("the profile starts with video:true stored", seeded?.tb_record_opts?.video === true,
    "a false pass here would make every check below meaningless");

  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  check("the manifest does not request `offscreen`",
    !(manifest.permissions || []).includes("offscreen"),
    (manifest.permissions || []).join(", "));

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);

  // ── Inject exactly the way the popup's Capture Bug does ──────────────────
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await sleep(500);

  // Dispatch the popup's own event, carrying the STORED video:true. This is
  // the line that matters: the popup would send what it read from storage.
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    return chrome.tabs.sendMessage(tab.id, {
      type: "TB_START_RECORDING",
      video: true,          // what an updater's stored preference would send
      withMic: true,
      blurFirst: false,
      delaySec: 0,
      surfaceMode: "tab",
    });
  }, GLOB);
  await sleep(1200);

  // ── It must be an EVENTS capture, not a recording ────────────────────────
  const state = await page.evaluate(() => ({
    isVideoRecording: !!window.TraceBugSDK.isVideoRecording?.(),
    hud: !!document.querySelector('[data-tb-hud="stop"]'),
    label: document.querySelector('[data-tb-hud="label"]')?.textContent?.trim() || "",
    micBtn: !!document.querySelector('[data-tb-hud="mic"]'),
    pauseBtn: !!document.querySelector('[data-tb-hud="pause"]'),
  }));
  check("a capture started", state.hud, JSON.stringify(state));
  check("it is NOT a video recording, despite video:true being stored",
    state.isVideoRecording === false, `isVideoRecording=${state.isVideoRecording}`);
  check("the HUD is the events-only one", state.label === "Capturing", state.label);
  check("no microphone button in the HUD", !state.micBtn);
  check("no pause button either — there is nothing to pause", !state.pauseBtn);

  const offscreenCount = await sw.evaluate(async () => {
    try {
      const c = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      return c.length;
    } catch { return -1; }
  });
  check("no offscreen document was created", offscreenCount === 0, String(offscreenCount));

  // ── Produce the three signals ────────────────────────────────────────────
  await page.click("#pay");
  await sleep(900);

  // ── Stop, and check the ticket ───────────────────────────────────────────
  await page.evaluate(() => {
    document.querySelector('[data-tb-hud="stop"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await sleep(2200);

  const modal = await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal"));
  check("stopping opens the ticket", modal);

  const report = await page.evaluate(() => {
    // NOT generateReport(): it needs an active session and correctly returns
    // null after a stop. This is the pair of calls the ticket modal makes.
    const sessions = window.TraceBugSDK.getAllSessions();
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    const r = window.TraceBugSDK.buildReport(session);
    if (!r) return null;
    return {
      consoleErrors: (r.consoleErrors || []).map((e) => String(e.message).slice(0, 60)),
      networkStatuses: (r.networkRequests || []).map((n) => n.status),
      actions: (r.sessionSteps || []).length,
      rrwebCount: r.video?.rrwebEvents?.length || 0,
      videoBytes: r.video?.sizeBytes || 0,
      videoDataUrl: (r.video?.dataUrl || "").slice(0, 12),
    };
  });
  check("a report was built", !!report, JSON.stringify(report));
  check("the replay is non-empty", (report?.rrwebCount || 0) > 0, `${report?.rrwebCount} rrweb events`);
  check("the console error is there",
    (report?.consoleErrors || []).some((m) => /Cannot read properties of undefined/.test(m)),
    JSON.stringify(report?.consoleErrors));
  check("the failed request is there",
    (report?.networkStatuses || []).includes(500), JSON.stringify(report?.networkStatuses));
  check("the click is there", (report?.actions || 0) > 0, String(report?.actions));
  check("and no video rode along", !report?.videoBytes && !report?.videoDataUrl,
    `bytes=${report?.videoBytes} dataUrl="${report?.videoDataUrl}"`);

  // ── The preference survives for 1.11.1 ───────────────────────────────────
  const after = await sw.evaluate(() => chrome.storage.local.get("tb_record_opts"));
  check("the stored video:true was NOT erased", after?.tb_record_opts?.video === true,
    "1.11.1 restores video by flipping one constant; the user must not have to re-choose");
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
