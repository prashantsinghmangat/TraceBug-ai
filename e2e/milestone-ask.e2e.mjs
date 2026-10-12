// Run: node e2e/milestone-ask.e2e.mjs
// Verifies the one-time milestone email ask: appears after the 5th saved
// ticket, submits to /api/notify-me (intercepted here), shows the success
// state, and never blocks anything. Guards the "ask, never a wall" rules.
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
// Run artefacts, not fixtures. These used to overwrite two PNGs committed next
// to the script, so every run dirtied the working tree and the "diff" was a
// re-encoded screenshot. e2e/output/ is gitignored.
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "output");
mkdirSync(OUT_DIR, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4179, r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

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

// Intercept the signup POST — asserts the payload without touching prod.
let capturedBody = null;
await page.route("**/api/notify-me", (route) => {
  capturedBody = route.request().postDataJSON();
  route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
});

try {
  await page.goto("http://localhost:4179/try.html", { waitUntil: "load" });
  await page.waitForTimeout(1500);

  // Seed: 5 already-saved tickets, ask not yet shown.
  await page.evaluate(() => {
    localStorage.removeItem("tracebug_milestone_ask_done");
    const K = "tracebug_sessions";
    const arr = JSON.parse(localStorage.getItem(K) || "[]");
    for (let i = 0; i < 5; i++) arr.push({
      sessionId: "seed_" + i, projectId: "t", createdAt: Date.now(), updatedAt: Date.now(),
      errorMessage: null, errorStack: null, reproSteps: null, errorSummary: null,
      events: [], annotations: [], environment: null, saved: true,
    });
    localStorage.setItem(K, JSON.stringify(arr));
  });

  // Real user path: arm tracking, interact, stop -> ticket modal -> Save Ticket.
  await page.click("#tracebug-toolbar-track-btn");
  await page.waitForTimeout(600);
  await page.click("#orderBtn");
  await page.waitForTimeout(1200);
  await page.click("#tracebug-toolbar-track-btn");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await page.waitForTimeout(800);
  await page.click('#tracebug-quick-bug-modal [data-action="save-ticket"]');

  // Card appears ~1.6s after the save toast.
  const card = await page.waitForSelector("#tracebug-milestone-ask", { timeout: 5000 }).catch(() => null);
  check("milestone card appears after 5th-ticket save", !!card);

  // Once-ever flag set at SHOW time (ignoring counts as answered).
  const flag = await page.evaluate(() => localStorage.getItem("tracebug_milestone_ask_done"));
  check("once-ever flag set at show time", flag === "1");

  if (card) {
    await page.screenshot({ path: join(OUT_DIR, "milestone-ask-card.png") });
    await page.fill('#tracebug-milestone-ask [data-act="email"]', "test@example.com");
    await page.click('#tracebug-milestone-ask [data-act="submit"]');
    await page.waitForTimeout(600);
    check("POST sent with email + milestone-5 source",
      capturedBody?.email === "test@example.com" && capturedBody?.source === "milestone-5",
      JSON.stringify(capturedBody));
    const success = await page.textContent("#tracebug-milestone-ask").catch(() => "");
    check("success state shown", /on the list/i.test(success || ""), success?.trim());
    await page.screenshot({ path: join(OUT_DIR, "milestone-ask-success.png") });
  }

  // The wall test: saving ANOTHER ticket must work and must NOT re-show the card.
  await page.waitForTimeout(3000); // let the card auto-close
  const cardGone = await page.$("#tracebug-milestone-ask");
  check("card auto-closed", !cardGone);
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} CHECK(S) FAILED — ${total()}` : `\nALL CHECKS PASSED — ${total()}`);
process.exit(failures ? 1 : 0);
