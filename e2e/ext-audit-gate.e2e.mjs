// Site Audit sign-in gate (ADR 009, docs/launch/sign-in-gate-plan.md).
//
// Proves: 3 audits are free with a "N left" note; the 4th asks for a free account
// while the saved result stays visible and exportable; sign-in happens on the
// extension's signin.html (email → code), never on the site; after sign-in audits
// run again; a bad code is refused; when sign-in can't be reached the gate opens
// (fail open); the marketing box is unticked unless ticked; delete clears the account.
// The tracebug.dev API is mocked with page.route — no network.
//
//   npm run build:ext && node e2e/ext-audit-gate.e2e.mjs [--headful] [--verbose]

import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const DIST = join(EXT_SRC_DIR, "dist", "chrome");
if (!existsSync(join(DIST, "signin.html"))) {
  console.error("No packaged build with signin.html — run `npm run build:ext` first.");
  process.exit(1);
}
const EXT = withGrantedHostAccess(DIST, "audit-gate");
const PORT = 4224;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GLOB = `${ORIGIN}/*`;
const KEY = "tb_audit_gate_v1";

const server = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gate fixture</title></head>
<body><h1>Gate</h1><button><svg width="9" height="9"></svg></button></body></html>`);
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

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "tb-ext-gate-")), {
  ...extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
  headless: !process.argv.includes("--headful"),
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  await sleep(1200);
  const extId = new URL(sw.url()).host;
  const gate = () => sw.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k] || null), KEY);
  const setGate = (v) => sw.evaluate(([k, val]) => chrome.storage.local.set({ [k]: val }), [KEY, v]);

  const page = await ctx.newPage();
  await page.goto(`${ORIGIN}/`, { waitUntil: "load" });
  const P = "#tracebug-audit-panel";
  const lastId = () => page.evaluate(() => window.__TraceBugExtension.getLastAudit()?.id ?? null);
  const panelText = () => page.locator(P).innerText().catch(() => "");
  const waitNewRun = async (prev) => {
    await page.waitForFunction((p) => { const r = window.__TraceBugExtension.getLastAudit(); return r && r.id !== p; }, prev, { timeout: 20000 }).catch(() => {});
    await sleep(300);
  };

  // Audit 1 — from the popup action.
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    // eslint-disable-next-line no-undef
    await handleComboAction({ type: "TB_RUN_AUDIT", tabId: tab.id }, {});
  }, GLOB);
  await page.waitForSelector(`${P} .tb-au-score`, { timeout: 20000 });
  await sleep(300);
  check("audit 1 runs and says 2 free audits are left", /2 free audits left/.test(await panelText()), (await panelText()).slice(0, 200));

  // Audits 2 and 3 — Re-scan in the panel.
  let prev = await lastId();
  await page.click(`${P} .tb-au-score [data-tb-au="rerun"]`);
  await waitNewRun(prev);
  check("audit 2 runs: 1 free audit left", /1 free audit left/.test(await panelText()));
  prev = await lastId();
  await page.click(`${P} .tb-au-score [data-tb-au="rerun"]`);
  await waitNewRun(prev);
  check("audit 3 runs and says it was the last free one", /That was your last free audit/.test(await panelText()));
  const g3 = await gate();
  check("three finished audits are counted", g3?.audits === 3, short(g3));

  // Audit 4 — gated; the saved result stays.
  const before4 = await lastId();
  await page.click(`${P} .tb-au-score [data-tb-au="rerun"]`);
  await page.waitForSelector(`${P} .tb-au-gate`, { timeout: 10000 }).catch(() => {});
  await sleep(500);
  check("audit 4 asks for a free account", /You've used your free audits/.test(await panelText()));
  check("no 4th scan ran", (await lastId()) === before4 && (await gate())?.audits === 3);
  check("the last result is still on screen", (await page.locator(`${P} .tb-au-score`).count()) === 1);
  check("no email field on the site itself", (await page.locator(`${P} input[type="email"]`).count()) === 0);
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }).catch(() => null),
    page.click(`${P} [data-tb-au="export"]`),
  ]);
  check("the saved result can still be exported while gated", !!dl && /^tracebug-audit-/.test(dl.suggestedFilename()), dl?.suggestedFilename());

  // Sign in on signin.html (opened by the panel button).
  const [signin] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 10000 }),
    page.click(`${P} .tb-au-gate [data-tb-au="signin"]`),
  ]);
  await signin.waitForLoadState("load");
  check("Sign in opens the extension's own page", signin.url() === `chrome-extension://${extId}/signin.html`, signin.url());
  const calls = [];
  let verifyStatus = 400;
  await signin.route("**/api/ext/otp/**", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const path = new URL(route.request().url()).pathname;
    calls.push({ path, body });
    if (path.endsWith("/start")) return route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    return route.fulfill({ status: verifyStatus, contentType: "application/json",
      body: verifyStatus === 200 ? JSON.stringify({ ok: true, email: body.email, userId: "u-1", ...(body.intent === "delete" ? { deleted: true } : {}) }) : '{"error":"invalid_code"}' });
  });
  check("the marketing box starts unticked", !(await signin.isChecked("#marketing")));
  await signin.fill("#email", "Dev@Example.com");
  await signin.click("#sendCode");
  await signin.waitForSelector("#stepCode:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("email → code step", await signin.isVisible("#code") && calls[0]?.body?.email === "dev@example.com", short(calls[0]));
  await signin.fill("#code", "111111");
  await signin.click("#verify");
  await sleep(400);
  check("a wrong code is refused", /didn't work/.test(await signin.textContent("#codeMsg")) && !(await gate())?.account);
  verifyStatus = 200;
  await signin.fill("#code", "123456");
  await signin.click("#verify");
  await signin.waitForSelector("#stepDone:not([hidden])", { timeout: 5000 }).catch(() => {});
  const g4 = await gate();
  const v = calls.filter((c) => c.path.endsWith("/verify")).pop();
  check("a right code signs in", g4?.account?.email === "dev@example.com" && g4?.account?.userId === "u-1", short(g4));
  check("marketing is false unless ticked; nothing else is sent", v?.body?.marketing === false && Object.keys(v?.body || {}).sort().join() === "code,email,intent,marketing", short(v?.body));

  // Back on the site: audits run again, no gate, no "free left" note.
  await page.bringToFront();
  const before5 = await lastId();
  await page.click(`${P} [data-tb-au="rerun"]`);
  await waitNewRun(before5);
  check("signed in: Re-scan runs", (await lastId()) !== before5);
  check("signed in: no gate and no free-audits note", !/used your free audits|free audit/.test(await panelText()));

  // Fail open: signed out, over the limit, sign-in unreachable.
  await setGate({ audits: 3, account: null });
  await signin.unroute("**/api/ext/otp/**");
  await signin.route("**/api/ext/otp/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"unavailable"}' }));
  await signin.goto(`chrome-extension://${extId}/signin.html`);
  await signin.fill("#email", "dev@example.com");
  await signin.click("#sendCode");
  await sleep(500);
  const g5 = await gate();
  check("sign-in down: the page says so and opens audits for a while", /couldn't reach/.test(await signin.textContent("#emailMsg")) && g5?.graceUntil > Date.now(), short(g5));
  const before6 = await lastId();
  await page.bringToFront();
  await page.click(`${P} [data-tb-au="rerun"]`);
  await waitNewRun(before6);
  check("sign-in down: the audit runs (fail open)", (await lastId()) !== before6);

  // Marketing ticked + delete.
  await setGate({ audits: 3, account: null });
  await signin.unroute("**/api/ext/otp/**");
  calls.length = 0;
  await signin.route("**/api/ext/otp/**", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    calls.push({ path: new URL(route.request().url()).pathname, body });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, userId: "u-1", email: body.email }) });
  });
  await signin.goto(`chrome-extension://${extId}/signin.html`);
  await signin.fill("#email", "dev@example.com");
  await signin.check("#marketing");
  await signin.click("#sendCode");
  await signin.waitForSelector("#stepCode:not([hidden])", { timeout: 5000 });
  await signin.fill("#code", "123456");
  await signin.click("#verify");
  await signin.waitForSelector("#stepDone:not([hidden])", { timeout: 5000 });
  check("ticked marketing box is sent as true", calls.find((c) => c.path.endsWith("/verify"))?.body?.marketing === true);
  await signin.click("#deleteAccount");
  await signin.waitForSelector("#stepEmail:not([hidden])", { timeout: 5000 });
  check("delete starts with the signed-in email filled", (await signin.inputValue("#email")) === "dev@example.com");
  calls.length = 0;
  await signin.click("#sendCode");
  await signin.waitForSelector("#stepCode:not([hidden])", { timeout: 5000 });
  await signin.fill("#code", "123456");
  await signin.click("#verify");
  await signin.waitForSelector("#stepDone:not([hidden])", { timeout: 5000 });
  const del = calls.find((c) => c.path.endsWith("/verify"));
  check("delete sends intent delete and clears the account", del?.body?.intent === "delete" && del?.body?.marketing === false && !(await gate())?.account, short(del?.body));
} catch (err) {
  failures++;
  console.log("FAIL  unexpected error —", err?.message || err);
} finally {
  await ctx.close();
  server.close();
}

console.log(`${failures ? "FAIL" : "PASS"}  ext-audit-gate: ${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
