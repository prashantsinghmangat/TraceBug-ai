// Run: node e2e/benchmark.mjs
// Measures REAL performance numbers for docs/performance.md — no aspirational
// figures. Serves website/public + a bare bench page (SDK loaded, no
// auto-init) and measures: bundle eval, init(), per-event capture overhead,
// report build, .html export build, export sizes, and JS heap delta.
// Prints a markdown table ready to paste. Re-run after big changes.
import { chromium } from "playwright";
import { readFileSync, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname } from "node:path";

const PUBLIC_DIR = "D:/Project/TraceBug-ai/website/public";
const BENCH_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>bench</title></head>
<body><main id="app">${'<section><h2>Card</h2><p>Row of content with <a href="#x">links</a> and <button class="b">Buttons</button></p><input name="field" /></section>'.repeat(40)}</main>
<script src="/tracebug-sdk.js"></script></body></html>`;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/bench.html") {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(BENCH_HTML);
    return;
  }
  const p = join(PUBLIC_DIR, path);
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4178, r));

const browser = await chromium.launch({
  headless: true,
  args: ["--enable-precise-memory-info"],
});
const results = {};
const runs = 5;

// ── 1. Bundle size (raw, on-disk IIFE the extension ships) ──────────────
results.bundleBytes = statSync(join(PUBLIC_DIR, "tracebug-sdk.js")).size;

// ── 2. Script eval + init(), median of N cold loads ──────────────────────
const evals = [], inits = [];
for (let i = 0; i < runs; i++) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:4178/bench.html", { waitUntil: "load" });
  const evalMs = await page.evaluate(() => {
    const e = performance.getEntriesByType("resource").find((r) => r.name.includes("tracebug-sdk.js"));
    return e ? e.duration : null;
  });
  const initMs = await page.evaluate(() => {
    const t0 = performance.now();
    window.TraceBug.init({ projectId: "bench", enabled: "all" });
    return performance.now() - t0;
  });
  evals.push(evalMs);
  inits.push(initMs);
  await page.close();
}
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
results.scriptLoadEvalMs = median(evals);
results.initMs = median(inits);

// ── 3. Session run: per-event overhead, heap, report build, exports ─────
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://localhost:4178/bench.html", { waitUntil: "load" });
await page.evaluate(() => window.TraceBug.init({ projectId: "bench", enabled: "all" }));
await page.waitForTimeout(300);

const session = await page.evaluate(async () => {
  const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
  window.TraceBug.startRecording();

  // 300 real interactions: clicks on varied buttons + console noise + fetches.
  const buttons = Array.from(document.querySelectorAll("button.b"));
  const t0 = performance.now();
  for (let i = 0; i < 300; i++) {
    buttons[i % buttons.length].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  const clickMs = performance.now() - t0;
  for (let i = 0; i < 30; i++) console.warn("bench state transition", i);
  for (let i = 0; i < 10; i++) { try { await fetch("/api/bench-miss-" + i).catch(() => {}); } catch {} }
  await new Promise((r) => setTimeout(r, 1200)); // let batched persistence flush

  // Baseline: identical click loop with recording paused.
  window.TraceBug.pauseRecording();
  const b0 = performance.now();
  for (let i = 0; i < 300; i++) {
    buttons[i % buttons.length].dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
  const baselineMs = performance.now() - b0;
  window.TraceBug.resumeRecording();

  const heap1 = performance.memory ? performance.memory.usedJSHeapSize : 0;

  // Report build + export build times and sizes.
  const sdk = window.TraceBugSDK;
  const sessions = sdk.getAllSessions ? sdk.getAllSessions() : [];
  const current = sessions[sessions.length - 1];
  const r0 = performance.now();
  const report = sdk.buildReport(current);
  const reportMs = performance.now() - r0;

  const e0 = performance.now();
  const blob = await sdk.buildReplayBlob(current, report);
  const exportMs = performance.now() - e0;

  const z0 = performance.now();
  const zip = await sdk.buildZipBlob([{ name: "r.html", data: new Uint8Array(await blob.arrayBuffer()) }]);
  const zipMs = performance.now() - z0;

  return {
    events: (current.events || []).length,
    clickMs, baselineMs,
    heapDeltaMB: heap0 && heap1 ? (heap1 - heap0) / 1048576 : null,
    reportMs, exportMs, exportBytes: blob.size, zipMs, zipBytes: zip.size,
  };
});
Object.assign(results, session);
await page.close();
await browser.close();
server.close();

// ── Output ────────────────────────────────────────────────────────────────
const perEventUs = ((results.clickMs - results.baselineMs) / 300) * 1000;
const fmt = (n, d = 0) => n.toFixed(d);
console.log(`\nEnvironment: headless Chromium (Playwright), ${process.platform}, Node ${process.version}`);
console.log(`Captured events in session: ${results.events}\n`);
console.log("| Metric | Measured |");
console.log("|---|---|");
console.log(`| SDK bundle (IIFE, on disk) | ${fmt(results.bundleBytes / 1048576, 2)} MB |`);
console.log(`| Script load + eval | ${fmt(results.scriptLoadEvalMs)} ms |`);
console.log(`| TraceBug.init() | ${fmt(results.initMs, 1)} ms |`);
console.log(`| Capture overhead per interaction | ~${fmt(Math.max(0, perEventUs))} µs |`);
console.log(`| 300 clicks with recording | ${fmt(results.clickMs)} ms (baseline ${fmt(results.baselineMs)} ms) |`);
console.log(`| JS heap delta after session | ${results.heapDeltaMB === null ? "n/a" : fmt(results.heapDeltaMB, 1) + " MB"} |`);
console.log(`| buildReport() | ${fmt(results.reportMs)} ms |`);
console.log(`| Export .html build | ${fmt(results.exportMs)} ms |`);
console.log(`| Export .html size | ${fmt(results.exportBytes / 1024)} KB |`);
console.log(`| .zip wrap | ${fmt(results.zipMs)} ms → ${fmt(results.zipBytes / 1024)} KB |`);
