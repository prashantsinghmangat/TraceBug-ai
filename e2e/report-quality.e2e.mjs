// Run: node e2e/report-quality.e2e.mjs   (--headful to watch, --verbose for every check)
//
// THE REPORT-QUALITY BENCHMARK — the 1.12 release gate (docs/launch/master-plan.md,
// "Acceptance gate"). Drives the real extension through five bug scenarios on a
// small local shop and checks each report against an answer key: does the report
// name the action that caused the bug, the real failure (and only real ones),
// in the right order, without inventing a cause when nothing failed, while
// leaking no cookie values, URL tokens or hidden-field values?
//
// Unit tests pin each rule on hand-built events. This is the end-to-end claim:
// the reports a user actually gets are accurate. A scenario per row of the
// answer key; every scenario also runs the shared checks (evidence block,
// privacy, prompt size, no noise failures).
//
// The shop is in-repo on purpose (deterministic, CI-able). Its bugs are written
// for this file; they are not the manual playground's bugs.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "report-quality");
const PORT = 4211;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const GLOB = `${ORIGIN}/*`;

// Values that must never appear anywhere in a report or its exported file.
const SECRETS = {
  urlToken: "SECRETQ1x9",       // landing URL ?access_token=
  cookie: "SECRETCOOKIE42",     // a third-party analytics cookie value
  csrf: "CSRFSECRET77",         // hidden form field value
};
const LANDING = `${ORIGIN}/?ref=mail&access_token=${SECRETS.urlToken}`;

/** AI prompt budget, in estimated tokens (chars / 4). The largest scenario is
 *  ~1.1k today; the budget leaves room to grow but catches a prompt that bloats. */
const PROMPT_TOKEN_BUDGET = 2500;

// ── The shop ────────────────────────────────────────────────────────────────
const SHOP = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bench Shop</title></head>
<body>
  <nav>
    <button id="nav-home" data-go="/">Home</button>
    <button id="nav-cart" data-go="/cart">Cart</button>
    <button id="nav-checkout" data-go="/checkout">Checkout</button>
    <button id="nav-track" data-go="/track">Track order</button>
  </nav>
  <main id="view"></main>
  <script>
    document.cookie = "_dd_s=${SECRETS.cookie}; path=/";
    document.cookie = "theme=dark; path=/";
    const CONFIG = { discounts: { SAVE10: { percent: 10 } } };
    const PRICE = 10;
    let items = 0;
    let searchCtl = null;

    const VIEWS = {
      "/": () => \`<h1>Shop</h1><button id="search">Search</button><div id="results"></div><div id="logo-slot"></div>\`,
      "/cart": () => \`<h1>Cart</h1>
        <button id="add">Add item</button> <span>Total: $<span id="total">0</span></span><br>
        <input id="coupon" name="coupon" placeholder="Coupon"> <button id="apply">Apply coupon</button>
        <div id="coupon-msg"></div>
        <button id="continue">Continue shopping</button>\`,
      "/checkout": () => \`<h1>Checkout</h1>
        <form id="order">
          <input type="hidden" name="csrf_token" value="${SECRETS.csrf}">
          <label>Quantity <select id="qty" name="quantity">\${[1,2,3,4,5,6,7,8,9].map(n => '<option>' + n + '</option>').join("")}</select></label>
          <button id="place" type="submit">Place order</button>
        </form><div id="order-msg"></div>\`,
      "/track": () => \`<h1>Track</h1>
        <input id="order-id" name="orderId" placeholder="Order number"> <button id="track">Track</button>
        <div id="track-status"></div>\`,
    };
    function render() { document.getElementById("view").innerHTML = (VIEWS[location.pathname] || VIEWS["/"])(); }
    function go(path) { history.pushState({}, "", path); render(); }

    // Bug A: a coupon the config doesn't know crashes (undefined.percent).
    function applyCoupon() {
      const code = document.getElementById("coupon").value.trim();
      const pct = CONFIG.discounts[code].percent;
      document.getElementById("coupon-msg").textContent = code + " applied: " + pct + "% off";
    }
    // Bug C: the total adds the price twice — wrong, but nothing throws.
    function addItem() { items++; document.getElementById("total").textContent = String(items * PRICE * 2); }
    // Bug B: the server rejects quantities over 5 with a 422 the UI just echoes.
    async function placeOrder(e) {
      e.preventDefault();
      const qty = Number(document.getElementById("qty").value);
      const res = await fetch("/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ qty }) });
      document.getElementById("order-msg").textContent = res.ok ? "Order placed" : "Could not place order";
    }
    // Bug D: an unknown order's 404 body has no .order -> unhandled rejection.
    function trackOrder() {
      const id = document.getElementById("order-id").value.trim();
      fetch("/api/orders/" + id).then((r) => r.json()).then((o) => {
        document.getElementById("track-status").textContent = o.order.status;
      });
    }
    // Clean path: a superseded (aborted) search, then the real one, then an image.
    function search() {
      if (searchCtl) searchCtl.abort();
      searchCtl = new AbortController();
      fetch("/api/search?q=first", { signal: searchCtl.signal }).catch(() => {});
      searchCtl.abort();
      searchCtl = new AbortController();
      fetch("/api/search?q=shoes", { signal: searchCtl.signal }).then((r) => r.json()).then((d) => {
        document.getElementById("results").textContent = d.results.join(", ");
        document.getElementById("logo-slot").innerHTML = '<img src="/img/logo.svg" alt="logo">';
      }).catch(() => {});
    }

    document.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      if (t.dataset.go) return go(t.dataset.go);
      if (t.id === "apply") applyCoupon();
      if (t.id === "add") addItem();
      if (t.id === "track") trackOrder();
      if (t.id === "search") search();
    });
    document.addEventListener("submit", (e) => { if (e.target.id === "order") placeOrder(e); });
    render();
  </script>
</body></html>`;

const server = createServer((req, res) => {
  const url = new URL(req.url, ORIGIN);
  const json = (status, body) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)); };
  if (url.pathname === "/favicon.ico") { res.writeHead(404); res.end(); return; }
  if (url.pathname === "/img/logo.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml" });
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
    return;
  }
  if (url.pathname === "/api/search") {
    setTimeout(() => json(200, { results: ["shoe A", "shoe B"] }), 30);
    return;
  }
  if (url.pathname === "/api/orders" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const qty = (() => { try { return JSON.parse(body).qty; } catch { return 0; } })();
      if (qty > 5) json(422, { error: "quantity exceeds stock", max: 5 });
      else json(201, { order: { id: 1001 } });
    });
    return;
  }
  const m = url.pathname.match(/^\/api\/orders\/(\d+)$/);
  if (m) {
    if (m[1] === "9999") json(404, { error: "order not found" });
    else json(200, { order: { id: Number(m[1]), status: "shipped" } });
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(SHOP);
});
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-report-quality-"));
const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
  `--disable-extensions-except=${EXT}`,
  `--load-extension=${EXT}`,
]));

