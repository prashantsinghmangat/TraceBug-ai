// Run: node e2e/ext-redaction.e2e.mjs   (headful; needs `npx playwright install chromium`)
//
// End-to-end check of the extension redaction-rules chain:
//   popup storage (chrome.storage.sync) → content-script publishes
//   <html data-tb-redact> → tracebug-init passes redact into TraceBug.init
//   → typing into a matching field is captured as [REDACTED].
// Also verifies live updates: clearing the rules removes the attribute.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { PUBLIC_DIR as PATHS_PUBLIC_DIR, EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

// Site access is OPTIONAL from 1.11, and this harness injects from the
// service worker rather than through a real toolbar click, so it cannot grant
// itself access. Load a copy that declares it — see e2e/ext-host-access.mjs
// for why, and for what this does NOT change.
const EXT = withGrantedHostAccess(EXT_SRC_DIR, "redaction");
const PUBLIC_DIR = PATHS_PUBLIC_DIR;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4174, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-redact-e2e-"));
const ctx = await chromium.launchPersistentContext(
  userDir,
  // Headless by default (new headless loads extensions; the old one does not),
  // `--headful` or TB_E2E_HEADFUL=1 to watch it. See e2e/paths.mjs.
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

let failures = 0;
// Output only: counts every check, but stays quiet while they all pass. The
// moment one fails it flushes the run so far and streams the rest — a failing
// check is only legible next to the ones that got that far. `--verbose` prints
// everything from the start. Assertions, timeouts and order are untouched.
const VERBOSE = process.argv.includes("--verbose");
let passes = 0;
let _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++;
  else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });

  // 1. Save rules the way the popup does.
  await sw.evaluate(() =>
    chrome.storage.sync.set({ tracebug_redact: { fields: ["coupon"], patterns: [] } })
  );

  const page = await ctx.newPage();
  await page.goto("http://localhost:4174/try.html", { waitUntil: "load" });
  await page.waitForTimeout(500);

  // 2. Inject exactly like background.js's pipeline.
  await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "http://localhost:4174/*" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  });
  await page.waitForTimeout(1500);

  // 3. The bridge attribute must be published.
  const attr = await page.evaluate(() => document.documentElement.getAttribute("data-tb-redact"));
  check("content script publishes data-tb-redact", !!attr && attr.includes("coupon"), attr ?? "missing");

  // 4. Record + type into the matching field.
  await page.evaluate(() => window.TraceBug.startRecording());
  await page.waitForTimeout(400);
  await page.fill("#coupon", "SAVE20");
  await page.waitForTimeout(2000); // input capture debounce

  const session = await page.evaluate(() => JSON.parse(window.TraceBug.exportSessionJSON()));
  const inputEv = (session.events || []).find(
    (e) => e.type === "input" && (e.data?.element?.name === "coupon")
  );
  check("input event captured", !!inputEv);
  check(
    "matching field value is [REDACTED]",
    inputEv?.data?.element?.value === "[REDACTED]",
    `value=${JSON.stringify(inputEv?.data?.element?.value)}`
  );

  // 5. Live update: clearing rules removes the attribute.
  await sw.evaluate(() => chrome.storage.sync.set({ tracebug_redact: { fields: [], patterns: [] } }));
  await page.waitForTimeout(800);
  const attrAfter = await page.evaluate(() => document.documentElement.getAttribute("data-tb-redact"));
  check("clearing rules removes the attribute (live)", attrAfter === null, String(attrAfter));
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
