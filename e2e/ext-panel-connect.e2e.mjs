// Run: node e2e/ext-panel-connect.e2e.mjs   (needs `npm run build:ext` first)
//
// Integration UX redesign, step 1: can Connect start from INSIDE the in-page
// Create panel (an extension frame in the ticket), with no extension window?
//   A. Sign-in from the panel: the Connect click asks for GitHub's hosts while
//      the click's user activation is still live, the worker opens GitHub's
//      device page in a popup, the code shows in the panel, the poll's token
//      connects it, and the same panel lists repos and creates the issue.
//   B. The real permission prompt: a profile that has NOT granted GitHub's
//      hosts. The Connect click must reach Chrome's native prompt (the request
//      stays pending — the dialog is up) instead of failing at once ("must be
//      called during a user gesture" or similar). Playwright can't click the
//      native dialog, so "pending, no error" is the signal; the owner confirms
//      the dialog by eye (manual sheet).
// Step 3 (in A and C):
//   A. Signed in, but the GitHub App is on no repository: "Install TraceBug on
//      GitHub" opens GitHub's install page (from the worker); when that window
//      closes the repository list refreshes by itself. A repository the app
//      isn't on gets a "configure access" note.
//   C. "Use a token instead" in a build with no GitHub App (Connect hidden,
//      the token box open): a rejected token, one without the repo scope, and
//      a working one, checked against the API before saving; the token never
//      reaches the page (messages, DOM); Disconnect removes it.
//
// GitHub (device flow + API) is stubbed with context.route.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, cpSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");

/** A copy that may run on localhost only: GitHub's hosts stay optional and ungranted. */
function withLocalhostOnly(extDir) {
  const dest = join(mkdtempSync(join(tmpdir(), "tb-localhost-only-")), "extension");
  cpSync(extDir, dest, { recursive: true });
  const m = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
  m.host_permissions = ["http://localhost/*"];
  writeFileSync(join(dest, "manifest.json"), JSON.stringify(m, null, 2) + "\n", "utf8");
  return dest;
}

const PORT = 4936;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const ACCESS = "ghu_FAKEe2ePanelConnect0123456789abcdef";
const REFRESH = "ghr_FAKEe2ePanelConnectRefresh0123456789abcdefghijklmnopqrstuvwxyz012345";
const REPO = "octo/app";
const PAT = "ghp_PANELgoodToken0123456789abcdefABCD";
const PAT_NOSCOPE = "ghp_PANELnoScopeToken0123456789abcdefAB";
const PAT_BAD = "ghp_PANELrevokedToken0123456789abcdefAB";
const LIN_KEY = "lin_api_PANELgoodKey0123456789abcdefWXYZ";
const LIN_BAD = "lin_api_PANELrevokedKey0123456789abcdefAB";

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
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function launch(ext, label) {
  const ctx = await chromium.launchPersistentContext(
    mkdtempSync(join(tmpdir(), `tb-panel-connect-${label}-`)),
    extensionLaunchOptions([`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]),
  );
  const state = { approve: false, posts: 0, installed: true, ssoPartial: false, extraRepos: [], createFail: null };
  await ctx.route("https://github.com/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "POST" && url.pathname === "/login/device/code") {
      return json(route, { device_code: "dc_panel", user_code: "WXYZ-6789", verification_uri: "https://github.com/login/device", interval: 1, expires_in: 900 });
    }
    if (req.method() === "POST" && url.pathname === "/login/oauth/access_token") {
      if (!state.approve) return json(route, { error: "authorization_pending" });
      return json(route, { access_token: ACCESS, refresh_token: REFRESH, expires_in: 28800, refresh_token_expires_in: 15897600, token_type: "bearer" });
    }
    return route.fulfill({ status: 200, contentType: "text/html", body: "<h1>stub</h1>" });
  });
  await ctx.route("https://api.github.com/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const auth = req.headers()["authorization"] || "";
    // Pasted tokens (leg C): a good one, one without the repo scope, anything else is rejected.
    if (auth === `Bearer ${PAT_NOSCOPE}`) return p === "/user" ? route.fulfill({ status: 200, contentType: "application/json", headers: { "x-oauth-scopes": "read:user, gist" }, body: '{"login":"octo"}' }) : json(route, { message: "Forbidden" }, 403);
    if (auth === `Bearer ${PAT}`) {
      if (p === "/user") return route.fulfill({ status: 200, contentType: "application/json", headers: { "x-oauth-scopes": "repo" }, body: '{"login":"octo-pat"}' });
      if (p === "/user/repos") return json(route, [{ full_name: REPO, private: true }]);
    } else if (auth !== `Bearer ${ACCESS}`) return json(route, { message: "Bad credentials" }, 401);
    if (p === "/user") return json(route, { login: "octo" });
    if (p === "/user/installations") {
      const body = state.installed ? { total_count: 1, installations: [{ id: 9 }] } : { total_count: 0, installations: [] };
      // SAML SSO: GitHub leaves an organisation out of the list until authorised.
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body),
        headers: state.ssoPartial ? { "x-github-sso": "partial-results; organizations=4242" } : {} });
    }
    if (p === "/organizations/4242") return json(route, { login: "acme" });
    if (p === "/user/installations/9/repositories") return json(route, { total_count: 1, repositories: [{ full_name: REPO, private: true }].concat(state.extraRepos) });
    if (p === `/repos/${REPO}/labels`) return json(route, state.manyLabels
      ? ["bug", "ui", "docs", "triage", "p1", "p2", "p3", "infra", "wontfix", "help"].map((name) => ({ name }))
      : [{ name: "bug" }]);
    if (p === `/repos/${REPO}/assignees`) return json(route, [{ login: "octo" }]);
    if (p === `/repos/${REPO}/milestones`) return json(route, []);
    if (p === `/repos/${REPO}`) return json(route, { permissions: { push: true } });
    if (req.method() === "POST" && p === `/repos/${REPO}/issues`) {
      if (state.createFail) return route.fulfill(state.createFail);
      state.posts++;
      state.lastBody = JSON.parse(req.postData() || "{}");
      return json(route, { html_url: `https://github.com/${REPO}/issues/7`, number: 7 });
    }
    return json(route, { message: "Not Found" }, 404);
  });
  // Linear (leg C): a personal API key is sent as-is; anything else is refused.
  await ctx.route("https://api.linear.app/**", async (route) => {
    const req = route.request();
    if ((req.headers()["authorization"] || "") !== LIN_KEY) return json(route, { errors: [{ message: "Authentication required, not authenticated" }] }, 401);
    const q = (JSON.parse(req.postData() || "{}").query) || "";
    if (/viewer/.test(q)) return json(route, { data: { viewer: { name: "Ana", email: "ana@acme.test" } } });
    if (/teams/.test(q)) return json(route, { data: { teams: { nodes: [{ id: "team-1", key: "ENG", name: "Engineering" }] } } });
    return json(route, { data: {} });
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  // GitHub's device page: record what the worker opens, load about:blank.
  await sw.evaluate(() => {
    self.__popups = [];
    self.__popupIds = [];
    const gh = (u) => /^https:\/\/github\.com\//.test(String(u));
    const realWin = chrome.windows.create.bind(chrome.windows);
    chrome.windows.create = (opts) => {
      if (!(opts && gh(opts.url))) return realWin(opts);
      self.__popups.push({ url: opts.url, type: opts.type });
      return realWin(Object.assign({}, opts, { url: "about:blank" })).then((w) => { self.__popupIds.push(w.id); return w; });
    };
  });
  return { ctx, sw, state };
}

/** Site → inject → ticket → Send to GitHub → the panel frame. */
async function panelOnPage(ctx, sw) {
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  // A fresh profile opens welcome.html in a new tab; keep this one in front.
  await page.bringToFront();
  await sleep(300);
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => { try { window.__TraceBugExtension.startEventsCapture && window.__TraceBugExtension.startEventsCapture(); } catch (e) {} });
  await sleep(300);
  await page.fill("#coupon", "SAVE20");
  await page.click("#applyBtn");
  await sleep(300);
  await page.click("#orderBtn");
  await sleep(400);
  await page.keyboard.press("Control+Shift+KeyB");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(700);
  // The ticket's own GitHub tab, before anything is sent (or connected).
  const tabBefore = await page.evaluate(() => {
    const t = document.querySelector("#tracebug-quick-bug-modal .tb-qb-tabstrip [data-tb-tracker-tab] [data-tab]");
    return t ? t.textContent.trim() : "";
  });
  const winP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 4000 }).catch(() => null);
  await page.locator('#tracebug-quick-bug-modal [data-action="open-github"]').first().click();
  let frame = null;
  for (let i = 0; i < 50 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes("/create-issue.html")) || null;
    if (!frame) await sleep(100);
  }
  if (frame) {
    await frame.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {});
    await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").scrollIntoView({ block: "center" }));
  }
  return { page, frame, winP, tabBefore };
}

