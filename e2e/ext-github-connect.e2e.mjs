// Run: node e2e/ext-github-connect.e2e.mjs   (needs `npm run build:ext` first)
//
// ADR 010, Phase 13 step 2: the Jam-style GitHub flow with NOTHING pasted.
// Fresh profile, no token anywhere:
//   Send to GitHub → Create window offers Connect GitHub → click → the code is
//   shown and github.com/login/device opens → (GitHub approves on the 2nd poll)
//   → "as octo" → repos from the app's installations → labels, assignee,
//   milestone → Create issue → the issue opens in a new tab.
// Then Disconnect from settings forgets the sign-in.
//
// GitHub (github.com device flow + api.github.com) is stubbed with
// context.route, which Chromium applies to the extension worker's fetches.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withGrantedHostAccess(EXT_SRC, "github-connect");

const PORT = 4924;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const ACCESS = "ghu_FAKEe2eAccessToken0123456789abcdef";
const REFRESH = "ghr_FAKEe2eRefreshToken0123456789abcdefghijklmnopqrstuvwxyz0123456789ABCD";
const REPO = "prashantsinghmangat/AI-workflowtask";
const ISSUE_URL = `https://github.com/${REPO}/issues/3`;

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
  mkdtempSync(join(tmpdir(), "tb-github-connect-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// ── GitHub stubs ───────────────────────────────────────────────────────────
const oauthBodies = [];
let polls = 0;
let issuePost = null;
let issuePosts = 0;
// While true, GitHub refuses the access token and the refresh token alike —
// a revoked sign-in. Cleared when a new device-flow token is issued.
let revoked = false;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

await ctx.route("https://github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "POST" && url.pathname === "/login/device/code") {
    oauthBodies.push(req.postData() || "");
    return json(route, { device_code: "dc_e2e", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", interval: 1, expires_in: 900 });
  }
  if (req.method() === "POST" && url.pathname === "/login/oauth/access_token") {
    oauthBodies.push(req.postData() || "");
    if (/grant_type=refresh_token/.test(req.postData() || "")) {
      return json(route, revoked ? { error: "bad_refresh_token" } : { access_token: ACCESS, expires_in: 28800 });
    }
    polls++;
    if (polls === 1) return json(route, { error: "authorization_pending" });
    revoked = false;
    return json(route, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer" });
  }
  // Best effort for pages: a tab the extension opens may bypass this route, so the
  // checks read only URLs (the device page is intercepted in the window instead).
  return route.fulfill({ status: 200, contentType: "text/html", body: `<title>${url.pathname}</title><h1>stub</h1>` });
});

await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (revoked || (req.headers()["authorization"] || "") !== `Bearer ${ACCESS}`) return json(route, { message: "Bad credentials" }, 401);
  const p = url.pathname;
  if (p === "/user") return json(route, { login: "octo" });
  if (p === "/user/installations") return json(route, { total_count: 1, installations: [{ id: 7 }] });
  if (p === "/user/installations/7/repositories") return json(route, { total_count: 1, repositories: [{ full_name: REPO, private: true }] });
  if (p === `/repos/${REPO}/labels`) return json(route, [{ name: "bug" }, { name: "ui" }]);
  if (p === `/repos/${REPO}/assignees`) return json(route, [{ login: "octo" }]);
  if (p === `/repos/${REPO}/milestones`) return json(route, [{ number: 1, title: "v1" }]);
  if (p === `/repos/${REPO}`) return json(route, { permissions: { push: true } });
  if (req.method() === "POST" && p === `/repos/${REPO}/issues`) {
    issuePosts++;
    issuePost = JSON.parse(req.postData() || "{}");
    return json(route, { html_url: ISSUE_URL, number: 3 });
  }
  return json(route, { message: "Not Found" }, 404);
});

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  const stored0 = await sw.evaluate(() => chrome.storage.local.get(["tb_integrations_v1", "tb_tracker_auth_v1"]));
  check("fresh profile: no token and no sign-in stored", !stored0.tb_integrations_v1 && !stored0.tb_tracker_auth_v1);

  // ── Onboarding offers Connect GitHub ──
  const welcome = await ctx.newPage();
  await welcome.goto(`chrome-extension://${extId}/welcome.html`);
  await welcome.waitForSelector("#trackerStep:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("welcome page: step 5 offers Connect GitHub",
    await welcome.isVisible("#trConnect") && (await welcome.textContent("#trConnect")).trim() === "Connect GitHub");
  check("welcome page: no repository picker before connecting", !(await welcome.isVisible("#trPickWrap")));

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
  await page.evaluate(() => {
    window.__tbResults = [];
    window.addEventListener("tracebug-provider-result", (e) => window.__tbResults.push(JSON.stringify(e.detail)));
  });

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
  check('with nothing set up, the ticket still offers "Send to GitHub"', (await primary.innerText()).trim() === "Send to GitHub");

  const confirmP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await primary.click();
  const win = await confirmP.catch(() => null);
  check("the Create window opened", !!win);
  if (!win) throw new Error("no confirm window");
  await win.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
  check('it offers "Connect GitHub"', (await win.textContent("#connect")).trim() === "Connect GitHub");
  check("there is no token field anywhere in the window", (await win.$$("input[type=password]")).length === 0);
  check("Create waits for the connection", await win.isDisabled("#send"));

  // Record the tab Connect asks for instead of loading the real github.com:
  // Playwright's route stubs don't reach tabs an extension opens.
  await win.evaluate(() => {
    window.__opened = [];
    chrome.tabs.create = (opts) => { window.__opened.push(opts && opts.url); return Promise.resolve({ id: -1 }); };
  });
  await win.click("#connect");
  await win.waitForFunction(() => window.__opened.length > 0, null, { timeout: 8000 }).catch(() => {});
  const opened = await win.evaluate(() => window.__opened);
  check("Connect opens github.com/login/device by itself", opened[0] === "https://github.com/login/device", JSON.stringify(opened));
  await win.waitForSelector("#deviceBox:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("the code to enter is shown", (await win.textContent("#userCode")).trim() === "ABCD-1234");

  // GitHub says "pending" once, then approves. The window keeps polling alone.
  await win.waitForFunction(() => /as octo/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 });
  check('after approval the window says "as octo"', true);
  check("it polled through authorization_pending", polls === 2, String(polls));
  check("no request to GitHub's sign-in endpoints carried a client secret",
    oauthBodies.length >= 2 && oauthBodies.every((b) => !/client_secret/.test(b) && /client_id=Iv23/.test(b)), oauthBodies.join(" | "));
  check("the device code never reached the window", !(await win.content()).includes("dc_e2e"));

  await win.waitForFunction(() => document.querySelectorAll("#containerList option").length > 0, null, { timeout: 8000 });
  const listed = await win.$$eval("#containerList option", (os) => os.map((o) => o.value));
  check("repos come from the app's installations", JSON.stringify(listed) === JSON.stringify([REPO]), JSON.stringify(listed));
  check('an "Add repositories" link is offered', await win.isVisible("#manageLink"));

  await win.fill("#container", REPO);
  await win.dispatchEvent("#container", "change");
  await win.waitForSelector('fieldset[data-field="labels"] button.chip[value="bug"]', { timeout: 8000 });
  check('"bug" starts ticked', (await win.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true");
  await win.selectOption('select[data-field="assignee"]', "octo");
  await win.selectOption('select[data-field="milestone"]', "1");

  // ── The sign-in is revoked on GitHub before Create ──
  revoked = true;
  await win.click("#send");
  await win.waitForSelector("#connect:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('a revoked sign-in turns into "Reconnect GitHub" in the panel',
    (await win.textContent("#connect")).trim() === "Reconnect GitHub", (await win.textContent("#panelMsg")).trim());
  check("nothing was filed, and the page heard nothing yet",
    issuePosts === 0 && (await page.evaluate(() => window.__tbResults.length)) === 0);

  await win.click("#connect");
  await win.waitForFunction(() => /as octo/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await win.waitForSelector('fieldset[data-field="labels"] button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  check("after reconnecting, the repo is kept", (await win.inputValue("#container")) === REPO);
  check("…and the label, assignee and milestone",
    (await win.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true" &&
    (await win.inputValue('select[data-field="assignee"]')) === "octo" &&
    (await win.inputValue('select[data-field="milestone"]')) === "1");

  await win.evaluate(() => { window.__opened = []; });
  await win.click("#send");
  await win.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('the panel says "Created #3" with a link', (await win.textContent("#issueLink")).trim() === "#3");
  await sleep(500);
  check("no tab was opened by itself", (await win.evaluate(() => window.__opened.length)) === 0 &&
    !ctx.pages().some((p) => p.url().startsWith(ISSUE_URL)));
  await win.click("#issueLink");
  check("the link opens the issue when clicked",
    (await win.evaluate(() => window.__opened[0])) === ISSUE_URL, JSON.stringify(await win.evaluate(() => window.__opened)));
  check("GitHub got the label, assignee and milestone",
    !!issuePost && JSON.stringify(issuePost.labels) === '["bug"]' && JSON.stringify(issuePost.assignees) === '["octo"]' && issuePost.milestone === 1,
    JSON.stringify(issuePost && { labels: issuePost.labels, assignees: issuePost.assignees, milestone: issuePost.milestone }));
  check("exactly one issue filed", issuePosts === 1, String(issuePosts));

  await page.waitForFunction(() => window.__tbResults.length > 0, null, { timeout: 8000 }).catch(() => {});
  const results = await page.evaluate(() => window.__tbResults);
  const caps = await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps") || "");
  check("the page got the issue link", results.some((r) => r.includes("issues/3")));
  check("no GitHub token in anything the page saw",
    ![...results, caps].some((r) => r.includes(ACCESS) || r.includes(REFRESH) || /gh[uor]_/.test(r)));

  const stored = await sw.evaluate(() => chrome.storage.local.get("tb_tracker_auth_v1"));
  const gh = stored.tb_tracker_auth_v1 && stored.tb_tracker_auth_v1.github;
  check("the sign-in is stored in extension storage with its expiry",
    !!gh && gh.tokens.accessToken === ACCESS && gh.tokens.refreshToken === REFRESH && gh.tokens.expiresAt > Date.now() && gh.account === "octo");
  const sess = await sw.evaluate(() => chrome.storage.session.get("tb_device_flow_v1"));
  check("the finished device code is cleared", !(sess.tb_device_flow_v1 && sess.tb_device_flow_v1.github));

  // ── Settings: account, Disconnect, token form folded away ──
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForFunction(() => /octo/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-line').textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const line = await opt.textContent('.tracker-acct[data-tracker="github"] .acct-line');
  check('settings: "Connected as octo."', (line || "").trim() === "Connected as octo.", line);
  check("settings: no token in the page", !(await opt.content()).includes(ACCESS));
  check("settings: the token form is folded away", !(await opt.evaluate(() => document.getElementById("ghAdvanced").open)));
  const defSel = '.tracker-acct[data-tracker="github"] .acct-default';
  await opt.waitForFunction((sel) => document.querySelectorAll(sel + " option").length > 1, defSel, { timeout: 5000 }).catch(() => {});
  check("settings: a Default repository picker lists the app's repos, set to the last one",
    (await opt.isVisible(defSel)) && (await opt.inputValue(defSel)) === REPO);
  await opt.selectOption(defSel, REPO);
  await opt.waitForFunction(() => /Saved/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-status').textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const pref = await sw.evaluate(async () => (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1);
  check("settings: picking it saves the default and keeps that repo's labels",
    pref && pref.github && pref.github.container === REPO && JSON.stringify(pref.github.fields.labels) === '["bug"]', JSON.stringify(pref));

  await welcome.reload();
  await welcome.waitForFunction(() => /octo/.test(document.getElementById("trStatus").textContent || ""), null, { timeout: 5000 }).catch(() => {});
  check("welcome page: connected, with the repository picker",
    !(await welcome.isVisible("#trConnect")) && (await welcome.isVisible("#trPick")) &&
    /Connected as octo/.test(await welcome.textContent("#trStatus")));
  await opt.click('.tracker-acct[data-tracker="github"] .acct-disconnect');
  await opt.waitForFunction(() => /Disconnected/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-status').textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const after = await sw.evaluate(() => chrome.storage.local.get(["tb_tracker_auth_v1", "tb_tracker_prefs_v1"]));
  check("Disconnect forgets the sign-in and the remembered picks",
    !(after.tb_tracker_auth_v1 && after.tb_tracker_auth_v1.github) && !(after.tb_tracker_prefs_v1 && after.tb_tracker_prefs_v1.github),
    JSON.stringify(after));
  check("settings offers Connect GitHub again",
    await opt.isVisible('.tracker-acct[data-tracker="github"] .acct-connect'));

  // ── Connect from onboarding, then pick the default repository there ──
  await welcome.reload();
  await welcome.waitForSelector("#trConnect:not([hidden])", { timeout: 5000 }).catch(() => {});
  await welcome.evaluate(() => {
    window.__opened = [];
    chrome.tabs.create = (opts) => { window.__opened.push(opts && opts.url); return Promise.resolve({ id: -1 }); };
  });
  await welcome.click("#trConnect");
  await welcome.waitForSelector("#trPickWrap:not([hidden])", { timeout: 15000 }).catch(() => {});
  check("welcome page: Connect opens GitHub's device page",
    (await welcome.evaluate(() => window.__opened[0])) === "https://github.com/login/device");
  await welcome.waitForFunction(() => document.querySelectorAll("#trPick option").length > 1, null, { timeout: 5000 }).catch(() => {});
  check("welcome page: right after connecting, it asks for the default repository",
    (await welcome.isVisible("#trPick")) && /pick where new issues go/.test(await welcome.textContent("#trStatus")),
    await welcome.textContent("#trStatus"));
  await welcome.selectOption("#trPick", REPO);
  await welcome.waitForFunction(() => /Saved/.test(document.getElementById("trStatus").textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const pref2 = await sw.evaluate(async () => (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1);
  check("welcome page: the pick is saved as the default", !!(pref2 && pref2.github && pref2.github.container === REPO), JSON.stringify(pref2));
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
