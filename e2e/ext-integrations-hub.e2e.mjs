// Run: node e2e/ext-integrations-hub.e2e.mjs   (needs `npm run build:ext` first)
//
// Phase 13 step 5: the Integrations hub (integrations-hub.js) in settings and
// the popup, the header status icon, and the ticket's default-tracker button.
//   0. nothing connected: popup icon says so, no dot
//   1. keyboard only: the roving grid, the connect dialog (focus trap, Esc,
//      focus back on the tile), Coming soon tiles, the #integrations deep link
//   2. connect GitHub from a tile (device flow, stubbed) → spinner on the tile →
//      listed under My connections → asked for the default repository
//   3. Slack + Set default; the popup icon's tooltip follows
//   4. Needs reconnect (Linear): the row, the dot, the popup hub, the popup's
//      hand-off to settings
//   5. Test connection
//   6. the ticket: main button = default tracker, others under More ▾, status
//      icon (no repo name in the page), icon → Create panel, Ctrl+Enter creates
//   7. Disconnect with a confirm dialog
//   8. 360 px, light and dark
//
// GitHub (device flow + API) is stubbed with context.route, which reaches the
// worker's fetches. Not covered here: the Error state from a REMOVED host
// permission (the harness grants <all_urls>, and only a native dialog removes
// it) — unit-tested in tests/integration-status.test.ts, and a manual row.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT = withGrantedHostAccess(requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first"), "integrations-hub");

const PORT = 4931;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const ACCESS = "ghu_FAKEhubAccessToken0123456789abcdef";
const REPO = "acme-private/web-app";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A hung step must fail the gate, not stall it.
const watchdog = setTimeout(() => { console.log(`FAIL  timed out after 4 min (${passes} passed so far)`); process.exit(1); }, 4 * 60 * 1000);

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), "tb-hub-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// ── GitHub stubs ───────────────────────────────────────────────────────────
let tokenMode = "pending";
const posts = [];
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
await ctx.route("https://github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (req.method() === "POST" && url.pathname === "/login/device/code") {
    return json(route, { device_code: "dc_hub", user_code: "WXYZ-9876", verification_uri: "https://github.com/login/device", interval: 1, expires_in: 900 });
  }
  if (req.method() === "POST" && url.pathname === "/login/oauth/access_token") {
    if (tokenMode !== "approve") return json(route, { error: "authorization_pending" });
    return json(route, { access_token: ACCESS, refresh_token: "ghr_x", expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer" });
  }
  return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>stub</h1>" });
});
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const p = new URL(req.url()).pathname;
  if ((req.headers()["authorization"] || "") !== `Bearer ${ACCESS}`) return json(route, { message: "Bad credentials" }, 401);
  if (p === "/user") return json(route, { login: "octo" });
  if (p === "/user/installations") return json(route, { total_count: 1, installations: [{ id: 7 }] });
  if (p === "/user/installations/7/repositories") return json(route, { total_count: 1, repositories: [{ full_name: REPO, private: true }] });
  if (p === `/repos/${REPO}/labels`) return json(route, [{ name: "bug" }]);
  if (p === `/repos/${REPO}/assignees`) return json(route, [{ login: "octo" }]);
  if (p === `/repos/${REPO}/milestones`) return json(route, []);
  if (p === `/repos/${REPO}`) return json(route, { permissions: { push: true } });
  if (req.method() === "POST" && p === `/repos/${REPO}/issues`) {
    posts.push(JSON.parse(req.postData() || "{}"));
    return json(route, { html_url: `https://github.com/${REPO}/issues/${posts.length + 40}`, number: posts.length + 40 });
  }
  return json(route, { message: "Not Found" }, 404);
});