// ── Output: quiet while passing (e2e/README.md conventions) ─────────────────
const VERBOSE = process.argv.includes("--verbose");
let failures = 0;
let passes = 0;
let _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra && (!ok || VERBOSE) ? " — " + extra : ""}`;
  if (ok) passes++;
  else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (v) => JSON.stringify(v)?.slice(0, 300);

let sw;

/** Fresh page on the landing URL, the extension injected the way the popup
 *  does, and an events-only capture started. */
async function startCapture() {
  const page = await ctx.newPage();
  await page.goto(LANDING, { waitUntil: "load" });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    const target = { tabId: tab.id };
    await chrome.scripting.executeScript({ target, files: ["content-script.js"] });
    await chrome.scripting.executeScript({ target, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(400);
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob, active: true });
    return chrome.tabs.sendMessage(tab.id, {
      type: "TB_START_RECORDING", video: false, withMic: false, blurFirst: false, delaySec: 0, surfaceMode: "desktop",
    });
  }, GLOB);
  await page.waitForSelector('[data-tb-hud="stop"]', { timeout: 10000 });
  await sleep(500);
  return page;
}

/** Stop from the HUD, then build what the ticket builds: the report, the AI
 *  prompt and the exported .html. */
async function stopAndCollect(page, reporterNotes) {
  await sleep(1200);
  await page.evaluate(() => {
    document.querySelector('[data-tb-hud="stop"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await sleep(1500);
  const out = await page.evaluate(async (notes) => {
    const SDK = window.__TraceBugExtensionSDK;
    const sessions = SDK.getAllSessions().sort((a, b) => a.createdAt - b.createdAt);
    const session = sessions[sessions.length - 1];
    if (!session) return null;
    const report = SDK.buildReport(session);
    const prompt = SDK.generateAIPrompt(report, notes ? { reporterNotes: notes } : {});
    const html = await (await SDK.buildReplayBlob(session, report)).text();
    return { report: JSON.parse(JSON.stringify(report)), prompt, html };
  }, reporterNotes || "");
  await page.close();
  if (!out) throw new Error("no session/report after stop");
  const m = out.html.match(/<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/);
  out.payload = m ? JSON.parse(m[1]) : null;
  out.replayText = "";
  if (out.payload?.rrwebEventsGz) {
    try { out.replayText = gunzipSync(Buffer.from(out.payload.rrwebEventsGz, "base64")).toString("utf8"); } catch {}
  } else if (out.payload?.rrwebEvents) {
    out.replayText = JSON.stringify(out.payload.rrwebEvents);
  }
  return out;
}

const tokens = (s) => Math.ceil((s || "").length / 4);
const promptSizes = [];

/** The checks every report must pass, whatever the bug. */
function sharedChecks(name, { report: r, prompt, html, payload, replayText }) {
  const ev = r.evidence;
  check(`${name}: evidence block present`, !!ev && ev.captured?.length > 0 && ev.notCaptured?.length > 0, short(ev));
  check(`${name}: capture reported complete`, ev?.complete === true, short(ev?.dropped));
  check(`${name}: AI prompt has Evidence coverage`, prompt.includes("## Evidence coverage"));
  check(`${name}: .html carries the evidence`, !!payload?.evidence && /Not captured/.test(html));
  promptSizes.push(`${name.split(" ")[0]} ${tokens(prompt)}`);
  check(`${name}: AI prompt ≤ ${PROMPT_TOKEN_BUDGET} tokens`, tokens(prompt) <= PROMPT_TOKEN_BUDGET, `~${tokens(prompt)}`);

  const everything = { report: JSON.stringify(r), prompt, html, replay: replayText };
  for (const [what, secret] of Object.entries(SECRETS)) {
    const leaks = Object.entries(everything).filter(([, text]) => text.includes(secret)).map(([k]) => k);
    check(`${name}: no ${what} leak`, leaks.length === 0, `found in ${leaks.join(", ")}`);
  }
  const cookies = r.storage?.cookies || [];
  check(`${name}: cookies captured by name`, cookies.some((c) => c.key === "_dd_s"), short(cookies));

  const errs = r.networkErrors || [];
  check(`${name}: favicon is not a failure`, !errs.some((e) => /favicon/.test(e.url)), short(errs));
  check(`${name}: no status-0 failures`, !errs.some((e) => e.status === 0), short(errs));
}

try {
  [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  await sleep(1200); // let onInstalled seed its defaults first

  // ── A: coupon crash, then an unrelated click ──────────────────────────────
  {
    const page = await startCapture();
    await page.click("#nav-cart");
    await page.type("#coupon", "SAVE20", { delay: 380 }); // pauses > 300 ms: one value per keystroke
    await page.click("#apply");
    await sleep(600);
    await page.click("#continue");
    const out = await stopAndCollect(page);
    const r = out.report;
    const name = "A coupon crash";
    check(`${name}: title names "Apply coupon"`, /Apply coupon/.test(r.title) && !/Continue shopping/.test(r.title), r.title);
    check(`${name}: summary names "Apply coupon"`, /Apply coupon/.test(r.summary || ""), r.summary);
    const first = (r.consoleErrors || [])[0];
    check(`${name}: the TypeError is captured`, /Cannot read properties of undefined/.test(first?.message || ""), short(r.consoleErrors));
    check(`${name}: its stack points at applyCoupon`, /applyCoupon/.test(first?.stack || ""), (first?.stack || "").slice(0, 200));
    const hint = r.rootCause?.hint || "";
    check(`${name}: hint says find the missing value, not "add ?."`, /missing|why/i.test(hint) && !/\?\./.test(hint), hint);
    const steps = String(r.steps || "");
    check(`${name}: typing collapsed to "SAVE20"`, steps.includes("SAVE20") && !/"SAVE2"|"SAV"|"SA"/.test(steps), steps);
    check(`${name}: report URL is the bug page`, new URL(r.environment.url).pathname === "/cart", r.environment.url);
    check(`${name}: start page kept, token masked`, (r.environment.startUrl || "").includes("access_token=[REDACTED]"), r.environment.startUrl);
    sharedChecks(name, out);
  }

  // ── B: order rejected (422) after raising the quantity ────────────────────
  {
    const page = await startCapture();
    await page.click("#nav-checkout");
    await page.selectOption("#qty", "9");
    await page.click("#place");
    const out = await stopAndCollect(page);
    const r = out.report;
    const name = "B order 422";
    const errs = r.networkErrors || [];
    check(`${name}: exactly one failure`, errs.length === 1, short(errs));
    check(`${name}: it is POST /api/orders 422`, errs[0]?.method === "POST" && /\/api\/orders$/.test(errs[0]?.url) && errs[0]?.status === 422, short(errs[0]));
    check(`${name}: with the response body`, /quantity exceeds stock/.test(errs[0]?.response || ""), errs[0]?.response);
    check(`${name}: title points at the order`, /Place order|422|orders/i.test(r.title), r.title);
    check(`${name}: the quantity change is a step`, /9/.test(String(r.steps || "")), String(r.steps));
    check(`${name}: hidden field counted, not captured`, !JSON.stringify(r.session?.events || []).includes("csrf_token\":\"C"));
    sharedChecks(name, out);
  }

  // ── C: wrong total, nothing throws ────────────────────────────────────────
  {
    const page = await startCapture();
    await page.click("#nav-cart");
    await page.click("#add");
    await sleep(300);
    await page.click("#add");
    const notes = "Two $10 items show a total of $40; expected $20.";
    const out = await stopAndCollect(page, notes);
    const r = out.report;
    const name = "C wrong total";
    check(`${name}: no errors, no failures`, (r.consoleErrors || []).length === 0 && (r.networkErrors || []).length === 0, short([r.consoleErrors, r.networkErrors]));
    check(`${name}: title says no errors captured`, /^No errors captured/.test(r.title), r.title);
    check(`${name}: prompt says nothing failed`, out.prompt.includes("## No errors captured"));
    check(`${name}: prompt invents no cause`, !out.prompt.includes("Auto-detected root cause hint"));
    check(`${name}: reporter's description in the prompt`, out.prompt.includes("Reporter's description") && out.prompt.includes(notes));
    sharedChecks(name, out);
  }

  // ── D: unknown order → 404 → unhandled rejection ─────────────────────────
  {
    const page = await startCapture();
    await page.click("#nav-track");
    await page.fill("#order-id", "9999");
    await page.click("#track");
    await sleep(800);
    const out = await stopAndCollect(page);
    const r = out.report;
    const name = "D track 404";
    const errs = r.networkErrors || [];
    check(`${name}: GET /api/orders/9999 404 is the failure`, errs.length === 1 && errs[0].status === 404 && /\/api\/orders\/9999$/.test(errs[0].url), short(errs));
    check(`${name}: the rejection is captured`, (r.consoleErrors || []).some((e) => /status/.test(e.message)), short(r.consoleErrors));
    const events = r.session?.events || [];
    const i404 = events.findIndex((e) => e.type === "api_request" && e.data?.request?.statusCode === 404);
    const iRej = events.findIndex((e) => e.type === "unhandled_rejection" || e.type === "error");
    check(`${name}: 404 comes before the rejection`, i404 >= 0 && iRej > i404, `404@${i404} rejection@${iRej}`);
    sharedChecks(name, out);
  }

  // ── E: a clean session ────────────────────────────────────────────────────
  {
    const page = await startCapture();
    await page.click("#search");
    await sleep(2000); // a pause after a working click is not a dead click
    await page.click("#nav-cart");
    await page.type("#coupon", "SAVE10", { delay: 380 });
    await page.click("#apply");
    const out = await stopAndCollect(page);
    const r = out.report;
    const name = "E clean session";
    check(`${name}: title says no errors captured`, /^No errors captured/.test(r.title), r.title);
    check(`${name}: no failures (the aborted search isn't one)`, (r.networkErrors || []).length === 0 && (r.consoleErrors || []).length === 0, short(r.networkErrors));
    const reqs = r.networkRequests || [];
    const shoes = reqs.filter((q) => /q=shoes/.test(q.url));
    check(`${name}: each request listed once`, shoes.length === 1, short(shoes));
    check(`${name}: aborted request labelled, not failed`, reqs.some((q) => /q=first/.test(q.url) && q.aborted === true), short(reqs.filter((q) => /q=first/.test(q.url))));
    check(`${name}: successful image load not listed`, !reqs.some((q) => /logo\.svg/.test(q.url)), short(reqs.map((q) => q.url)));
    const chips = out.payload?.actionChips || [];
    check(`${name}: no dead clicks`, !chips.some((c) => c.frustration === "dead"), short(chips.filter((c) => c.frustration)));
    check(`${name}: typing collapsed`, String(r.steps || "").includes("SAVE10") && !/"SAVE1"/.test(String(r.steps || "")), String(r.steps));
    sharedChecks(name, out);
  }
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

if (VERBOSE || failures) console.log(`\nAI prompt size (est. tokens): ${promptSizes.join(" · ")}`);
console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
