// Manual, not a gate: loads public sites. Usage: node e2e/audit-noise.mjs <outdir> [url,url,...]
// Runs the full Site Audit (page SDK, after a scroll pass) on real pages and prints findings per rule,
// so a detector change can be judged on real-world noise before it ships. Writes <outdir>/noise.json.
// Build first: npm run build (uses website/public/tracebug-sdk.js).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire("D:/Project/TraceBug-ai/package.json");
const { chromium } = require("playwright");
const SDK = "D:/Project/TraceBug-ai/website/public/tracebug-sdk.js";
const OUT = process.argv[2];
const SITES = (process.argv[3] || [
  "https://tracebug.dev/",
  "https://github.com/",
  "https://stripe.com/",
  "https://en.wikipedia.org/wiki/Web_accessibility",
  "https://www.bbc.com/",
  "https://vercel.com/",
  "https://developer.mozilla.org/en-US/",
  "https://news.ycombinator.com/",
  "https://www.gov.uk/",
  "https://www.shopify.com/",
].join(",")).split(",");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true });
const results = [];
for (const url of SITES) {
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 45000 });
    // Past the 5 s after load that blocking time (TBT) covers, so the scroll pass below isn't charged to the load.
    await page.waitForTimeout(5500);
    // Scroll through so scroll-revealed content appears, then back to top. Real wheel input,
    // as a person would: a programmatic scrollTo() is not input, so the browser kept
    // reporting LCP candidates far down the page (BBC read 5.9 s against Lighthouse's 1.7 s).
    await page.mouse.move(720, 450);
    const h = await page.evaluate(() => Math.min(document.documentElement.scrollHeight, 30000));
    for (let y = 0; y < h; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(800);
    await page.addScriptTag({ path: SDK });
    await page.evaluate(() => window.TraceBug.init({ projectId: "noise", enabled: "all" }));
    await page.waitForTimeout(600);
    const run = await page.evaluate(() => window.TraceBug.runAudit({ scan: "full" }));
    results.push({ url, score: run.score, categories: run.categories.map((c) => ({ n: c.name, ran: c.ran, count: c.count, m: c.metrics })),
      findings: run.findings.map((f) => ({ r: f.ruleId, s: f.severity, t: f.title, sel: f.selector, txt: f.evidence?.text, m: f.evidence?.metrics, occ: f.occurrences, url: f.url })) });
    console.log(`${url}  score ${run.score?.overall}  findings ${run.findings.length + run.truncated}`);
  } catch (e) {
    console.log(`${url}  ERROR ${String(e.message).slice(0, 120)}`);
    results.push({ url, error: String(e.message).slice(0, 300) });
  } finally { await page.close(); }
}
await browser.close();
writeFileSync(`${OUT}/noise.json`, JSON.stringify(results, null, 1));
// Summary: count of findings per rule across sites.
const per = {};
for (const r of results) for (const f of r.findings || []) { per[f.r] ??= { n: 0, sites: new Set() }; per[f.r].n++; per[f.r].sites.add(new URL(r.url).host); }
console.log("\nrule                                   findings  sites");
for (const [k, v] of Object.entries(per).sort((a, b) => b[1].n - a[1].n)) console.log(k.padEnd(40), String(v.n).padStart(6), " ", v.sites.size);
