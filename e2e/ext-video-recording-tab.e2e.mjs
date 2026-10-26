// Run: node e2e/ext-video-recording-tab.e2e.mjs   (--headful to watch)
//
// Real-browser coverage for 1.11.3's "Tab" record mode — no browser
// share-picker, via chrome.tabCapture.getMediaStreamId resolved in
// background.js (docs/audit/capture-flow-1.11.3.md). Modeled on
// ext-video-recording.e2e.mjs, which covers the existing getDisplayMedia
// "Desktop" path; this file is the same shape for the new path.
//
// Granting the optional `tabCapture` permission needs a real
// chrome.permissions.request() click — a native dialog Playwright cannot
// click, the same limitation ext-host-access.mjs already documents for
// `<all_urls>`. withGrantedTabCapture() works around it the same way: a copy
// of the build with `tabCapture` moved into required `permissions`, which is
// exactly the state a user is in after accepting the popup's prompt once.
//
// Scenarios:
//   1. start (surfaceMode: "tab") → stop: no picker needed, a real stream
//      comes back, a real recording lands in chrome.storage.local and the
//      ticket modal.
//   2. same-origin navigation mid-recording: the tab-bound stream must
//      survive it (unlike a cross-origin navigation, which ADR 008 already
//      ends the capture on) — assert the recording is still active and the
//      final recording is non-empty after stopping post-navigation.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedTabCapture } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const PORT = 4290;
const page1 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tab A</title></head><body><h1>Tab A</h1></body></html>`;
const page2 = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tab B</title></head><body><h1>Tab B (same-origin nav)</h1></body></html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(req.url.includes("/b") ? page2 : page1);
});
await new Promise((r) => server.listen(PORT, r));

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

function newContext(label) {
  const EXT = withGrantedTabCapture(EXT_SRC_DIR, label);
  const userDir = mkdtempSync(join(tmpdir(), `tb-video-tab-e2e-${label}-`));
  return chromium.launchPersistentContext(userDir, extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ]));
}

async function inject(sw, url) {
  return sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    return tab.id;
  }, url);
}

async function startTabRecording(sw, tabId) {
  return sw.evaluate(async (id) => chrome.tabs.sendMessage(id, {
    type: "TB_START_RECORDING", video: true, withMic: false, blurFirst: false, delaySec: 0, surfaceMode: "tab",
  }).catch((e) => ({ error: String(e && e.message) })), tabId);
}

async function readStorage(sw) {
  return sw.evaluate(async () => {
    const data = await chrome.storage.local.get(["tb_rec_meta_v2", "tb_rec_data_v2"]);
    const dataUrl = data["tb_rec_data_v2"] || "";
    return { sizeBytes: data["tb_rec_meta_v2"]?.sizeBytes ?? null, dataUrlLength: dataUrl.length };
  });
}

async function readModalVideo(page) {
  return page.evaluate(() => {
    const video = document.querySelector("#tb-qb-video, video");
    return {
      videoPresent: !!video,
      videoSrcLength: video ? (video.currentSrc || video.src || "").length : 0,
    };
  });
}

// ── Scenario 1: Tab mode start → stop, no picker ────────────────────────────
try {
  const ctx = await newContext("tab-plain");
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(400);

    const tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);
    const started = await startTabRecording(sw, tabId);
    check("[tab] recording started with no picker", started?.ok === true, JSON.stringify(started));
    check("[tab] did not fall back to the Desktop picker", started?.tabModeFallback !== true, JSON.stringify(started));
    await sleep(2500);

    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);

    const storage = await readStorage(sw);
    check("[tab] chrome.storage.local got a non-empty recording",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0, JSON.stringify(storage));

    const modalVideo = await readModalVideo(page);
    check("[tab] the ticket modal's video element has a real src",
      modalVideo.videoPresent && modalVideo.videoSrcLength > 10, JSON.stringify(modalVideo));
  } finally {
    await ctx.close().catch(() => {});
  }
} catch (err) {
  console.error("[tab] scenario error:", err);
  failures++;
}

// ── Scenario 2: same-origin navigation mid-recording ────────────────────────
try {
  const ctx = await newContext("tab-nav");
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(400);

    let tabId = await inject(sw, `http://localhost:${PORT}/*`);
    await sleep(400);
    const started = await startTabRecording(sw, tabId);
    check("[nav] recording started with no picker", started?.ok === true, JSON.stringify(started));
    await sleep(1500);

    await page.goto(`http://localhost:${PORT}/b`, { waitUntil: "load" });
    tabId = await inject(sw, `http://localhost:${PORT}/b`);
    await sleep(1500);

    const offscreenCount = await sw.evaluate(async () => {
      try { return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length; }
      catch { return -1; }
    });
    check("[nav] the tab-bound stream survived a same-origin navigation — offscreen still active", offscreenCount === 1, String(offscreenCount));

    const hudAfterNav = await page.evaluate(() => !!document.getElementById("tracebug-recording-hud"));
    check("[nav] the HUD re-mounted on the navigated-to page", hudAfterNav);

    await sleep(1500);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);

    const storage = await readStorage(sw);
    check("[nav] chrome.storage.local got a non-empty recording after the same-origin nav",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0, JSON.stringify(storage));
  } finally {
    await ctx.close().catch(() => {});
  }
} catch (err) {
  console.error("[nav] scenario error:", err);
  failures++;
} finally {
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
