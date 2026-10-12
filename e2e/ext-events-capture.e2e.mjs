// Run: node e2e/ext-events-capture.e2e.mjs   (headful; needs `npx playwright install chromium`)
//
// Phase 4, in a real browser: the popup's Capture Bug must NOT open a
// screen-share picker.
//
// This is the check the unit tests cannot make. tests/events-capture.test.ts
// proves the report shape; only a real MV3 browser can prove that nothing
// asked the OS for a screen. So the strong assertions here are negative ones:
//   • no offscreen document is ever created (that is the only thing in this
//     extension that can call getDisplayMedia)
//   • getDisplayMedia is never called, verified by replacing it on the page
//     with a tripwire — a belt to the offscreen braces
//   • isVideoRecording() stays false for the whole capture
// and then the positive one: the capture still produces a report with the
// console error, the failed request, and a DOM replay.
//
// Paths are repo-relative on purpose. The older harnesses hardcode
// D:/Project/TraceBug-ai (noted in docs/launch/phase0-findings.md item 10.3,
// to be fixed when Phase 8 puts them in CI) — don't copy that here.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withGrantedHostAccess } from "./ext-host-access.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

// Site access is OPTIONAL from 1.11, and this harness injects from the service
// worker rather than through a real toolbar click, so it cannot grant itself
// access. Load a copy that declares it — see e2e/ext-host-access.mjs.
const EXT = withGrantedHostAccess(join(REPO, "tracebug-extension"), "events-capture");
const PORT = 4179;

// A page that produces exactly the three things a bug report is made of: a
// console error, a failing request, and something to click.
const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Events capture fixture</title></head>
<body>
  <h1>Checkout</h1>
  <button id="pay">Pay now</button>
  <script>
    document.getElementById("pay").addEventListener("click", function () {
      console.error("TypeError: Cannot read properties of undefined (reading 'total')");
      fetch("/api/charge").catch(function () {});
    });
  </script>
