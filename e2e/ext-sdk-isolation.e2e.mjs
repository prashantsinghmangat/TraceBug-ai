// Run: node e2e/ext-sdk-isolation.e2e.mjs   (needs `npm run build:ext` first)
//
// Two scenarios, both from docs/launch/sdk-isolation-1.11.2.md:
//
//   A. Host toolbar present (enableDashboard left at its true default) ->
//      the extension must defer ENTIRELY: no second toolbar, no page-world
//      SDK injected at all (not even under its own global), the popup's
//      action fails with the new "this site runs its own TraceBug" state,
//      and Alt+B shows the same sentence as an on-page shadow-root notice.
//      Two TraceBug toolbars on one page is the wrong outcome -- giving the
//      extension's bundle its own window global isolates STATE, but both
//      instances still mount into the same shared DOM under the same
//      hardcoded ids (src/dashboard.ts), so state isolation alone doesn't
//      stop a second toolbar from trying to appear. One interface per page.
//
//   B. Host SDK present but WITHOUT a UI (enableDashboard: false) -> the
//      original isolation behavior applies unchanged: the extension reaches
//      extension mode under its own global, real sends work, none of its
//      data is reachable from the page's own instance.
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
const EXT = withGrantedHostAccess(EXT_SRC, "sdk-isolation");
const PUBLIC_DIR = join(REPO, "website", "public");

const PORT = 4941;
const GLOB = `http://localhost:${PORT}/*`;

// Scenario A: a host app with its toolbar up (enableDashboard defaults true).
const FIXTURE_WITH_UI = `<!DOCTYPE html><html><body>
<h1>Host app (own UI)</h1>
<button id="b">Click me</button>
<script src="/tracebug-sdk.js"></script>
<script>
  window.TraceBug.init({ projectId: "host-app", enabled: "all" });
  document.getElementById("b").addEventListener("click", function () { console.error("host app error"); });
</script>
</body></html>`;

