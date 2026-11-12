// Run: node e2e/ext-site-audit.e2e.mjs   (--headful to watch, --verbose for every check)
//
// SITE AUDIT through the shipped extension (docs/audit-quality/implementation-plan.md
// step 2b). Loads the PACKAGED Chrome build (tracebug-extension/dist/chrome) and runs
// the popup's "Audit" action through the worker's real handleComboAction, so the
// path under test is the one users get:
//
//   popup "Audit" → worker: inject SDK + vendor/axe.min.js (MAIN world, on demand)
//                → content script → tracebug-init.js "audit" → SDK showAuditPanel()
//
// Checks: axe is not in the page before the audit and is after; accessibility
// actually RUNS in the extension (the injected bundle stubs axe); the panel shows
// every category and the planted findings; "Re-run audit" reports what changed;
// Esc closes it; no new manifest permission.
//
// Build first: npm run build:ext
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const DIST = join(EXT_SRC_DIR, "dist", "chrome");
if (!existsSync(join(DIST, "vendor", "axe.min.js"))) {
  console.error("No packaged build with vendor/axe.min.js — run `npm run build:ext` first.");
  process.exit(1);
}
const EXT = withGrantedHostAccess(DIST, "site-audit");
const PORT = 4221;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GLOB = `${ORIGIN}/*`;

