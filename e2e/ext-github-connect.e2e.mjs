// Run: node e2e/ext-github-connect.e2e.mjs   (needs `npm run build:ext` first)
//
// ADR 010, Phase 13 step 2: the Jam-style GitHub flow with NOTHING pasted.
// Fresh profile, no token anywhere:
//   Send to GitHub → Create window offers Connect GitHub → click → the code is
//   shown large and GitHub's device page opens in a POPUP WINDOW → the poll's
//   token (the only success signal) → popup closed, TraceBug refocused, "as
//   octo" → repos, labels, assignee, milestone → Create → "Created #3".
// Plus the edge cases of docs/audit/github-step2-plan.md: clipboard refused,
// offline poll, popup closed early + Reopen, slow_down, access_denied,
// expired_token, popup that can't open (tab instead), Reconnect keeping the
// choices, settings and onboarding.
//
// GitHub (github.com device flow + api.github.com) is stubbed with
// context.route, which Chromium applies to the extension worker's fetches.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess, withoutInPagePanel } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withoutInPagePanel(withGrantedHostAccess(EXT_SRC, "github-connect")); // the window path; the panel is ext-inpage-panel

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
// What GitHub's token endpoint answers a device-code poll:
//   "pending" | "approve" | "deny" | "expire" | "slow" (once) | "offline" (once)
let tokenMode = "pending";
const pollTimes = [];
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
    pollTimes.push(Date.now());
    const mode = tokenMode;
    if (mode === "slow" || mode === "offline") tokenMode = "pending";
    if (mode === "offline") return route.abort("internetdisconnected");
    if (mode === "slow") return json(route, { error: "slow_down", interval: 6 });
    if (mode === "deny") return json(route, { error: "access_denied", error_description: "The user has denied your application access." });
    if (mode === "expire") return json(route, { error: "expired_token" });
    if (mode !== "approve") return json(route, { error: "authorization_pending" });
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

  // GitHub's device page opens in a popup window the WORKER creates. Route
  // stubs don't reach extension-opened windows, so the worker's windows.create
  // (and its tabs.create fallback) get about:blank instead of the real
  // github.com — and the URLs asked for are recorded. Nothing here ever tells
  // the worker what the popup shows: only the token endpoint decides.
  await sw.evaluate(() => {
    self.__popups = [];
    self.__tabs = [];
    self.__failPopup = false;
    const gh = (u) => /^https:\/\/github\.com\//.test(String(u));
    const realWin = chrome.windows.create.bind(chrome.windows);
    chrome.windows.create = (opts) => {
      if (!(opts && gh(opts.url))) return realWin(opts);
      if (self.__failPopup) return Promise.reject(new Error("windows.create refused"));
      self.__popups.push({ url: opts.url, type: opts.type });
      return realWin(Object.assign({}, opts, { url: "about:blank" }));
    };
    const realTab = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = (opts) => {
      if (!(opts && gh(opts.url))) return realTab(opts);
      self.__tabs.push(opts.url);
      return realTab(Object.assign({}, opts, { url: "about:blank" }));
    };
    self.__focused = [];
    const update = chrome.windows.update.bind(chrome.windows);
    chrome.windows.update = (id, info, cb) => {
      if (info && info.focused) self.__focused.push(id);
      return update(id, info, cb);
    };
  });
  const popups = () => sw.evaluate(() => self.__popups);
  const deviceState = () => sw.evaluate(async () => ((await chrome.storage.session.get("tb_device_flow_v1")).tb_device_flow_v1 || {}).github || null);
  const windowExists = (id) => sw.evaluate((wid) => chrome.windows.get(wid).then(() => true, () => false), id);
  const tabExists = (id) => sw.evaluate((tid) => chrome.tabs.get(tid).then(() => true, () => false), id);

  check("the worker has no handler that reads the popup's address",
    await sw.evaluate(() => typeof onDevicePopupUrl === "undefined" && typeof isDeviceSuccessUrl === "undefined"));

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
  check('with nothing connected, the ticket offers one "Connect a tracker" button (no ▾ half)', (await primary.innerText()).trim() === "Connect a tracker" &&
    !(await page.$('#tracebug-quick-bug-modal [data-tb-split-caret]')), (await primary.innerText()).trim());

  const confirmP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await primary.click();
  const win = await confirmP.catch(() => null);
  check("the Create window opened", !!win);
  if (!win) throw new Error("no confirm window");
  await win.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
  check('it offers "Connect GitHub"', (await win.textContent("#connect")).trim() === "Connect GitHub");
  check("there is no token field anywhere in the window", (await win.$$("input[type=password]")).length === 0);
  check("Create waits for the connection", await win.isDisabled("#send"));

  // The window's own tab opens are recorded too; the clipboard is refused.
  await win.evaluate(() => {
    window.__opened = [];
    chrome.tabs.create = (opts) => { window.__opened.push(opts && opts.url); return Promise.resolve({ id: -1 }); };
    navigator.clipboard.writeText = () => Promise.reject(new Error("denied"));
  });
  await win.click("#connect");
  await win.waitForSelector("#deviceBox:not([hidden])", { timeout: 8000 }).catch(() => {});
  const pop1 = await popups();
  check("1. Connect opens GitHub's device page in a popup window",
    pop1.length === 1 && pop1[0].url === "https://github.com/login/device" && pop1[0].type === "popup", JSON.stringify(pop1));
  check("…and no tab", (await win.evaluate(() => window.__opened.length)) === 0 && (await sw.evaluate(() => self.__tabs.length)) === 0);
  check("2. the code is shown large and selectable", (await win.textContent("#userCode")).trim() === "ABCD-1234" &&
    (await win.$eval("#userCode", (e) => parseFloat(getComputedStyle(e).fontSize))) >= 28 &&
    (await win.$eval("#userCode", (e) => getComputedStyle(e).userSelect)) === "all");
  check("…copied before GitHub's window opened (or a 'select the code' hint), and a Copy button",
    (await win.isVisible("#copyCode")) && /Code copied|Select the code and copy it/.test(await win.textContent("#deviceHint")),
    await win.textContent("#deviceHint"));
  check("…and no Reopen button while the popup is open", !(await win.isVisible("#openDevice")));

  // 3. Pending for a while: nothing about the popup ever "connects" it.
  await sleep(2500);
  check("3. while GitHub says pending, the window keeps polling and stays unconnected",
    polls >= 2 && !/as octo/.test(await win.textContent("#account")), String(polls));

  // 4. A poll fails at the network: not final, polling goes on.
  tokenMode = "offline";
  await win.waitForFunction(() => /still trying/.test(document.getElementById("panelMsg").textContent || ""), null, { timeout: 8000 }).catch(() => {});
  check("4. a poll that can't reach GitHub says \"still trying\" and keeps the code",
    /still trying/.test(await win.textContent("#panelMsg")) && !!(await deviceState()) && (await deviceState()).deviceCode === "dc_e2e");

  // 5. The user closes GitHub's window early: polling continues, Reopen is offered.
  const stA = await deviceState();
  const pollsBefore = polls;
  await sw.evaluate((wid) => chrome.windows.remove(wid), stA && stA.popupWindowId);
  await win.waitForSelector("#openDevice:not([hidden])", { timeout: 8000 }).catch(() => {});
  check("5. closing GitHub's window early offers \"Reopen GitHub\" and says the code still works",
    (await win.isVisible("#openDevice")) && (await win.textContent("#openDevice")).trim() === "Reopen GitHub" &&
    /code still works/.test(await win.textContent("#panelMsg")), (await win.textContent("#panelMsg")).trim());
  await sleep(1500);
  check("…and polling goes on", polls > pollsBefore && !!(await deviceState()), `${pollsBefore} → ${polls}`);
  await win.click("#openDevice");
  await sleep(500);
  check("…Reopen GitHub opens the device page again in a popup",
    (await popups()).length === 2 && !(await win.isVisible("#openDevice")), JSON.stringify(await popups()));

  // 6. slow_down: the next poll waits the server's longer interval.
  tokenMode = "slow";
  await win.waitForFunction(() => true);
  const slowAt = await (async () => { for (let i = 0; i < 40 && tokenMode === "slow"; i++) await sleep(200); return pollTimes[pollTimes.length - 1]; })();
  const nAfterSlow = pollTimes.length;
  await (async () => { for (let i = 0; i < 60 && pollTimes.length === nAfterSlow; i++) await sleep(200); })();
  const gap = pollTimes[nAfterSlow] - slowAt;
  check("6. after slow_down the next poll waits the new interval (≥ 5.5 s)", gap >= 5500, `${gap} ms`);

  // 7. Authorize: the token is the only success signal.
  tokenMode = "approve";
  const st1 = await deviceState();
  await win.waitForFunction(() => /as octo/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 });
  check('7. the token arrives → the window says "as octo"', true);
  check("…the worker closed the popup", !(await windowExists(st1.popupWindowId)));
  check("…and brought the TraceBug window back to the front",
    st1.returnWindowId != null && (await sw.evaluate(() => self.__focused)).includes(st1.returnWindowId));
  const stDone = await deviceState();
  check("…and kept only 'done' (no device code) for a second page to read", !!stDone && stDone.done === true && !stDone.deviceCode,
    JSON.stringify(stDone));
  check("no request to GitHub's sign-in endpoints carried a client secret",
    oauthBodies.length >= 2 && oauthBodies.every((b) => !/client_secret/.test(b) && /client_id=Iv23/.test(b)), oauthBodies.join(" | ").slice(0, 200));
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
  tokenMode = "pending";
  await win.click("#send");
  await win.waitForSelector("#connect:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('a revoked sign-in turns into "Reconnect GitHub" in the panel',
    (await win.textContent("#connect")).trim() === "Reconnect GitHub", (await win.textContent("#panelMsg")).trim());
  check("nothing was filed, and the page heard nothing yet",
    issuePosts === 0 && (await page.evaluate(() => window.__tbResults.length)) === 0);

  // 8. Reconnect from the Create window keeps the choices.
  await win.click("#connect");
  await win.waitForSelector("#deviceBox:not([hidden])", { timeout: 8000 }).catch(() => {});
  tokenMode = "approve";
  await win.waitForFunction(() => /as octo/.test(document.getElementById("account").textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await win.waitForSelector('fieldset[data-field="labels"] button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  check("8. after reconnecting, the repo is kept", (await win.inputValue("#container")) === REPO);
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
  const sess = await deviceState();
  check("the device code is gone from session storage", !sess || !sess.deviceCode, JSON.stringify(sess));

  // ── Settings: account, Disconnect, token form folded away ──
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForFunction(() => /octo/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-line').textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const line = await opt.textContent('.tracker-acct[data-tracker="github"] .acct-line');
  check('settings: "Signed in as octo · GitHub App" (the mode, B11)', (line || "").trim() === "Signed in as octo · GitHub App", line);
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
  await opt.waitForFunction(() => /Signed out/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-status').textContent || ""), null, { timeout: 5000 }).catch(() => {});
  const after = await sw.evaluate(() => chrome.storage.local.get(["tb_tracker_auth_v1", "tb_tracker_prefs_v1"]));
  check("Disconnect forgets the sign-in and the remembered picks",
    !(after.tb_tracker_auth_v1 && after.tb_tracker_auth_v1.github) && !(after.tb_tracker_prefs_v1 && after.tb_tracker_prefs_v1.github),
    JSON.stringify(after));
  check("settings offers Connect GitHub again",
    await opt.isVisible('.tracker-acct[data-tracker="github"] .acct-connect'));

  const acct = '.tracker-acct[data-tracker="github"]';
  const statusText = () => opt.textContent(acct + " .acct-status");
  // Regression: a status message used to overwrite the line's classes, and
  // Connect from settings then silently did nothing.
  check("settings: the GitHub status line survives its own messages",
    await opt.evaluate((a) => !!document.querySelector(a + " .acct-status.status"), acct));
  // 9. access_denied → "Cancelled", Connect again; the popup is closed.
  tokenMode = "deny";
  await opt.click(acct + " .acct-connect");
  await opt.waitForFunction((a) => /Cancelled/.test(document.querySelector(a + " .acct-status").textContent || ""), acct, { timeout: 10000 }).catch(() => {});
  const popDeny = (await popups()).length;
  check('9. declined on GitHub → "Cancelled", Connect GitHub offered again',
    /Cancelled/.test(await statusText()) && (await opt.textContent(acct + " .acct-connect")).trim() === "Connect GitHub" &&
    !(await opt.isVisible(acct + " .device")), await statusText());
  check("…the sign-in state is cleared", (await deviceState()) === null);
  const lastPop = await sw.evaluate(async () => (await chrome.windows.getAll({ populate: true })).filter((w) => w.type === "popup" && w.tabs.some((t) => t.url === "about:blank")).length);
  check("…and the GitHub popup was closed", lastPop === 0, `${popDeny} popups opened, ${lastPop} left`);

  // 10. expired_token → "Code expired", Get a new code.
  tokenMode = "expire";
  await opt.click(acct + " .acct-connect");
  await opt.waitForFunction((a) => /Code expired/.test(document.querySelector(a + " .acct-status").textContent || ""), acct, { timeout: 10000 }).catch(() => {});
  check('10. an expired code → "Code expired" and "Get a new code"',
    /Code expired/.test(await statusText()) && (await opt.textContent(acct + " .acct-connect")).trim() === "Get a new code", await statusText());
  check("…the sign-in state is cleared", (await deviceState()) === null);

  // ── Connect from onboarding, then pick the default repository there ──
  await welcome.reload();
  await welcome.waitForSelector("#trConnect:not([hidden])", { timeout: 5000 }).catch(() => {});
  // 11. The popup can't be created: a normal tab opens instead, and is closed on the token.
  const before = (await popups()).length;
  tokenMode = "pending";
  await sw.evaluate(() => { self.__failPopup = true; });
  await welcome.click("#trConnect");
  await welcome.waitForSelector("#trCodeLine:not([hidden])", { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const tabs11 = await sw.evaluate(() => self.__tabs);
  const st11 = await deviceState();
  check("11. welcome page: when the popup can't open, the device page opens in a tab",
    (await popups()).length === before && tabs11[tabs11.length - 1] === "https://github.com/login/device" && st11 && st11.popupTabId != null,
    JSON.stringify(tabs11));
  check("…and the hint says GitHub tab", /GitHub tab/.test(await welcome.textContent("#trStatus")), await welcome.textContent("#trStatus"));
  tokenMode = "approve";
  await welcome.waitForSelector("#trPickWrap:not([hidden])", { timeout: 15000 }).catch(() => {});
  await welcome.waitForFunction(() => document.querySelectorAll("#trPick option").length > 1, null, { timeout: 5000 }).catch(() => {});
  check("…the worker closed that tab on the token", !(await tabExists(st11.popupTabId)));
  await sw.evaluate(() => { self.__failPopup = false; });
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
