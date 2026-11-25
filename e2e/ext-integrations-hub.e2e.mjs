// Run: node e2e/ext-integrations-hub.e2e.mjs   (needs `npm run build:ext` first)
//
// Phase 13 step 5 + redesign step 5: the Integrations hub (integrations-hub.js)
// in the popup, Settings → "Integrations" (S1: Connected rows with a ⋯ menu, Add a
// tracker tiles, the Connect and Disconnect dialogs, then Preferences), the
// header status icon, and the ticket's default-tracker button.
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

  // ══ 1. Keyboard only — the popup's hub ═══════════════════════════════════
  // Settings is now "Manage integrations" (one card per tracker, leg 2+); the
  // hub view (My connections / Add platform) lives in the popup.
  const openHub = async (pg) => {
    await pg.click("#intBtn");
    await pg.waitForSelector("#hubView:not([hidden]) .tbh-tile, #hubView:not([hidden]) .tbh-row", { timeout: 8000 });
  };
  await openHub(pop);
  const opt = pop; // the grid/dialog checks below run in the popup
  check("1. popup hub, fresh: My connections (0) and the Add platform grid is shown",
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
  await opt.focus("#tbh-tab-add");
  await opt.keyboard.press("ArrowLeft");
  check("…tabs: arrow keys switch My connections / Add platform",
    (await opt.getAttribute("#tbh-tab-conn", "aria-selected")) === "true" && (await active(opt)).text === "My connections (0)");
  check("…status lines live in an aria-live region", (await opt.getAttribute(".tbh-live", "aria-live")) === "polite");

  // ══ 2. Settings → Integrations: Connected rows, Add a tracker tiles ══════
  const set = await ctx.newPage();
  await set.goto(OPT);
  const card = (id) => `.tracker-acct[data-tracker="${id}"]`;
  const tile = (id) => `.add-tile[data-tracker="${id}"]`;
  const pillOf = (id) => set.textContent(id === "github" ? "#ghPill" : id === "linear" ? "#lnPill" : "#slPill");
  const openMenu = (pg, id) => pg.click(`.conn-row[data-tracker="${id}"] .menu-btn`);
  await set.waitForFunction(() => !document.getElementById("defaultTrackerEmpty").hidden, null, { timeout: 8000 }).catch(() => {});
  check("2. settings opens on Integrations: nothing connected yet, a tile per tracker (GitHub first, with its logo), no hub grid",
    (await set.textContent("#integrationsTitle")).trim() === "Integrations" &&
    (await set.getAttribute('.nav-item[data-section="integrations"]', "aria-current")) === "page" &&
    (await set.textContent("#connectedEmpty")).trim() === "No trackers connected yet. Add one below." &&
    (await set.$$eval(".add-tile:not([hidden])", (t) => t.map((x) => x.dataset.tracker).join())) === "github,linear,slack" &&
    !!(await set.$(`${tile("github")} .int-logo svg[aria-label="GitHub"]`)) && !(await set.$(".tbh-tile")));
  check("…Preferences comes after the trackers",
    await set.evaluate(() => !!(document.getElementById("addCard").compareDocumentPosition(document.getElementById("intGlobal")) & Node.DOCUMENT_POSITION_FOLLOWING)));
  check("…not connected: \"Not connected\", no rows (so no Disconnect, U8)",
    (await pillOf("github")) === "Not connected" && (await pillOf("slack")) === "Not connected" &&
    !(await set.isVisible(card("github"))) && !(await set.isVisible("#slRow")));
  await set.click(`${tile("linear")} .tile-connect`);
  check("…Linear can't sign in in this build: its dialog opens on the API key, no dead Connect",
    await set.evaluate(() => document.getElementById("connectDialog").open) &&
    !(await set.isVisible('#connectDialog [data-pane="linear"] .acct-connect')) && await set.evaluate(() => document.getElementById("lnAdvanced").open) &&
    (await set.textContent("#dlgTitle")) === "Connect Linear");
  check("…and it says so once: \"Connect with an API key\" (U8)",
    (await set.textContent("#lnAdvanced summary")).trim() === "Connect with an API key");
  await set.keyboard.press("Escape");
  check("…Esc closes the dialog, focus back on the tile's Connect",
    !(await set.evaluate(() => document.getElementById("connectDialog").open)) &&
    await set.evaluate(() => document.activeElement.classList.contains("tile-connect") && document.activeElement.dataset.tracker === "linear"));
  check("…default tracker: nothing to pick yet — a line, not a dead select", await set.isHidden("#defaultTracker") &&
    await set.isVisible("#defaultTrackerEmpty") &&
    (await set.textContent("#defaultTrackerEmpty")) === "Connect a tracker to choose a default");
  check("…\"Open the issue after creating\" is a switch, on by default",
    await set.isChecked("#openAfterCreate") && (await set.getAttribute("#openAfterCreate", "role")) === "switch");
  check("…remembered choices: \"On 0 sites\", Forget off",
    (await set.textContent("#rememberedCount")) === "On 0 sites" && await set.isDisabled("#forgetChoices"));

  const deep = await ctx.newPage();
  await deep.goto(OPT + "#integrations:connect=github");
  await deep.waitForFunction(() => document.activeElement && document.activeElement.id === "ghChooseSignIn", null, { timeout: 5000 }).catch(() => {});
  check("…#integrations:connect=github (the popup's hand-off) opens Connect GitHub with \"Sign in with GitHub\" focused",
    await deep.evaluate(() => document.getElementById("connectDialog").open && document.activeElement.id === "ghChooseSignIn") &&
    (await deep.textContent("#dlgSub")) === "Choose how to connect" && await deep.isVisible("#ghChooseToken"));
  await deep.close();

  // Keyboard: Connect on the GitHub tile, Enter → the two choices, Enter on
  // "Sign in with GitHub" → the device code in the dialog.
  await set.focus(`${tile("github")} .tile-connect`);
  await set.keyboard.press("Enter");
  await set.waitForFunction(() => document.activeElement && document.activeElement.id === "ghChooseSignIn", null, { timeout: 3000 }).catch(() => {});
  await set.keyboard.press("Enter");
  await set.waitForFunction(() => (document.querySelector("#connectDialog .device-code") || {}).textContent === "WXYZ-9876", null, { timeout: 8000 }).catch(() => {});
  check("…Connect → Sign in with GitHub (keyboard) shows the device code in the dialog",
    (await set.textContent("#connectDialog .device-code")) === "WXYZ-9876" && (await set.textContent("#dlgSub")) === "Sign in with GitHub");
  tokenMode = "approve";
  await set.waitForFunction(() => /Signed in as octo/.test(document.querySelector('.tracker-acct[data-tracker="github"] .acct-line').textContent), null, { timeout: 15000 }).catch(() => {});
  check("…once GitHub confirms: the dialog closes, a \"Connected\" row signed in as octo, its tile gone",
    !(await set.evaluate(() => document.getElementById("connectDialog").open)) &&
    (await pillOf("github")) === "Connected" && /Signed in as octo/.test(await set.textContent(`${card("github")} .acct-line`)) &&
    await set.isVisible(card("github")) && !(await set.isVisible(tile("github"))) && (await set.textContent("#navIntCount")) === "1");
  await openMenu(set, "github");
  check("…its ⋯ menu: Switch to a personal token, then Disconnect (red), focus on the first item",
    await set.isVisible(`${card("github")} .acct-to-token`) && await set.isVisible(`${card("github")} .acct-disconnect`) &&
    !(await set.isVisible(`${card("github")} .acct-switch`)) &&
    await set.evaluate(() => document.activeElement.getAttribute("role") === "menuitem"));
  await set.keyboard.press("Escape");
  check("…Esc closes the menu, focus back on ⋯",
    !(await set.isVisible(`${card("github")} .menu`)) && await set.evaluate(() => document.activeElement.classList.contains("menu-btn")));
  await set.waitForFunction(() => document.querySelectorAll('.tracker-acct[data-tracker="github"] .acct-default option').length > 1, null, { timeout: 8000 }).catch(() => {});
  check("…and the default repository picker is there", await set.isVisible(`${card("github")} .acct-default`));
  await set.selectOption(`${card("github")} .acct-default`, REPO);
  await sleep(600);
  const prefs = await getLocal("tb_tracker_prefs_v1");
  check("…the default repo is saved with its name", prefs && prefs.github && prefs.github.container === REPO && prefs.github.containerLabel === REPO, JSON.stringify(prefs));

  // ══ 3. Token state, remembered sites, default tracker ═════════════════════
  await setLocal({
    tb_integrations_v1: { slack: { webhookUrl: "https://hooks.slack.com/services/T/B/x" }, linear: { apiKey: "lin_api_hubTestKey0123456789abcdWXYZ" } },
    tb_tracker_sites_v1: {
      "https://a.example": { at: 1, picks: { "github|oauth:octo": { container: REPO, fields: {}, at: 1 } } },
      "https://b.example": { at: 2, picks: { "github|oauth:octo": { container: REPO, fields: {}, at: 2 }, "linear|token:": { container: "t1", fields: {}, at: 2 } } },
    },
  });
  await set.reload();
  await set.waitForFunction(() => /Using an API key/.test(document.querySelector('.tracker-acct[data-tracker="linear"] .acct-line').textContent), null, { timeout: 8000 }).catch(() => {});
  check("3. a token connection: a \"Connected\" row, the key shown masked",
    (await pillOf("linear")) === "Connected" && /Using an API key lin_…WXYZ\./.test(await set.textContent(`${card("linear")} .acct-line`)) &&
    await set.isVisible(card("linear")), (await set.textContent(`${card("linear")} .acct-line`)).trim());
  check("…the secret itself is nowhere on the page", !(await set.content()).includes("lin_api_hubTestKey"));
  check("…Preferences counts the sites with remembered choices", (await set.textContent("#rememberedCount")) === "On 2 sites" &&
    !(await set.isDisabled("#forgetChoices")));
  await set.click("#forgetChoices");
  await set.waitForFunction(() => document.getElementById("rememberedCount").textContent === "On 0 sites", null, { timeout: 5000 }).catch(() => {});
  check("…Forget clears them, says so beside the button, and turns itself off",
    !(await getLocal("tb_tracker_sites_v1")) && await set.isDisabled("#forgetChoices") &&
    (await set.$eval("#forgetChoices", (b) => b.closest(".pref-row").querySelector(".saved").textContent)) === "Forgotten");
  check("…Slack: a \"Connected\" row, its tile gone (only now a Disconnect, U8)", (await pillOf("slack")) === "Connected" &&
    await set.isVisible("#slRow") && !(await set.isVisible(tile("slack"))) && (await set.textContent("#navIntCount")) === "3");
  check("…the default tracker's row says \"Default\"",
    await set.isVisible(`${card("github")} .default-pill`) && !(await set.isVisible("#slRow .default-pill")));
  check("…default tracker lists the connections, GitHub first",
    (await set.$$eval("#defaultTracker option", (o) => o.map((x) => x.value).join())) === "github,linear,slack" && (await set.inputValue("#defaultTracker")) === "github");
  await pop.waitForFunction(() => /GitHub/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check('…popup icon: "GitHub · acme-private/web-app · connected", no dot, GitHub logo',
    (await pop.getAttribute("#intBtn", "title")) === `GitHub · ${REPO} · connected` && await pop.isHidden("#intBtn .hd-int-dot") &&
    (await pop.getAttribute("#intBtn .hd-int-logo svg", "aria-label")) === "GitHub");
  await set.selectOption("#defaultTracker", "slack");
  await sleep(500);
  check("…picking Slack is stored", (await getLocal("tb_tracker_default_v1")) === "slack");
  const savedBeside = (sel) => set.$eval(sel, (c) => c.closest(".pref-row").querySelector(".saved").textContent);
  check("…picking a default says \"Saved\" beside the select", (await savedBeside("#defaultTracker")) === "Saved");
  await pop.waitForFunction(() => /^Slack/.test(document.getElementById("intBtn").title), null, { timeout: 5000 }).catch(() => {});
  check("…the popup icon follows: Slack · connected", (await pop.getAttribute("#intBtn", "title")) === "Slack · connected");
  await setLocal({ tb_tracker_default_v1: "github" });
  await set.click('label[for="openAfterCreate"]');
  await sleep(300);
  check("…\"Open the issue after creating\" off (its label toggles it) is stored, \"Saved\" beside it",
    (await getLocal("tb_open_issue_after_create_v1")) === false && (await savedBeside("#openAfterCreate")) === "Saved");
  await sleep(2600);
  check("…and the \"Saved\" fades away", (await savedBeside("#openAfterCreate")) === "" && !(await set.$("#prefsStatus")));
  await set.check("#openAfterCreate");
  await openMenu(set, "linear");
  await set.click(`${card("linear")} .acct-disconnect`);
  check("…Disconnect asks first: \"Disconnect Linear?\", what is removed, Cancel focused",
    await set.evaluate(() => document.getElementById("disconnectDialog").open) && (await set.textContent("#discTitle")) === "Disconnect Linear?" &&
    /forgets any pasted key/.test(await set.textContent("#discText")) && await set.evaluate(() => document.activeElement.id === "discCancel"));
  await set.click("#discYes");
  await set.waitForFunction(() => document.getElementById("lnPill").textContent === "Not connected", null, { timeout: 5000 }).catch(() => {});
  check("…Disconnect on the token card removes the key", (await pillOf("linear")) === "Not connected" &&
    !((await getLocal("tb_integrations_v1")).linear || {}).apiKey);

  // ══ 4. Needs reconnect ═══════════════════════════════════════════════════
  const auth = await getLocal("tb_tracker_auth_v1");
  await setLocal({ tb_tracker_auth_v1: Object.assign({}, auth, { linear: { tokens: { accessToken: "lin_x" }, account: "ana@acme.test", needsReconnect: true } }) });
  await pop.reload();
  await pop.waitForFunction(() => !document.querySelector("#intBtn .hd-int-dot").hidden, null, { timeout: 5000 }).catch(() => {});
  check("4. a connection needing reconnect puts a warning dot on the popup icon", await pop.isVisible("#intBtn .hd-int-dot") &&
    /GitHub/.test(await pop.getAttribute("#intBtn", "aria-label")));
  await set.reload();
  await set.waitForFunction(() => document.getElementById("lnPill").textContent === "Needs reconnecting", null, { timeout: 5000 }).catch(() => {});
  check("…settings: the Linear row says \"Needs reconnecting\" (amber) and why",
    (await pillOf("linear")) === "Needs reconnecting" && /sign-in expired/.test(await set.textContent(`${card("linear")} .acct-line`)) &&
    await set.isVisible(card("linear")) && (await set.getAttribute("#lnPill", "class")) === "state warn");
  await pop.click("#intBtn");
  await pop.waitForSelector('#hubView .tbh-row[data-tracker="linear"]', { timeout: 5000 }).catch(() => {});
  check("…popup: the icon opens the hub view (Back focused), with the same rows",
    await pop.isVisible("#hubView") &&
    (await pop.evaluate(() => document.activeElement.id)) === "hubBack" &&
    (await pop.$$eval("#hubView .tbh-row", (r) => r.map((x) => x.dataset.tracker).join())) === "github,linear,slack");
  // ══ 5. Test connection (popup hub) ═══════════════════════════════════════
  await pop.click('#hubView .tbh-row[data-tracker="github"] >> text=Test connection');
  await pop.waitForFunction(() => /works/.test(document.querySelector(".tbh-live").textContent), null, { timeout: 8000 }).catch(() => {});
  check("5. Test connection: GitHub works — 1 repository available",
    (await pop.textContent(".tbh-live")) === "GitHub works — 1 repository available.");
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
  const caretTitle = () => page.getAttribute(`${M} [data-tb-split-main]`, "title");
  check('…the one send button: warning dot, tooltip without the repo; no separate plug icon',
    /^GitHub · a connection needs attention/.test(await caretTitle()) &&
    !!(await page.$(`${M} [data-tb-split-main] .tb-qb-status-dot`)) &&
    !(await page.$(`${M} [data-action="tracker-status"]`)), await caretTitle());
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
    /^GitHub · connected/.test(await caretTitle()) && !(await page.$(`${M} .tb-qb-status-dot`)),
    (await caretTitle()) + " | " + await page.evaluate(() => document.documentElement.getAttribute("data-tb-caps")));
  await page.click(`${M} [data-tb-split-main]`);
  let frame = null;
  for (let i = 0; i < 60 && !frame; i++) { frame = page.frames().find((f) => f.url().includes("/create-issue.html")) || null; if (!frame) await sleep(100); }
  check("…clicking the button opens the GitHub Create panel in the ticket", !!frame);
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

  // ══ 7. Disconnect, with a confirm (popup hub) ═══════════════════════════
  const hub = pop2;
  await hub.click("#intBtn");
  await hub.waitForSelector('#hubView .tbh-row[data-tracker="github"]', { timeout: 5000 });
  await hub.click('#hubView .tbh-row[data-tracker="github"] >> text=Disconnect');
  await hub.waitForSelector(".tbh-dialog", { timeout: 3000 });
  check("7. Disconnect asks first, focus on Cancel",
    /Disconnect GitHub\?/.test(await hub.textContent(".tbh-dialog h3")) && (await active(hub)).text === "Cancel");
  await hub.keyboard.press("Escape");
  check("…Esc cancels; still connected; focus back on Disconnect",
    await hub.isHidden(".tbh-dialog-wrap") && !!(await hub.$('.tbh-row[data-tracker="github"]')) && (await active(hub)).text === "Disconnect");
  await hub.keyboard.press("Enter");
  await hub.waitForSelector(".tbh-dialog", { timeout: 3000 });
  await hub.click(".tbh-dialog button.danger");
  await hub.waitForFunction(() => !document.querySelector('.tbh-row[data-tracker="github"]'), null, { timeout: 5000 }).catch(() => {});
  const authAfter = await getLocal("tb_tracker_auth_v1");
  check("…confirmed: the row is gone, the sign-in forgotten, GitHub back in the grid",
    !(await hub.$('.tbh-row[data-tracker="github"]')) && !(authAfter && authAfter.github) &&
    /^Signed out of GitHub. TraceBug deleted its GitHub sign-in/.test(await hub.textContent(".tbh-live")) && !!(await hub.$('.tbh-tile[data-tracker="github"]')));
  await set.reload();
  await set.waitForFunction(() => document.getElementById("ghPill").textContent === "Not connected", null, { timeout: 5000 }).catch(() => {});
  check("…settings agrees: GitHub is \"Not connected\", its row gone and its tile back", (await pillOf("github")) === "Not connected" &&
    await set.isVisible(`${tile("github")} .tile-connect`) && !(await set.isVisible(card("github"))));

  // ══ 8. 360 px, light and dark ════════════════════════════════════════════
  await set.setViewportSize({ width: 360, height: 800 });
  check("8. settings at 360 px: no horizontal scroll", await set.evaluate(() => document.documentElement.scrollWidth <= 360));
  check("…popup at 360 px: no horizontal scroll", await hub.evaluate(() => document.documentElement.scrollWidth <= 360));
  const cardBg = async (theme) => {
    await set.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    return set.evaluate(() => [getComputedStyle(document.querySelector(".card")).backgroundColor, getComputedStyle(document.body).color].join("|"));
  };
  const sLight = await cardBg("light"), sDark = await cardBg("dark");
  check("…settings follows light and dark", sLight !== sDark, `${sLight} / ${sDark}`);
  // Pass 2: Settings' own Auto / Light / Dark writes the popup's key.
  await set.click('#themeSeg [data-theme-choice="dark"]');
  const th = await set.evaluate(() => ({ key: localStorage.getItem("tracebug_popup_theme"), attr: document.documentElement.getAttribute("data-theme"),
    checked: document.querySelector('#themeSeg [aria-checked="true"]').dataset.themeChoice }));
  await set.click('#themeSeg [data-theme-choice="auto"]');
  const th2 = await set.evaluate(() => ({ key: localStorage.getItem("tracebug_popup_theme"), attr: document.documentElement.getAttribute("data-theme") }));
  check("…Settings' theme control (Auto / Light / Dark) writes the popup's theme key and applies it",
    th.key === "dark" && th.attr === "dark" && th.checked === "dark" && th2.key === "auto" && th2.attr === null, JSON.stringify([th, th2]));
  const bg = async (theme) => {
    await hub.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
    return hub.evaluate(() => getComputedStyle(document.querySelector("#hubView .tbh-row, #hubView .tbh-tile")).backgroundColor);
  };
  const light = await bg("light"), dark = await bg("dark");
  check("…the popup hub follows the popup's light and dark tokens", light !== dark && light !== "rgba(0, 0, 0, 0)", `${light} / ${dark}`);
} catch (err) {
  failures++;
  console.log("FAIL  threw: " + (err && err.stack || err));
} finally {
  await ctx.close().catch(() => {});
  server.close();
}

console.log(`\n${passes}/${passes + failures} checks passed`);
process.exit(failures ? 1 : 0);