// Scenario B: a host app that opted OUT of the toolbar — the npm SDK's own
// documented way to use TraceBug headless/programmatically.
const FIXTURE_NO_UI = `<!DOCTYPE html><html><body>
<h1>Host app (no UI)</h1>
<button id="b">Click me</button>
<script src="/tracebug-sdk.js"></script>
<script>
  window.TraceBug.init({ projectId: "host-app-no-ui", enabled: "all", enableDashboard: false });
  document.getElementById("b").addEventListener("click", function () { console.error("host app error"); });
</script>
</body></html>`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/fixture-with-ui.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(FIXTURE_WITH_UI); return; }
  if (url.pathname === "/fixture-no-ui.html") { res.writeHead(200, { "content-type": "text/html" }); res.end(FIXTURE_NO_UI); return; }
  const p = join(PUBLIC_DIR, decodeURIComponent(url.pathname));
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
  mkdtempSync(join(tmpdir(), "tb-sdk-isolation-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  await sw.evaluate(() => chrome.storage.local.set({
    tb_integrations_v1: { github: { token: "ghp_FAKE_ISOLATION", repo: "acme/widgets" } },
  }));

  // ══════════════════════════ Scenario A: host toolbar present ══════════════
  console.log("\n=== Scenario A: host toolbar present -> extension defers ===");
  {
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/fixture-with-ui.html`, { waitUntil: "load" });
    await sleep(500);

    const hostToolbarBefore = await page.evaluate(() => !!document.getElementById("tracebug-compact-toolbar"));
    check("host app's own toolbar is up before any extension action", hostToolbarBefore);

    // Drive this through the REAL popup, same technique as
    // e2e/marketing-screenshots.mjs: open popup.html as a real tab and stub
    // chrome.tabs.query so it resolves to the fixture tab (opened as a plain
    // tab, chrome.tabs.query({active:true}) would otherwise return the popup
    // page itself). Clicking the real #btnCaptureBug exercises the actual
    // onMessage -> handleComboAction -> injectSDK chain end to end.
    const realTab = await sw.evaluate(async (glob) => {
      const [t] = await chrome.tabs.query({ url: glob });
      return t ? { id: t.id, url: t.url, title: t.title, windowId: t.windowId, active: true } : null;
    }, GLOB);
    if (!realTab) throw new Error("extension cannot see the fixture tab");

    const popup = await ctx.newPage();
    await popup.addInitScript((tab) => {
      const wait = setInterval(() => {
        if (!globalThis.chrome || !chrome.tabs || !chrome.tabs.query) return;
        clearInterval(wait);
        const orig = chrome.tabs.query.bind(chrome.tabs);
        chrome.tabs.query = (info, cb) => {
          if (info && info.active && info.currentWindow) {
            if (cb) { cb([tab]); return undefined; }
            return Promise.resolve([tab]);
          }
          return orig(info, cb);
        };
      }, 1);
    }, realTab);
    const extId = new URL(sw.url()).host;
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "load" });
    await popup.waitForTimeout(1200);

    await popup.click("#btnCaptureBug").catch(() => {});
    await sleep(1000);
    const unavailable = await popup.evaluate(() => {
      const panel = document.getElementById("unavailable");
      const main = document.getElementById("mainContent");
      return {
        panelShown: panel ? panel.style.display !== "none" : false,
        mainHidden: main ? main.style.display === "none" : false,
        title: document.getElementById("unavailableTitle")?.textContent || null,
        sub: document.getElementById("unavailableSub")?.textContent || null,
      };
    }).catch(() => null);
    check('the popup replaces the main content with the "can\'t run" panel', !!unavailable?.panelShown && !!unavailable?.mainHidden, JSON.stringify(unavailable));
    check('panel title reads "This site runs its own TraceBug"', unavailable?.title === "This site runs its own TraceBug", unavailable?.title || "");
    check('panel detail reads "Use its bug button, or capture on another page."', unavailable?.sub === "Use its bug button, or capture on another page.", unavailable?.sub || "");
    await popup.close();
    const afterState = await page.evaluate(() => ({
      toolbarCount: document.querySelectorAll('[id="tracebug-compact-toolbar"]').length,
      extGlobalExists: typeof window.__TraceBugExtension !== "undefined",
      extSDKExists: typeof window.__TraceBugExtensionSDK !== "undefined",
    }));
    check("still exactly one toolbar on the page (no second one appeared)", afterState.toolbarCount === 1, JSON.stringify(afterState));
    check("the extension's own global was never created — nothing of its SDK was injected",
      !afterState.extGlobalExists && !afterState.extSDKExists, JSON.stringify(afterState));

    await page.close();
  }

  // ══════════════════ Scenario B: host SDK present, no UI ═══════════════════
  console.log("\n=== Scenario B: host SDK present but no UI -> isolation works as before ===");
  {
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/fixture-no-ui.html`, { waitUntil: "load" });
    await sleep(400);

    const noHostUi = await page.evaluate(() => ({
      toolbar: !!document.getElementById("tracebug-compact-toolbar"),
      root: !!document.getElementById("tracebug-root"),
      hasTraceBug: typeof window.TraceBug !== "undefined",
    }));
    check("host app's own SDK is initialized but mounted no UI", noHostUi.hasTraceBug && !noHostUi.toolbar && !noHostUi.root, JSON.stringify(noHostUi));

    await page.evaluate(() => { window.__hostTraceBugRef = window.TraceBug; });

    await sw.evaluate(async (glob) => {
      const [tab] = await chrome.tabs.query({ url: glob });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "page-support.js", "content-script.js"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
    }, GLOB);
    await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
    await sleep(600);

    const pageInstanceUnchanged = await page.evaluate(() => window.TraceBug === window.__hostTraceBugRef);
    check("the page's own window.TraceBug instance is unchanged after injection", pageInstanceUnchanged);

    const distinct = await page.evaluate(() =>
      typeof window.TraceBug !== "undefined" && typeof window.__TraceBugExtension !== "undefined" &&
      window.TraceBug !== window.__TraceBugExtension);
    check("window.TraceBug and window.__TraceBugExtension are distinct instances", distinct);

    const capsGithub = await page.evaluate(() => {
      try { return JSON.parse(document.documentElement.getAttribute("data-tb-caps") || "null")?.github; }
      catch { return null; }
    });
    check("data-tb-caps reports github configured (extension mode reached)", capsGithub === true, String(capsGithub));

    await page.evaluate(() => window.dispatchEvent(new CustomEvent("tracebug-ext-action", { detail: { action: "record" } })));
    await sleep(600);
    await page.click("#b");
    await sleep(400);
    await page.keyboard.press("Control+Shift+KeyB");
    const modal = await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 }).catch(() => null);
    check("the extension's own ticket modal opened", !!modal);
    await sleep(1000);

    if (modal) {
      await page.click('#tracebug-quick-bug-modal [data-action="more-toggle"]').catch(() => {});
      await sleep(300);
      await page.click('#tracebug-quick-bug-modal [data-action="integrations-configure"]').catch(() => {});
      await sleep(500);
      // document.body.innerText misses this: #tracebug-root (and everything
      // nested under it, including the ticket modal and this pointer overlay)
      // is appended to document.documentElement as a SIBLING of <body>, not
      // inside it (src/dashboard.ts). documentElement.innerText covers both.
      const pointerText = await page.evaluate(() => document.documentElement.innerText).catch(() => "");
      check("'Configure integrations…' shows the settings pointer",
        /stored by the TraceBug extension|Open TraceBug settings/i.test(pointerText), pointerText.slice(0, 150).replace(/\s+/g, " "));
      // Close the settings-pointer overlay itself (showSettingsPointerModal,
      // quick-bug.ts ~L2821) — it's a separate full-screen overlay nested
      // INSIDE the ticket modal, still covering its footer buttons otherwise.
      await page.click('#tb-ext-settings-pointer [data-ext-close]').catch(() => {});
      await sleep(300);
      await page.click('#tracebug-quick-bug-modal [data-action="more-toggle"]').catch(() => {});
      await sleep(300);

      const primary = page.locator('#tracebug-quick-bug-modal [data-action="open-github"], #tracebug-quick-bug-modal [data-action="github"]').first();
      const label = (await primary.innerText().catch(() => "")).trim();
      check('primary button reads "Send to GitHub"', label === "Send to GitHub", label);

      const openedUrls = [];
      ctx.on("page", (p) => openedUrls.push(p.url()));
      await primary.click().catch(() => {});
      await sleep(1200);
      const confirmWin = ctx.pages().find((pg) => pg.url().includes("confirm-send.html"));
      check("clicking Send to GitHub opens the real confirm-send.html window", !!confirmWin);
      check("no github.com tab ever opened", !openedUrls.some((u) => /github\.com/i.test(u)));
      if (confirmWin) await confirmWin.click("#cancel").catch(() => {});
    }
    await sleep(400);

    const leak = await page.evaluate(() => {
      const hay = [document.documentElement.outerHTML];
      for (let i = 0; i < localStorage.length; i++) hay.push(String(localStorage.getItem(localStorage.key(i))));
      return hay.join("\n");
    });
    check("the GitHub token never reached the page", !leak.includes("ghp_FAKE_ISOLATION"));
    check("the configured repo string never reached the page", !leak.includes("acme/widgets"));

    await page.close();
  }
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
