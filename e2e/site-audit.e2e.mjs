// Run: node e2e/site-audit.e2e.mjs   (--headful to watch, --verbose for every check)
//
// SITE AUDIT — the audit engine against a page with planted defects
// (docs/audit-quality/implementation-plan.md §7). Uses the script-tag SDK
// (website/public/tracebug-sdk.js, which bundles axe-core) in real Chromium,
// because the layout checks need real layout. The extension path (packaged
// axe file, popup "Run audit") is step 2b and gets its own coverage.
//
//   /before  — one or more planted defects per category (performance: a
//              ~700 KB render-blocking script in <head>)
//   /after   — the same page with four fixes (the script is gone) and ONE new
//              accessibility defect
//
// Then the export: exportAudit() downloads the report; the file carries
// payload.audit (no token, metrics present) and opens on its Audit tab.
//
// Answer key: every planted defect is found; nothing comes from TraceBug's own
// UI; a token in the page never reaches the run; compareAudits() reports the
// three fixes as fixed and the new defect as regressed.
//
// Build first: npm run build
import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const ROOT = "D:/Project/TraceBug-ai";
const SDK = join(ROOT, "website/public/tracebug-sdk.js");
if (!existsSync(SDK)) { console.error("Missing website/public/tracebug-sdk.js — run `npm run build` first."); process.exit(1); }
const PORT = 4219;
// A public-looking host (mapped to 127.0.0.1 below): on localhost the audit skips file-size checks.
const ORIGIN = `http://shop.example:${PORT}`;
const SECRET = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.c2VjcmV0c2lnbmF0dXJlMTIzNDU2";

