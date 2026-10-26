// Run: node e2e/ext-badge-host-ui-defer.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// A real bug found by hand-testing: start a capture on a plain site, then
// navigate the SAME tab to a site that runs its own TraceBug. injectSDK()
// correctly defers (one interface per page — docs/launch/sdk-isolation-1.11.2.md)
// but nothing on a deferred page ever pings tb:capture:status, so the stale
// capture — and the red REC badge it drives — used to stick around forever.
// The only other way a capture ends is the NEW page proactively reporting its
// origin, which a page the extension never injects into can't do.
//
// What must be true now: injectSDK()'s catch path ends any capture tracked
// against that tab the moment injection is skipped/fails, for exactly this
// reason — see background.js's injectSDK catch block.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "badge-host-ui-defer");
const PLAIN_PORT = 4303;
const HOST_UI_PORT = 4304;

const PLAIN = `<!DOCTYPE html><html><head><title>Plain site</title></head>
<body><h1>Plain site</h1></body></html>`;
// detectHostTraceBugUI() (page-support.js) treats #tracebug-root as a host's
// own TraceBug instance already being up.
const HOST_UI = `<!DOCTYPE html><html><head><title>Host UI site</title></head>
<body><div id="tracebug-root"></div><h1>Site with its own TraceBug</h1></body></html>`;

const serverA = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(PLAIN); });
const serverB = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(HOST_UI); });
await new Promise((r) => serverA.listen(PLAIN_PORT, r));
await new Promise((r) => serverB.listen(HOST_UI_PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-badge-host-ui-"));
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
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  const page = await ctx.newPage();
  await page.goto(`http://localhost:${PLAIN_PORT}/`, { waitUntil: "load" });
  await sleep(300);

  // Driven through handleComboAction() itself, not a manual
  // executeScript+sendMessage shortcut: that function is also what populates
  // activeTabs, which is what makes chrome.tabs.onUpdated re-inject (and
  // re-run the host-UI check) on the navigation below. An extension can't
  // chrome.runtime.sendMessage itself, so this calls it directly — the same
  // workaround the other e2e files use for injectSDK().
  const tabId = await sw.evaluate(async (port) => {
    const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
    await handleComboAction({
      type: "TB_START_RECORDING", tabId: tab.id,
      video: false, withMic: false, blurFirst: false, delaySec: 0,
    }, {});
    return tab.id;
  }, PLAIN_PORT);
  await sleep(1500);

  // GET_STATE can't be read via chrome.runtime.sendMessage from inside the
  // worker evaluating it (an extension can't message itself), so this reads
  // the same persisted session state the worker rehydrates captureTabs from.
  const capturingTab = (state, id) =>
    (state?.tb_sw_state_v1?.captureTabs || []).some(([t]) => t === id);

  const badgeBefore = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  check("REC badge shows while capturing on the plain site", badgeBefore === "REC", badgeBefore);

  const stateBefore = await sw.evaluate(() => chrome.storage.session.get("tb_sw_state_v1"));
  check("captureTabs tracks this tab before navigating away",
    capturingTab(stateBefore, tabId), JSON.stringify(stateBefore));

  // Navigate the SAME tab to a site that runs its own TraceBug. The real
  // chrome.tabs.onUpdated listener fires on this navigation (activeTabs still
  // has this tab from the TB_START_RECORDING combo action above) and calls
  // injectSDK(tabId) itself — no harness shortcut needed here, unlike the
  // initial injection above (an extension can't sendMessage to itself to
  // trigger its own first-ever injection, but a real navigation event is a
  // real event, and this IS what a user's click does).
  await page.goto(`http://localhost:${HOST_UI_PORT}/`, { waitUntil: "load" });
  await sleep(1000);

  const badgeAfter = await sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  check("the REC badge clears once the extension defers to the host's own TraceBug",
    badgeAfter === "", `badge="${badgeAfter}"`);

  const stateAfter = await sw.evaluate(() => chrome.storage.session.get("tb_sw_state_v1"));
  check("captureTabs no longer tracks this tab",
    !capturingTab(stateAfter, tabId), JSON.stringify(stateAfter));
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  serverA.close();
  serverB.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
