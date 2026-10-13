// Run: node e2e/ext-provider-confirm.e2e.mjs   (headful; needs `npx playwright install chromium`)
//
// Phase 2b in a real browser. The unit tests cover the decision layer
// (tests/provider-bridge.test.ts) and the HTTP layer (tests/provider-api.test.ts);
// what only a browser can show is the part that matters most:
//
//   * NOTHING reaches a provider before the user clicks Send
//   * Cancel, window-close and timeout all send nothing, and tell the page
//   * the confirmation window renders page-controlled text AS TEXT
//   * a page that forges the bridge event cannot pick its own destination
//   * an "approve" sent from a content script is refused
//
// A stub server stands in for GitHub/Linear/Slack/Ollama and counts every
// request it receives, so "nothing was sent" is an assertion, not a hope.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions } from "./paths.mjs";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
// Site access is OPTIONAL from 1.11, and this harness injects from the
// service worker rather than through a real toolbar click, so it cannot grant
// itself access. Load a copy that declares it — see e2e/ext-host-access.mjs
// for why, and for what this does NOT change.
const EXT = withGrantedHostAccess(join(REPO, "tracebug-extension"), "confirm");
const PUBLIC_DIR = join(REPO, "website", "public");

const PORT = 4178;
const SITE = `http://localhost:${PORT}/try.html`;
const GLOB = `http://localhost:${PORT}/*`;

const GH_TOKEN = "ghp_FAKE_CONFIRM";
const REPO_NAME = "acme/widgets";