let fixed = false; // the server serves the "after" page once a test flips this
const PAGE = () => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Acme checkout — extension audit fixture</title>
<style>body{font-family:system-ui;margin:0;padding:16px}.low{color:#cfcfcf;background:#fff}.wide{width:2400px;height:10px;background:#eee}</style>
</head><body><h1>Checkout</h1>
<p class="low" id="low">Delivery in 3–5 working days</p>
${fixed ? '<button id="icon-btn" aria-label="Close">×</button>' : '<button id="icon-btn"><svg width="12" height="12"></svg></button>'}
${fixed ? "" : '<div class="wide" id="wide"></div>'}
<input id="coupon" type="text">
</body></html>`;

// /strict: a page whose CSP forbids eval and inline scripts (like GitHub's).
// axe-core contains `new Function` (web-ext flags it), and code injected into
// the MAIN world runs under the PAGE's CSP — so this proves the audit still
// works where eval is blocked.
const STRICT = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Strict CSP page for the site audit</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body><h1>Strict</h1>
<button id="strict-btn"><svg width="9" height="9"></svg></button></body></html>`;
const server = createServer((req, res) => {
  if (req.url.startsWith("/strict")) {
    res.writeHead(200, {
      "content-type": "text/html",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    });
    res.end(STRICT);
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(PAGE());
});
await new Promise((r) => server.listen(PORT, r));

const VERBOSE = process.argv.includes("--verbose");
let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra && (!ok || VERBOSE) ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const short = (v) => JSON.stringify(v)?.slice(0, 300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const userDir = mkdtempSync(join(tmpdir(), "tb-ext-site-audit-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  ...extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
  headless: !process.argv.includes("--headful") ? true : false,
});

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  await sleep(1200);

  // No new permission: the audit rides on activeTab + scripting.
  const perms = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")).permissions;
  check("manifest permissions unchanged", JSON.stringify(perms) === JSON.stringify(["activeTab", "storage", "unlimitedStorage", "scripting", "alarms", "offscreen", "tabCapture"]), short(perms));

  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${ORIGIN}/checkout`, { waitUntil: "load" });
  check("axe is not in the page before an audit", await page.evaluate(() => typeof window.axe === "undefined"));

  const runAuditAction = () => sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    // eslint-disable-next-line no-undef
    await handleComboAction({ type: "TB_RUN_AUDIT", tabId: tab.id }, {});
    return true;
  }, GLOB);

  await runAuditAction();
  await page.waitForSelector("#tracebug-audit-panel .tb-au-cats", { timeout: 20000 });
  check("the Audit action opens the audit panel", true);
  check("axe was injected on demand", await page.evaluate(() => !!(window.axe && typeof window.axe.run === "function")));

  const run = await page.evaluate(() => window.__TraceBugExtension.getLastAudit());
  const cat = (name) => run?.categories.find((c) => c.name === name);
  check("accessibility RAN in the extension", cat("accessibility")?.ran === true, short(cat("accessibility")));
  check("ui, seo and runtime ran", ["ui", "seo", "runtime"].every((n) => cat(n)?.ran === true), short(run?.categories));
  const ids = (run?.findings || []).map((f) => f.ruleId);
  check("a11y findings: unnamed button, unlabeled input, low contrast", ["button-name", "label", "color-contrast"].every((r) => ids.includes(r)), short(ids));
  check("layout finding: sideways scroll", ids.includes("ui/horizontal-overflow"));
  check("nothing from TraceBug's own UI", !(run?.findings || []).some((f) => /tracebug/i.test(f.selector || "")));

  // textContent: the limitations sit in a collapsed "What these checks can't tell you" section.
  const panelText = await page.locator("#tracebug-audit-panel").evaluate((el) => el.textContent || "");
  check("panel lists every category", ["Accessibility", "Layout", "SEO", "Errors & requests"].every((t) => panelText.includes(t)), panelText.slice(0, 200));
  check("panel shows the honest a11y limitation", /not a conformance evaluation/.test(panelText));
  check("panel shows a finding title", /Buttons must have discernible text/i.test(panelText) || panelText.includes("button-name"));

  // Fix three things on the page, then "Re-run audit" from the panel.
  fixed = true;
  await page.evaluate(() => {
    document.getElementById("icon-btn").setAttribute("aria-label", "Close");
    document.getElementById("wide")?.remove();
  });
  await page.click('#tracebug-audit-panel [data-tb-au="rerun"]');
  await page.waitForSelector("#tracebug-audit-panel .tb-au-diff", { timeout: 20000 });
  const diffText = await page.locator("#tracebug-audit-panel .tb-au-diff").innerText();
  check("re-run reports what was fixed", /[1-9]\d* fixed/.test(diffText), diffText);
  const after = await page.evaluate(() => window.__TraceBugExtension.getLastAudit());
  check("the fixed button is gone from the new run", !(after?.findings || []).some((f) => f.ruleId === "button-name"));
  check("performance ran, with page metrics", typeof after?.categories.find((c) => c.name === "performance")?.metrics?.ttfbMs === "number", short(after?.categories.find((c) => c.name === "performance")));

  // Export report: downloads the .html with the audit inside.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.click('#tracebug-audit-panel [data-tb-au="export"]'),
  ]);
  const exported = join(mkdtempSync(join(tmpdir(), "tb-ext-audit-")), download.suggestedFilename());
  await download.saveAs(exported);
  const exportedData = JSON.parse(readFileSync(exported, "utf8").match(/<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  check("Export report downloads a tracebug-audit file carrying the run", /^tracebug-audit-/.test(download.suggestedFilename()) && exportedData.audit?.id === after?.id, download.suggestedFilename());

  // 1.12.0: score, docked panel, Locate keeps the panel open.
  const scoreText = await page.locator("#tracebug-audit-panel .tb-au-score").innerText();
  check("the panel shows an overall score and a band", /\b\d{1,3}\b/.test(scoreText) && /(Good|Needs work|Poor)/.test(scoreText), scoreText.slice(0, 120));
  check("the run carries a score per category that ran", typeof after?.score?.overall === "number" && typeof after?.score?.categories?.accessibility === "number", short(after?.score));
  check("the panel is docked, not a modal over the page", await page.evaluate(() => {
    const p = document.getElementById("tracebug-audit-panel");
    return !!p && p.getAttribute("role") === "complementary" && !document.getElementById("tracebug-audit-panel-overlay") && p.getBoundingClientRect().width <= 420;
  }));
  const contrastCard = page.locator('#tracebug-audit-panel .tb-au-card[data-selector]:not([data-selector=""])').first();
  await contrastCard.locator('[data-tb-au="toggle"]').click();
  check("a finding expands to how-to-fix and where-it-is", /How to fix|Where it is/i.test(await contrastCard.innerText()));
  await contrastCard.locator('[data-tb-au="locate"]').click();
  await sleep(300);
  check("Locate keeps the panel open", (await page.locator("#tracebug-audit-panel").count()) === 1);
  check("Locate highlights the element on the page", (await page.locator("#tracebug-audit-highlight").count()) === 1);
  const contrastRow = after?.findings.find((f) => f.ruleId === "color-contrast");
  check("contrast findings suggest a passing colour and name WCAG 1.4.3",
    /^#[0-9a-f]{6}$/.test(contrastRow?.evidence?.metrics?.suggestedFgColor || "") && (contrastRow?.wcag || []).includes("1.4.3") && !!contrastRow?.fix,
    short(contrastRow && { wcag: contrastRow.wcag, fix: contrastRow.fix, m: contrastRow.evidence?.metrics }));

  await page.locator('#tracebug-audit-panel [data-tb-au="close"]').focus();
  await page.keyboard.press("Escape");
  await sleep(200);
  check("Esc closes the panel", (await page.locator("#tracebug-audit-panel").count()) === 0);

  // The floating toolbar's Audit button: loads axe through the worker (TB_LOAD_AXE) and opens the panel.
  await page.evaluate(() => { delete window.axe; });
  await page.click("#tracebug-toolbar-audit-btn");
  await page.waitForSelector("#tracebug-audit-panel .tb-au-cats", { timeout: 20000 });
  const viaToolbar = await page.evaluate(() => window.__TraceBugExtension.getLastAudit());
  check("toolbar Audit opens the panel with accessibility run (axe loaded on request)",
    viaToolbar?.categories.find((c) => c.name === "accessibility")?.ran === true && !!(await page.evaluate(() => window.axe && typeof window.axe.run === "function")),
    short(viaToolbar?.categories));
  check("toolbar Audit button shows as pressed while open", (await page.getAttribute("#tracebug-toolbar-audit-btn", "aria-pressed")) === "true");
  await page.click("#tracebug-toolbar-audit-btn");
  await sleep(200);
  check("toolbar Audit button closes the panel again", (await page.locator("#tracebug-audit-panel").count()) === 0);

  // Scan menu (plan §4a): the popup sends a scan; only its categories run.
  const popupHtml = readFileSync(join(DIST, "popup.html"), "utf8");
  check("popup offers the four scans", ["full", "auto-review", "accessibility", "performance-seo"].every((k) => popupHtml.includes(`data-scan="${k}"`)));
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    // eslint-disable-next-line no-undef
    await handleComboAction({ type: "TB_RUN_AUDIT", tabId: tab.id, scan: "accessibility" }, {});
  }, GLOB);
  await page.waitForSelector('#tracebug-audit-panel [data-scan="accessibility"][aria-pressed="true"]', { timeout: 20000 });
  await page.waitForSelector("#tracebug-audit-panel .tb-au-cats", { timeout: 20000 });
  const a11yOnly = await page.evaluate(() => window.__TraceBugExtension.getLastAudit());
  check("Accessibility Audit runs accessibility only", a11yOnly?.scan === "accessibility" && a11yOnly.categories.map((c) => c.name).join() === "accessibility", short(a11yOnly?.categories.map((c) => c.name)));
  await page.click('#tracebug-audit-panel [data-scan="performance-seo"]');
  await page.waitForFunction(() => window.__TraceBugExtension.getLastAudit()?.scan === "performance-seo", null, { timeout: 20000 });
  const perfSeo = await page.evaluate(() => window.__TraceBugExtension.getLastAudit());
  check("the panel's scan bar switches to Performance & SEO", perfSeo.categories.map((c) => c.name).join() === "performance,seo", short(perfSeo.categories.map((c) => c.name)));
  await page.keyboard.press("Escape");

  // Strict CSP (no eval): accessibility must still run.
  const strict = await ctx.newPage();
  const cspErrors = [];
  strict.on("console", (m) => { if (/Content Security Policy|unsafe-eval|EvalError/i.test(m.text())) cspErrors.push(m.text().slice(0, 160)); });
  await strict.goto(`${ORIGIN}/strict`, { waitUntil: "load" });
  await strict.bringToFront();
  await sw.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ url });
    // eslint-disable-next-line no-undef
    await handleComboAction({ type: "TB_RUN_AUDIT", tabId: tab.id }, {});
  }, `${ORIGIN}/strict*`);
  await strict.waitForSelector("#tracebug-audit-panel .tb-au-cats", { timeout: 20000 });
  const strictRun = await strict.evaluate(() => window.__TraceBugExtension.getLastAudit());
  check("strict CSP: accessibility still runs", strictRun?.categories.find((c) => c.name === "accessibility")?.ran === true, short(strictRun?.categories));
  check("strict CSP: the unnamed button is found", (strictRun?.findings || []).some((f) => f.ruleId === "button-name"));
  check("strict CSP: no CSP/eval errors in the console", cspErrors.length === 0, short(cspErrors));
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await ctx.close();
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