// ── The page under test ─────────────────────────────────────────────────────
// fixed = which defects are repaired; regression = add one new a11y defect.
function page({ fixed = false } = {}) {
  const svg = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#ccc"/></svg>');
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Acme checkout — site audit fixture</title>
${fixed ? '<meta name="description" content="Review your cart, apply a coupon and place your order with Acme in under a minute, securely.">' : '<script src="/big.js"></script>'}
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; }
  .low { color: #c8c8c8; background: #ffffff; }
  .wide { width: 2400px; height: 20px; background: #eee; }
  .clip { width: 80px; overflow: hidden; white-space: nowrap; }
  .pair { position: relative; height: 40px; }
  .pair button { position: absolute; top: 0; height: 36px; width: 120px; }
  .pair .b2 { left: 60px; }
  .apply:focus { outline: none; }
</style></head><body>
<h1>Checkout</h1>
<h1>Your cart</h1>
<p class="low" id="low-contrast">Delivery in 3–5 working days</p>
<img src="${svg}" id="hero-img">
<img src="/missing-banner.png" alt="Spring sale" id="broken-img">
<label>Email <input id="email" type="email"></label>
<button class="apply" id="apply-coupon" tabindex="2">Apply</button>
<input id="coupon" type="text" data-token="${SECRET}">
${fixed ? '<button id="icon-btn" aria-label="Close">×</button>' : '<button id="icon-btn"><svg width="12" height="12"></svg></button>'}
${fixed ? "" : '<div class="wide" id="wide-banner"></div>'}
<div class="clip" id="clipped">This label is much too long for its box</div>
<div class="pair">${fixed ? '<button class="b1">Save</button>' : '<button class="b1">Save</button><button class="b2">Delete</button>'}</div>
${fixed ? '<a href="/help" id="empty-link"></a>' : ""}
<script src="/tracebug-sdk.js"></script>
<script>window.TraceBug.init({ projectId: "site-audit-e2e", enabled: "all" });</script>
</body></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  if (url.pathname === "/tracebug-sdk.js") { res.writeHead(200, { "content-type": "text/javascript" }); res.end(readFileSync(SDK)); return; }
  if (url.pathname === "/big.js") {
    // ~700 KB, slow enough to hold up the first paint.
    setTimeout(() => {
      res.writeHead(200, { "content-type": "text/javascript", "cache-control": "no-store" });
      res.end("window.__big = 1;\n" + "/*" + "x".repeat(700 * 1024) + "*/\n");
    }, 250);
    return;
  }
  if (url.pathname === "/phone") {
    // Fine at desktop width; at 390px a promo banner becomes wider than the screen and the code block scrolls.
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phone fixture</title>
<style>body{margin:0;font-family:system-ui,sans-serif} main{padding:16px} pre{overflow-x:auto;background:#eee;font-size:14px} @media (max-width:500px){ .promo{width:620px;height:40px;background:#fc0} }</style></head>
<body><main><h1>Phone</h1><div class="promo" id="promo">Promo</div><pre id="code">npx -y tracebug mcp --dir ./reports --verbose --a-long-flag-for-width</pre></main>
<script src="/tracebug-sdk.js"></script><script>window.TraceBug.init({ projectId: "site-audit-e2e", enabled: "all" });</script></body></html>`);
    return;
  }
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(["User-agent: *", "Disallow: /reveal", ""].join("\n"));
    return;
  }
  if (url.pathname === "/reveal") {
    // 1.12.0 accessibility additions: a fixed header with no scroll-padding (2.4.11), a link whose
    // aria-label drops its visible text (2.5.3), and low-contrast text that only fades in on scroll.
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Reveal fixture</title>
<style>body{margin:0;font-family:system-ui,sans-serif} header{position:fixed;top:0;left:0;right:0;height:64px;box-sizing:border-box;background:#fff;border-bottom:1px solid #ddd}
main{padding:80px 16px} .spacer{height:2400px} .reveal{opacity:0;transition:opacity .2s} .reveal.on{opacity:1} .low{color:#b45309;background:#f4eae4;font-size:11px}</style></head>
<body><header><a href="/">Home</a></header><main><h1>Reveal</h1>
<a href="/demo" id="demo" aria-label="Play the 57-second product video">Watch the demo</a>
<p id="over-gradient" style="background-image:linear-gradient(90deg,#000,#fff);color:#777">Text over a gradient</p>
<div class="spacer"></div><div class="reveal" id="rev"><p class="low" id="hidden-low">Only after scrolling</p></div></main>
<script>new IntersectionObserver(([e],o)=>{if(e.isIntersecting){e.target.classList.add("on");o.disconnect();}}).observe(document.getElementById("rev"));</script>
<script src="/tracebug-sdk.js"></script><script>window.TraceBug.init({ projectId: "site-audit-e2e", enabled: "all" });</script></body></html>`);
    return;
  }
  if (url.pathname === "/checkout") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(page({ fixed: url.searchParams.get("v") === "after" }));
    return;
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(PORT, r));

// ── Output: quiet while passing (e2e/README.md conventions) ─────────────────
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

const browser = await chromium.launch({ headless: !process.argv.includes("--headful"), args: ["--host-resolver-rules=MAP shop.example 127.0.0.1"] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const tab = await ctx.newPage();

  const audit = async (v) => {
    await tab.goto(`${ORIGIN}/checkout?v=${v}&session=abc123`, { waitUntil: "load" });
    await tab.waitForFunction(() => window.TraceBug && window.TraceBug.runAudit, null, { timeout: 15000 });
    await tab.waitForTimeout(500); // let the toolbar mount, so we can prove it is ignored
    return tab.evaluate(() => window.TraceBug.runAudit());
  };

  const before = await audit("before");
  const rules = (run) => run.findings.map((f) => f.ruleId);
  const has = (run, ruleId, pred = () => true) => run.findings.some((f) => f.ruleId === ruleId && pred(f));
  const cat = (run, name) => run.categories.find((c) => c.name === name);

  // Categories
  for (const name of ["accessibility", "ui", "performance", "seo", "runtime"]) {
    check(`category ${name} ran`, cat(before, name)?.ran === true, short(cat(before, name)));
  }
  check("accessibility carries the honest limitation", /not a conformance evaluation/.test(cat(before, "accessibility")?.limitation || ""));

  // Accessibility (axe)
  check("a11y: image without alt", has(before, "image-alt", (f) => /hero-img/.test(f.selector || "")), short(rules(before)));
  check("a11y: button without a name", has(before, "button-name", (f) => /icon-btn/.test(f.selector || "")));
  check("a11y: input without a label", has(before, "label", (f) => /coupon/.test(f.selector || "")));
  check("a11y: low-contrast text, with the measured ratio", has(before, "color-contrast", (f) => /low-contrast/.test(f.selector || "") && typeof f.evidence?.metrics?.contrastRatio === "number"));

  // UI (layout)
  check("ui: page scrolls sideways", has(before, "ui/horizontal-overflow"));
  check("ui: the wide banner is named as the cause", has(before, "ui/off-screen", (f) => /wide-banner/.test(f.selector || "") || /wide/.test(f.evidence?.html || "")), short(before.findings.filter((f) => f.ruleId === "ui/off-screen").map((f) => f.selector)));
  check("ui: overlapping buttons", has(before, "ui/overlap"));
  check("ui: clipped text", has(before, "ui/text-clipped", (f) => /clipped/.test(f.selector || "")));
  check("ui: image without width/height", has(before, "ui/img-no-dimensions", (f) => /hero-img/.test(f.selector || "")));
  check("ui: broken image", has(before, "ui/broken-image", (f) => /missing-banner/.test(f.url || "")));

  // SEO
  check("seo: no meta description", has(before, "seo/missing-description"));
  check("seo: two h1 headings", has(before, "seo/multiple-h1"));
  check("seo: no canonical", has(before, "seo/missing-canonical"));
  check("seo: title and viewport present → not flagged", !has(before, "seo/missing-title") && !has(before, "seo/missing-viewport"));

  // Keyboard pass (Accessibility Audit)
  check("kbd: positive tabindex", has(before, "kbd/positive-tabindex", (f) => /apply-coupon/.test(f.selector || "")), short(before.findings.filter((f) => f.ruleId.startsWith("kbd/")).map((f) => [f.ruleId, f.selector])));
  check("kbd: :focus rule hides the outline", has(before, "kbd/focus-outline-removed", (f) => f.title.includes(".apply:focus")));
  check("kbd: TraceBug's own focus styles are ignored", !before.findings.some((f) => f.ruleId === "kbd/focus-outline-removed" && /tracebug|tb-/i.test(f.title)));

  // Scan menu: each scan runs only its categories
  const names = (run) => run.categories.map((c) => c.name).join();
  const scanRun = (scan) => tab.evaluate((s) => window.TraceBug.runAudit({ scan: s }), scan);
  const auto = await scanRun("auto-review");
  check("scan auto-review = layout + phone width + runtime", auto.scan === "auto-review" && names(auto) === "ui,mobile,runtime", names(auto));
  const a11y = await scanRun("accessibility");
  check("scan accessibility = axe + keyboard only", names(a11y) === "accessibility" && has(a11y, "kbd/positive-tabindex") && has(a11y, "image-alt"), names(a11y));
  const ps = await scanRun("performance-seo");
  check("scan performance-seo = performance + SEO", names(ps) === "performance,seo" && has(ps, "seo/multiple-h1"), names(ps));
  const cross = await tab.evaluate(([b, a]) => window.TraceBug.compareAudits(b, a), [before, ps]);
  check("comparing a full run with a partial scan skips what the scan didn't run", cross.comparable && ["accessibility", "runtime", "ui"].every((c) => cross.skippedCategories.includes(c)) && !cross.fixed.some((f) => f.category === "accessibility"), short(cross.skippedCategories));
  const full = await tab.evaluate(() => window.TraceBug.runAudit());
  check("no scan = all checks", full.scan === "full" && full.categories.length === 6, names(full));

  // Performance (lab, this page load)
  const perfCat = cat(before, "performance");
  const m = perfCat?.metrics || {};
  check("perf: page metrics recorded (TTFB, FCP, LCP, CLS, weight)", ["ttfbMs", "fcpMs", "lcpMs", "cls", "transferKb", "requests"].every((k) => typeof m[k] === "number"), short(m));
  check("perf: weight counts the big script", m.transferKb >= 700, short(m));
  check("perf: limitation says lab data, not real users", /not real-user data/.test(perfCat?.limitation || ""));
  check("perf: the 700 KB script is a large file", has(before, "perf/large-resource", (f) => /big\.js/.test(f.url || "") && f.evidence?.metrics?.sizeKb >= 690), short(before.findings.filter((f) => f.category === "performance").map((f) => [f.ruleId, f.title])));
  check("perf: and it blocks the first paint", has(before, "perf/render-blocking", (f) => /big\.js/.test(f.url || "")));
  check("perf: TraceBug's own SDK file is never blamed", !before.findings.some((f) => f.category === "performance" && /tracebug/i.test(f.url || "")), short(before.findings.filter((f) => f.category === "performance").map((f) => f.url)));

  // Hygiene
  const json = JSON.stringify(before);
  check("nothing from TraceBug's own UI", !before.findings.some((f) => /tracebug/i.test(f.selector || "") || /tracebug-root/.test(f.evidence?.html || "")));
  check("the token in the page never reaches the run", !json.includes(SECRET));
  check("the page URL's query is masked", !json.includes("abc123"));
  check("every finding has a fingerprint", before.findings.every((f) => /^[0-9a-f]{16}$/.test(f.fingerprint || "")));
  check("findings are most severe first", before.findings.every((f, i, a) => i === 0 || ["critical", "serious", "moderate", "minor"].indexOf(a[i - 1].severity) <= ["critical", "serious", "moderate", "minor"].indexOf(f.severity)));
  check("evidence html is bounded", before.findings.every((f) => (f.evidence?.html || "").length <= 600));

  // Re-run the same page: identical fingerprints (nothing random in them)
  const again = await audit("before");
  const fpSet = (run) => run.findings.map((f) => f.fingerprint).sort().join(",");
  check("same page, same fingerprints", fpSet(before) === fpSet(again));

  // Verify loop
  const after = await audit("after");
  const cmp = await tab.evaluate(([b, a]) => window.TraceBug.compareAudits(b, a), [before, after]);
  const ids = (list) => list.map((f) => f.ruleId);
  check("compare: comparable", cmp.comparable === true, short(cmp.reason));
  check("compare: button-name fixed", ids(cmp.fixed).includes("button-name"), short(ids(cmp.fixed)));
  check("compare: overflow fixed", ids(cmp.fixed).includes("ui/horizontal-overflow"));
  check("compare: overlap fixed", ids(cmp.fixed).includes("ui/overlap"));
  check("compare: description fixed", ids(cmp.fixed).includes("seo/missing-description"));
  check("compare: the large script fixed", ids(cmp.fixed).includes("perf/large-resource"));
  check("compare: the new empty link is a regression", ids(cmp.regressed).includes("link-name"), short({ regressed: ids(cmp.regressed), new: ids(cmp.new) }));
  check("compare: untouched defects still present", ["image-alt", "label", "color-contrast", "ui/text-clipped", "seo/multiple-h1"].every((r) => cmp.stillPresent.some((p) => p.after.ruleId === r)), short(cmp.stillPresent.map((p) => p.after.ruleId)));

  // Export: the report file carries the audit and opens on its Audit tab.
  const out = mkdtempSync(join(tmpdir(), "tb-audit-export-"));
  try {
    const [download] = await Promise.all([
      tab.waitForEvent("download", { timeout: 20000 }),
      tab.evaluate(() => window.TraceBug.exportAudit()),
    ]);
    const name = download.suggestedFilename();
    check("export: named tracebug-audit-<host>-…html", /^tracebug-audit-shop\.example-.*\.html$/.test(name), name);
    const file = join(out, name);
    await download.saveAs(file);
    const html = readFileSync(file, "utf8");
    const data = JSON.parse(html.match(/<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    check("export: payload.audit is the last run", data.audit?.id === after.id && data.audit.findings.length === after.findings.length, short({ id: data.audit?.id }));
    check("export: performance metrics ride along", typeof data.audit?.categories.find((c) => c.name === "performance")?.metrics?.lcpMs === "number");
    check("export: report title names the page", data.meta.title === "Site audit: /checkout", data.meta.title);
    check("export: summary is the audit, with no root-cause guess", /^Site audit: \d+ findings? \(/.test(data.meta.summary) && !data.rootCauseHint && data.meta.rootCause === "", short([data.meta.summary, data.rootCauseHint]));
    check("export: no token, no masked query value", !html.includes(SECRET) && !html.includes("abc123"));

    const viewer = await ctx.newPage();
    await viewer.goto(pathToFileURL(file).href, { waitUntil: "load" });
    const v = await viewer.evaluate(() => {
      const btn = document.querySelector('[data-tab="audit"]');
      const panel = document.getElementById("panel-audit");
      return {
        visible: !!btn && !btn.hidden,
        active: !!btn && btn.classList.contains("tb-vtab-active"),
        rows: panel ? panel.querySelectorAll(".tb-vau-row").length : 0,
        cats: panel ? panel.querySelectorAll(".tb-vau-cat").length : 0,
        metrics: panel?.querySelector(".tb-vau-m")?.textContent || "",
      };
    });
    check("viewer: opens on the Audit tab", v.visible && v.active, short(v));
    check("viewer: one row per finding, one card per category", v.rows === after.findings.length && v.cats === after.categories.length, short(v));
    check("viewer: performance card shows LCP", /LCP \d/.test(v.metrics), v.metrics);
    await viewer.close();
  } finally {
    rmSync(out, { recursive: true, force: true });
  }

  // ── 1.12.0: label in name, focus not obscured, content hidden until scrolled, score ──
  await tab.goto(`${ORIGIN}/reveal`, { waitUntil: "load" });
  await tab.waitForFunction(() => window.TraceBug && window.TraceBug.runAudit, null, { timeout: 15000 });
  await tab.waitForTimeout(400);
  const rv = await tab.evaluate(() => window.TraceBug.runAudit({ scan: "accessibility" }));
  const rvA = cat(rv, "accessibility");
  check("label in name (2.5.3): the demo link is flagged, with WCAG 2.5.3 and a fix quoting the visible text",
    has(rv, "label-content-name-mismatch", (f) => /demo/.test(f.selector || "") && (f.wcag || []).includes("2.5.3") && /Watch the demo/.test(f.fix || "")), short(rules(rv)));
  check("focus not obscured (2.4.11): the 64px fixed header is flagged with a scroll-padding fix",
    has(rv, "kbd/focus-obscured", (f) => (f.fix || "").includes("scroll-padding-top: 64px") && (f.wcag || []).includes("2.4.11")), short(rv.findings.filter((f) => f.ruleId.startsWith("kbd/"))));
  check("text hidden until scroll is not checked — and the run says so",
    !has(rv, "color-contrast") && (rvA?.metrics?.transparentText ?? 0) >= 1 && /invisible \(opacity 0\)/.test(rvA?.limitation || ""), short(rvA));
  check("score: accessibility = 100 × 0.88 (label) × 0.94 (header) = 82.7 → 83", rv.score?.categories?.accessibility === 83 && rv.score?.overall === 83, short(rv.score));
  const rvM = rvA?.metrics || {};
  check("coverage: rules checked/passed and failed WCAG criteria are counted",
    rvM.rulesChecked > 10 && rvM.rulesPassed === rvM.rulesChecked - 2 && rvM.wcagCriteriaFailed === 2, short(rvM));

  const seoRun = await tab.evaluate(() => window.TraceBug.runAudit({ scan: "performance-seo" }));
  check("seo: robots.txt blocking this page is critical; missing og:image and sitemap reported",
    has(seoRun, "seo/robots-blocked", (f) => f.severity === "critical" && f.description.includes("Disallow: /reveal")) && has(seoRun, "seo/og-image-missing") && has(seoRun, "seo/no-sitemap"),
    short(rules(seoRun)));
  check("seo: the limitation says robots.txt was read", (cat(seoRun, "seo")?.limitation || "").includes("robots.txt"));

  // The panel's "Scroll the page and re-run" reveals it; the contrast finding then appears with a passing colour.
  await tab.evaluate(() => window.TraceBug.showAuditPanel("accessibility"));
  await tab.waitForSelector('#tracebug-audit-panel [data-tb-au="reveal"]', { timeout: 15000 });
  const startY = await tab.evaluate(() => scrollY);
  await tab.click('#tracebug-audit-panel [data-tb-au="reveal"]');
  await tab.waitForFunction(() => (window.TraceBug.getLastAudit()?.findings || []).some((f) => f.ruleId === "color-contrast"), null, { timeout: 30000 });
  const rv2 = await tab.evaluate(() => window.TraceBug.getLastAudit());
  const cc = rv2.findings.find((f) => f.ruleId === "color-contrast");
  check("after the scroll pass: the hidden low-contrast text is checked, with suggested colour #ad5009",
    /hidden-low/.test(cc?.selector || "") && cc?.evidence?.metrics?.suggestedFgColor === "#ad5009" && (cc?.wcag || []).includes("1.4.3"), short(cc && { sel: cc.selector, m: cc.evidence?.metrics, wcag: cc.wcag }));
  check("after the scroll pass: nothing is reported as invisible, and the page is back where it was",
    !cat(rv2, "accessibility")?.metrics?.transparentText && (await tab.evaluate(() => scrollY)) === startY);
  await tab.waitForSelector("#tracebug-audit-panel .tb-au-score", { timeout: 15000 });
  const scoreTxt = await tab.locator("#tracebug-audit-panel .tb-au-score").innerText();
  check("the panel shows the score", /\b\d{1,3}\b[\s\S]*(Good|Needs work|Poor)/.test(scoreTxt), scoreTxt.slice(0, 120));

  // Drag the panel by its header: it floats where dropped (remembered), and snaps back to an edge.
  const head = await tab.locator("#tracebug-audit-panel .tb-au-title").boundingBox();
  await tab.mouse.move(head.x + 40, head.y + 8); await tab.mouse.down();
  await tab.mouse.move(head.x - 300, head.y + 120, { steps: 8 }); await tab.mouse.up();
  const free = await tab.evaluate(() => { const p = document.getElementById("tracebug-audit-panel"); const r = p.getBoundingClientRect(); return { dock: p.dataset.dock, left: Math.round(r.left), top: Math.round(r.top), saved: localStorage.getItem("tracebug_audit_dock") }; });
  check("drag: the panel floats where it was dropped and the spot is remembered", free.dock === "free" && free.top > 60 && /^free:[0-9]+,[0-9]+$/.test(free.saved || ""), JSON.stringify(free));
  const head2 = await tab.locator("#tracebug-audit-panel .tb-au-title").boundingBox();
  await tab.mouse.move(head2.x + 40, head2.y + 8); await tab.mouse.down();
  await tab.mouse.move(2, head2.y + 8, { steps: 8 }); await tab.mouse.up();
  const snapped = await tab.evaluate(() => ({ dock: document.getElementById("tracebug-audit-panel").dataset.dock, saved: localStorage.getItem("tracebug_audit_dock") }));
  check("drag: dropping at the left edge docks it to the left", snapped.dock === "left" && snapped.saved === "left", JSON.stringify(snapped));
  await tab.evaluate(() => localStorage.removeItem("tracebug_audit_dock"));
  const rvReview = await tab.evaluate(() => window.TraceBug.getLastAudit());
  const cc2 = (rvReview.review || []).find((r) => r.ruleId === "color-contrast");
  check("needs review: text over a gradient is listed for a person, not as a finding or in the score",
    !!cc2 && cc2.elements.some((e) => /over-gradient/.test(e.selector || "")) && !rvReview.findings.some((f) => /over-gradient/.test(f.selector || "")), JSON.stringify(rvReview.review)?.slice(0, 300));
  const reviewTxt = await tab.locator("#tracebug-audit-panel .tb-au-review").evaluate((el) => el.textContent || "");
  check("the panel shows the needs-review section, marked not scored", /Needs a person to check/.test(reviewTxt) && /not failures/.test(reviewTxt), reviewTxt.slice(0, 160));

  // ── Phone width: checked in a hidden 390px frame, only what the current width doesn't already show ──
  await tab.goto(`${ORIGIN}/phone`, { waitUntil: "load" });
  await tab.waitForFunction(() => window.TraceBug && window.TraceBug.runAudit, null, { timeout: 15000 });
  const ph = await tab.evaluate(() => window.TraceBug.runAudit({ scan: "auto-review" }));
  const phIds = rules(ph);
  check("phone width ran and stays out of the current-width layout results",
    cat(ph, "mobile")?.ran === true && !phIds.includes("ui/horizontal-overflow") && /390/.test(cat(ph, "mobile")?.limitation || ""), short(ph.categories));
  check("phone width: the banner that only overflows on phones is found, with WCAG 1.4.10",
    has(ph, "mobile/horizontal-overflow", (f) => (f.wcag || []).includes("1.4.10")) && has(ph, "mobile/off-screen", (f) => /promo/.test(f.selector || "")), short(phIds));
  check("phone width: the code block that only scrolls on phones is flagged as unreachable by keyboard",
    has(ph, "mobile/scroll-not-focusable", (f) => /code/.test(f.selector || "") && !!f.fix), short(phIds));
  check("phone width: the hidden frame is removed afterwards", (await tab.locator("#tracebug-phone-frame").count()) === 0);
} catch (err) {
  console.error(err);
  failures++;
} finally {
  await browser.close();
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
