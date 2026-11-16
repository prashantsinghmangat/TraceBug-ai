// Run: node e2e/video-trim.e2e.mjs   (--headful to watch, --verbose for every line)
//
// Ticket-modal video trim (src/ui/video-trim.ts) on the real extension:
// record ~7 s, stop, then in the ticket modal check the trim bar appears,
// the handles move by keyboard, the label and Cut button follow, and playback
// stays inside the kept range. Then the same on a strict-CSP page (the
// extension player frame path).
//
// The cut itself is NOT run here: Playwright's bundled Chromium (the only one
// that loads an unpacked extension) crashes the tab on any in-page
// MediaRecorder encode. e2e/video-cut.e2e.mjs covers the cut in real Chrome,
// Edge and Firefox.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const PORT = 4291;
const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Trim fixture</title>
<style>body{font:16px system-ui;margin:40px}#clock{font-size:64px}</style></head>
<body><h1>Checkout</h1><div id="clock">0</div>
<script>let n=0;setInterval(()=>{document.getElementById("clock").textContent=String(++n)},100)</script>
</body></html>`;
// /strict is the same page under a CSP that blocks blob: video, like GitHub:
// the ticket plays the recording in the extension's player frame, and the trim
// bar has to drive that frame instead of an in-page <video>.
const server = createServer((req, res) => {
  const headers = { "content-type": "text/html" };
  if (req.url.startsWith("/strict")) headers["content-security-policy"] = "media-src 'self'";
  res.writeHead(200, headers);
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(PORT, r));

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

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "trim");
const userDir = mkdtempSync(join(tmpdir(), "tb-trim-e2e-"));
const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`,
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
]));

// Decode a recording's true length (MediaRecorder WebM has no duration header).
const decodedLength = (page, sel) => page.evaluate(async (s) => {
  const src = document.querySelector(s)?.currentSrc || document.querySelector(s)?.src;
  if (!src) return -1;
  const v = document.createElement("video");
  v.muted = true; v.src = src;
  await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
  if (!isFinite(v.duration)) {
    await new Promise((r) => { v.addEventListener("seeked", r, { once: true }); v.currentTime = 1e7; });
  }
  return v.duration;
}, sel);

let [sw] = ctx.serviceWorkers();
async function run(path, strict) {
  const tag = strict ? "[strict CSP] " : "";
  const check2 = (n, ok, x) => check(tag + n, ok, x);
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: "load" });
  await sleep(400);
  const tabId = await sw.evaluate(async (p) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${p.port}${p.path}*` });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    return tab.id;
  }, { port: PORT, path });
  await sleep(400);
  const started = await sw.evaluate(async (id) => chrome.tabs.sendMessage(id, {
    type: "TB_START_RECORDING", video: true, withMic: false, blurFirst: false, delaySec: 0,
  }).catch((e) => ({ error: String(e && e.message) })), tabId);
  check2("recording started", started?.ok === true, JSON.stringify(started));
  await sleep(7500);
  await page.click('#tracebug-recording-hud [data-tb-hud="stop"]');
  await page.waitForSelector("#tracebug-quick-bug-modal #tb-qb-video, #tracebug-quick-bug-modal .tb-qb-player-iframe", { state: "attached", timeout: 20000 });
  if (strict) {
    const frame = await page.waitForSelector("#tracebug-quick-bug-modal .tb-qb-player-iframe", { timeout: 10000 }).catch(() => null);
    check2("the recording plays in the extension's player frame", !!frame);
    await sleep(1500); // the frame loads the bytes and reports its duration
  }
  await page.waitForSelector("#tracebug-quick-bug-modal .tb-trim", { timeout: 10000 }).catch(() => {});

  if (!strict) {
    const fullLen = await decodedLength(page, "#tb-qb-video");
    check2("the recording is ~7 s long", fullLen > 5 && fullLen < 11, String(fullLen));
  }
  const bar = await page.evaluate(() => {
    const t = document.querySelector("#tracebug-quick-bug-modal .tb-trim");
    return t ? { label: t.querySelector('[data-tb-trim="label"]').textContent, cutDisabled: t.querySelector('[data-tb-trim="cut"]').disabled } : null;
  });
  check2("trim bar shows under the video, nothing cut yet", !!bar && /nothing cut/.test(bar.label) && bar.cutDisabled, JSON.stringify(bar));

  // Keep 2.0 s → (end − 2.0 s) using the keyboard on the handles (Shift = 1 s).
  await page.focus('[data-tb-trim="h-start"]');
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.focus('[data-tb-trim="h-end"]');
  await page.keyboard.press("Shift+ArrowLeft");
  await page.keyboard.press("Shift+ArrowLeft");
  const sel = await page.evaluate(() => ({
    s: Number(document.querySelector('[data-tb-trim="h-start"]').getAttribute("aria-valuenow")),
    e: Number(document.querySelector('[data-tb-trim="h-end"]').getAttribute("aria-valuenow")),
    d: Number(document.querySelector('[data-tb-trim="h-end"]').getAttribute("aria-valuemax")),
    label: document.querySelector('[data-tb-trim="label"]').textContent,
    cutDisabled: document.querySelector('[data-tb-trim="cut"]').disabled,
  }));
  check2("handles move by keyboard and the label says what is kept",
    Math.abs(sel.s - 2) < 0.05 && Math.abs(sel.d - sel.e - 2) < 0.05 && /^Keep /.test(sel.label) && !sel.cutDisabled, JSON.stringify(sel));

  if (strict) {
    // The handle preview went to the frame (tb:player:seek-to) and the frame's
    // time came back (tb:player:time): the playhead sits on the end handle.
    await sleep(600);
    const ph = await page.evaluate(() => {
      const left = (k) => parseFloat(document.querySelector('[data-tb-trim="' + k + '"]').style.left);
      return { playhead: left("playhead"), end: left("h-end") };
    });
    check2("the handles drive the player frame (playhead follows)", Math.abs(ph.playhead - ph.end) < 3, JSON.stringify(ph));
    await page.close();
    return;
  }

  // Playback stays inside the kept range.
  const play = await page.evaluate(async (end) => {
    const v = document.getElementById("tb-qb-video");
    v.muted = true;
    v.currentTime = end - 0.4;
    await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
    await v.play().catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    return { t: v.currentTime, paused: v.paused };
  }, sel.e);
  const shot = process.argv.find((a) => a.startsWith("--shot="))?.slice(7);
  if (shot) await page.locator("#tracebug-quick-bug-modal .tb-qb-preview").evaluate((el) => el.scrollIntoView({ block: "start" })).then(() => page.screenshot({ path: shot }));
  check2("playback stops at the end of the kept range", play.paused && play.t <= sel.e + 0.15, JSON.stringify(play));

  check2("no page errors", errors.length === 0, errors.join(" | "));
  await page.close();
}

try {
  await run("/", false);
  await run("/strict", true);
} catch (err) {
  check("run completes", false, String(err && err.stack || err).split("\n").slice(0, 3).join(" "));
} finally {
  await ctx.close().catch(() => {});
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
