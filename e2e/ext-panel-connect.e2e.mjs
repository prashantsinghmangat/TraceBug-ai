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
  const state = { approve: false, posts: 0 };
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
    if ((req.headers()["authorization"] || "") !== `Bearer ${ACCESS}`) return json(route, { message: "Bad credentials" }, 401);
    if (p === "/user") return json(route, { login: "octo" });
    if (p === "/user/installations") return json(route, { total_count: 1, installations: [{ id: 9 }] });
    if (p === "/user/installations/9/repositories") return json(route, { total_count: 1, repositories: [{ full_name: REPO, private: true }] });
    if (p === `/repos/${REPO}/labels`) return json(route, [{ name: "bug" }]);
    if (p === `/repos/${REPO}/assignees`) return json(route, [{ login: "octo" }]);
    if (p === `/repos/${REPO}/milestones`) return json(route, []);
    if (p === `/repos/${REPO}`) return json(route, { permissions: { push: true } });
    if (req.method() === "POST" && p === `/repos/${REPO}/issues`) {
      state.posts++;
      return json(route, { html_url: `https://github.com/${REPO}/issues/7`, number: 7 });
    }
    return json(route, { message: "Not Found" }, 404);
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  // GitHub's device page: record what the worker opens, load about:blank.
  await sw.evaluate(() => {
    self.__popups = [];
    const gh = (u) => /^https:\/\/github\.com\//.test(String(u));
    const realWin = chrome.windows.create.bind(chrome.windows);
    chrome.windows.create = (opts) => {
      if (!(opts && gh(opts.url))) return realWin(opts);
      self.__popups.push({ url: opts.url, type: opts.type });
      return realWin(Object.assign({}, opts, { url: "about:blank" }));
    };
  });
  return { ctx, sw, state };
}

/** Site → inject → ticket → Send to GitHub → the panel frame. */
async function panelOnPage(ctx, sw) {
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
  return { page, frame, winP };
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
    const { page, frame, winP } = await panelOnPage(ctx, sw);
    check("A1. not connected: Send to GitHub opens the in-page panel (no window)", !!frame && !(await Promise.race([winP, sleep(500).then(() => null)])));
    if (!frame) throw new Error("no panel frame");
    await frame.waitForSelector("#connect:not([hidden])", { timeout: 8000 });
    check('…from a "Send to app" button (nothing connected yet)',
      (await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]").catch(() => "?")).trim().endsWith("Send to app"),
      (await page.textContent("#tracebug-quick-bug-modal [data-tb-split-main]").catch(() => "none")).trim());
    check('…offering "Connect GitHub" in the panel, with focus on it', (await frame.textContent("#connect")).trim() === "Connect GitHub" &&
      await frame.evaluate(() => document.activeElement && document.activeElement.id === "connect"));
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
    state.approve = true;
    await frame.waitForFunction((r) => [...document.querySelectorAll("#containerList option")].some((o) => o.value === r) ||
      document.getElementById("container").value === r, REPO, { timeout: 12000 }).catch(() => {});
    check("A4. after GitHub approves, the same panel is connected and lists the repo",
      /Connected/.test(await frame.textContent("#panelMsg")) || (await frame.inputValue("#container")) === REPO,
      (await frame.textContent("#panelMsg")).trim());
    if ((await frame.inputValue("#container")) !== REPO) {
      await frame.fill("#container", REPO);
      await frame.dispatchEvent("#container", "change");
    }
    const armed = await frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).then(() => true, () => false);
    if (armed) await frame.click("#send");
    await frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("A5. …and Create files the issue there", state.posts === 1 && /Created/.test(await frame.textContent("#doneBox")), `posts=${state.posts}`);
    check("…the ticket never left the page", await page.locator("#tracebug-quick-bug-modal").isVisible());
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

server.close();
console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
