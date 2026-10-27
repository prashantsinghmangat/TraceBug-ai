// Run: node e2e/pre-record.e2e.mjs
// Verifies the pre-recording flow on the live sandbox SDK:
//   prepareRecording({blurFirst}) → arming bar appears with blur mode on
//   → Cancel exits cleanly and clears boxes → countdown counts and resolves
//   → the countdown's mic toggle (opt-in via runRecordCountdown's second arg)
//     is absent with no mic option, present and togglable with one, and its
//     final state is readable via getCountdownMicChoice() after resolving.
// (The actual getDisplayMedia recording needs a headful picker — out of scope.)
import { chromium } from "playwright";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4176, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

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

try {
  await page.goto("http://localhost:4176/try.html", { waitUntil: "load" });
  await page.waitForTimeout(500);
  // try.html deliberately does not load the SDK on page load any more (see
  // its own comment: loading it unconditionally would race the extension's
  // injected copy and lock the page into page mode) — the "No extension? Try
  // the in-page demo" button is what loads it now. Without this click
  // window.TraceBug stays undefined and every call below throws.
  await page.click("#inPageDemoBtn");
  await page.waitForTimeout(1000);

  // Blur-first arming: bar + blur mode active.
  await page.evaluate(() => window.TraceBug.prepareRecording({ blurFirst: true }));
  await page.waitForTimeout(400);
  const armed = await page.evaluate(() => ({
    bar: !!document.getElementById("tracebug-record-armbar"),
    blurActive: window.TraceBugSDK.isBlurModeActive(),
  }));
  check("arming bar appears", armed.bar);
  check("blur mode active while armed", armed.blurActive);

  // Cancel: bar gone, blur mode off, no leftover boxes.
  await page.click('#tracebug-record-armbar [data-tb-arm="cancel"]');
  await page.waitForTimeout(300);
  const cancelled = await page.evaluate(() => ({
    bar: !!document.getElementById("tracebug-record-armbar"),
    blurActive: window.TraceBugSDK.isBlurModeActive(),
    blurred: document.querySelectorAll("[data-tb-blurred]").length,
  }));
  check("cancel removes the bar", !cancelled.bar);
  check("cancel exits blur mode", !cancelled.blurActive);
  check("cancel clears blurred elements", cancelled.blurred === 0);

  // Countdown: overlay shows a number, resolves, overlay gone.
  const t0 = Date.now();
  const during = await page.evaluate(() => {
    const p = window.TraceBugSDK.runRecordCountdown(2);
    return new Promise((resolve) => {
      setTimeout(() => {
        const el = document.getElementById("tracebug-record-countdown");
        const shown = el ? el.textContent : null;
        p.then(() => resolve({ shown, done: true, remains: !!document.getElementById("tracebug-record-countdown") }));
      }, 500);
    });
  });
  const elapsed = Date.now() - t0;
  check("countdown shows digits", /\d/.test(during.shown || ""), `showed "${during.shown}"`);
  check("countdown resolves and cleans up", during.done && !during.remains, `${elapsed}ms`);

  // Countdown with no mic option: no mic toggle is shown, same as before.
  const noMic = await page.evaluate(() => {
    const p = window.TraceBugSDK.runRecordCountdown(1);
    const micPresent = !!document.querySelector("#tracebug-record-countdown .tb-countdown-mic");
    return p.then(() => micPresent);
  });
  check("no mic option → no mic toggle rendered", noMic === false);

  // Countdown with a mic option: toggle appears, starts at the given state,
  // clicking it flips state, and the final choice is readable after resolve.
  const withMic = await page.evaluate(() => {
    const p = window.TraceBugSDK.runRecordCountdown(2, { withMicrophone: true });
    const mic = document.querySelector("#tracebug-record-countdown .tb-countdown-mic");
    const initialState = mic ? mic.dataset.tbMic : null;
    mic?.querySelector("button")?.click();
    const afterClickState = mic ? mic.dataset.tbMic : null;
    return p.then((completed) => ({
      initialState,
      afterClickState,
      completed,
      finalChoice: window.TraceBugSDK.getCountdownMicChoice(),
    }));
  });
  check("mic toggle starts matching the passed-in state (on)", withMic.initialState === "on", JSON.stringify(withMic));
  check("clicking the toggle flips it (on → off)", withMic.afterClickState === "off", JSON.stringify(withMic));
  check("the flipped choice is readable after the countdown resolves", withMic.completed && withMic.finalChoice === false, JSON.stringify(withMic));
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await browser.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
