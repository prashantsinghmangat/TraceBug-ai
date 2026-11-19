// Run: node e2e/ext-firefox-token-path.e2e.mjs   (needs `npm run build:ext` first)
//
// Firefox keeps the pasted-token path for GitHub (ADR 010, "Chrome first").
// Playwright cannot load an extension into Firefox, so this suite does the two
// things it can:
//
//   1. Static: dist/firefox is shaped the way the token path needs — no
//      `identity` anywhere, the GitHub API host optional, the worker scripts
//      and the Create window packaged.
//   2. Behaviour: the Chrome build loaded in Chromium with the FIREFOX
//      permission shape (identity stripped). background.js, confirm-send.* and
//      options.* are the same files in both builds (build-ext.mjs SHARED_FILES),
//      and they decide by feature detection, so this is the code path Firefox
//      takes: no Connect anywhere, the token lists repos and files the issue.
//
// Not covered: Firefox's event-page worker itself. Run `npm run ext:firefox`
// by hand for that.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess, withoutInPagePanel } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const FF_DIR = join(EXT_DIST_DIR, "..", "firefox");

const PORT = 4931;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;
const TOKEN = "ghp_FAKE_E2E_FIREFOX_SHAPE";
const ISSUE_URL = "https://github.com/acme/api/issues/7";

let failures = 0, passes = 0;
const check = (name, ok, extra = "") => {
  if (ok) passes++; else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. The Firefox package ─────────────────────────────────────────────────
const ffPath = join(FF_DIR, "manifest.json");
check("dist/firefox exists", existsSync(ffPath));
if (existsSync(ffPath)) {
  const ff = JSON.parse(readFileSync(ffPath, "utf8"));
  const all = [...(ff.permissions || []), ...(ff.optional_permissions || [])];
  check("Firefox: no `identity` permission, required or optional", !all.includes("identity"), JSON.stringify(all));
  check("Firefox: api.github.com is an optional host (asked for when the token is saved)",
    (ff.optional_host_permissions || []).includes("https://api.github.com/*"), JSON.stringify(ff.optional_host_permissions));
  const scripts = (ff.background && ff.background.scripts) || [];
  check("Firefox: the worker loads the bridge, the provider API and background.js",
    ["provider-bridge.js", "tracebug-provider-api.js", "background.js"].every((f) => scripts.includes(f)), JSON.stringify(scripts));
  check("Firefox: no in-page Create panel (Chrome first) — not web-accessible, not packaged",
    !JSON.stringify(ff.web_accessible_resources || []).includes("create-issue.html") && !existsSync(join(FF_DIR, "create-issue.html")));
  check("Firefox: the Create window and settings are packaged",
    ["confirm-send.html", "confirm-send.js", "options.html", "options.js"].every((f) => existsSync(join(FF_DIR, f))));
}

// ── 2. The shared code, with Firefox's permissions ─────────────────────────
const EXT = withoutInPagePanel(withGrantedHostAccess(EXT_SRC, "firefox-shape")); // the window path; the panel is ext-inpage-panel
const mPath = join(EXT, "manifest.json");
const m = JSON.parse(readFileSync(mPath, "utf8"));
m.optional_permissions = (m.optional_permissions || []).filter((p) => p !== "identity");
writeFileSync(mPath, JSON.stringify(m, null, 2) + "\n", "utf8");

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

const ctx = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), "tb-firefox-shape-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

let issuePost = null;
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const ok = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if ((req.headers()["authorization"] || "") !== `Bearer ${TOKEN}`) {
    return route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Bad credentials"}' });
  }
  if (url.pathname === "/user/repos") return ok([{ full_name: "acme/api" }]);
  if (url.pathname === "/repos/acme/api/labels") return ok([{ name: "bug" }]);
  if (url.pathname === "/repos/acme/api") return ok({ permissions: { push: true } });
  if (req.method() === "POST" && url.pathname === "/repos/acme/api/issues") {
    issuePost = JSON.parse(req.postData() || "{}");
    return ok({ html_url: ISSUE_URL, number: 7 });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Not Found"}' });
});

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;
  await sw.evaluate((token) => chrome.storage.local.set({ tb_integrations_v1: { github: { token } } }), TOKEN);

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
  check('with a token, the ticket offers "Send to GitHub"', (await primary.innerText()).trim() === "Send to GitHub");

  const winP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 10000 });
  await primary.click();
  const win = await winP.catch(() => null);
  check("the Create window opens", !!win);
  if (!win) throw new Error("no window");
  await win.waitForSelector("#panel:not([hidden])", { timeout: 8000 });
  check("no Connect button (sign-in UI is hidden without identity)", !(await win.isVisible("#connect")));
  await win.waitForFunction(() => document.querySelectorAll("#containerList option").length > 0, null, { timeout: 8000 });
  await win.fill("#container", "acme/api");
  await win.dispatchEvent("#container", "change");
  await win.waitForSelector('button.chip[value="bug"]', { timeout: 8000 });
  await win.click("#send");
  await win.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('the token files the issue: "Created #7"', (await win.textContent("#doneBox")).includes("Created #7"));
  check("GitHub got the repo, label and title", !!issuePost && JSON.stringify(issuePost.labels) === '["bug"]' && !!issuePost.title);
  check("the token never reached the page", !(await page.content()).includes(TOKEN));

  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await sleep(600);
  check("settings: no Connect GitHub button", !(await opt.isVisible('.tracker-acct[data-tracker="github"] .acct-connect')));
  check("settings: the token form is open (it's the main path here)",
    await opt.evaluate(() => document.getElementById("ghAdvanced").open));
  const status = await opt.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ type: "tb:tracker:status" }, res)));
  check("the worker reports no sign-in UI", status && status.oauthUi === false, JSON.stringify(status && status.oauthUi));
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
