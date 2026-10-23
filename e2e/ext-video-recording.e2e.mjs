// Run: node e2e/ext-video-recording.e2e.mjs   (--headful to watch)
//
// Dedicated real-browser repro for docs/launch/video-1.11.1.md Bug 1 — "a
// recording is lost on stop" — the WORST of the four bugs that paused screen
// recording in the extension. The doc's own instructions for diagnosing it:
// flip VIDEO_ENABLED_IN_EXTENSION, record for real, and check whether
// chrome.storage.local actually gets tb_rec_data_v2/tb_rec_meta_v2 written
// (non-empty) and whether the ticket modal's <video> ends up with a real src.
//
// Two scenarios, because the doc's own hand-off comment
// ("lost to a page reload between Stop and modal mount", quick-bug.ts) points
// specifically at a reload — not just a plain stop:
//   1. start → stop, same page context (the straightforward path).
//   2. start → reload mid-recording (tab-share survives via
//      surfaceSwitching:"include") → re-inject → stop from the fresh page.
//
// Both passed when this file was written against commit dda5ac8's
// stash-then-refresh rework of showQuickBugCapture, which looks to have
// already fixed the race the doc's hypothesis described — see
// tests/video-enabled-1-11-2.test.ts and docs/launch/video-1.11.1.md for the
// surrounding context. If this file starts failing, Bug 1 is back.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const PORT = 4289;
const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Video recording fixture</title></head>
<body><h1>Checkout</h1><button id="pay">Pay now</button></body></html>`;

const server = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(FIXTURE);
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
  const EXT = withGrantedHostAccess(EXT_SRC_DIR, label);
  const userDir = mkdtempSync(join(tmpdir(), `tb-video-e2e-${label}-`));
  return chromium.launchPersistentContext(userDir, extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
  ]));
}

async function inject(sw, port) {
  return sw.evaluate(async (p) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${p}/*` });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    return tab.id;
  }, port);
}

async function startRecording(sw, tabId) {
  return sw.evaluate(async (id) => chrome.tabs.sendMessage(id, {
    type: "TB_START_RECORDING", video: true, withMic: false, blurFirst: false, delaySec: 0,
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
      modalPresent: !!document.getElementById("tracebug-quick-bug-modal"),
      videoPresent: !!video,
      videoSrcLength: video ? (video.currentSrc || video.src || "").length : 0,
    };
  });
}

// ── Scenario 1: plain start → stop ──────────────────────────────────────────
try {
  const ctx = await newContext("plain");
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(400);

    const tabId = await inject(sw, PORT);
    await sleep(400);
    const started = await startRecording(sw, tabId);
    check("[plain] recording started", started?.ok === true, JSON.stringify(started));
    await sleep(2500);

    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);

    const storage = await readStorage(sw);
    check("[plain] chrome.storage.local got a non-empty recording",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0, JSON.stringify(storage));

    const modalVideo = await readModalVideo(page);
    check("[plain] the ticket modal's video element has a real src",
      modalVideo.videoPresent && modalVideo.videoSrcLength > 10, JSON.stringify(modalVideo));
  } finally {
    await ctx.close().catch(() => {});
  }
} catch (err) {
  console.error("[plain] scenario error:", err);
  failures++;
}

// ── Scenario 2: reload mid-recording, stop from the fresh page ─────────────
try {
  const ctx = await newContext("reload");
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(400);

    let tabId = await inject(sw, PORT);
    await sleep(400);
    const started = await startRecording(sw, tabId);
    check("[reload] recording started", started?.ok === true, JSON.stringify(started));
    await sleep(2000);

    await page.reload({ waitUntil: "load" });
    tabId = await inject(sw, PORT);
    await sleep(1500);

    const offscreenCount = await sw.evaluate(async () => {
      try { return (await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] })).length; }
      catch { return -1; }
    });
    check("[reload] the tab-share survived the reload — offscreen still active", offscreenCount === 1, String(offscreenCount));

    const hudAfterReload = await page.evaluate(() => !!document.getElementById("tracebug-recording-hud"));
    check("[reload] the HUD re-mounted on the fresh page", hudAfterReload);

    await sleep(2000);
    await page.click('#tracebug-recording-hud [data-tb-hud="stop"]').catch(() => {});
    await sleep(2000);

    const storage = await readStorage(sw);
    check("[reload] chrome.storage.local got a non-empty recording after a mid-recording reload",
      storage.dataUrlLength > 1000 && storage.sizeBytes > 0, JSON.stringify(storage));

    const modalVideo = await readModalVideo(page);
    check("[reload] the ticket modal's video element has a real src",
      modalVideo.videoPresent && modalVideo.videoSrcLength > 10, JSON.stringify(modalVideo));
  } finally {
    await ctx.close().catch(() => {});
  }
} catch (err) {
  console.error("[reload] scenario error:", err);
  failures++;
} finally {
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
