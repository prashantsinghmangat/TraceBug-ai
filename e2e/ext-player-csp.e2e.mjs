// Run: node e2e/ext-player-csp.e2e.mjs   (headful; needs `npx playwright install chromium`)
// NOTE: uses Playwright's bundled Chromium, NOT channel:"chrome" — branded
// Chrome 137+ silently ignores --load-extension.
//
// E2E check of the CSP-proof player chain on a real strict-CSP page (github.com):
// 1) content script publishes data-tb-player-url
// 2) an iframe to player.html loads despite page CSP (web_accessible exemption)
// 3) ready → load(ArrayBuffer transfer — data: URLs die at Chromium's 2MB
//    URL cap, which broke every recording over ~1.5MB) → grab-frame
//    round-trip returns a real PNG frame
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Known-good webm (the real site demo video) — removes MediaRecorder/canvas
// flakiness from the test entirely.
const DEMO = readFileSync("D:/Project/TraceBug-ai/website/public/tracebug-demo.webm");
const DEMO_B64 = DEMO.toString("base64"); // rebuilt to ArrayBuffer in-page
console.log(`demo webm: ${(DEMO.length / 1024 / 1024).toFixed(1)} MB`);

const EXT = "D:/Project/TraceBug-ai/tracebug-extension";
const userDir = mkdtempSync(join(tmpdir(), "tb-ext-test-"));

// Bundled Chromium, NOT channel:"chrome" — branded Chrome 137+ removed
// --load-extension support, silently ignoring the flag.
const ctx = await chromium.launchPersistentContext(userDir, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

const page = await ctx.newPage();
await page.goto("https://github.com/prashantsinghmangat/tracebug-ai", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

// Injection is user-triggered in production (popup action → background
// executeScript). Drive the same path via the extension service worker.
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });
const injected = await sw.evaluate(async () => {
  const [tab] = await chrome.tabs.query({ url: "https://github.com/*" });
  if (!tab) return "no github tab found";
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    return "injected into tab " + tab.id;
  } catch (e) {
    return "executeScript failed: " + e.message;
  }
});
console.log("0) injection:", injected);
await page.waitForTimeout(800);

const attr = await page.evaluate(() => document.documentElement.getAttribute("data-tb-player-url"));
console.log("1) data-tb-player-url:", attr || "MISSING");

if (!attr) { await ctx.close(); process.exit(1); }

const result = await page.evaluate(async ({ playerUrl, b64 }) => {
  const log = [];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const iframe = document.createElement("iframe");
  iframe.src = playerUrl;
  iframe.style.cssText = "position:fixed;bottom:8px;right:8px;width:320px;height:180px;z-index:99999;border:2px solid #6366F1";
  const playerOrigin = new URL(playerUrl).origin;

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ log, verdict: "TIMEOUT waiting for handshake/frame" }), 8000);
    let loaded = false;
    window.addEventListener("message", (e) => {
      if (e.origin !== playerOrigin) return;
      const t = e.data && e.data.type;
      log.push("msg from player: " + t + (e.data.message ? ` (${e.data.message})` : ""));
      if (t === "tb:player:ready") {
        iframe.contentWindow.postMessage(
          { type: "tb:player:load", buffer: bytes.buffer, mimeType: "video/webm", durationMs: 15400 },
          playerOrigin,
          [bytes.buffer]
        );
        loaded = true;
        setTimeout(() => iframe.contentWindow.postMessage({ type: "tb:player:grab-frame" }, playerOrigin), 3000);
      } else if (t === "tb:player:frame") {
        clearTimeout(timeout);
        resolve({ log, verdict: "OK", frameBytes: (e.data.dataUrl || "").length, w: e.data.width, h: e.data.height });
      } else if (t === "tb:player:error") {
        clearTimeout(timeout);
        resolve({ log, verdict: "PLAYER ERROR: " + e.data.message });
      }
    });
    iframe.addEventListener("load", () => log.push("iframe load event fired (loaded=" + loaded + ")"));
    document.body.appendChild(iframe);
  });
}, { playerUrl: attr, b64: DEMO_B64 });

// Write result to a file too — stdout can stay buffered if browser close hangs.
writeFileSync("D:/tmp/player-e2e-result.json", JSON.stringify(result, null, 2));
console.log("2) chain result:", JSON.stringify(result, null, 2));
await page.screenshot({ path: "D:/tmp/player-e2e.png" });
await ctx.close().catch(() => {});
process.exit(0);
