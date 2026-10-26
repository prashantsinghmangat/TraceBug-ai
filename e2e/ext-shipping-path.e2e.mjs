// Run: node e2e/ext-shipping-path.e2e.mjs   (--headful to watch)
//
// THE 1.11.2 SHIPPING PATH, IN A REAL BROWSER, FOR THE "UPDATED FROM 1.10"
// USER WHOSE STORED `tb_record_opts.video` IS TRUE.
//
// e2e/ext-events-capture.e2e.mjs already walks the events-only happy path on
// a clean profile. This one does it for the user whose stored preference asks
// for video, and 1.11.2 restores screen recording in the extension
// (VIDEO_ENABLED_IN_EXTENSION in src/video-recorder.ts) — so unlike 1.11/1.11.1,
// that stored true must now actually produce a recording, not be silently
// ignored. See docs/launch/video-1.11.1.md ("Flipping the switch") and
// tests/video-enabled-1-11-2.test.ts for the unit-level pins.
//
// That is the guarantee unit tests cannot make. They assert source text and a
// mocked transport; only a real browser can say whether getDisplayMedia is
// actually called, whether the offscreen document hands back a real video, and
// whether the ticket the user opens actually has it.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    // Lets getDisplayMedia/getUserMedia resolve with a synthetic source
    // instead of blocking on an OS picker/consent dialog no harness can click.
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ]),
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
      tb_record_opts: { video: true, videoSetBy: "default", surfaceMode: "desktop", delaySec: 0 },
    });
    return chrome.storage.local.get("tb_record_opts");
  });
  check("the profile starts with video:true stored", seeded?.tb_record_opts?.video === true,
    "a false pass here would make every check below meaningless");

  const manifest = await sw.evaluate(() => chrome.runtime.getManifest());
  check("the manifest requests `offscreen` — video is restored in 1.11.2",
    (manifest.permissions || []).includes("offscreen"),
    (manifest.permissions || []).join(", "));

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);

  // ── Inject exactly the way the popup's Capture Bug does ──────────────────
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(500);

  // Dispatch the popup's own event, carrying the STORED video:true. This is
  // the line that matters: the popup would send what it read from storage.
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    return chrome.tabs.sendMessage(tab.id, {
      type: "TB_START_RECORDING",
      video: true,          // what an updater's stored preference would send
      withMic: false,
      blurFirst: false,
      delaySec: 0,
      surfaceMode: "desktop",
    });
  }, GLOB);
  await sleep(1500);

  // ── It must be an actual video recording — 1.11.2 honours the stored pref ──
  const state = await page.evaluate(() => ({
    isVideoRecording: !!window.__TraceBugExtensionSDK.isVideoRecording?.(),
    hud: !!document.querySelector('[data-tb-hud="stop"]'),
    label: document.querySelector('[data-tb-hud="label"]')?.textContent?.trim() || "",
    micBtn: !!document.querySelector('[data-tb-hud="mic"]'),
    pauseBtn: !!document.querySelector('[data-tb-hud="pause"]'),
  }));
  check("a capture started", state.hud, JSON.stringify(state));
  check("it IS a video recording — the stored preference is honoured",
    state.isVideoRecording === true, `isVideoRecording=${state.isVideoRecording}`);
  check("a pause button is present — there is a stream to pause", state.pauseBtn);
  // The mic button renders for a video recording, but stays disabled: Bug 4
  // (docs/launch/video-1.11.1.md) — hasMicrophoneTrack() reads page-side
  // `_stream`, which the extension transport never sets. withMic was false
  // here anyway, so "no track" is doubly true; the button existing at all is
  // what this line is checking.
  check("a mic button renders in the HUD for a video recording", state.micBtn);

  const offscreenCount = await sw.evaluate(async () => {
    try {
      const c = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      return c.length;
    } catch { return -1; }
  });
  check("an offscreen document was created to host the recorder", offscreenCount === 1, String(offscreenCount));

  const badgeWhileRecording = await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    return chrome.action.getBadgeText({ tabId: tab.id });
  }, GLOB);
  check("the toolbar badge shows REC while the video capture is running",
    badgeWhileRecording === "REC", badgeWhileRecording);

  // ── Produce the three signals ────────────────────────────────────────────
  await page.click("#pay");
  await sleep(1500);

  // ── Stop, and check the ticket ───────────────────────────────────────────
  await page.evaluate(() => {
    document.querySelector('[data-tb-hud="stop"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await sleep(2500);

  const modal = await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal"));
  check("stopping opens the ticket", modal);

  // Regression check: a video stop never used to tell the worker it was no
  // longer capturing (only an events capture announced its own stop), so the
  // REC badge stayed stuck forever after a completely normal Stop click.
  const badgeAfterStop = await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    return chrome.action.getBadgeText({ tabId: tab.id });
  }, GLOB);
  check("the REC badge clears after stopping the video capture",
    badgeAfterStop !== "REC", badgeAfterStop);

  const report = await page.evaluate(() => {
    // NOT generateReport(): it needs an active session and correctly returns
    // null after a stop. This is the pair of calls the ticket modal makes.
    const sessions = window.__TraceBugExtensionSDK.getAllSessions();
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    const r = window.__TraceBugExtensionSDK.buildReport(session);
    if (!r) return null;
    return {
      consoleErrors: (r.consoleErrors || []).map((e) => String(e.message).slice(0, 60)),
      networkStatuses: (r.networkRequests || []).map((n) => n.status),
      actions: (r.sessionSteps || []).length,
      videoBytes: r.video?.sizeBytes || 0,
      videoDataUrlPrefix: (r.video?.dataUrl || "").slice(0, 15),
    };
  });
  check("a report was built", !!report, JSON.stringify(report));
  check("the console error is there",
    (report?.consoleErrors || []).some((m) => /Cannot read properties of undefined/.test(m)),
    JSON.stringify(report?.consoleErrors));
  check("the failed request is there",
    (report?.networkStatuses || []).includes(500), JSON.stringify(report?.networkStatuses));
  check("the click is there", (report?.actions || 0) > 0, String(report?.actions));
  // This is the regression Bug 1 (docs/launch/video-1.11.1.md) describes: a
  // ticket that opens with "Video started…stopped" in the timeline but no
  // actual video bytes. Re-verified in a real browser before this file was
  // rewritten — see e2e/ext-video-recording.e2e.mjs for the dedicated,
  // narrower repro (plain start/stop and a mid-recording reload).
  check("the video actually rode along — Bug 1 does not reproduce here",
    (report?.videoBytes || 0) > 0 && (report?.videoDataUrlPrefix || "").startsWith("data:video"),
    `bytes=${report?.videoBytes} dataUrl="${report?.videoDataUrlPrefix}"`);

  // ── The preference is honoured, not just preserved ───────────────────────
  const after = await sw.evaluate(() => chrome.storage.local.get("tb_record_opts"));
  check("the stored video:true is still there", after?.tb_record_opts?.video === true);
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
