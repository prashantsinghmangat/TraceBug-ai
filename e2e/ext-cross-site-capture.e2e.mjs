// Run: node e2e/ext-cross-site-capture.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// The zombie capture, as a spec.
//
// A capture's state used to live only in the host page's localStorage, which
// is per-origin. The audit (docs/audit/capture-architecture.md §2.1) measured
// what that did: capture on site A, move to site B — the HUD vanishes with no
// Stop control and nothing says why; go back to A and the HUD RETURNS, timer
// still counting, for a capture that ended minutes ago.
//
// What must be true now:
//   • on site B the capture is over, said out loud, and nothing is capturing
//   • back on site A the stale flag is cleared, not resumed
//   • a same-origin navigation still resumes, which is the thing this must
//     not break
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions } from "./paths.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT = withGrantedHostAccess(join(REPO, "tracebug-extension"), "cross-site-capture");
// localhost and 127.0.0.1 are different ORIGINS to the browser, which is all
// this needs — no DNS, no certificates.
const A_PORT = 4197, B_PORT = 4198;
const A = `http://localhost:${A_PORT}`, B = `http://127.0.0.1:${B_PORT}`;

const page = (label) => `<!DOCTYPE html><html><body>
<h1>${label}</h1><button id="b">Button ${label}</button>
<script>document.getElementById('b').addEventListener('click',function(){console.error('${label} error');});</script>
</body></html>`;

const serve = (label) => createServer((_q, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(page(label));
});
const sA = serve("SITE-A"), sB = serve("SITE-B");
await new Promise((r) => sA.listen(A_PORT, r));
await new Promise((r) => sB.listen(B_PORT, r));

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), "tb-xsite-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

let failures = 0, passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) passes++; else failures++;
  if (!ok) console.log(`FAIL  ${name}${extra ? " — " + extra : ""}`);
};
const total = () => `${passes}/${passes + failures} checks passed`;

/** Replay what chrome.tabs.onUpdated does in the worker after a navigation. */
const inject = (sw, urlGlob) => sw.evaluate(async (u) => {
  const [tab] = await chrome.tabs.query({ url: u });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  return tab.id;
}, urlGlob);

const hudState = (p) => p.evaluate(() => {
  const el = document.getElementById("tracebug-recording-hud");
  return {
    hud: !!el,
    timer: el?.querySelector('[data-tb-hud="timer"]')?.textContent || "",
    keys: Object.keys(localStorage).filter((k) => k.startsWith("tracebug") || k.startsWith("tb_")),
    notice: (document.getElementById("tracebug-root")?.textContent || ""),
  };
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });

  const p = await ctx.newPage();
  await p.goto(`${A}/`, { waitUntil: "load" });
  await p.waitForTimeout(400);
  await inject(sw, `${A}/*`);
  await p.waitForTimeout(400);
  await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    return chrome.tabs.sendMessage(tab.id, { type: "TB_START_RECORDING", video: false, withMic: false, blurFirst: false, delaySec: 0 });
  }, `${A}/*`);
  await p.waitForTimeout(1200);

  check("the capture is running on site A", (await hudState(p)).hud);
  await p.click("#b");
  await p.waitForTimeout(600);

  // ── Same-origin navigation: the capture MUST survive ────────────────────
  await p.goto(`${A}/second`, { waitUntil: "load" });
  await inject(sw, `${A}/*`);
  await p.waitForTimeout(1800);
  const sameOrigin = await hudState(p);
  check("a same-origin navigation keeps the capture", sameOrigin.hud, JSON.stringify(sameOrigin.timer));
  check("its timer kept counting", /^00:0[2-9]|^00:[1-9]/.test(sameOrigin.timer), sameOrigin.timer);

  // ── The worker is killed mid-capture ────────────────────────────────────
  // MV3 stops an idle service worker after ~30s and restarts it with BLANK
  // module state. If the status answer came from that blank memory, a
  // restarted worker would say "not running" about a live capture and the
  // page would end it — someone reads a page for a minute, clicks a link on
  // the same site, and loses everything.
  //
  // The sentinel matters: if stopAllWorkers did NOT actually wipe memory,
  // this whole section would pass while testing nothing, so the wipe itself
  // is asserted first.
  await sw.evaluate(() => { globalThis.__tbRestartProbe = "alive"; });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await p.waitForTimeout(800);

  // Any message from a tab wakes a stopped worker; the navigation below does.
  await p.goto(`${A}/third`, { waitUntil: "load" });
  let swAfter = ctx.serviceWorkers()[0];
  if (!swAfter) swAfter = await ctx.waitForEvent("serviceworker", { timeout: 8000 });
  let wiped = false;
  try {
    wiped = (await swAfter.evaluate(() => globalThis.__tbRestartProbe ?? null)) === null;
  } catch { wiped = true; } // the handle died with the worker — also a restart
  check("the worker really was restarted (blank module state)", wiped);

  await inject(swAfter, `${A}/*`);
  await p.waitForTimeout(2000);
  const afterRestart = await hudState(p);
  check("the capture survives a worker restart", afterRestart.hud, JSON.stringify(afterRestart.timer));
  check(
    "and its timer still counts from the original start",
    /^00:(0[5-9]|[1-9]\d)|^0[1-9]:/.test(afterRestart.timer),
    afterRestart.timer,
  );
  sw = swAfter;

  // ── Cross-origin: the capture ends, and says so ─────────────────────────
  await p.goto(`${B}/`, { waitUntil: "load" });
  await inject(sw, `${B}/*`);
  await p.waitForTimeout(2200);
  const onB = await hudState(p);
  check("no HUD on the new site — the capture is over", !onB.hud);
  check(
    "the page says the capture ended, and names the site left",
    /Capture ended when you left/i.test(onB.notice) && /localhost/.test(onB.notice),
    JSON.stringify(onB.notice.slice(0, 160)),
  );
  const workerSaysB = await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    return new Promise((r) => chrome.tabs.sendMessage(tab.id, { type: "TB_PING" }, () => r(true)));
  }, `${B}/*`);
  check("site B is reachable (the bridge is alive there)", workerSaysB);

  // ── Back to site A: the stale flag must NOT resurrect the capture ───────
  await p.goto(`${A}/`, { waitUntil: "load" });
  await inject(sw, `${A}/*`);
  await p.waitForTimeout(2200);
  const backOnA = await hudState(p);
  check("no zombie HUD back on site A", !backOnA.hud, JSON.stringify(backOnA.timer));
  check(
    "the stale start flag is cleared, so it cannot resurrect later either",
    !backOnA.keys.includes("tracebug_events_capture_started"),
    JSON.stringify(backOnA.keys),
  );
  check(
    "what site A captured is still there to open",
    backOnA.keys.includes("tracebug_sessions"),
    JSON.stringify(backOnA.keys),
  );

  // ── And a fresh capture still works afterwards ──────────────────────────
  await sw.evaluate(async (u) => {
    const [tab] = await chrome.tabs.query({ url: u });
    return chrome.tabs.sendMessage(tab.id, { type: "TB_START_RECORDING", video: false, withMic: false, blurFirst: false, delaySec: 0 });
  }, `${A}/*`);
  await p.waitForTimeout(1500);
  check("a new capture starts normally after all that", (await hudState(p)).hud);
} catch (err) {
  failures++;
  console.log("FAIL  harness error —", err && err.message);
} finally {
  await ctx.close();
  sA.close();
  sB.close();
}

if (failures > 0) { console.log(`\n${failures} CHECK(S) FAILED — ${total()}`); process.exit(1); }
console.log(`ALL CHECKS PASSED — ${total()}`);