const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? { tag: a.tagName, tracker: a.dataset && a.dataset.tracker, text: (a.textContent || "").trim(), inDialog: !!a.closest(".tbh-dialog"), cls: a.className } : null;
});

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  const OPT = `chrome-extension://${extId}/options.html`;
  const POP = `chrome-extension://${extId}/popup.html`;
  // GitHub's device page opens in a window the worker creates; route stubs
  // don't reach it, so it gets about:blank.
  await sw.evaluate(() => {
    const realWin = chrome.windows.create.bind(chrome.windows);
    chrome.windows.create = (opts) => realWin(Object.assign({}, opts, /github\.com/.test(String(opts && opts.url)) ? { url: "about:blank" } : {}));
    const realTab = chrome.tabs.create.bind(chrome.tabs);
    chrome.tabs.create = (opts) => realTab(Object.assign({}, opts, /github\.com/.test(String(opts && opts.url)) ? { url: "about:blank" } : {}));
  });
  const setLocal = (obj) => sw.evaluate((o) => chrome.storage.local.set(o), obj);
  const getLocal = (k) => sw.evaluate(async (key) => (await chrome.storage.local.get(key))[key], k);

  // ══ 0. Nothing connected ═════════════════════════════════════════════════
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 360, height: 600 });
  await pop.goto(POP);
  await pop.waitForFunction(() => /No tracker/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check("0. popup icon, nothing connected: tooltip says so, no dot",
    (await pop.getAttribute("#intBtn", "title")) === "No tracker connected · connect one" && await pop.isHidden("#intBtn .hd-int-dot"));

  // ══ 1. Keyboard only ═════════════════════════════════════════════════════
  const opt = await ctx.newPage();
  await opt.goto(OPT);
  await opt.waitForSelector(".tbh-tile", { timeout: 8000 });
  check("1. settings, fresh: My connections (0) and the Add platform grid is shown",
    (await opt.textContent("#tbh-tab-conn")) === "My connections (0)" && (await opt.getAttribute("#tbh-tab-add", "aria-selected")) === "true");
  check("…six tiles: GitHub, Linear, Slack live; GitLab, Azure DevOps, Jira coming soon",
    JSON.stringify(await opt.$$eval(".tbh-tile", (ts) => ts.map((t) => t.dataset.tracker + (t.getAttribute("aria-disabled") ? ":soon" : ""))))
      === JSON.stringify(["github", "linear", "slack", "gitlab:soon", "azure:soon", "jira:soon"]));
  check("…each logo has an accessible name",
    await opt.$$eval(".tbh-tile svg", (ss) => ss.every((s) => s.getAttribute("role") === "img" && !!s.getAttribute("aria-label"))));
  check("…roving tabindex: exactly one tile is tabbable", (await opt.$$eval('.tbh-tile[tabindex="0"]', (t) => t.length)) === 1);
  await opt.focus('.tbh-tile[tabindex="0"]');
  const keys = [];
  for (const k of ["ArrowRight", "ArrowRight", "ArrowDown", "Home", "End", "ArrowUp", "Control+Home", "ArrowLeft"]) {
    await opt.keyboard.press(k);
    keys.push((await active(opt)).tracker);
  }
  check("…arrows, Home/End move focus around the grid", JSON.stringify(keys) ===
    JSON.stringify(["linear", "slack", "jira", "gitlab", "jira", "slack", "github", "github"]), JSON.stringify(keys));
  check("…and the tabbable tile follows focus", (await opt.$$eval('.tbh-tile[tabindex="0"]', (t) => t.map((x) => x.dataset.tracker))).join() === "github");
  await opt.keyboard.press("Control+End");
  await opt.keyboard.press("Enter");
  await sleep(100);
  check('…Enter on a "Coming soon" tile opens nothing and says so',
    await opt.isHidden(".tbh-dialog-wrap") && /Coming soon/.test(await opt.textContent(".tbh-live")) &&
    /Coming soon/.test(await opt.getAttribute('.tbh-tile[data-tracker="jira"]', "title")));
  await opt.keyboard.press("Control+Home");
  await opt.keyboard.press("Enter");
  await opt.waitForSelector(".tbh-dialog", { timeout: 3000 });
  const a1 = await active(opt);
  check('…Enter on GitHub opens the dialog, focus on "Sign in with GitHub — recommended"',
    a1.inDialog && a1.text.endsWith("Sign in with GitHub — recommended"), a1.text);
  const dlg = await opt.textContent(".tbh-dialog");
  check("…the dialog says TraceBug can't read your code, and the token path is Advanced with exact scopes",
    /TraceBug can't read your code/.test(dlg) && /Advanced: use a token/.test(dlg) && /Issues: Read and write/.test(dlg) && /repo scope/.test(dlg));
  check("…sign-in comes before the token path",
    await opt.evaluate(() => { const d = document.querySelector(".tbh-dialog"); return d.querySelector(".tbh-signin").compareDocumentPosition(d.querySelector(".tbh-advanced")) === Node.DOCUMENT_POSITION_FOLLOWING; }));
  check("…dialog semantics: role=dialog, aria-modal, labelled",
    await opt.evaluate(() => { const d = document.querySelector(".tbh-dialog"); return d.getAttribute("role") === "dialog" && d.getAttribute("aria-modal") === "true" && !!document.getElementById(d.getAttribute("aria-labelledby")); }));
  let trapped = true;
  for (let i = 0; i < 9; i++) { await opt.keyboard.press("Tab"); if (!(await active(opt)).inDialog) trapped = false; }
  for (let i = 0; i < 9; i++) { await opt.keyboard.press("Shift+Tab"); if (!(await active(opt)).inDialog) trapped = false; }
  check("…Tab and Shift+Tab stay inside the dialog", trapped);
  await opt.keyboard.press("Escape");
  await sleep(100);
  const a2 = await active(opt);
  check("…Esc closes it and focus returns to the GitHub tile", await opt.isHidden(".tbh-dialog-wrap") && a2.tracker === "github");
  await opt.keyboard.press("Space");
  await opt.waitForSelector(".tbh-dialog", { timeout: 3000 }).catch(() => {});
  check("…Space opens it too", await opt.isVisible(".tbh-dialog"));
  await opt.keyboard.press("Escape");
  await opt.focus("#tbh-tab-add");
  await opt.keyboard.press("ArrowLeft");
  check("…tabs: arrow keys switch My connections / Add platform",
    (await opt.getAttribute("#tbh-tab-conn", "aria-selected")) === "true" && (await active(opt)).text === "My connections (0)");
  check("…status lines live in an aria-live region", (await opt.getAttribute(".tbh-live", "aria-live")) === "polite");

  const deep = await ctx.newPage();
  await deep.goto(OPT + "#integrations:connect=github");
  await deep.waitForSelector(".tbh-dialog", { timeout: 5000 }).catch(() => {});
  check("…#integrations:connect=github (the popup's hand-off) opens the GitHub dialog in settings",
    /Connect GitHub/.test((await deep.textContent(".tbh-dialog h3").catch(() => "")) || ""));
  await deep.close();

  // ══ 2. Connect → listed → asked for the default repo ═════════════════════
  await opt.click("#tbh-tab-add");
  await opt.focus('.tbh-tile[data-tracker="github"]');
  await opt.keyboard.press("Enter");
  await opt.waitForSelector(".tbh-signin", { timeout: 3000 });
  await opt.keyboard.press("Enter");
  await opt.waitForFunction(() => (document.querySelector(".tbh-code") || {}).textContent === "WXYZ-9876", null, { timeout: 8000 }).catch(() => {});
  check("2. Sign in shows the device code in the dialog", (await opt.textContent(".tbh-code").catch(() => "")) === "WXYZ-9876");
  check("…the GitHub tile spins while connecting (aria-busy + spinner)",
    (await opt.getAttribute('.tbh-tile[data-tracker="github"]', "aria-busy")) === "true" && await opt.$('.tbh-tile[data-tracker="github"] .tbh-spinner') !== null);
  tokenMode = "approve";
  await opt.waitForSelector('.tbh-row[data-tracker="github"]', { timeout: 15000 }).catch(() => {});
  check("…once GitHub confirms: listed under My connections (1), as octo, dialog closed",
    (await opt.textContent("#tbh-tab-conn")) === "My connections (1)" && /octo/.test(await opt.textContent('.tbh-row[data-tracker="github"]')) &&
    await opt.isHidden(".tbh-dialog-wrap"));
  check("…the GitHub tile left the grid", !(await opt.$('.tbh-tile[data-tracker="github"]')));
  await opt.waitForFunction(() => document.activeElement && document.activeElement.classList.contains("tbh-select") && document.activeElement.options.length > 1, null, { timeout: 8000 }).catch(() => {});
  check("…and you're asked for the default repository (picker focused)", await opt.evaluate(() => document.activeElement.classList.contains("tbh-select")));
  await opt.selectOption('.tbh-row[data-tracker="github"] .tbh-select', REPO);
  await opt.waitForFunction(() => /Saved/.test(document.querySelector(".tbh-live").textContent), null, { timeout: 5000 }).catch(() => {});
  const prefs = await getLocal("tb_tracker_prefs_v1");
  check("…the default repo is saved with its name", prefs && prefs.github && prefs.github.container === REPO && prefs.github.containerLabel === REPO, JSON.stringify(prefs));

  // ══ 3. Slack + Set default; popup icon follows ═══════════════════════════
  await setLocal({ tb_integrations_v1: { slack: { webhookUrl: "https://hooks.slack.com/services/T/B/x" } } });
  await opt.reload();
  await opt.waitForSelector('.tbh-row[data-tracker="slack"]', { timeout: 5000 }).catch(() => {});
  check("3. Slack (webhook) is listed; GitHub is the default",
    (await opt.textContent("#tbh-tab-conn")) === "My connections (2)" && /Default/.test(await opt.textContent('.tbh-row[data-tracker="github"] .tbh-row-title')));
  await pop.waitForFunction(() => /GitHub/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check('…popup icon: "GitHub · acme-private/web-app · connected", no dot, GitHub logo',
    (await pop.getAttribute("#intBtn", "title")) === `GitHub · ${REPO} · connected` && await pop.isHidden("#intBtn .hd-int-dot") &&
    (await pop.getAttribute("#intBtn .hd-int-logo svg", "aria-label")) === "GitHub");
  await opt.click('.tbh-row[data-tracker="slack"] >> text=Set default');
  await opt.waitForFunction(() => /Default/.test((document.querySelector('.tbh-row[data-tracker="slack"] .tbh-row-title') || {}).textContent || ""), null, { timeout: 5000 }).catch(() => {});
  check("…Set default on Slack moves the badge and is stored",
    /Default/.test(await opt.textContent('.tbh-row[data-tracker="slack"] .tbh-row-title')) &&
    !/Default/.test(await opt.textContent('.tbh-row[data-tracker="github"] .tbh-row-title')) && (await getLocal("tb_tracker_default_v1")) === "slack");
  await pop.waitForFunction(() => /^Slack/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check("…the popup icon follows: Slack · connected", (await pop.getAttribute("#intBtn", "title")) === "Slack · connected");
  await setLocal({ tb_tracker_default_v1: "github" });

  // ══ 4. Needs reconnect ═══════════════════════════════════════════════════
  const auth = await getLocal("tb_tracker_auth_v1");
  await setLocal({ tb_tracker_auth_v1: Object.assign({}, auth, { linear: { tokens: { accessToken: "lin_x" }, account: "ana@acme.test", needsReconnect: true } }) });
  await pop.waitForFunction(() => !document.querySelector("#intBtn .hd-int-dot").hidden, null, { timeout: 5000 }).catch(() => {});
  check("4. a connection needing reconnect puts a warning dot on the popup icon", await pop.isVisible("#intBtn .hd-int-dot") &&
    /GitHub/.test(await pop.getAttribute("#intBtn", "aria-label")));
  await opt.reload();
  await opt.waitForSelector('.tbh-row[data-tracker="linear"]', { timeout: 5000 }).catch(() => {});
  check("…settings: Linear row shows Needs reconnect ⚠ with a Reconnect button",
    (await opt.getAttribute('.tbh-row[data-tracker="linear"]', "data-state")) === "reconnect" &&
    (await opt.textContent('.tbh-row[data-tracker="linear"] .tbh-pill')) === "Needs reconnect ⚠" &&
    await opt.isVisible('.tbh-row[data-tracker="linear"] >> text=Reconnect Linear'));
  await pop.click("#intBtn");
  await pop.waitForSelector('#hubView .tbh-row[data-tracker="linear"]', { timeout: 5000 }).catch(() => {});
  check("…popup: the icon opens the hub view (Back focused), with the same rows",
    await pop.isVisible("#hubView") && await pop.isHidden("#mainContent, #unavailable >> visible=true").catch(() => true) &&
    (await pop.evaluate(() => document.activeElement.id)) === "hubBack" &&
    (await pop.$$eval("#hubView .tbh-row", (r) => r.map((x) => x.dataset.tracker).join())) === "github,linear,slack");
  await pop.click('#hubView .tbh-row[data-tracker="linear"] >> text=Reconnect Linear');
  await pop.waitForSelector("#hubView .tbh-dialog", { timeout: 3000 }).catch(() => {});
  const handoffP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("options.html#integrations:token=linear"), timeout: 5000 }).catch(() => null);
  await pop.click("#hubView .tbh-dialog >> text=Enter key");
  const handed = await handoffP;
  if (handed) await handed.waitForFunction(() => document.activeElement && document.activeElement.id === "lnKey", null, { timeout: 5000 }).catch(() => {});
  check("…popup hands the token path to settings, which focuses the Linear key field",
    !!handed && (await handed.evaluate(() => document.activeElement.id)) === "lnKey");
  if (handed) await handed.close();
  // The popup closed itself (window.close); reopen for the Esc check.
  const pop2 = await ctx.newPage();
  await pop2.setViewportSize({ width: 360, height: 600 });
  await pop2.goto(POP);
  await pop2.waitForFunction(() => document.getElementById("intBtn").title !== "Integrations", null, { timeout: 5000 }).catch(() => {});
  await pop2.focus("#intBtn");
  await pop2.keyboard.press("Enter");
  await pop2.waitForSelector("#hubView:not([hidden])", { timeout: 3000 }).catch(() => {});
  await pop2.keyboard.press("Escape");
  check("…Esc leaves the popup hub, focus back on the icon",
    await pop2.isHidden("#hubView") && (await pop2.evaluate(() => document.activeElement.id)) === "intBtn" &&
    (await pop2.getAttribute("#intBtn", "aria-expanded")) === "false");

  // ══ 5. Test connection ═══════════════════════════════════════════════════
  await opt.click('.tbh-row[data-tracker="github"] >> text=Test connection');
  await opt.waitForFunction(() => /works/.test(document.querySelector(".tbh-live").textContent), null, { timeout: 8000 }).catch(() => {});
  check("5. Test connection: GitHub works — 1 repository available",
    (await opt.textContent(".tbh-live")) === "GitHub works — 1 repository available." &&
    (await opt.evaluate(() => (document.activeElement.textContent || "").trim())) === "Test connection");

  // ══ 6. The ticket ════════════════════════════════════════════════════════
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sw.evaluate(async (g) => {
    const [tab] = await chrome.tabs.query({ url: g });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await page.evaluate(() => { try { window.__TraceBugExtension.startEventsCapture(); } catch (e) {} });
  await sleep(500);
  const caps = await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps"));
  check("6. the page learns only the default tracker id and an attention flag",
    /"defaultTracker":"github"/.test(caps) && /"trackerAttention":true/.test(caps) && !/acme|octo|ana@/.test(caps), caps);
  const openTicket = async () => {
    await page.click("#orderBtn").catch(() => {});
    await sleep(300);
    await page.keyboard.press("Control+Shift+KeyB");
    await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
    await sleep(600);
  };
  const M = "#tracebug-quick-bug-modal";
  // Esc asks "Close / Keep editing" for an unsaved ticket: answer Close.
  const closeTicket = async () => {
    await page.keyboard.press("Escape");
    await page.click(`${M} [data-cc="close"]`, { timeout: 2000 }).catch(() => {});
    await page.waitForSelector(M, { state: "detached", timeout: 5000 }).catch(() => {});
  };
  await openTicket();
  check('…main button: "Send to GitHub"; Linear and Slack under More ▾',
    /Send to GitHub/.test(await page.textContent(`${M} .tb-qb-btn-primary`)) &&
    (await page.$$eval(`${M} .tb-qb-more-menu [data-action="linear"], ${M} .tb-qb-more-menu [data-action="slack"]`, (b) => b.length)) === 2 &&
    !(await page.$(`${M} .tb-qb-more-menu [data-action="open-github"]`)));
  check('…status icon: GitHub logo, warning dot, tooltip without the repo',
    (await page.getAttribute(`${M} [data-action="tracker-status"]`, "title")) === "GitHub · a connection needs attention" &&
    !!(await page.$(`${M} [data-action="tracker-status"] .tb-qb-status-dot`)) &&
    (await page.getAttribute(`${M} [data-action="tracker-status"] svg`, "aria-label")) === "GitHub");
  check("…no repo, team or account name anywhere in the page's ticket",
    !/acme-private|octo|ana@acme/.test(await page.evaluate(() => document.getElementById("tracebug-quick-bug-modal").outerHTML)));
  await closeTicket();

  await setLocal({ tb_tracker_default_v1: "slack" });
  await page.waitForFunction(() => /"defaultTracker":"slack"/.test(document.documentElement.getAttribute("data-tb-caps") || ""), null, { timeout: 5000 }).catch(() => {});
  await openTicket();
  check('…default Slack: main button "Send to Slack", Send to GitHub moves under More ▾',
    /Send to Slack/.test(await page.textContent(`${M} .tb-qb-btn-primary`)) &&
    /Send to GitHub/.test(await page.textContent(`${M} .tb-qb-more-menu [data-action="open-github"]`).catch(() => "")),
    (await page.textContent(`${M} .tb-qb-btn-primary`)).trim() + " | " + await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps")));
  await closeTicket();

  // Back to GitHub, attention cleared, then icon → Create panel → Ctrl+Enter.
  await setLocal({ tb_tracker_default_v1: "github", tb_tracker_auth_v1: auth });
  await page.waitForFunction(() => /"defaultTracker":"github".*"trackerAttention":false|"trackerAttention":false.*"defaultTracker":"github"/.test(document.documentElement.getAttribute("data-tb-caps") || ""), null, { timeout: 5000 }).catch(() => {});
  await openTicket();
  await page.fill("#tb-qb-title", "Hub ticket");
  check("…no attention: no dot, tooltip GitHub · connected",
    (await page.getAttribute(`${M} [data-action="tracker-status"]`, "title")) === "GitHub · connected" && !(await page.$(`${M} .tb-qb-status-dot`)),
    (await page.getAttribute(`${M} [data-action="tracker-status"]`, "title")) + " | " + await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps")));
  await page.click(`${M} [data-action="tracker-status"]`);
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes("/create-issue.html")) || null; if (!frame) await sleep(100); }
  check("…clicking the status icon opens the GitHub Create panel in the ticket", !!frame);
  if (frame) {
    await frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 10000 }).catch(() => {});
    await frame.focus("#container");
    await page.keyboard.press("Control+Enter");
    await frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("…Ctrl+Enter in the panel creates the issue", posts.length === 1 && /#41/.test(await frame.textContent("#issueLink").catch(() => "")), String(posts.length));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Esc closes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));
  }
  await page.close();

  // ══ 7. Disconnect, with a confirm ════════════════════════════════════════
  await opt.reload();
  await opt.waitForSelector('.tbh-row[data-tracker="github"]', { timeout: 5000 });
  await opt.click('.tbh-row[data-tracker="github"] >> text=Disconnect');
  await opt.waitForSelector(".tbh-dialog", { timeout: 3000 });
  check("7. Disconnect asks first, focus on Cancel",
    /Disconnect GitHub\?/.test(await opt.textContent(".tbh-dialog h3")) && (await active(opt)).text === "Cancel");
  await opt.keyboard.press("Escape");
  check("…Esc cancels; still connected; focus back on Disconnect",
    await opt.isHidden(".tbh-dialog-wrap") && !!(await opt.$('.tbh-row[data-tracker="github"]')) && (await active(opt)).text === "Disconnect");
  await opt.keyboard.press("Enter");
  await opt.waitForSelector(".tbh-dialog", { timeout: 3000 });
  await opt.click(".tbh-dialog button.danger");
  await opt.waitForFunction(() => !document.querySelector('.tbh-row[data-tracker="github"]'), null, { timeout: 5000 }).catch(() => {});
  const authAfter = await getLocal("tb_tracker_auth_v1");
  check("…confirmed: the row is gone, the sign-in forgotten, GitHub back in the grid",
    !(await opt.$('.tbh-row[data-tracker="github"]')) && !(authAfter && authAfter.github) &&
    (await opt.textContent("#tbh-tab-conn")) === "My connections (1)" && /Disconnected GitHub/.test(await opt.textContent(".tbh-live")) &&
    !!(await opt.$('.tbh-tile[data-tracker="github"]')));
  await pop2.waitForFunction(() => /^Slack/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check("…the default falls back to Slack (the popup icon says so)", (await pop2.getAttribute("#intBtn", "title")) === "Slack · connected");

  // ══ 8. 360 px, light and dark ════════════════════════════════════════════
  await opt.setViewportSize({ width: 360, height: 800 });
  await opt.click("#tbh-tab-add");
  check("8. settings at 360 px: no horizontal scroll", await opt.evaluate(() => document.documentElement.scrollWidth <= 360));
  await pop2.click("#intBtn");
  await pop2.waitForSelector("#hubView .tbh-row", { timeout: 5000 }).catch(() => {});
  check("…popup at 360 px: no horizontal scroll", await pop2.evaluate(() => document.documentElement.scrollWidth <= 360));
  const bg = async (theme) => {
    await pop2.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    return pop2.evaluate(() => getComputedStyle(document.querySelector("#hubView .tbh-row")).backgroundColor);
  };
  const light = await bg("light"), dark = await bg("dark");
  check("…the hub follows the popup's light and dark tokens", light !== dark && light !== "rgba(0, 0, 0, 0)", `${light} / ${dark}`);
} catch (err) {
  failures++;
  console.log("FAIL  threw: " + (err && err.stack || err));
} finally {
  await ctx.close().catch(() => {});
  server.close();
}

console.log(`\n${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