</body></html>`;

const server = createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"charge_failed"}');
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-events-e2e-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  headless: false,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

let failures = 0;
// Output only: counts every check, but stays quiet while they all pass. The
// moment one fails it flushes the run so far and streams the rest — a failing
// check is only legible next to the ones that got that far. `--verbose` prints
// everything from the start. Assertions, timeouts and order are untouched.
const VERBOSE = process.argv.includes("--verbose");
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

/** Does the worker hold an offscreen document? The only getDisplayMedia host. */
const offscreenCount = (sw) =>
  sw.evaluate(async () => {
    try {
      const ctxs = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
      return ctxs.length;
    } catch {
      return -1; // API missing — reported rather than silently passing
    }
  });

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });

  const page = await ctx.newPage();
  // Tripwire BEFORE any TraceBug code runs: if the page world ever reaches for
  // the picker we will know, even if the offscreen check somehow passes.
  await page.addInitScript(() => {
    window.__tbGetDisplayMediaCalls = 0;
    try {
      const md = navigator.mediaDevices;
      if (md && md.getDisplayMedia) {
        const real = md.getDisplayMedia.bind(md);
        md.getDisplayMedia = function (...args) {
          window.__tbGetDisplayMediaCalls++;
          return real(...args);
        };
      }
    } catch {}
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
  await page.waitForTimeout(400);

  check("no offscreen document before the capture", (await offscreenCount(sw)) === 0);

  // Inject and then dispatch exactly what handleComboAction dispatches. The
  // injection is replayed here rather than driven through the worker's own
  // message handler because an extension cannot sendMessage to itself — the
  // worker's onMessage listener is unreachable from the worker. The worker's
  // half (building that message, defaulting `video` to false) is covered in
  // tests/background-tab-lifecycle.test.ts; everything downstream of it —
  // content-script.js's field allowlist, tracebug-init.js, the SDK — is what
  // this harness exercises.
  const started = await sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    await new Promise((r) => setTimeout(r, 400));
    return chrome.tabs.sendMessage(tab.id, {
      type: "TB_START_RECORDING",
      video: false,
      withMic: false,
      blurFirst: false,
      delaySec: 0,
    }).catch((e) => ({ error: String(e && e.message) }));
  }, PORT);
  check("the capture was accepted", started && started.ok === true, JSON.stringify(started));

  await page.waitForTimeout(2500);

  // ── The point of this file ──────────────────────────────────────────────
  check("still no offscreen document while capturing", (await offscreenCount(sw)) === 0);
  check(
    "getDisplayMedia was never called",
    (await page.evaluate(() => window.__tbGetDisplayMediaCalls)) === 0,
  );
  check(
    "the SDK does not think it is recording video",
    (await page.evaluate(() => !!window.TraceBugSDK && window.TraceBugSDK.isVideoRecording() === false)),
  );
  // The "your browser will ask what to share" line belongs to the video path
  // only. If it shows up here it is telling the user about a dialog that is
  // never going to open.
  check(
    "no share-dialog hint was shown",
    (await page.evaluate(() => !document.getElementById("tracebug-picker-hint"))),
  );

  // The HUD is the only Stop control the user has once the popup closes.
  const hud = await page.evaluate(() => {
    const el = document.getElementById("tracebug-recording-hud");
    if (!el) return null;
    return {
      stop: !!el.querySelector('[data-tb-hud="stop"]'),
      pause: !!el.querySelector('[data-tb-hud="pause"]'),
      mic: !!el.querySelector('[data-tb-hud="mic"]'),
      label: el.querySelector('[data-tb-hud="label"]')?.textContent || "",
      timer: el.querySelector('[data-tb-hud="timer"]')?.textContent || "",
    };
  });
  check("the capture HUD is mounted", !!hud, JSON.stringify(hud));
  check("it has a Stop button", !!hud?.stop);
  check("it says what is being captured", hud?.label === "Capturing", JSON.stringify(hud?.label));
  check("pause and mic are absent — there is nothing to pause or mute", !hud?.pause && !hud?.mic);
  check("the timer is counting", /^00:0[1-9]|^00:[1-9]/.test(hud?.timer || ""), hud?.timer);

  // Reproduce the bug: console error + failed request + a click to step on.
  await page.click("#pay");
  await page.waitForTimeout(1800);

  // ── Survive a navigation ────────────────────────────────────────────────
  // An events-only session is the one kind that RESUMES across a navigation
  // rather than being finalized, and the HUD is its only Stop control — so it
  // has to come back, and its timer has to keep counting from the real start
  // instead of restarting at 00:00. The re-injection itself is replayed here
  // the way chrome.tabs.onUpdated does it in the worker (that trigger is
  // covered in tests/background-tab-lifecycle.test.ts); what is under test is
  // the SDK's resume branch.
  await page.goto(`http://localhost:${PORT}/second`, { waitUntil: "load" });
  await sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, PORT);
  await page.waitForTimeout(2500);

  const afterNav = await page.evaluate(() => {
    const el = document.getElementById("tracebug-recording-hud");
    return {
      hud: !!el,
      timer: el?.querySelector('[data-tb-hud="timer"]')?.textContent || "",
      label: el?.querySelector('[data-tb-hud="label"]')?.textContent || "",
    };
  });
  check("the HUD comes back after a navigation", afterNav.hud, JSON.stringify(afterNav));
  check(
    "its timer kept counting instead of restarting",
    (() => {
      const m = /^(\d\d):(\d\d)$/.exec(afterNav.timer);
      return !!m && Number(m[1]) * 60 + Number(m[2]) >= 5;
    })(),
    afterNav.timer,
  );
  check("it is still the events-only HUD", afterNav.label === "Capturing");

  // Something to capture on the new page, so the stop below is not a no-op.
  await page.click("#pay");
  await page.waitForTimeout(1500);

  // Stop the way the user does — the HUD's own button, not an API call.
  await page.click('#tracebug-recording-hud [data-tb-hud="stop"]');
  await page.waitForTimeout(2500);

  check(
    "stopping opens the ticket modal",
    await page.evaluate(() => !!document.getElementById("tracebug-quick-bug-modal")),
  );
  check(
    "the HUD is gone",
    await page.evaluate(() => !document.getElementById("tracebug-recording-hud")),
  );

  // ── and the capture is actually worth something ─────────────────────────
  // Built from the session the capture just finalized. Not TraceBug.generateReport(),
  // which needs an ACTIVE session and correctly returns null after a stop —
  // this is the same pair of calls the ticket modal makes.
  const report = await page.evaluate(() => {
    const sessions = window.TraceBugSDK.getAllSessions();
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    const r = window.TraceBugSDK.buildReport(session);
    if (!r) return null;
    return {
      consoleErrors: (r.consoleErrors || []).map((e) => e.message || ""),
      networkStatuses: (r.networkRequests || []).map((n) => n.status),
      actions: (r.sessionSteps || []).length,
      rrwebCount: Array.isArray(r.video?.rrwebEvents) ? r.video.rrwebEvents.length : 0,
      videoDataUrl: r.video?.dataUrl ?? null,
      videoSize: r.video?.sizeBytes ?? null,
    };
  });
  check("a report was built", !!report, JSON.stringify(report));
  check(
    "it carries the console error",
    (report?.consoleErrors || []).some((m) => /reading 'total'/.test(m)),
    JSON.stringify(report?.consoleErrors),
  );
  check(
    "it carries the failed request",
    (report?.networkStatuses || []).includes(500),
    JSON.stringify(report?.networkStatuses),
  );
  check("it carries the user's actions", (report?.actions || 0) > 0, String(report?.actions));
  check(
    "it carries a DOM replay — this is what replaces the video",
    (report?.rrwebCount || 0) > 0,
    `${report?.rrwebCount} rrweb events`,
  );
  check(
    "the replay-only video object holds no video bytes",
    report?.videoDataUrl === "" && report?.videoSize === 0,
    `dataUrl=${JSON.stringify(report?.videoDataUrl)} sizeBytes=${report?.videoSize}`,
  );
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