/** Watch (never answer) the frame's permission requests. */
const watchPermissionRequests = (frame) => frame.evaluate(() => {
  window.__perm = [];
  const real = chrome.permissions.request.bind(chrome.permissions);
  chrome.permissions.request = (p, cb) => {
    const rec = { asked: p, activeAtCall: !!(navigator.userActivation && navigator.userActivation.isActive), done: false, granted: null, error: null };
    window.__perm.push(rec);
    return real(p, (granted) => {
      rec.done = true;
      rec.granted = !!granted;
      rec.error = chrome.runtime.lastError ? chrome.runtime.lastError.message : null;
      if (cb) cb(granted);
    });
  };
});

// ═══ A. Sign-in starts and finishes inside the panel ═══════════════════════
{
  const { ctx, sw, state } = await launch(withGrantedHostAccess(EXT_SRC, "panel-connect"), "a");
  try {
    const { page, frame, winP, tabBefore } = await panelOnPage(ctx, sw);
    check("A0. not connected, the ticket already has a GitHub tab beside Info · Actions · Console · Network · AI", tabBefore === "GitHub", tabBefore);
    check("A1. not connected: Send to GitHub opens the in-page panel (no window)", !!frame && !(await Promise.race([winP, sleep(500).then(() => null)])));
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
    check('…from a "Connect a tracker" button with a plug icon (nothing connected yet)',
      (await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]").catch(() => "?")).trim().endsWith("Connect a tracker") &&
      !!(await page.$("#tracebug-quick-bug-modal [data-tb-split-main] svg.tb-lu")),
      (await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]").catch(() => "none")).trim());
    check('…offering "Connect GitHub" in the panel, with focus on it', (await frame.textContent("#connect")).trim() === "Connect GitHub" &&
      await frame.evaluate(() => document.activeElement && document.activeElement.id === "connect"));
    check("…a centred Connect screen: no footer (Cancel/Create), no ⋯ menu, the status line says \"Not connected\"",
      !(await frame.isVisible("#footer")) && !(await frame.isVisible("#more")) && (await frame.textContent("#account")).trim() === "Not connected");
    await watchPermissionRequests(frame);
    const opened = [];
    ctx.on("page", (p) => opened.push(p.url()));
    await frame.click("#connect");
    await frame.waitForSelector("#deviceBox:not([hidden])", { timeout: 8000 }).catch(() => {});
    const perm = await frame.evaluate(() => window.__perm);
    check("A2. the permission request runs inside the click (user activation live)", perm.length === 1 && perm[0].activeAtCall,
      JSON.stringify(perm));
    check("…for GitHub's hosts only", perm.length === 1 && JSON.stringify(perm[0].asked.origins || []).includes("github.com") &&
      !(perm[0].asked.permissions || []).length, JSON.stringify(perm[0] && perm[0].asked));
    check("…and is answered without an error (already granted here)", perm.length === 1 && perm[0].done && perm[0].granted && !perm[0].error);
    const pops = await sw.evaluate(() => self.__popups);
    check("A3. the worker opens GitHub's device page in a small popup", pops.length === 1 && pops[0].type === "popup" &&
      pops[0].url === "https://github.com/login/device", JSON.stringify(pops));
    check("…no extension window or tab opens", !opened.some((u) => u.includes("confirm-send.html") || u.includes("options.html")), JSON.stringify(opened));
    check("…the code shows in the panel", (await frame.textContent("#userCode")).trim() === "WXYZ-6789");
    check("…on its own screen: the Connect screen gone, \"Waiting for GitHub…\", the header says \"Connecting…\"",
      !(await frame.isVisible("#connectBox")) && (await frame.textContent("#deviceWait")).trim() === "Waiting for GitHub…" &&
      (await frame.textContent("#account")).trim() === "Connecting…" && await frame.isVisible("#cancelDevice"));
    check("…with the two steps, \"1 Sign in\" current", await frame.isVisible("#deviceSteps") &&
      /^1\s*Sign in$/.test((await frame.textContent("#deviceSteps .cur")).trim()));
    await frame.click("#copyCode");
    await sleep(300);
    check("…Copy doesn't add a second \"Code copied\" line under the subtitle (#5)",
      (await frame.textContent("#panelMsg")).trim() === "" && /It's copied/.test(await frame.textContent("#deviceHint")),
      (await frame.textContent("#panelMsg")).trim());
    state.installed = false;
    state.approve = true;
    // Pass 2 #2: the app is on no repository → the SAME window goes on to Install.
    await frame.waitForSelector("#installingBox:not([hidden])", { timeout: 12000 }).catch(() => {});
    check("A3b. signed in, app on no repository: step 2 \"Choose repositories\" in the panel (✓ Sign in)",
      await frame.isVisible("#installingBox") && /Choose repositories/.test(await frame.textContent("#installingBox .steps .cur")) &&
      /Sign in/.test(await frame.textContent("#installingBox .steps .done")) && !(await frame.isVisible("#installBox")));
    const chain = await sw.evaluate(async () => {
      const id = self.__popupIds[0];
      const win = await chrome.windows.get(id, { populate: true }).catch(() => null);
      const t = win && win.tabs && win.tabs[0];
      return { opened: self.__popups.length, open: !!win, url: t ? (t.pendingUrl || t.url) : "" };
    });
    check("…in the same GitHub window, sent on to the install page (no second window)",
      chain.opened === 1 && chain.open && chain.url === "https://github.com/apps/tracebug-dev/installations/new", JSON.stringify(chain));
    check("…and the ticket's button switched to \"Send to GitHub\" with the GitHub mark, without reopening (#3)",
      /Send to GitHub/.test(await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]")) &&
      !!(await page.$("#tracebug-quick-bug-modal [data-tb-split-main] svg.tb-brand")),
      (await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]")).trim());
    // The user closes GitHub's window before choosing: the Install screen is the fallback.
    await sw.evaluate(() => chrome.windows.remove(self.__popupIds[0]));
    await frame.waitForSelector("#installBox:not([hidden])", { timeout: 8000 }).catch(() => {});
    check("A3c. window closed between the steps: the fallback offers \"Install on GitHub\" + Refresh",
      await frame.isVisible("#installApp") && await frame.isVisible("#refreshRepos") && !(await frame.isVisible("#installingBox")) &&
      (await frame.textContent("#installApp")).trim() === "Install on GitHub");
    await frame.click("#installApp");
    await sleep(800);
    const pops2 = await sw.evaluate(() => self.__popups);
    check("…which the worker opens in a GitHub window", pops2.length === 2 &&
      pops2[1].url === "https://github.com/apps/tracebug-dev/installations/new" && pops2[1].type === "popup", JSON.stringify(pops2));
    // The user installs it on a repository and closes the window.
    state.installed = true;
    await sw.evaluate(() => chrome.windows.remove(self.__popupIds[self.__popupIds.length - 1]));
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO, { timeout: 8000 }).catch(() => {});
    check("…and when it closes the repository list refreshes by itself",
      await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO) &&
      !(await frame.isVisible("#installBox")));
    await frame.fill("#container", "octo/not-installed");
    await frame.dispatchEvent("#container", "input");
    check("…a repository the app isn't on gets a configure-access link",
      await frame.isVisible("#repoNote") && /octo\/not-installed/.test(await frame.textContent("#repoNote")) && await frame.isVisible("#configureRepo"));
    await frame.fill("#container", REPO);
    await frame.dispatchEvent("#container", "input");
    await frame.dispatchEvent("#container", "change");
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r) ||
      document.getElementById("container").value === r, REPO, { timeout: 12000 }).catch(() => {});
    check("A4. after GitHub approves, the same panel is connected and lists the repo",
      /Connected/.test(await frame.textContent("#panelMsg")) || (await frame.inputValue("#container")) === REPO,
      (await frame.textContent("#panelMsg")).trim());
    // ⋯ → "Switch to a personal token": the token form in place; "Keep the sign-in" goes back.
    await frame.click("#more");
    const menu = await frame.$$eval("#moreMenu button", (bs) => bs.filter((b) => !b.hidden).map((b) => b.textContent.trim()));
    check("A4b. signed in: ⋯ offers Manage integrations, Switch to a personal token, Disconnect GitHub",
      JSON.stringify(menu) === '["Manage integrations","Switch to a personal token","Disconnect GitHub"]', JSON.stringify(menu));
    await frame.click("#switchToken");
    check("…which shows the token form in place (no Connect, no footer)", await frame.isVisible("#tokenInput") &&
      !(await frame.isVisible("#connect")) && !(await frame.isVisible("#footer")) && await frame.isVisible("#tokenBack"));
    await frame.click("#tokenBack");
    await frame.waitForSelector("#footer:not([hidden])", { timeout: 8000 }).catch(() => {});
    check("…and \"Keep the sign-in\" goes back to the form", await frame.isVisible("#footer") && !(await frame.isVisible("#tokenInput")) &&
      /Signed in as octo/.test(await frame.textContent("#account")));
    if ((await frame.inputValue("#container")) !== REPO) {
      await frame.fill("#container", REPO);
      await frame.dispatchEvent("#container", "change");
    }
    const armed = await frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).then(() => true, () => false);
    if (armed) await frame.click("#send");
    await frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("A5. …and Create files the issue there", state.posts === 1 && /created/i.test(await frame.textContent("#doneBox")), `posts=${state.posts}`);
    check("…with Assignee \"—\", no assignee is sent (#6)", !!state.lastBody && !("assignees" in state.lastBody) &&
      JSON.stringify(state.lastBody.labels) === '["bug"]', JSON.stringify(state.lastBody && { labels: state.lastBody.labels, assignees: state.lastBody.assignees }));
    check("…the ticket never left the page", await page.locator("#tracebug-quick-bug-modal").isVisible());

    // Disconnect → the ticket's button goes back to "Connect a tracker" by itself.
    await frame.click("#cancel"); // Done
    await sleep(300);
    // Create opened the issue in a new tab: back to the ticket's tab (a
    // background tab draws no frames, so clicks into a new frame go astray).
    await page.bringToFront();
    const again = await (async () => {
      await page.locator("#tracebug-quick-bug-modal [data-tb-split-main]").click();
      for (let i = 0; i < 50; i++) {
        const f = page.frames().find((x) => x.url().includes("/create-issue.html"));
        if (f) return f;
        await sleep(100);
      }
      return null;
    })();
    if (!again) throw new Error("no panel frame (A6)");
    await again.waitForSelector("#more:not([hidden])", { timeout: 8000 });
    await again.waitForSelector("#fields fieldset", { timeout: 8000 }).catch(() => {});
    await sleep(300);
    await again.click("#more");

    await again.waitForSelector("#disconnect:not([hidden])", { state: "visible", timeout: 5000 });
    await again.click("#disconnect");
    await again.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
    await page.waitForFunction(() => /Connect a tracker/.test(document.querySelector("#tracebug-quick-bug-modal [data-tb-split-main]").textContent), null, { timeout: 5000 }).catch(() => {});
    check("A6. after Disconnect the open ticket says \"Connect a tracker\" again (live)",
      /Connect a tracker/.test(await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]")));
    // Already installed (a returning user): the window closes after Authorize — one step.
    state.approve = false;
    await again.click("#connect");
    await again.waitForSelector("#deviceBox:not([hidden])", { timeout: 8000 });
    // GitHub's window for this code (opened once the code is copied).
    await sw.evaluate(async (n) => { for (let i = 0; i < 50 && self.__popups.length <= n; i++) await new Promise((r) => setTimeout(r, 100)); },
      2);
    const popsBefore = await sw.evaluate(() => self.__popups.length);
    state.approve = true;
    await again.waitForFunction(() => !document.getElementById("pickBox").hidden && !document.getElementById("repoField").hidden &&
      /Signed in/.test(document.getElementById("account").textContent), null, { timeout: 12000 }).catch(() => {});
    await sleep(500);
    const shortcut = await sw.evaluate(async (n) => {
      const id = self.__popupIds[n - 1];
      const win = await chrome.windows.get(id).catch(() => null);
      return { open: !!win, opened: self.__popups.length };
    }, popsBefore);
    check("A6b. already installed: GitHub's window closes after Authorize, straight to the form (no step 2)",
      !shortcut.open && shortcut.opened === popsBefore && await again.isVisible("#repoField") &&
      !(await again.isVisible("#installingBox")) && !(await again.isVisible("#installBox")), JSON.stringify(shortcut));
  } finally {
    await ctx.close();
  }
}

