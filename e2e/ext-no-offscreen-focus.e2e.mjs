// Run: node e2e/ext-no-offscreen-focus.e2e.mjs   (needs `npm run build:ext` first)
//
// T-11 (docs/audit/tracebug-control-inventory.md / tracebug-product-ux-final-review.md):
// dashboard.ts's mountDashboard() creates an empty, off-screen panel container
// (#tracebug-dashboard-panel, right: -480px) on every page by default, as a
// side effect of mounting the compact-toolbar (the real, used in-page UI,
// which mountDashboard also mounts — the two are NOT independently toggleable
// at this call site, confirmed by reading src/dashboard.ts before acting on an
// earlier, wrong instruction to stop mounting it).
//
// What this proves: Tabbing through the whole page during an active capture
// never lands focus inside that panel container, and never lands focus on
// anything positioned off-screen. If this ever fails, the panel has either
// gained a focusable child or come on-screen without T-11 being decided.
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
const EXT = withGrantedHostAccess(EXT_SRC, "no-offscreen-focus");
const PUBLIC_DIR = join(REPO, "website", "public");

const PORT = 4931;
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
  mkdtempSync(join(tmpdir(), "tb-no-offscreen-focus-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);

  const preInject = await page.evaluate(() => typeof window.TraceBug);
  check("clean try.html did not self-start an SDK before injection", preInject === "undefined", preInject);

  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await sleep(500);

  // Confirm the panel container exists (mountDashboard's side effect) before
  // proving it's unreachable by Tab — otherwise this test would pass by
  // accident if the panel were ever removed entirely.
  const panelExists = await page.evaluate(() => !!document.getElementById("tracebug-dashboard-panel"));
  check("the off-screen panel container exists (mountDashboard's side effect)", panelExists);

  // Start a capture — the most "elements on screen" state: HUD, its icon row,
  // and the toolbar are all live, maximizing what Tab can reach.
  await page.evaluate(() => { try { window.TraceBug.startEventsCapture && window.TraceBug.startEventsCapture(); } catch (e) {} });
  await sleep(800);
  const hudPresent = await page.evaluate(() => !!document.getElementById("tracebug-recording-hud"));
  check("capture started (HUD mounted)", hudPresent);

  // Start from the top of the document, then Tab through everything.
  await page.evaluate(() => { document.body.focus(); window.scrollTo(0, 0); });
  await page.keyboard.press("Tab"); // enters the document's tab order
  await sleep(100);

  const MAX_TABS = 200;
  const seen = [];
  const offenders = [];
  let cycled = false;
  let firstKey = null;

  for (let i = 0; i < MAX_TABS; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const panel = document.getElementById("tracebug-dashboard-panel");
      const insidePanel = !!(panel && panel.contains(el));
      // "off-screen" by position (negative/far beyond viewport), not by
      // zero-size (a legitimately tiny but on-screen control is fine).
      const offscreenByPosition =
        r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight;
      return {
        key: (el.id ? "#" + el.id : "") + (el.className ? "." + String(el.className).split(" ").join(".") : "") + "<" + el.tagName + ">",
        insidePanel,
        offscreenByPosition,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
    if (!info) break;
    if (firstKey === null) firstKey = info.key;
    else if (info.key === firstKey) { cycled = true; break; } // back to the start of the cycle
    seen.push(info.key);
    if (info.insidePanel || info.offscreenByPosition) offenders.push(info);
    await page.keyboard.press("Tab");
    await sleep(40);
  }

  check(`tabbed through the page (${seen.length} focusable elements, cycled=${cycled})`, seen.length > 0, seen.length < MAX_TABS ? "" : `hit the ${MAX_TABS}-tab cap without cycling — may not have covered everything`);
  check("focus never landed inside the off-screen panel container", !offenders.some((o) => o.insidePanel),
    JSON.stringify(offenders.filter((o) => o.insidePanel)));
  check("focus never landed on anything positioned off-screen", !offenders.some((o) => o.offscreenByPosition),
    JSON.stringify(offenders.filter((o) => o.offscreenByPosition)));

  console.log(`  ${seen.length} focusable elements tabbed through: ${seen.slice(0, 20).join(", ")}${seen.length > 20 ? ", …" : ""}`);
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
