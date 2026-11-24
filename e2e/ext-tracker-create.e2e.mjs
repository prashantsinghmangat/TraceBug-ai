// Run: node e2e/ext-tracker-create.e2e.mjs   (needs `npm run build:ext` first)
//
// ADR 010, Phase 13 step 1: the Create panel in the extension-owned confirm
// window. With a GitHub token saved and NO repository typed, filing a ticket
// must go: Send to GitHub → confirm window lists repos → pick a repo → labels
// load → tick one → Create issue → the API gets that repo + label → the issue
// opens in a new tab → the pick is remembered.
//
// Also the privacy half of the ADR: the tracker list messages are refused when
// they come from a content script, and no token reaches the page.
//
// GitHub is stubbed with context.route, which Chromium applies to the
// extension service worker's fetches as well — checked below, so a silent miss
// can't pass as green.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname, dirname } from "node:path";
import { withGrantedHostAccess, withoutInPagePanel } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withoutInPagePanel(withGrantedHostAccess(EXT_SRC, "tracker-create")); // the window path; the panel is ext-inpage-panel

const PORT = 4923;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const TOKEN = "ghp_FAKE_E2E_TRACKER_TOKEN";
const ISSUE_URL = "https://github.com/acme/api/issues/42";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

let failures = 0, passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) passes++; else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), "tb-tracker-create-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// ── GitHub stub ────────────────────────────────────────────────────────────
const apiHits = [];
let issuePost = null;
let issuePosts = 0;
// The first POST "lands" at GitHub but the answer never arrives (connection
// dropped) — the unclear failure the duplicate guard exists for.
let dropFirstAnswer = true;
// Later creates answer after this long, so two can overlap.
let postDelayMs = 0;
let lastIssuesQuery = "";
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  apiHits.push(`${req.method()} ${url.pathname}`);
  const auth = req.headers()["authorization"] || "";
  const ok = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if (auth !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Bad credentials"}' });
  if (req.method() === "GET" && url.pathname === "/user/repos") {
    return ok([{ full_name: "acme/widgets" }, { full_name: "acme/api", private: true }, { full_name: "acme/old", archived: true }]);
  }
  if (req.method() === "GET" && url.pathname === "/repos/acme/api/labels") return ok([{ name: "bug" }, { name: "ui" }]);
  if (req.method() === "GET" && url.pathname === "/repos/acme/widgets/labels") return ok([{ name: "triage" }]);
  if (req.method() === "GET" && url.pathname === "/repos/acme/api") return ok({ permissions: { push: true } });
  if (req.method() === "GET" && url.pathname === "/repos/acme/widgets") return ok({ permissions: { push: false } });
  if (req.method() === "GET" && url.pathname === "/user") return ok({ login: "tester" });
  if (req.method() === "GET" && url.pathname === "/repos/acme/api/issues") {
    lastIssuesQuery = url.search;
    // The retry's look-up: the issue the dropped POST created is there.
    return ok(issuePost ? [{ number: 42, html_url: ISSUE_URL, body: issuePost.body }] : []);
  }
  if (req.method() === "POST" && url.pathname === "/repos/acme/api/issues") {
    issuePosts++;
    issuePost = JSON.parse(req.postData() || "{}");
    if (dropFirstAnswer) {
      dropFirstAnswer = false;
      await new Promise((r) => setTimeout(r, 700));
      return route.abort("connectionreset");
    }
    if (postDelayMs) await new Promise((r) => setTimeout(r, postDelayMs));
    return ok({ html_url: ISSUE_URL, number: 42 });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Not Found"}' });
});
// The created issue opens in a tab. Best effort: Playwright routes may not reach a tab the
// extension opens, so the checks below read only the tab's URL, never its content.
await ctx.route("https://github.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "text/html", body: "<title>acme/api#42</title><h1>Issue 42</h1>" }));

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  // A token, and deliberately no repository: the panel is where it is picked.
  await sw.evaluate((token) => chrome.storage.local.set({ tb_integrations_v1: { github: { token } } }), TOKEN);

  // ── The Firefox build hides Connect: it must not declare `identity` ──
  const ffManifest = join(EXT_DIST_DIR, "..", "firefox", "manifest.json");
  if (existsSync(ffManifest)) {
    const ff = JSON.parse(readFileSync(ffManifest, "utf8"));
    const chromeM = JSON.parse(readFileSync(join(EXT_DIST_DIR, "manifest.json"), "utf8"));
    check("Chrome build declares identity as OPTIONAL only",
      (chromeM.optional_permissions || []).includes("identity") && !(chromeM.permissions || []).includes("identity"));
    check("Firefox build does not declare identity at all",
      !(ff.optional_permissions || []).includes("identity") && !(ff.permissions || []).includes("identity"));
  }

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(500);

  // ── Privacy: a content script cannot list repos ──
  const fromContent = await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => new Promise((res) => chrome.runtime.sendMessage({ type: "tb:tracker:containers", tracker: "github" }, res)),
    });
    return r && r.result;
  }, GLOB);
  check("tb:tracker:containers from a content script is refused", !!fromContent && fromContent.error === "Rejected.",
    JSON.stringify(fromContent));
  check("…and nothing was fetched for it", apiHits.length === 0, apiHits.join(", "));

  const caps = await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps") || "");
  check("page caps say GitHub is usable with a token and no repo", JSON.parse(caps || "{}").github === true, caps);
  check("page caps carry no token", !caps.includes(TOKEN));

  // Record every provider result the PAGE sees, to prove no token is in it.
  await page.evaluate(() => {
    window.__tbResults = [];
    window.addEventListener("tracebug-provider-result", (e) => window.__tbResults.push(JSON.stringify(e.detail)));
  });

  // A ticket with real content.
  await page.evaluate(() => { try { window.__TraceBugExtension.startEventsCapture && window.__TraceBugExtension.startEventsCapture(); } catch (e) {} });
  await sleep(400);
  await page.fill("#coupon", "SAVE20");
  await page.click("#applyBtn");
  await sleep(400);
  await page.click("#orderBtn");
  await sleep(600);
  await page.keyboard.press("Control+Shift+KeyB");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(800);

  const primary = page.locator('#tracebug-quick-bug-modal [data-action="open-github"]').first();
  check('the ticket button reads "Send to GitHub"', (await primary.innerText()).trim() === "Send to GitHub");

  const confirmP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await primary.click();
  const win = await confirmP.catch(() => null);
  check("the confirm window opened", !!win);
  if (!win) throw new Error("no confirm window");
  await win.waitForLoadState("domcontentloaded");

  await win.waitForSelector("#panel:not([hidden])", { timeout: 8000 });
  check("the Create panel is shown for a GitHub send", true);
  check('the window is titled "Create GitHub issue"',
    (await win.title()) === "Create GitHub issue" && (await win.textContent("#heading")).trim() === "Create GitHub issue",
    await win.title());
  check("the tracker menu offers GitHub and Linear",
    JSON.stringify(await win.$$eval("#tracker option", (os) => os.map((o) => o.value))) === '["github","linear"]');
  check('the button reads "Create issue"', (await win.textContent("#send")).trim() === "Create issue");
  check("Create waits for a repository", await win.isDisabled("#send"));
  check("no Connect box while a saved token works", !(await win.isVisible("#connect")));
  check("no countdown", (await win.textContent("#countdown")).trim() === "");
  const armed = await sw.evaluate(() => chrome.alarms.getAll().then((a) => a.map((x) => x.name)));
  check("no deadline: nothing will close the window by itself", !armed.some((n) => n.startsWith("tb:confirm:expire:")), JSON.stringify(armed));
  const pend = await sw.evaluate(async () => Object.values((await chrome.storage.session.get("tb_pending_sends_v1")).tb_pending_sends_v1 || {})[0]);
  const SEND_ID = (pend && pend.sendId) || "";
  check("the send has a random UUID v4 id", /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(SEND_ID), SEND_ID);
  check("no duplicate Destination/Via rows", !(await win.isVisible("#meta")));

  await win.waitForFunction(() => document.querySelectorAll("#containerList option").length > 0, null, { timeout: 8000 });
  const listed = await win.$$eval("#containerList option", (os) => os.map((o) => o.value + (/Archived/.test(o.label) ? ":archived" : "")));
  check("repos are listed from GitHub, archived ones marked unavailable",
    JSON.stringify(listed) === '["acme/widgets","acme/api","acme/old:archived"]', JSON.stringify(listed));
  check("the worker's fetches went through the stub", apiHits.includes("GET /user/repos"), apiHits.join(", "));

  // A repo the user can't push to: the warning shows.
  await win.fill("#container", "acme/widgets");
  await win.dispatchEvent("#container", "change");
  await win.waitForSelector('fieldset[data-field="labels"] button.chip[value="triage"]', { timeout: 8000 });
  check("push warning shows for a repo the user can't push to",
    /can't push/.test(await win.textContent("#fields")), await win.textContent("#fields"));

  await win.fill("#container", "acme/api");
  await win.dispatchEvent("#container", "change");
  await win.waitForSelector('fieldset[data-field="labels"] button.chip[value="bug"]', { timeout: 8000 });
  check("labels load for the picked repo, as chips", true);
  check("…and no push warning where the user can push", !/can't push/.test(await win.textContent("#fields")));
  check('"bug" is ticked by default', (await win.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true");
  check("other labels are not", (await win.getAttribute('button.chip[value="ui"]', "aria-pressed")) === "false");
  check("Create is enabled once a repo is picked", !(await win.isDisabled("#send")));

  // ── Unclear failure: GitHub took the POST, the answer was lost ──
  await win.click("#send");
  await sleep(150);
  check("Create is disabled while sending", await win.isDisabled("#send"));
  check("…and Cancel too, so nothing is closed under it", await win.isDisabled("#cancel"));
  await win.waitForFunction(() => /won't be filed twice/.test(document.getElementById("panelMsg").textContent), null, { timeout: 10000 })
    .catch(() => {});
  const failMsg = (await win.textContent("#panelMsg")).trim();
  check("an unclear failure says so and offers Retry",
    /won't be filed twice/.test(failMsg) && (await win.textContent("#send")).trim() === "Retry", failMsg);
  check("the choices are kept", (await win.inputValue("#container")) === "acme/api" &&
    (await win.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true");
  check("the ticket in the page is still open and untouched",
    await page.locator("#tracebug-quick-bug-modal").isVisible() && (await page.evaluate(() => window.__tbResults.length)) === 0);
  check("the hidden marker went with the first try — only the random id",
    ((issuePost && issuePost.body) || "").endsWith(`\n\n<!-- tracebug:${SEND_ID} -->`), ((issuePost && issuePost.body) || "").slice(-60));

  const tabsBefore = ctx.pages().length;
  await win.click("#send");
  await win.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('the retry found the first issue: "Created #42"',
    (await win.textContent("#doneBox")).includes("Created #42"), (await win.textContent("#doneBox")).trim());
  check("…and says it was already there", /already been created/.test(await win.textContent("#doneNote")));
  check("the look-up asked for this user's issues since the first try",
    /creator=tester/.test(lastIssuesQuery) && /since=/.test(lastIssuesQuery) && /state=all/.test(lastIssuesQuery), lastIssuesQuery);
  check("GitHub got exactly one issue (no duplicate)", issuePosts === 1, String(issuePosts));
  check("…with the picked label", JSON.stringify(issuePost && issuePost.labels) === '["bug"]', JSON.stringify(issuePost && issuePost.labels));
  check("…and a title from the ticket", !!(issuePost && issuePost.title));
  await sleep(800);
  // Like Jam (owner decision 2026-11-20): the worker opens the filed issue in
  // a new tab — "Open the issue after creating", on by default.
  const issueTabs = await sw.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url || "").startsWith(u)).length, ISSUE_URL);
  check("the issue opened once, in a new tab", issueTabs === 1, `${issueTabs} tab(s); ${tabsBefore} → ${ctx.pages().length} pages`);

  await page.waitForFunction(() => window.__tbResults.length > 0, null, { timeout: 8000 }).catch(() => {});
  const results = await page.evaluate(() => window.__tbResults);
  check("the page got the result", results.some((r) => r.includes("issues/42")), results.join(" | ").slice(0, 200));
  check("no token in anything the page received", !results.some((r) => r.includes(TOKEN) || /ghp_|ghu_|ghr_/.test(r)));
  const toast = await page.locator("text=/GitHub issue created #42/").first().isVisible().catch(() => false);
  check('the page says "GitHub issue created #42"', toast);
  check("the page did not open it a second time",
    (await sw.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url || "").startsWith(u)).length, ISSUE_URL)) === 1);

  // The link opens it — only when clicked.
  const issueTabP = ctx.waitForEvent("page", { predicate: (p) => p.url().startsWith(ISSUE_URL), timeout: 8000 });
  await win.click("#issueLink");
  const issueTab = await issueTabP.catch(() => null);
  check("clicking the link opens the issue", !!issueTab, issueTab ? issueTab.url() : "no tab");

  const prefs = await sw.evaluate(async () => (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1);
  check("the repo and labels are remembered for next time",
    prefs && prefs.github && prefs.github.container === "acme/api" && JSON.stringify(prefs.github.fields.labels) === '["bug"]',
    JSON.stringify(prefs));

  // ── A new ticket: closing the window keeps it; two Creates at once file one issue ──
  await page.keyboard.press("Control+Shift+KeyB");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(800);
  await page.fill("#tb-qb-title", "Concurrent create");
  const send2 = page.locator('#tracebug-quick-bug-modal [data-action="open-github"]').first();
  let w2P = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await send2.click();
  let w2 = await w2P.catch(() => null);
  if (w2) { await w2.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {}); await w2.close(); }
  await sleep(900);
  check("closing the window leaves the ticket open, as it was",
    await page.locator("#tracebug-quick-bug-modal").isVisible() && (await page.inputValue("#tb-qb-title")) === "Concurrent create");

  w2P = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await send2.click();
  w2 = await w2P.catch(() => null);
  if (w2) {
    await w2.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
    postDelayMs = 800;
    const postsBefore = issuePosts;
    // Two creates for the same ticket, sent together (a double click that got
    // past the button, or a second message) — straight to the worker.
    const answers = await w2.evaluate(() => {
      const one = () => new Promise((r) => chrome.runtime.sendMessage({ type: "tb:confirm:create", id: ID, choice: collectChoice() }, r));
      return Promise.all([one(), one()]);
    });
    check("two Creates at once: one files, the other is refused as already running",
      answers.filter((a) => a && a.ok).length === 1 && answers.filter((a) => a && a.busy).length === 1, JSON.stringify(answers));
    check("…and GitHub got exactly one issue", issuePosts === postsBefore + 1, `${postsBefore} → ${issuePosts}`);
    await w2.close().catch(() => {});
  } else {
    check("second window opened", false);
  }

  // ── The options page sees accounts, never tokens ──
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  const status = await opt.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: "tb:tracker:status" }, res)));
  const gh = status && status.trackers && status.trackers.find((t) => t.id === "github");
  check("options: GitHub shows as connected via a token", gh && gh.connected && gh.via === "token", JSON.stringify(gh));
  check("options: status carries no token", !JSON.stringify(status).includes(TOKEN));
  check("options: the Chrome build supports sign-in UI", status && status.oauthUi === true);
  // GitHub sign-in is offered in this build, so the token row's menu offers switching to it.
  await opt.waitForFunction(() => /Using a personal token/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-line').textContent), null, { timeout: 5000 }).catch(() => {});
  check("options: the token row offers \"Switch to GitHub sign-in\" when sign-in is offered",
    await opt.evaluate(() => !document.querySelector('.tracker-acct[data-tracker="github"] .acct-switch').hidden));
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