// ═══ A7. One window: Authorize, then Install, then it closes by itself ════
{
  const { ctx, sw, state } = await launch(withGrantedHostAccess(EXT_SRC, "panel-connect-chain"), "a7");
  try {
    const { frame } = await panelOnPage(ctx, sw);
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
    state.installed = false;
    state.manyLabels = true; // for A8's label search
    await frame.click("#connect");
    await frame.waitForSelector("#deviceBox:not([hidden])", { timeout: 8000 });
    state.approve = true;
    await frame.waitForSelector("#installingBox:not([hidden])", { timeout: 12000 }).catch(() => {});
    check("A7. sign-in → install chain: step 2 shows while GitHub's window is on the install page", await frame.isVisible("#installingBox"));
    // The user installs; GitHub sends the window to the app's Setup URL.
    state.installed = true;
    const tabId = await sw.evaluate(async () => {
      const [t] = await chrome.tabs.query({ windowId: self.__popupIds[0] });
      return t ? t.id : null;
    });
    await sw.evaluate((id) => chrome.tabs.update(id, { url: "https://github.com/apps/tracebug-dev?setup_action=install&installation_id=9" }), tabId);
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO, { timeout: 12000 }).catch(() => {});
    const left = await sw.evaluate(() => chrome.windows.get(self.__popupIds[0]).then(() => true, () => false));
    check("…GitHub reports the install: the worker closes that window, the panel lists the repository",
      !left && !(await frame.isVisible("#installingBox")) &&
      await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO));
    check("…and only one GitHub window was ever opened", (await sw.evaluate(() => self.__popups.length)) === 1);
    // The label search only narrows the repository's labels: no match says so.
    if ((await frame.inputValue("#container")) !== REPO) {
      await frame.fill("#container", REPO);
      await frame.dispatchEvent("#container", "change");
    }
    await frame.waitForSelector('fieldset[data-field="labels"] .filter', { timeout: 8000 }).catch(() => {});
    await frame.fill('fieldset[data-field="labels"] .filter', "Newtest");
    const nomatch = await frame.$eval('fieldset[data-field="labels"]', (fs) => ({
      text: (fs.querySelector(".chips-none") || {}).textContent || "", shown: fs.querySelector(".chips-none") && !fs.querySelector(".chips-none").hidden,
      // What's picked stays in sight; only unpicked chips are filtered out.
      unpicked: [...fs.querySelectorAll('button.chip[aria-pressed="false"]')].filter((c) => !c.hidden).length,
      picked: [...fs.querySelectorAll('button.chip[aria-pressed="true"]')].filter((c) => !c.hidden).length,
      // The search box sits above the scrolling list, and the list never scrolls sideways.
      filterOutside: !fs.querySelector(".chips .filter"),
      sideways: (() => { const b = fs.querySelector(".chips"); return b.scrollWidth > b.clientWidth; })(),
      pickedFirst: (() => { const cs = [...fs.querySelectorAll("button.chip")].map((c) => c.getAttribute("aria-pressed")); return cs.indexOf("false") < 0 || cs.lastIndexOf("true") < cs.indexOf("false"); })(),
    })).catch(() => ({}));
    check("A8. a label search with no match says \"No labels match …\"; picked labels stay shown, first, above no sideways scroll",
      nomatch.shown && nomatch.unpicked === 0 && nomatch.picked >= 1 && nomatch.filterOutside && !nomatch.sideways && nomatch.pickedFirst &&
      /No labels match .Newtest. in this repository/.test(nomatch.text), JSON.stringify(nomatch));
    // Settings → Default repository: a long list gets a search box that narrows it.
    state.extraRepos = Array.from({ length: 12 }, (_, i) => ({ full_name: `octo/repo-${i}` })).concat([{ full_name: "octo/snow" }]);
    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#integrations`);
    const sel = '.tracker-acct[data-tracker="github"]';
    await opt.waitForFunction((s) => (document.querySelector(s + " .acct-default") || { options: [] }).options.length > 10, sel, { timeout: 8000 }).catch(() => {});
    // One field: typing narrows the list under it, Enter picks the only match.
    const combo = sel + " .acct-default-combo";
    await opt.click(combo);
    await opt.keyboard.type("snow");
    const narrowed = await opt.$$eval(sel + ' .tb-combo li[role="option"]', (ls) => ls.map((l) => l.textContent));
    await opt.press(combo, "Enter");
    await opt.waitForFunction((s) => document.querySelector(s + " .acct-default").value === "octo/snow", sel, { timeout: 5000 }).catch(() => {});
    const after = await opt.$eval(sel, (row) => ({
      select: row.querySelector(".acct-default").hidden, field: row.querySelector(".acct-default-combo").value,
      list: row.querySelector(".tb-combo ul").hidden,
    }));
    check("A9. Settings: a long repository list is one search field; \"snow\" leaves one, Enter picks it",
      JSON.stringify(narrowed) === '["octo/snow"]' && (await opt.inputValue(sel + " .acct-default")) === "octo/snow" &&
      after.select && after.field === "octo/snow" && after.list, JSON.stringify({ narrowed, after }));
    await opt.fill(combo, "zzz");
    check("…a search with no match says so in the list",
      /No repositories match .zzz./.test(await opt.textContent(sel + " .tb-combo ul")));
  } finally {
    await ctx.close();
  }
}