// Every request the "providers" receive. Length 0 is the assertion that
// matters on the cancel / close / timeout paths.
const hits = [];

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  // ── Stub provider endpoints ───────────────────────────────────────────────
  if (url.pathname.startsWith("/api/")) {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      hits.push({ path: url.pathname, body, auth: req.headers.authorization || "" });
      res.writeHead(200, { "content-type": "application/json" });
      if (url.pathname === "/api/chat") {
        res.end(JSON.stringify({ message: { content: "## Root cause\nStub." }, model: "stub" }));
      } else {
        res.end(JSON.stringify({ html_url: "http://localhost/issues/1", number: 1 }));
      }
    });
    return;
  }

  const p = join(PUBLIC_DIR, decodeURIComponent(url.pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(PORT, r));

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

const userDir = mkdtempSync(join(tmpdir(), "tb-confirm-e2e-"));
const ctx = await chromium.launchPersistentContext(
  userDir,
  // Headless by default (new headless loads extensions; the old one does not),
  // `--headful` or TB_E2E_HEADFUL=1 to watch it. See e2e/paths.mjs.
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

/** Wait for the confirmation window's page object to appear. */
async function waitForConfirmWindow(timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const hit = ctx.pages().find((pg) => pg.url().includes("confirm-send.html"));
    if (hit) { await hit.waitForLoadState("domcontentloaded").catch(() => {}); return hit; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  // ── Configure GitHub the way the options page does ────────────────────────
  // Note what the page never learns: this token and this repo live only here.
  await sw.evaluate(({ token, repo }) => chrome.storage.local.set({
    tb_integrations_v1: { github: { token, repo } },
  }), { token: GH_TOKEN, repo: REPO_NAME });

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(400);
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await sleep(600);

  /**
   * Fire one bridge request from PAGE script — exactly what a hostile page can
   * do — and collect whatever the bridge answers.
   */
  await page.evaluate(() => {
    window.__tb = { acks: [], results: [] };
    window.addEventListener("tracebug-provider-ack", (e) => window.__tb.acks.push(e.detail));
    window.addEventListener("tracebug-provider-result", (e) => window.__tb.results.push(e.detail));
    window.__tbSend = (detail) => {
      const id = "e2e_" + Math.random().toString(36).slice(2);
      window.dispatchEvent(new CustomEvent("tracebug-provider-request", { detail: { id, ...detail } }));
      return id;
    };
  });

  const outcome = (id) => page.evaluate((wanted) => {
    const r = window.__tb.results.find((x) => x.id === wanted);
    const a = window.__tb.acks.find((x) => x.id === wanted);
    return { result: r || null, ack: a || null };
  }, id);

  // ══ 1. Nothing is sent before the user clicks Send ════════════════════════
  const id1 = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Login fails", body: "Steps: click login" } },
  }));

  const win = await waitForConfirmWindow();
  check("a confirmation window opens for a tracker send", !!win);
  check("NOTHING reached the provider while the window is open", hits.length === 0,
    JSON.stringify(hits));

  if (win) {
    const text = await win.evaluate(() => document.body.innerText);
    check("the window names the destination from EXTENSION storage", text.includes(REPO_NAME),
      text.slice(0, 120).replace(/\s+/g, " "));
    check("the window names the requesting origin", text.includes(`localhost:${PORT}`));
    check("the window shows the title", text.includes("Login fails"));
    check("the window never shows the token", !(await win.content()).includes(GH_TOKEN));

    const armed = await sw.evaluate(() => chrome.alarms.getAll().then((a) => a.map((x) => ({ name: x.name, inMs: x.scheduledTime - Date.now() }))));
    const confirmAlarm = armed.find((a) => a.name.startsWith("tb:confirm:expire:"));
    // The timeout must be on chrome.alarms, not setTimeout: a terminated
    // worker takes its timers with it.
    check("the timeout is armed as a chrome.alarms alarm", !!confirmAlarm, JSON.stringify(armed));
    check("the timeout is ~2 minutes out", !!confirmAlarm && confirmAlarm.inMs > 100000 && confirmAlarm.inMs <= 121000,
      confirmAlarm ? Math.round(confirmAlarm.inMs / 1000) + "s" : "none");
  }

  // ── a second send from the same tab is refused while one is pending ───────
  const idDup = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Second", body: "x" } },
  }));
  await sleep(700);
  const dup = await outcome(idDup);
  check("a second send from the same tab is refused", !!dup.ack && /already waiting/i.test(dup.ack.error || ""),
    JSON.stringify(dup.ack));

  // ══ 2. Cancel sends nothing and tells the page ════════════════════════════
  if (win) await win.click("#cancel");
  await sleep(900);
  const r1 = await outcome(id1);
  check("cancel sends nothing", hits.length === 0, JSON.stringify(hits));
  check("cancel reports cancelled (not failed) to the page",
    !!r1.result && r1.result.cancelled === true, JSON.stringify(r1.result));
  check("cancel closes the window",
    !ctx.pages().some((pg) => pg.url().includes("confirm-send.html")));

  // ══ 3. Send actually sends, with the stored destination ═══════════════════
  // Point GitHub at the stub by making the stub answer api.github.com. We
  // cannot re-route api.github.com, so this leg uses the Ollama/LLM path for a
  // real end-to-end call and asserts the GitHub leg up to the request itself.
  const id2 = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Real send", body: "body text" } },
  }));
  const win2 = await waitForConfirmWindow();
  check("a second confirmation window opens after the first resolved", !!win2);
  if (win2) await win2.click("#send");
  await sleep(2500);
  const r2 = await outcome(id2);
  // api.github.com is unreachable from this test, so the call fails at the
  // network — which still proves the send was ATTEMPTED only after Send, and
  // that the failure is reported as a plain sentence.
  check("Send proceeds to a real call and reports a plain error, not a stack",
    !!r2.result && !r2.result.cancelled && /could not reach|github/i.test(r2.result.error || ""),
    JSON.stringify(r2.result));

  // ══ 4. HTML in the body renders as TEXT ═══════════════════════════════════
  const EVIL = '<img src="https://evil.example/pixel.png" onerror="window.__pwned=1">'
    + '<a href="https://evil.example">click</a> cc @channel';
  const id3 = await page.evaluate((evil) => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "<b>bold title</b>", body: evil } },
  }), EVIL);
  const win3 = await waitForConfirmWindow();
  check("window opens for the markup payload", !!win3);
  if (win3) {
    const bodyText = await win3.evaluate(() => document.getElementById("body").textContent);
    const titleText = await win3.evaluate(() => document.getElementById("title").textContent);
    check("the body is rendered as source text", bodyText.includes("<img src=\"https://evil.example"), bodyText.slice(0, 60));
    check("the title is rendered as source text", titleText === "<b>bold title</b>", titleText);
    const injected = await win3.evaluate(() => ({
      imgs: document.querySelectorAll("#body img, #title img").length,
      anchors: document.querySelectorAll("#body a, #title a").length,
      bolds: document.querySelectorAll("#title b").length,
      pwned: !!window.__pwned,
    }));
    check("no element was created from the payload",
      injected.imgs === 0 && injected.anchors === 0 && injected.bolds === 0,
      JSON.stringify(injected));
    check("nothing executed", injected.pwned === false);

    // The remote-image warning should be showing for this payload.
    const warn = await win3.evaluate(() => {
      const box = document.getElementById("warnBox");
      return { shown: box.style.display !== "none", text: document.getElementById("warnList").textContent };
    });
    check("a remote image is flagged before the user approves", warn.shown && /remote image/i.test(warn.text),
      JSON.stringify(warn));
    check("an @mention is flagged too", /@mention/i.test(warn.text) && warn.text.includes("@channel"),
      warn.text);

    // Closing the window with no decision is a cancel.
    const before = hits.length;
    await win3.close();
    await sleep(900);
    const r3 = await outcome(id3);
    check("closing the window cancels and sends nothing", hits.length === before, String(hits.length));
    check("closing the window tells the page it was cancelled",
      !!r3.result && r3.result.cancelled === true, JSON.stringify(r3.result));
  }

  // ══ 4b. An over-long body is cut BEFORE the user approves ════════════════
  // GitHub refuses a body over 65,536 characters with a 422, which loses the
  // whole send. The worker caps it first, so what the user approves in this
  // window is exactly what will be posted — and the window has to say that it
  // was shortened, or the approval is of something the user cannot see the end
  // of.
  const LONG_LINE = "step: the user clicked submit and the spinner never stopped\n";
  const id3b = await page.evaluate((line) => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Huge report", body: line.repeat(4000) } },
  }), LONG_LINE);
  const win3b = await waitForConfirmWindow();
  check("window opens for the over-long payload", !!win3b);
  if (win3b) {
    const view = await win3b.evaluate(() => ({
      body: document.getElementById("body").textContent,
      label: document.getElementById("bodyLabel").textContent,
      warn: document.getElementById("warnList").textContent,
      warnShown: document.getElementById("warnBox").style.display !== "none",
    }));
    check("the body shown is within GitHub's 65,536-character limit",
      view.body.length <= 65536, String(view.body.length));
    check("the body shown is still most of the report, not a stub",
      view.body.length > 60000, String(view.body.length));
    check("the cut is marked at the end of the body",
      /Cut off here by TraceBug/.test(view.body) && /export the \.html/i.test(view.body),
      view.body.slice(-160));
    check("the cut fell on a line boundary",
      view.body.slice(0, view.body.indexOf("\n\n---")).endsWith(LONG_LINE.trim()),
      JSON.stringify(view.body.slice(0, view.body.indexOf("\n\n---")).slice(-70)));
    check("the shortening is warned about before the user approves",
      view.warnShown && /Shortened to fit GitHub/.test(view.warn), JSON.stringify(view.warn).slice(0, 200));
    check("the warning names both sizes",
      /Shortened to fit GitHub: [\d,]+ characters became [\d,]+/.test(view.warn), view.warn.slice(0, 200));
    check("the body label says it was shortened", /shortened to fit/i.test(view.label), view.label);

    // Cancel: this case is about what the window shows, not about delivery.
    const beforeCap = hits.length;
    await win3b.close();
    await sleep(900);
    await outcome(id3b);
    check("nothing was sent for the cancelled over-long report", hits.length === beforeCap);
  }

  // ══ 5. A forged request cannot pick its own destination ═══════════════════
  const id4 = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: {
      provider: "github",
      // Everything a hostile page would try to smuggle in:
      repo: "attacker/evil",
      token: "ghp_attacker",
      payload: { title: "Hi", body: "x", repo: "attacker/evil" },
    },
  }));
  await sleep(900);
  const r4 = await outcome(id4);
  check("a page-supplied repo is rejected, not ignored",
    !!r4.ack && /repo/i.test(r4.ack.error || ""), JSON.stringify(r4.ack));
  check("no window opened for the forged request",
    !ctx.pages().some((pg) => pg.url().includes("confirm-send.html")));
  // Nothing has reached the STUB at all yet: the GitHub legs above went to the
  // real api.github.com (and were refused there). Baseline it rather than
  // assuming a number.
  const stubBaseline = hits.length;
  check("the forged request sent nothing", stubBaseline === 0, String(stubBaseline));

  // An extra field in the ENVELOPE is refused the same way, so a page cannot
  // smuggle a destination one level up either.
  const idEnv = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "T", body: "B" }, baseUrl: "https://evil.example" },
  }));
  await sleep(700);
  const rEnv = await outcome(idEnv);
  check("an extra envelope field is rejected",
    !!rEnv.ack && /baseUrl/.test(rEnv.ack.error || ""), JSON.stringify(rEnv.ack));

  // ══ 6. Verbs off the allowlist ════════════════════════════════════════════
  for (const verb of ["CAPTURE_SCREENSHOT", "tb:rec:start", "tb:confirm:decide"]) {
    const id = await page.evaluate((t) => window.__tbSend({ type: t, data: {} }), verb);
    await sleep(350);
    const r = await outcome(id);
    check(`verb ${verb} is rejected by the relay`,
      !!r.ack && /unsupported/i.test(r.ack.error || ""), JSON.stringify(r.ack));
  }

  // ══ 7. An approve sent from a content script is refused ═══════════════════
  // The page cannot even relay tb:confirm:decide (verb 6 above), so this runs
  // the message from the content script's own isolated world — a sender with a
  // real tab and a page URL. Only confirm-send.html may decide.
  const id5 = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Approve me", body: "x" } },
  }));
  const win5 = await waitForConfirmWindow();
  check("window opened for the approve-spoof test", !!win5);

  const spoof = await sw.evaluate(async ({ glob, id }) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    // Find the real pending id the worker assigned — the page's id IS the id,
    // so a hostile page knows it.
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "ISOLATED",
      func: (pendingId) => new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "tb:confirm:decide", id: pendingId, approved: true }, (r) => {
          void chrome.runtime.lastError;
          resolve(r || null);
        });
      }),
      args: [id],
    });
    return res && res.result;
  }, { glob: GLOB, id: id5 });

  check("the worker refuses an approve from a content script",
    !!spoof && spoof.ok === false, JSON.stringify(spoof));
  await sleep(1200);
  check("the spoofed approve sent nothing", hits.length === stubBaseline, String(hits.length));
  check("the confirmation window is still waiting after the spoof",
    ctx.pages().some((pg) => pg.url().includes("confirm-send.html")));
  const r5 = await outcome(id5);
  check("the page was not told the spoofed send succeeded", !r5.result || r5.result.ok !== true,
    JSON.stringify(r5.result));
  if (win5) { await win5.click("#cancel"); await sleep(700); }

  // ══ 8. A stale pending request is reaped and reported ═════════════════════
  // The real timeout is two minutes on chrome.alarms, which is covered by the
  // alarm assertions above. This exercises the same cancel path through the
  // reaper, which is what runs when the worker was asleep at the deadline.
  const id6 = await page.evaluate(() => window.__tbSend({
    type: "tb:provider:send",
    data: { provider: "github", payload: { title: "Stale", body: "x" } },
  }));
  const win6 = await waitForConfirmWindow();
  check("window opened for the stale-reap test", !!win6);
  await sw.evaluate(async () => {
    const got = await chrome.storage.session.get(["tb_pending_sends_v1"]);
    const all = got.tb_pending_sends_v1 || {};
    Object.keys(all).forEach((k) => { all[k].expiresAt = Date.now() - 1000; });
    await chrome.storage.session.set({ tb_pending_sends_v1: all });
  });
  // A send from another tab triggers the reap.
  const page2 = await ctx.newPage();
  await page2.goto(SITE, { waitUntil: "load" });
  await sleep(400);
  await sw.evaluate(async (glob) => {
    const tabs = await chrome.tabs.query({ url: glob });
    const tab = tabs[tabs.length - 1];
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page2.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await page2.evaluate(() => {
    const id = "e2e_reaper";
    window.dispatchEvent(new CustomEvent("tracebug-provider-request", {
      detail: { id, type: "tb:provider:send", data: { provider: "github", payload: { title: "Fresh", body: "y" } } },
    }));
  });
  await sleep(1200);
  const r6 = await outcome(id6);
  check("the stale request was cancelled and the original tab told",
    !!r6.result && r6.result.cancelled === true, JSON.stringify(r6.result));
  check("the stale reap sent nothing", hits.length === stubBaseline, String(hits.length));

  // ══ 9. The LLM path: approval, then a real call, then the rate limit ══════
  // Ollama pointed at the stub server, which is a legitimate 127.0.0.1 host.
  await sw.evaluate((port) => chrome.storage.local.set({
    tb_ai_config_v1: { provider: "ollama", apiKey: "", model: "stub", baseUrl: `http://127.0.0.1:${port}` },
    tb_llm_sites_v1: {},
  }), PORT);

  // Clear any leftover confirmation windows first.
  for (const pg of ctx.pages()) {
    if (pg.url().includes("confirm-send.html")) { try { await pg.close(); } catch {} }
  }
  await sleep(600);

  const hitsBeforeLlm = hits.length;
  const idA = await page.evaluate(() => window.__tbSend({
    type: "tb:llm:analyze", data: { payload: { prompt: "why did login fail" } },
  }));
  const winA = await waitForConfirmWindow();
  check("the FIRST analysis on a site asks for approval", !!winA);
  check("no analysis was sent before approval", hits.length === hitsBeforeLlm, String(hits.length));
  if (winA) {
    const t = await winA.evaluate(() => document.body.innerText);
    check("the approval window asks about the SITE, not the report", /allow .*analysis/i.test(t),
      t.slice(0, 100).replace(/\s+/g, " "));
    await winA.click("#send");
  }
  await sleep(2500);
  const rA = await outcome(idA);
  check("an approved analysis runs and returns text",
    !!rA.result && rA.result.ok === true && /Stub/.test((rA.result.result || {}).text || ""),
    JSON.stringify(rA.result).slice(0, 160));
  check("the stub LLM was called exactly once", hits.filter((h) => h.path === "/api/chat").length === 1);

  // A second analysis on the same site must NOT ask again.
  const idB = await page.evaluate(() => window.__tbSend({
    type: "tb:llm:analyze", data: { payload: { prompt: "second question" } },
  }));
  await sleep(2000);
  const rB = await outcome(idB);
  check("a second analysis on an approved site does not ask again",
    !!rB.result && rB.result.ok === true, JSON.stringify(rB.result).slice(0, 120));
  check("no window opened for the second analysis",
    !ctx.pages().some((pg) => pg.url().includes("confirm-send.html")));

  // Rate limit: 10 per minute per origin. Two are already spent.
  let limited = null;
  for (let i = 0; i < 12 && !limited; i++) {
    const id = await page.evaluate((n) => window.__tbSend({
      type: "tb:llm:analyze", data: { payload: { prompt: "flood " + n } },
    }), i);
    await sleep(350);
    const r = await outcome(id);
    if (r.ack && /too many/i.test(r.ack.error || "")) limited = r.ack.error;
  }
  check("the site is rate limited after 10 analyses in a minute", !!limited, String(limited));
  check("the limit message says how long to wait", !!limited && /\d+s/.test(limited), String(limited));
  const chatHits = hits.filter((h) => h.path === "/api/chat").length;
  check("no more than 10 analyses reached the provider", chatHits <= 10, String(chatHits));

  // ══ 9b. The keyboard command really bound ═════════════════════════════════
  // `suggested_key` is a request, not a guarantee: Chrome leaves a colliding
  // suggestion UNBOUND and reports an empty string. Measured here, not
  // assumed — Ctrl+Shift+B (bookmarks bar) and Alt+Shift+B (focus bookmarks
  // bar) BOTH come back empty, while Ctrl+Shift+Y binds, which is how we know
  // it is a real collision and not an artifact of this environment. Hence the
  // shipped default Alt+B. If this check ever fails, the shortcut the docs
  // name does nothing on a fresh install — the whole bug Phase 3 set out to
  // fix — so pick another key rather than relaxing the assertion. Chromium is
  // a strong signal, not proof for branded Chrome or Firefox; those are manual
  // rows in docs/testing/restricted-pages.md.
  const cmd = await sw.evaluate(async () => {
    const all = await new Promise((r) => chrome.commands.getAll((l) => r(l || [])));
    return (all.find((c) => c.name === "tb-quick-capture") || null);
  });
  check("the capture command is registered", !!cmd, JSON.stringify(cmd));
  check(
    "Chrome actually BOUND a key to it (empty = collided with a browser shortcut)",
    !!(cmd && cmd.shortcut),
    cmd ? `shortcut="${cmd.shortcut}"` : "no command",
  );

  // The worker hands that same value to the page over data-tb-caps, which is
  // where the SDK reads it — that is the hop that lets the in-page tip show
  // the real key and lets the page handler stand down when the browser owns it.
  const capsShortcut = await page.evaluate(() => {
    try {
      return JSON.parse(document.documentElement.getAttribute("data-tb-caps") || "{}").shortcut;
    } catch { return undefined; }
  });
  check(
    "the bound shortcut reaches the page on data-tb-caps",
    cmd ? capsShortcut === cmd.shortcut : false,
    `caps="${capsShortcut}" command="${cmd && cmd.shortcut}"`,
  );

  // ══ 10. Nothing leaked into the page ══════════════════════════════════════
  const leak = await page.evaluate((secrets) => {
    const hay = [document.documentElement.outerHTML, JSON.stringify(window.__tb || {})];
    for (let i = 0; i < localStorage.length; i++) hay.push(String(localStorage.getItem(localStorage.key(i))));
    const all = hay.join("\n");
    return secrets.filter((s) => all.includes(s));
  }, [GH_TOKEN, REPO_NAME]);
  check("neither the token nor the repo ever reached the page", leak.length === 0, leak.join(", "));
} catch (err) {
  console.error("FAIL  threw:", err);
  failures++;
} finally {
  try { await ctx.close(); } catch {}
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
