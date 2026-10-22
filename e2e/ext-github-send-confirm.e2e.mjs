// Run: node e2e/ext-github-send-confirm.e2e.mjs   (needs `npm run build:ext` first)
//
// T-02's behavior half, not just the label (docs/audit/tracebug-control-inventory.md):
// in extension mode with GitHub configured, the primary ticket-modal button must say
// "Send to GitHub" (never "Open in GitHub" — nothing opens a tab) and clicking it must
// go through _fileViaTracker -> confirm-send.html, never a direct github.com tab.
// Page/SDK mode (config.githubRepo) keeps the real "Open in GitHub" tab-opening behavior.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, requireBuilt } from "./paths.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withGrantedHostAccess(EXT_SRC, "gh-send-confirm");
const PUBLIC_DIR = join(REPO, "website", "public");

const PORT = 4921;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;

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
  mkdtempSync(join(tmpdir(), "tb-gh-send-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  // Configure GitHub exactly as options.html would (real token shape, fake value).
  await sw.evaluate(() => chrome.storage.local.set({
    tb_integrations_v1: { github: { token: "ghp_FAKE_E2E", repo: "acme/widgets" } },
  }));

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);

  // This is the CLEAN try.html (post fix(try) commit) — it never self-starts a
  // page-mode SDK, so the extension's injected copy is the only one, same
  // real injection sequence background.js runs.
  const preInject = await page.evaluate(() => typeof window.TraceBug);
  check("try.html did not self-start an SDK before injection", preInject === "undefined", preInject);

  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await sleep(500);

  // Reproduce the seeded bug so the ticket modal has real content.
  await page.fill("#coupon", "SAVE20");
  await page.click("#applyBtn");
  await sleep(400);
  await page.click("#orderBtn");
  await sleep(700);
  await page.evaluate(() => { try { window.TraceBug.startEventsCapture && window.TraceBug.startEventsCapture(); } catch (e) {} });
  await sleep(500);
  await page.fill("#coupon", "SAVE20");
  await page.click("#applyBtn");
  await sleep(400);
  await page.click("#orderBtn");
  await sleep(700);

  await page.keyboard.press("Control+Shift+KeyB");
  const modal = await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  check("ticket modal opened", !!modal);
  await sleep(1000);

  const primary = page.locator('#tracebug-quick-bug-modal [data-action="open-github"], #tracebug-quick-bug-modal [data-action="github"]').first();
  const label = (await primary.innerText()).trim();
  const action = await primary.getAttribute("data-action");
  check('extension mode, configured: label reads "Send to GitHub"', label === "Send to GitHub", label);
  check('extension mode, configured: data-action is "open-github"', action === "open-github", action);

  // Watch for ANY new page/tab appearing — the assertion that matters: no
  // github.com tab, ever, only the confirm-send.html window.
  const openedUrls = [];
  ctx.on("page", (p) => { openedUrls.push(p.url()); p.waitForLoadState("domcontentloaded").catch(() => {}); });

  await primary.click();
  await sleep(1500);

  const confirmWin = ctx.pages().find((pg) => pg.url().includes("confirm-send.html"));
  check("clicking the button opens confirm-send.html", !!confirmWin);
  const anyGithubTab = openedUrls.some((u) => /github\.com/i.test(u)) ||
    ctx.pages().some((pg) => /github\.com/i.test(pg.url()));
  check("no github.com tab ever opened", !anyGithubTab, JSON.stringify(openedUrls));

  if (confirmWin) {
    const confirmText = await confirmWin.evaluate(() => document.body.innerText).catch(() => "");
    check("confirm window names the configured destination", confirmText.includes("acme/widgets"), confirmText.slice(0, 120));
    await confirmWin.click("#cancel").catch(() => {});
  }
  await sleep(500);

  // ── Page/SDK mode: must keep the real "Open in GitHub" tab-opening behavior ──
  console.log("\n--- page/SDK mode (config.githubRepo) ---");
  const page2 = await ctx.newPage();
  await page2.goto(SITE, { waitUntil: "load" });
  await sleep(300);
  // Page mode, deliberately NOT via the extension injection — this simulates a
  // real npm-SDK consumer with a prefilled repo, no BYO token.
  await page2.evaluate(() => {
    const s = document.createElement("script");
    s.src = "/tracebug-sdk.js";
    document.body.appendChild(s);
  });
  await page2.waitForFunction(() => !!window.TraceBug, null, { timeout: 15000 });
  await sleep(300);
  await page2.evaluate(() => {
    window.TraceBug.init({ projectId: "page-mode-e2e", enabled: "all", githubRepo: "acme/widgets" });
  });
  await sleep(500);

  await page2.fill("#coupon", "SAVE20");
  await page2.click("#applyBtn");
  await sleep(400);
  await page2.click("#orderBtn");
  await sleep(700);
  await page2.evaluate(() => { try { window.TraceBug.startEventsCapture && window.TraceBug.startEventsCapture(); } catch (e) {} });
  await sleep(500);
  await page2.fill("#coupon", "SAVE20");
  await page2.click("#applyBtn");
  await sleep(400);
  await page2.click("#orderBtn");
  await sleep(700);

  await page2.keyboard.press("Control+Shift+KeyB");
  await page2.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(1000);

  const primary2 = page2.locator('#tracebug-quick-bug-modal [data-action="open-github"], #tracebug-quick-bug-modal [data-action="github"]').first();
  const label2 = (await primary2.innerText()).trim();
  check('page/SDK mode, githubRepo set: label stays "Open in GitHub"', label2 === "Open in GitHub", label2);

  const opened2 = [];
  ctx.on("page", (p) => opened2.push(p.url()));
  const [newTab] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null),
    primary2.click(),
  ]);
  await sleep(800);
  const realGithubTab = newTab && /github\.com/i.test(newTab.url());
  check("page/SDK mode really opens a github.com tab", !!realGithubTab, newTab ? newTab.url() : "no tab opened");
  if (newTab) await newTab.close().catch(() => {});
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