// ═══ B. The real prompt, from the frame, GitHub's hosts not granted ════════
{
  const { ctx, sw } = await launch(withLocalhostOnly(EXT_SRC), "b");
  try {
    const before = await sw.evaluate(() => chrome.permissions.contains({ origins: ["https://github.com/*", "https://api.github.com/*"] }));
    check("B0. this profile has not granted GitHub's hosts", before === false);
    const { frame } = await panelOnPage(ctx, sw);
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
    await watchPermissionRequests(frame);
    await frame.click("#connect");
    await sleep(2500);
    const perm = await frame.evaluate(() => window.__perm);
    check("B1. the Connect click calls permissions.request with activation live", perm.length === 1 && perm[0].activeAtCall, JSON.stringify(perm));
    check("B2. Chrome's prompt is up: the request is pending, not refused", perm.length === 1 && !perm[0].done,
      perm[0] && perm[0].done ? `answered: granted=${perm[0].granted} error=${perm[0].error}` : "pending after 2.5 s");
    check("…and nothing has been opened or fetched yet", (await sw.evaluate(() => self.__popups.length)) === 0);
  } finally {
    await ctx.close();
  }
}

// ═══ C. "Use a token instead", in a build without the GitHub App ══════════
{
  const { ctx, sw, state } = await launch(withGrantedHostAccess(EXT_SRC, "panel-token"), "c");
  try {
    // A store build before its production App exists: no client id → no Connect.
    const off = await sw.evaluate(() => {
      const c = self.TraceBugProviderAPI && self.TraceBugProviderAPI.OAUTH_CLIENTS;
      try { c.github = "TODO_OWNER_CLIENT_ID"; c.linear = "TODO_OWNER_CLIENT_ID"; } catch (e) { return "frozen"; }
      return c.github;
    });
    const { page, frame } = await panelOnPage(ctx, sw);
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#tokenBox", { timeout: 8000 });
    await page.evaluate(() => { window.__pageMsgs = []; window.addEventListener("message", (e) => { try { window.__pageMsgs.push(JSON.stringify(e.data)); } catch (x) {} }); });
    check("C1. no sign-in in this build: Connect is hidden and the token box starts open",
      off === "TODO_OWNER_CLIENT_ID" && !(await frame.isVisible("#connect")) && await frame.evaluate(() => document.getElementById("tokenBox").open), off);
    check("…the token form is the whole screen: no \"instead\" toggle", !(await frame.isVisible("#tokenSummary")));
    check("…a password field with autocomplete off",
      (await frame.getAttribute("#tokenInput", "type")) === "password" && (await frame.getAttribute("#tokenInput", "autocomplete")) === "off");
    const tryToken = async (tok) => {
      await frame.fill("#tokenInput", tok);
      await frame.click("#tokenSave");
      // An answer, not the empty line before the check starts or "Checking…".
      await frame.waitForFunction(() => { const t = document.getElementById("tokenMsg").textContent; return !!t && !/Checking/.test(t); }, null, { timeout: 8000 }).catch(() => {});
      return (await frame.textContent("#tokenMsg")).trim();
    };
    const bad = await tryToken(PAT_BAD);
    check("C2. a rejected token: a clear error, nothing saved", /didn't accept this token/.test(bad) &&
      !((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).github, bad);
    const noScope = await tryToken(PAT_NOSCOPE);
    check("C3. a token without the repo scope: says which scope it needs", /needs the "repo" scope/.test(noScope), noScope);
    await frame.fill("#tokenInput", PAT);
    await frame.press("#tokenInput", "Enter");
    await frame.waitForFunction(() => /Using a personal token/.test(document.getElementById("account").textContent), null, { timeout: 8000 }).catch(() => {});
    check("C4. a working token: checked, saved, shown masked (\"Using a personal token\")", /Using a personal token ghp_…ABCD/.test(await frame.textContent("#account")),
      (await frame.textContent("#account")).trim());
    check("…the field is cleared", (await frame.inputValue("#tokenInput").catch(() => "")) === "");
    check("…\"personal token\" is marked in the header, and the panel says it's connected with one",
      (await frame.textContent("#account .tok").catch(() => "")) === "personal token" &&
      /Connected as .* with a personal token\./.test(await frame.textContent("#panelMsg")), (await frame.textContent("#panelMsg")).trim());
    const stored = ((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).github || {};
    check("…saved in extension storage", stored.token === PAT);
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO, { timeout: 8000 }).catch(() => {});
    check("…and the repositories load with it", await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO));
    const msgs = await page.evaluate(() => window.__pageMsgs);
    const dom = await page.evaluate(() => document.documentElement.outerHTML);
    const ls = await page.evaluate(() => JSON.stringify(localStorage));
    check("C5. no token reached the page: messages, DOM, localStorage",
      ![PAT, PAT_NOSCOPE, PAT_BAD].some((t) => msgs.some((m) => m.includes(t)) || dom.includes(t) || ls.includes(t)) &&
      msgs.every((m) => /^\{"type":"tb-panel-(ready|close)"\}$|^\{"type":"tb-panel-tracker","tracker":"(github|linear)"\}$/.test(m) || !/tb-panel/.test(m)),
      `${msgs.length} messages: ${msgs.filter((m) => /tb-panel/.test(m)).join(" ")}`);
    await frame.click("#more"); // Disconnect is in the ⋯ menu
    await frame.click("#disconnect");
    await frame.waitForSelector("#tokenBox", { state: "visible", timeout: 8000 }).catch(() => {});
    const after = ((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).github || {};
    check("C6. Disconnect removes the token", !after.token && await frame.isVisible("#tokenBox"));
    check("…and says exactly that, with where to delete it on GitHub (B11)",
      /^Token removed from this browser\. You can delete it on GitHub:/.test((await frame.textContent("#revokeText")).trim()) &&
      (await frame.textContent("#revokeLink")).trim() === "Personal access tokens" && !/sign-in/.test(await frame.textContent("#revokeNote")));

    // ── The same disclosure for Linear: an API key ──
    await frame.selectOption("#tracker", "linear");
    await frame.waitForSelector("#tokenBox", { state: "visible", timeout: 8000 }).catch(() => {});
    check("…the header shows Linear's mark, not GitHub's (SVG: the hidden attribute)",
      await frame.evaluate(() => document.getElementById("markGithub").hasAttribute("hidden") && !document.getElementById("markLinear").hasAttribute("hidden") &&
        getComputedStyle(document.getElementById("markGithub")).display === "none"));
    check("C7. Linear: \"Use an API key instead\", open (no sign-in here)",
      /Use an API key instead/.test(await frame.textContent("#tokenSummary")) && await frame.evaluate(() => document.getElementById("tokenBox").open) &&
      /Linear API key/.test(await frame.textContent("#tokenLabel")));
    const linBad = await tryToken(LIN_BAD);
    check("…a rejected key: a clear error, nothing saved", /didn't accept this API key/.test(linBad) &&
      !((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).linear?.apiKey, linBad);
    await frame.fill("#tokenInput", LIN_KEY);
    await frame.click("#tokenSave");
    await frame.waitForFunction(() => /with a token/.test(document.getElementById("account").textContent), null, { timeout: 8000 }).catch(() => {});
    check("…a working key: saved and shown masked", /with a token lin_…WXYZ/.test(await frame.textContent("#account")) &&
      (((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).linear || {}).apiKey === LIN_KEY,
      (await frame.textContent("#account")).trim());
    await frame.waitForFunction(() => [...document.querySelectorAll("#containerList option")].some((o) => o.value === "team-1"), null, { timeout: 8000 }).catch(() => {});
    check("…and its teams load", await frame.evaluate(() => [...document.querySelectorAll("#containerList option")].some((o) => o.value === "team-1")));
    check("…the key never reached the page", !(await page.evaluate(() => document.documentElement.outerHTML + JSON.stringify(window.__pageMsgs) + JSON.stringify(localStorage))).includes("lin_api_"));
    await frame.click("#more"); // Disconnect is in the ⋯ menu
    await frame.click("#disconnect");
    await frame.waitForSelector("#tokenBox", { state: "visible", timeout: 8000 }).catch(() => {});
    check("…Disconnect removes it", !((((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {}).linear || {}).apiKey));
    void state;
  } finally {
    await ctx.close();
  }
}

// ═══ D. GitHub hardening: approval, SSO, unavailable repos, limits, Disconnect ═
{
  const { ctx, sw, state } = await launch(withGrantedHostAccess(EXT_SRC, "panel-github"), "d");
  try {
    // Already signed in with the GitHub App (as after Connect).
    await sw.evaluate((t) => chrome.storage.local.set({ tb_tracker_auth_v1: { github: {
      tokens: { accessToken: t.a, refreshToken: t.r, expiresAt: Date.now() + 8 * 3600e3 }, account: "octo", connectedAt: Date.now() } } }),
      { a: ACCESS, r: REFRESH });
    state.installed = false;
    const { page, frame } = await panelOnPage(ctx, sw);
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#installBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("D1. app on no repository: the Install state", /isn't installed on any/.test(await frame.textContent("#installText")));
    check("…and only Install + Refresh: no empty Repository box, no \"Don't see it?\", no files line (U4)",
      await frame.isVisible("#installApp") && await frame.isVisible("#refreshRepos") && !(await frame.isVisible("#container")) &&
      !(await frame.isVisible("#manageLink")) && !(await frame.isVisible("#attachNote")) && !(await frame.isVisible("#fields fieldset")));
    await frame.click("#installApp");
    await sleep(800);
    // GitHub sends the install window to the app's Setup URL with setup_action=request.
    const popTab = await sw.evaluate(async () => {
      const w = await chrome.windows.get(self.__popupIds[self.__popupIds.length - 1], { populate: true });
      return w.tabs[0].id;
    });
    await sw.evaluate((id) => chrome.tabs.update(id, { url: "https://github.com/apps/tracebug-dev?setup_action=request&installation_id=1" }), popTab);
    await sleep(1200);
    // B3: GitHub is done with the window once it reports setup_action — the
    // worker closes it, and the panel reloads by itself.
    const installWinLeft = await sw.evaluate(async () => {
      try { await chrome.windows.get(self.__popupIds[self.__popupIds.length - 1]); return true; } catch { return false; }
    });
    check("…the worker closes GitHub's install window when it reports setup_action (B3)", !installWinLeft);
    await frame.waitForFunction(() => /Waiting for your organisation owner/.test(document.getElementById("installText").textContent), null, { timeout: 8000 }).catch(() => {});
    check("D2. GitHub says an owner must approve: \"Waiting for your organisation owner to approve TraceBug\"",
      /^Waiting for your organisation owner to approve TraceBug/.test((await frame.textContent("#installText")).trim()),
      (await frame.textContent("#installText")).trim());
    // B3: install on an account you own — GitHub reports setup_action=install;
    // the window closes and the list refreshes by itself (no Refresh click).
    state.installed = true;
    await frame.click("#installApp");
    await sleep(800);
    const popTab2 = await sw.evaluate(async () => {
      const w = await chrome.windows.get(self.__popupIds[self.__popupIds.length - 1], { populate: true });
      return w.tabs[0].id;
    });
    await sw.evaluate((id) => chrome.tabs.update(id, { url: "https://github.com/apps/tracebug-dev?setup_action=install&installation_id=2" }), popTab2);
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO, { timeout: 10000 }).catch(() => {});
    check("…after Install, the repositories appear by themselves — no Refresh (B3)",
      await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO));
    // Refresh still works as the fallback.
    await frame.click("#refreshRepos").catch(() => {});
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO, { timeout: 8000 }).catch(() => {});
    check("…once approved, Refresh lists the repositories and the note is gone",
      await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO) &&
      !(await frame.isVisible("#installBox")) &&
      !(await sw.evaluate(async () => (await chrome.storage.local.get("tb_github_install_pending_v1")).tb_github_install_pending_v1)));

    // SSO partial results: the list stays, with an authorise link per organisation.
    state.ssoPartial = true;
    await frame.click("#refreshRepos").catch(() => {});
    await frame.evaluate(() => document.getElementById("refreshRepos") && document.getElementById("refreshRepos").click());
    await sw.evaluate(() => { self.__popups.length = 0; });
    await frame.waitForSelector("#ssoBox:not([hidden])", { timeout: 8000 }).catch(() => {});
    check("D3. SSO partial results: the list stays and says some organisations hide repositories",
      await frame.isVisible("#ssoBox") && /Some organisations hide repositories until you authorise TraceBug/.test(await frame.textContent("#ssoText")) &&
      (await frame.textContent("#ssoLinks button")).trim() === "Authorise TraceBug for acme" &&
      await frame.evaluate((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r), REPO));
    const forged = await frame.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: "tb:tracker:open-sso", tracker: "github", url: "https://evil.example/orgs/acme/sso" }, res)));
    check("…a link that isn't https://github.com/… is refused by the worker", !!(forged && forged.error) && (await sw.evaluate(() => self.__popups.length)) === 0, JSON.stringify(forged));
    await frame.click("#ssoLinks button");
    await sleep(800);
    const ssoPop = await sw.evaluate(() => self.__popups[self.__popups.length - 1]);
    check("…Authorise opens GitHub's SSO page for that org (from the worker)", !!ssoPop && ssoPop.url === "https://github.com/orgs/acme/sso", JSON.stringify(ssoPop));
    // Authorised: GitHub now returns everything.
    state.ssoPartial = false;
    state.extraRepos = [{ full_name: "acme/secret", private: true }, { full_name: "octo/old", archived: true }, { full_name: "octo/quiet", has_issues: false }];
    await sw.evaluate(() => chrome.windows.remove(self.__popupIds[self.__popupIds.length - 1]));
    await frame.waitForFunction(() => [...document.querySelectorAll("#containerList option")].some((o) => o.value === "acme/secret"), null, { timeout: 8000 }).catch(() => {});
    check("…back from GitHub, the list reloads with the organisation's repositories and the note goes",
      await frame.evaluate(() => [...document.querySelectorAll("#containerList option")].some((o) => o.value === "acme/secret")) &&
      !(await frame.isVisible("#ssoBox")));

    // Archived / Issues off: listed, marked, and Create stays off.
    const labels = await frame.evaluate(() => Object.fromEntries([...document.querySelectorAll("#containerList option")].map((o) => [o.value, o.label])));
    check("D4. archived and Issues-off repositories are marked unavailable in the picker",
      /Archived \(can't file here\)/.test(labels["octo/old"] || "") && /Issues are turned off \(can't file here\)/.test(labels["octo/quiet"] || ""), JSON.stringify(labels));
    await frame.fill("#container", "octo/old");
    await frame.dispatchEvent("#container", "input");
    await sleep(700);
    check("…picking one says why and keeps Create off", await frame.isDisabled("#send") &&
      /archived, so it can't take new issues/.test(await frame.textContent("#panelMsg")), (await frame.textContent("#panelMsg")).trim());
    await frame.fill("#container", REPO);
    await frame.dispatchEvent("#container", "input");
    await frame.dispatchEvent("#container", "change");
    const armed = await frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).then(() => true, () => false);

    // Create blocked by SSO: the message and link; nothing filed; the ticket stays.
    state.createFail = { status: 403, contentType: "application/json", body: '{"message":"Resource protected by organization SAML enforcement."}',
      headers: { "x-github-sso": "required; url=https://github.com/orgs/acme/sso?authorization_request=Zz9" } };
    if (armed) await frame.click("#send");
    await frame.waitForFunction(() => /Authorise TraceBug for acme/.test(document.getElementById("panelMsg").textContent), null, { timeout: 8000 }).catch(() => {});
    check("D5. Create blocked by SSO: \"Authorise TraceBug for acme\" with GitHub's link, nothing filed, ticket kept",
      /Authorise TraceBug for acme/.test(await frame.textContent("#panelMsg")) && await frame.isVisible("#ssoLinks button") &&
      state.posts === 0 && await page.locator("#tracebug-quick-bug-modal").isVisible() &&
      (await sw.evaluate(async () => Object.keys((await chrome.storage.session.get("tb_pending_sends_v1")).tb_pending_sends_v1 || {}).length)) === 1,
      (await frame.textContent("#panelMsg")).trim());

    // Rate limit on Create.
    const reset = Math.floor(Date.now() / 1000) + 30 * 60;
    state.createFail = { status: 403, contentType: "application/json", body: '{"message":"API rate limit exceeded for user."}',
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) } };
    await frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).catch(() => {});
    await frame.click("#send");
    await frame.waitForFunction(() => /rate limit/.test(document.getElementById("panelMsg").textContent), null, { timeout: 8000 }).catch(() => {});
    const hhmm = (ms) => { const d = new Date(ms); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
    check("D6. a rate limit on Create: \"GitHub rate limit: try again after HH:MM\", nothing filed",
      (await frame.textContent("#panelMsg")).includes(`GitHub rate limit: try again after ${hhmm(reset * 1000)}.`) && state.posts === 0,
      (await frame.textContent("#panelMsg")).trim());
    state.createFail = null;

    // Disconnect: the token is deleted here; GitHub's record needs the user.
    await frame.click("#more"); // Disconnect is in the ⋯ menu
    await frame.click("#disconnect");
    await frame.waitForSelector("#revokeNote:not([hidden])", { timeout: 8000 }).catch(() => {});
    const authLeft = await sw.evaluate(async () => (await chrome.storage.local.get("tb_tracker_auth_v1")).tb_tracker_auth_v1 || {});
    check("D7. Disconnect deletes the sign-in and says how to remove its access on GitHub, with the link (B7)",
      !authLeft.github && await frame.isVisible("#revokeLink") &&
      /^Signed out\. TraceBug deleted its GitHub sign-in from this browser\. To remove its access on GitHub too:/.test((await frame.textContent("#revokeText")).trim()) &&
      (await frame.textContent("#revokeLink")).trim() === "Authorized GitHub Apps");
    // Settings says the same.
    await sw.evaluate((t) => chrome.storage.local.set({ tb_tracker_auth_v1: { github: {
      tokens: { accessToken: t.a, refreshToken: t.r, expiresAt: Date.now() + 8 * 3600e3 }, account: "octo", connectedAt: Date.now() } } }),
      { a: ACCESS, r: REFRESH });
    const extId = new URL(sw.url()).host;
    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${extId}/options.html`);
    const GH = '.tracker-acct[data-tracker="github"]';
    const disconnectGitHub = async () => {
      await opt.click(GH + " .menu-btn");
      await opt.click(GH + " .acct-disconnect");
    };
    await opt.waitForSelector(GH + ":not([hidden])", { timeout: 8000 }).catch(() => {});
    await disconnectGitHub();
    check("…Settings asks first, naming what goes and linking Authorized GitHub Apps (B7, B11)",
      (await opt.textContent("#discTitle")) === "Disconnect GitHub?" &&
      /^TraceBug deletes its GitHub sign-in from this browser\. To remove its access on GitHub too: Authorized GitHub Apps\.$/.test((await opt.textContent("#discText")).trim()) &&
      (await opt.getAttribute("#discText a", "href")) === "https://github.com/settings/apps/authorizations");
    await opt.click("#discYes");
    await opt.waitForSelector("#intStatus .revoke-link", { timeout: 5000 }).catch(() => {});
    check("…and so does Settings once done, linking Authorized GitHub Apps (B7)", (await opt.getAttribute("#intStatus .revoke-link", "href").catch(() => "")) === "https://github.com/settings/apps/authorizations" &&
      /^Signed out\. TraceBug deleted its GitHub sign-in from this browser/.test(await opt.textContent("#intStatus")));

    // ── B11: one GitHub connection ──
    const lineOf = () => opt.textContent(GH + " .acct-line").then((t) => t.trim());
    await sw.evaluate((t) => chrome.storage.local.set({
      tb_tracker_auth_v1: { github: { tokens: { accessToken: t.a, refreshToken: t.r, expiresAt: Date.now() + 8 * 3600e3 }, account: "octo", connectedAt: Date.now() } },
      tb_integrations_v1: { github: { token: t.pat } },
    }), { a: ACCESS, r: REFRESH, pat: PAT });
    await opt.reload();
    await opt.waitForFunction((g) => /Signed in as octo/.test(document.querySelector(g + " .acct-line").textContent), GH, { timeout: 8000 }).catch(() => {});
    const ints11 = (await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1 || {};
    check("B11. older storage with a sign-in AND a token keeps one — the sign-in — and says its mode",
      !(ints11.github && ints11.github.token) && (await lineOf()) === "Signed in as octo · GitHub App", await lineOf());
    // Signed in → "Switch to a personal token": the token step, and saving asks first.
    await opt.click(GH + " .menu-btn");
    await opt.click(GH + " .acct-to-token");
    check("…signed in, the menu offers \"Switch to a personal token\": the dialog's token step, no Back",
      (await opt.textContent("#dlgTitle")) === "Switch to a personal token" && await opt.isVisible("#ghToken") && !(await opt.isVisible("#ghTokenBack")));
    await opt.fill("#ghToken", PAT);
    await opt.click("#ghSave");
    check("…saving it asks first: \"This replaces your GitHub sign-in (octo) with this token.\"",
      await opt.isVisible("#ghReplace") && (await opt.textContent("#ghReplace .acct-confirm-text")).trim() === "This replaces your GitHub sign-in (octo) with this token.");
    await opt.click("#ghReplace .acct-confirm-no");
    await opt.keyboard.press("Escape");
    await sw.evaluate((pat) => chrome.storage.local.set({ tb_tracker_auth_v1: {}, tb_integrations_v1: { github: { token: pat } } }), PAT);
    await opt.reload();
    await opt.waitForFunction((g) => /Using a personal token/.test(document.querySelector(g + " .acct-line").textContent), GH, { timeout: 8000 }).catch(() => {});
    await opt.click(GH + " .menu-btn");
    check("…token mode: \"Using a personal token ghp_…ABCD\", no GitHub tile, the menu's \"Switch to GitHub sign-in\"",
      (await lineOf()) === "Using a personal token ghp_…ABCD" && !(await opt.isVisible('.add-tile[data-tracker="github"]')) &&
      (await opt.textContent(GH + " .acct-switch")).trim() === "Switch to GitHub sign-in" && await opt.isVisible(GH + " .acct-switch") &&
      !(await opt.isVisible(GH + " .acct-to-token")), await lineOf());
    await opt.click(GH + " .acct-switch");
    const confirm = '#connectDialog [data-pane="github-signin"] .acct-confirm';
    check("…switching asks first: \"This replaces your token ghp_…ABCD\"",
      await opt.isVisible(confirm) && (await opt.textContent("#dlgTitle")) === "Switch to GitHub sign-in" &&
      /^This replaces your token ghp_…ABCD\./.test((await opt.textContent(confirm + " .acct-confirm-text")).trim()));
    await opt.click(confirm + " .acct-confirm-no");
    check("…Cancel closes it and leaves the token as it was", !(await opt.isVisible(confirm)) &&
      !(await opt.evaluate(() => document.getElementById("connectDialog").open)) &&
      ((await sw.evaluate(() => chrome.storage.local.get("tb_integrations_v1"))).tb_integrations_v1.github || {}).token === PAT);
    await disconnectGitHub();
    check("…Disconnect in token mode names the token and links Personal access tokens",
      /^TraceBug removes the token ghp_…ABCD from this browser\./.test(await opt.textContent("#discText")) &&
      (await opt.getAttribute("#discText a", "href")) === "https://github.com/settings/tokens");
    await opt.click("#discYes");
    await opt.waitForSelector("#intStatus .revoke-link", { timeout: 5000 }).catch(() => {});
    check("…Disconnect in token mode says the token went, not a sign-in",
      /^Token removed from this browser\. You can delete it on GitHub:/.test(await opt.textContent("#intStatus")) &&
      (await opt.getAttribute("#intStatus .revoke-link", "href")) === "https://github.com/settings/tokens");
  } finally {
    await ctx.close();
  }
}

server.close();
console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
