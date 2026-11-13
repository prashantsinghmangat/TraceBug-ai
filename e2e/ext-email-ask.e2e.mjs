// Optional email ask in the extension popup (docs/launch/email-capture-plan.md).
//
// Proves: a real audit sends the success signal and the worker counts it; the
// ask is due only after the 2nd result; the popup shows it once, sends only the
// typed address (+ counts only when ticked), and every exit path ends or snoozes
// it; ✕ comes back exactly once at the 10th result; nothing is ever blocked.
//
//   npm run build:ext && node e2e/ext-email-ask.e2e.mjs [--headful] [--verbose]

import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const DIST = join(EXT_SRC_DIR, "dist", "chrome");
if (!existsSync(join(DIST, "vendor", "axe.min.js"))) {
  console.error("No packaged build — run `npm run build:ext` first.");
  process.exit(1);
}
const EXT = withGrantedHostAccess(DIST, "email-ask");
const PORT = 4223;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GLOB = `${ORIGIN}/*`;
const KEY = "tb_email_ask_v1";

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Email ask fixture</title></head>
<body><h1>Fixture</h1><button><svg width="9" height="9"></svg></button></body></html>`);
});
await new Promise((r) => server.listen(PORT, r));

const VERBOSE = process.argv.includes("--verbose");
let failures = 0, passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) passes++; else failures++;
  if (!ok || VERBOSE) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra && (!ok || VERBOSE) ? " — " + extra : ""}`);
};
const short = (v) => JSON.stringify(v)?.slice(0, 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDir = mkdtempSync(join(tmpdir(), "tb-ext-email-ask-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  ...extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
  headless: !process.argv.includes("--headful"),
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  await sleep(1200);
  const extId = new URL(sw.url()).host;
  const getState = () => sw.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k] || null), KEY);
  const setState = (v) => sw.evaluate(([k, val]) => chrome.storage.local.set({ [k]: val }), [KEY, v]);
  const waitFor = async (pred, ms = 5000) => {
    const end = Date.now() + ms;
    let st;
    while (Date.now() < end) { st = await getState(); if (pred(st)) return st; await sleep(100); }
    return st;
  };

  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: "load" });

  // 1. A real audit → signal → counted, not yet due.
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    // eslint-disable-next-line no-undef
    await handleComboAction({ type: "TB_RUN_AUDIT", tabId: tab.id }, {});
  }, GLOB);
  await page.waitForSelector("#tracebug-audit-panel .tb-au-score", { timeout: 20000 });
  let st = await waitFor((s) => s?.counts?.audit === 1);
  check("a finished audit is counted", st?.counts?.audit === 1, short(st));
  check("one result: the ask is not due yet", st?.state === "waiting", short(st));

  // Unknown kinds are ignored by the content script.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tracebug-success", { detail: { kind: "bogus" } })));
  // 2nd result (an export) → due, attributed to it.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tracebug-success", { detail: { kind: "export" } })));
  st = await waitFor((s) => s?.state === "due");
  check("2nd result makes the ask due", st?.state === "due", short(st));
  check("source names the result just before it", st?.source === "ext-export-2", short(st));
  check("unknown kinds are not counted", !("bogus" in (st?.counts || {})) && st?.counts?.export === 1, short(st));

  // 2. Popup shows it; showing it counts as ✕ (snoozed); submit sends address + ticked counts.
  const popup = await ctx.newPage();
  let posted = null;
  await popup.route("**/api/notify-me", async (route) => {
    posted = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForSelector("#emailAsk", { state: "visible", timeout: 5000 }).catch(() => {});
  check("popup shows the ask when due", await popup.isVisible("#emailAsk"));
  check("the audit card is still usable beside it", await popup.isEnabled("#btnAuditRun"));
  st = await getState();
  check("showing it snoozes (ignoring = ✕)", st?.state === "snoozed", short(st));
  check("counts are shown before sending", /1 audit, 0 saved tickets, 1 export/.test(await popup.textContent("#emailAskCounts")));

  await popup.fill("#emailAskInput", "not-an-email");
  await popup.click("#emailAskSubmit");
  check("a bad address is not sent", posted === null && /doesn't look like/.test(await popup.textContent("#emailAskMsg")));

  await popup.fill("#emailAskInput", "dev@example.com");
  await popup.click("#emailAskSubmit");
  await popup.waitForFunction(() => /check your inbox/.test(document.getElementById("emailAskMsg").textContent), null, { timeout: 5000 }).catch(() => {});
  check("without the box ticked, counts are not sent", posted && posted.email === "dev@example.com" && posted.source === "ext-export-2" && !("usage" in posted), short(posted));
  st = await getState();
  check("a signup ends the ask for good", st?.state === "done", short(st));
  await popup.reload();
  await sleep(500);
  check("done: not shown again", !(await popup.isVisible("#emailAsk")));

  // 3. Ticked box sends exactly the three counts.
  await setState({ counts: { audit: 3, ticket: 1, export: 2 }, state: "due", source: "ext-audit-2" });
  posted = null;
  await popup.reload();
  await popup.waitForSelector("#emailAsk", { state: "visible", timeout: 5000 });
  await popup.check("#emailAskUsage");
  await popup.fill("#emailAskInput", "dev@example.com");
  await popup.click("#emailAskSubmit");
  await popup.waitForFunction(() => /check your inbox/.test(document.getElementById("emailAskMsg").textContent), null, { timeout: 5000 }).catch(() => {});
  check("ticked: counts sent, nothing else", short(posted?.usage) === short({ audit: 3, ticket: 1, export: 2 }) && Object.keys(posted || {}).sort().join() === "email,source,usage", short(posted));

  // 4. No thanks → done.
  await setState({ counts: { audit: 2, ticket: 0, export: 0 }, state: "due", source: "ext-audit-2" });
  await popup.reload();
  await popup.waitForSelector("#emailAsk", { state: "visible", timeout: 5000 });
  await popup.click("#emailAskNo");
  st = await getState();
  check("No thanks ends it for good", st?.state === "done" && !(await popup.isVisible("#emailAsk")), short(st));

  // 5. ✕ → snoozed → due again at the 10th result, once.
  await setState({ counts: { audit: 2, ticket: 0, export: 0 }, state: "due", source: "ext-audit-2" });
  await popup.reload();
  await popup.waitForSelector("#emailAsk", { state: "visible", timeout: 5000 });
  await popup.click("#emailAskClose");
  check("✕ hides it", !(await popup.isVisible("#emailAsk")));
  for (let i = 0; i < 7; i++) {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("tracebug-success", { detail: { kind: "ticket" } })));
  }
  st = await waitFor((s) => s?.counts?.ticket === 7);
  check("9 results after ✕: still snoozed", st?.state === "snoozed", short(st));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("tracebug-success", { detail: { kind: "ticket" } })));
  st = await waitFor((s) => s?.state === "due");
  check("10th result: due once more", st?.state === "due" && st?.source === "ext-retry-10", short(st));
  await popup.reload();
  await popup.waitForSelector("#emailAsk", { state: "visible", timeout: 5000 });
  st = await getState();
  check("the retry is the last time", st?.state === "done", short(st));

  // 6. The in-page 5th-ticket card never appears in extension mode.
  check("no in-page milestone card in extension mode", (await page.$("#tracebug-milestone-ask")) === null);
} catch (err) {
  failures++;
  console.log("FAIL  unexpected error —", err?.message || err);
} finally {
  await ctx.close();
  server.close();
}

console.log(`${failures ? "FAIL" : "PASS"}  ext-email-ask: ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
