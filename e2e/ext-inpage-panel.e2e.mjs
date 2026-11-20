// Run: node e2e/ext-inpage-panel.e2e.mjs   (needs `npm run build:ext` first)
//
// Phase 13 Step 3: the Create panel as an extension frame INSIDE the ticket.
// GitHub (token path) is stubbed with context.route, which reaches the
// worker's fetches. Covers: the frame loads (cross-origin, dynamic URL) and
// the page can't read it; Create arms only after ~500 ms fully visible and
// only on a trusted click; forged messages and a page-made copy of the frame
// are refused; Create → "Created #N" in place, ticket kept; a repeat bug is
// one click; keyboard only; dark/light; a 360 px viewport; navigating away
// cleans up; a frame the page breaks falls back to the window; a strict-CSP
// site.
import { chromium } from "playwright";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { extensionLaunchOptions, EXT_DIST_DIR, PUBLIC_DIR, requireBuilt } from "./paths.mjs";

const EXT_SRC = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const EXT = withGrantedHostAccess(EXT_SRC, "inpage-panel");

const PORT = 4933;
const SITE = `http://localhost:${PORT}/try.html`;
const STRICT = `http://localhost:${PORT}/strict.html`;
const GLOB = `http://localhost:${PORT}/*`;
const TOKEN = "ghp_FAKE_E2E_INPAGE_PANEL";
const REPO = "acme/api";
// A strict page: no inline script, no frames at all.
const STRICT_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; frame-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'";
const STRICT_HTML = "<!doctype html><title>Strict</title><h1>Strict CSP</h1><input id=\"q\"><button id=\"b\">Go</button>";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/strict.html") {
    res.writeHead(200, { "content-type": "text/html", "content-security-policy": STRICT_CSP });
    res.end(STRICT_HTML);
    return;
  }
  const p = join(PUBLIC_DIR, path);
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
  mkdtempSync(join(tmpdir(), "tb-inpage-panel-e2e-")),
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// ── GitHub stub ────────────────────────────────────────────────────────────
const posts = [];
let nextNumber = 100;
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  const ok = (body) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  if ((req.headers()["authorization"] || "") !== `Bearer ${TOKEN}`) {
    return route.fulfill({ status: 401, contentType: "application/json", body: '{"message":"Bad credentials"}' });
  }
  const p = url.pathname;
  if (p === "/user") return ok({ login: "tester" });
  if (p === "/user/repos") return ok([{ full_name: REPO }, { full_name: "acme/web" }]);
  if (p === `/repos/${REPO}/labels`) return ok([{ name: "bug" }, { name: "ui" }]);
  if (p === `/repos/${REPO}/assignees`) return ok([{ login: "tester" }, { login: "octo" }]);
  if (p === `/repos/${REPO}/milestones`) return ok([{ number: 4, title: "v4" }]);
  if (p === `/repos/${REPO}`) return ok({ permissions: { push: true } });
  if (req.method() === "POST" && p === `/repos/${REPO}/issues`) {
    const body = JSON.parse(req.postData() || "{}");
    const n = nextNumber++;
    posts.push(Object.assign({ n }, body));
    return ok({ html_url: `https://github.com/${REPO}/issues/${n}`, number: n });
  }
  return route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"Not Found"}' });
});

let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
await sw.evaluate((token) => chrome.storage.local.set({ tb_integrations_v1: { github: { token } } }), TOKEN);
// The issue link opens through chrome.tabs.create in the frame; record instead
// of loading github.com.
const pending = () => sw.evaluate(async () => Object.values((await chrome.storage.session.get("tb_pending_sends_v1")).tb_pending_sends_v1 || {}));

async function inject(page, glob) {
  await sw.evaluate(async (g) => {
    const [tab] = await chrome.tabs.query({ url: g });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk-ext.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, glob);
  await page.waitForFunction(() => !!window.__TraceBugExtensionSDK, null, { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => {
    window.__tbResults = [];
    window.addEventListener("tracebug-provider-result", (e) => window.__tbResults.push(JSON.stringify(e.detail)));
    try { window.__TraceBugExtension.startEventsCapture && window.__TraceBugExtension.startEventsCapture(); } catch (e) {}
  });
  await sleep(300);
}

/** A ticket with content, opened with the shortcut. */
async function openTicket(page, clickSel, title) {
  await page.click(clickSel);
  await sleep(400);
  await page.keyboard.press("Control+Shift+KeyB");
  await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(700);
  if (title) await page.fill("#tb-qb-title", title);
}

/** Click Send to GitHub; resolve the panel frame (or null) and any window. */
async function sendToGitHub(page) {
  const winP = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 5000 }).catch(() => null);
  await page.locator('#tracebug-quick-bug-modal [data-action="open-github"]').first().click();
  await page.waitForSelector("[data-tb-create-panel] iframe", { timeout: 5000 }).catch(() => {});
  let frame = null;
  for (let i = 0; i < 40 && !frame; i++) {
    frame = page.frames().find((f) => f.url().includes("/create-issue.html")) || null;
    if (!frame) await sleep(100);
  }
  if (frame) await frame.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {});
  return { frame, winP };
}

const armed = (frame) => frame.evaluate(() => !document.getElementById("send").disabled);

try {
  // ══ 1. The frame loads in the ticket ═════════════════════════════════════
  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);
  await inject(page, GLOB);
  await page.fill("#coupon", "SAVE20");
  await openTicket(page, "#orderBtn", "Panel ticket one");

  const t0 = Date.now();
  const { frame, winP } = await sendToGitHub(page);
  check("1. Send to GitHub opens the Create panel inside the ticket", !!frame);
  if (!frame) throw new Error("no panel frame");
  check("…in the ticket's footer", await page.evaluate(() => !!document.querySelector("#tracebug-quick-bug-modal .tb-qb-footer [data-tb-create-panel] iframe")));
  check("…and no extension window", (await Promise.race([winP, sleep(600).then(() => "none")])) === "none");
  const srcHost = new URL(await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").getAttribute("src"))).host;
  check("…framed by its dynamic URL (the page never sees the extension id)", srcHost !== extId && /^[0-9a-f-]{36}$/.test(srcHost),
    `${srcHost} vs ${extId}`);
  check('…reading "Create a [GitHub] issue"', (await frame.textContent(".prow")).replace(/\s+/g, " ").includes("Create a")
    && (await frame.inputValue("#tracker")) === "github");

  // ══ 2. The page can't see into it ════════════════════════════════════════
  await frame.waitForFunction(() => document.querySelectorAll("#containerList option").length > 0, null, { timeout: 8000 });
  const pageView = await page.evaluate(() => {
    const f = document.querySelector("[data-tb-create-panel] iframe");
    let doc = "blocked";
    try { doc = f.contentDocument ? "readable" : "null"; } catch (e) { doc = "threw"; }
    return { doc, html: document.documentElement.outerHTML };
  });
  check("2. the page cannot read the frame's document", pageView.doc === "null" || pageView.doc === "threw", pageView.doc);
  check("…and no repo name, nonce or token is in the page's DOM",
    !pageView.html.includes("acme/web") && !pageView.html.includes(TOKEN) && !/[0-9a-f]{48}/.test(pageView.html));
  const req1 = (await pending()).find((r) => r.mode === "panel");
  check("…the frame URL carries no id or nonce", !frame.url().includes("#") && !!req1 && !frame.url().includes(req1.nonce));

  // ══ 3. Click safety ══════════════════════════════════════════════════════
  await frame.fill("#container", REPO);
  await frame.dispatchEvent("#container", "change");
  await frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 });
  await frame.selectOption('select[data-field="assignee"]', "octo");
  await frame.selectOption('select[data-field="milestone"]', "4");
  await page.waitForTimeout(Math.max(0, 900 - (Date.now() - t0)));
  check("3. Create arms once the frame has been fully visible", await armed(frame));

  // Faded by the page → disarmed; back to full → re-arms only after ~500 ms.
  await page.evaluate(() => { document.querySelector("[data-tb-create-panel] iframe").style.opacity = "0.4"; });
  await sleep(700);
  check("…a page that fades the frame disarms Create", !(await armed(frame)));
  await page.evaluate(() => { document.querySelector("[data-tb-create-panel] iframe").style.opacity = ""; });
  await sleep(250);
  check("…and it stays disarmed for the first moments after it is visible again", !(await armed(frame)));
  await sleep(900);
  check("…then re-arms", await armed(frame));
  // Covered by an opaque decoy (the page draws its own button over ours) → disarmed.
  await page.evaluate(() => {
    const r = document.querySelector("[data-tb-create-panel] iframe").getBoundingClientRect();
    const c = document.createElement("div");
    c.id = "__cover";
    c.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:2147483647;background:#fff;`;
    document.getElementById("tracebug-quick-bug-modal").appendChild(c);
  });
  await sleep(700);
  const onTop = await page.evaluate(() => { const r = document.querySelector("[data-tb-create-panel] iframe").getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return el && (el.id || el.tagName); });
  check("…a page that covers the frame disarms Create", !(await armed(frame)), "on top: " + onTop);
  await page.evaluate(() => document.getElementById("__cover").remove());
  await sleep(1100);

  // A script-made click does nothing, even when armed.
  await frame.evaluate(() => document.getElementById("send").click());
  await sleep(800);
  check("…a click a script made files nothing", posts.length === 0, String(posts.length));

  // ══ 4. Forged messages ═══════════════════════════════════════════════════
  await page.evaluate(() => {
    window.postMessage({ type: "tb-panel-close" }, "*");
    window.postMessage({ type: "tb-panel-size", height: 5 }, "*");
  });
  await sleep(300);
  check("4. the page posting 'close'/'size' as if it were the frame is ignored",
    await page.evaluate(() => !!document.querySelector("[data-tb-create-panel] iframe")));
  const forged = await frame.evaluate(() => new Promise((r) => chrome.runtime.sendMessage({ type: "tb:panel:create", id: "x", nonce: "0".repeat(48), choice: {} }, r)));
  check("…the worker refuses a create with the wrong id/nonce", forged && forged.ok === false, JSON.stringify(forged));
  const fromContent = await sw.evaluate(async ({ glob, r }) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (id, nonce) => new Promise((ok) => chrome.runtime.sendMessage({ type: "tb:panel:create", id, nonce, choice: { tracker: "github", container: "acme/api" } }, ok)),
      args: [r.id, r.nonce],
    });
    return res && res.result;
  }, { glob: GLOB, r: req1 });
  check("…even with the real id and nonce, a content script can't create (not the panel page)",
    fromContent && fromContent.ok === false && /Rejected/.test(fromContent.error || ""), JSON.stringify(fromContent));
  // The page copies our frame and posts a guessed init into its copy.
  await page.evaluate(() => {
    const ours = document.querySelector("[data-tb-create-panel] iframe");
    const copy = document.createElement("iframe");
    copy.id = "__copy";
    copy.src = ours.src;
    copy.style.cssText = "width:400px;height:200px";
    copy.onload = () => copy.contentWindow.postMessage({ type: "tb-panel-init", id: "tb_send_1", nonce: "a".repeat(48), theme: "auto" }, "*");
    document.body.appendChild(copy);
  });
  await sleep(1500);
  const copyFrame = page.frames().find((f) => f !== frame && f.url().includes("/create-issue.html"));
  check("…a page-made copy of the frame shows nothing", !!copyFrame && (await copyFrame.evaluate(() => document.getElementById("panel").hidden)));
  const bound = (await pending()).find((r) => r.mode === "panel");
  check("…and the request stays bound to our frame", !!bound && bound.panelFrameId === req1.panelFrameId && bound.panelFrameId != null);
  await page.evaluate(() => document.getElementById("__copy").remove());

  // ══ 5. Create → "Created #N" in place ════════════════════════════════════
  await frame.evaluate(() => { window.__opened = []; chrome.tabs.create = (o) => { window.__opened.push(o && o.url); return Promise.resolve({ id: -1 }); }; });
  const tabsBefore = ctx.pages().length;
  await frame.click("#send");
  await frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('5. a real click creates: "Created #100" in the panel', (await frame.textContent("#issueLink")).trim() === "#100");
  check("…exactly one issue, with the picks", posts.length === 1 && JSON.stringify(posts[0].labels) === '["bug"]' &&
    JSON.stringify(posts[0].assignees) === '["octo"]' && posts[0].milestone === 4, JSON.stringify(posts));
  await sleep(600);
  check("…no tab opened, and the ticket stays open to show it",
    ctx.pages().length === tabsBefore && await page.locator("#tracebug-quick-bug-modal").isVisible());
  await page.waitForFunction(() => window.__tbResults.length > 0, null, { timeout: 5000 }).catch(() => {});
  const results = await page.evaluate(() => window.__tbResults);
  check("…the page heard only the result (link and number), no token", results.some((r) => r.includes("issues/100")) &&
    !results.some((r) => r.includes(TOKEN)));
  await frame.click("#issueLink");
  check("…the link opens the issue when clicked", (await frame.evaluate(() => window.__opened[0])) === `https://github.com/${REPO}/issues/100`);
  await frame.click("#cancel"); // "Close"
  await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
  check("…Close removes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));

  // ══ 6. A repeat bug is one click ═════════════════════════════════════════
  await page.keyboard.press("Escape");
  await sleep(400);
  await openTicket(page, "#applyBtn", "Panel ticket two");
  const r6 = await sendToGitHub(page);
  const f6 = r6.frame;
  await f6.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  check("6. the next panel starts with the last repo, label, assignee and milestone",
    (await f6.inputValue("#container")) === REPO && (await f6.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true" &&
    (await f6.inputValue('select[data-field="assignee"]')) === "octo" && (await f6.inputValue('select[data-field="milestone"]')) === "4");
  await f6.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 5000 }).catch(() => {});
  await f6.click("#send");
  await f6.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('…one click on Create → "Created #101"', (await f6.textContent("#issueLink")).trim() === "#101" && posts.length === 2,
    JSON.stringify(posts.map((p) => p.n)));
  await f6.click("#cancel");

  // ══ 7. Keyboard only, and Escape cancels ═════════════════════════════════
  await page.keyboard.press("Escape");
  await sleep(400);
  await openTicket(page, "#orderBtn", "Keyboard ticket");
  const r7 = await sendToGitHub(page);
  const f7 = r7.frame;
  await f7.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 5000 }).catch(() => {});
  await f7.focus("#send");
  await page.keyboard.press("Enter");
  await f7.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check("7. keyboard only: Enter on the focused Create button files the issue", (await f7.textContent("#issueLink")).trim() === "#102");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
  check("…Escape in the panel closes it", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));

  await page.keyboard.press("Escape");
  await sleep(400);
  await openTicket(page, "#orderBtn", "Escape ticket");
  const r7b = await sendToGitHub(page);
  await r7b.frame.waitForSelector("#send", { timeout: 5000 });
  await r7b.frame.focus("#tracker");
  await page.keyboard.press("Escape");
  await sleep(800);
  const res7 = await page.evaluate(() => window.__tbResults.slice(-1)[0] || "");
  check("…Escape before Create cancels: the page hears 'cancelled', nothing filed, the ticket stays open",
    /"cancelled":true/.test(res7) && posts.length === 3 && await page.locator("#tracebug-quick-bug-modal").isVisible(), res7);
  check("…and the request is gone", (await pending()).length === 0, JSON.stringify(await pending()));

  // ══ 7b. A page whose CSS caps iframes (seen on a real site) ══════════════
  // (The "Escape ticket" from leg 7 is still open; send it again.)
  await page.evaluate(() => {
    const st = document.createElement("style");
    st.id = "__cap";
    st.textContent = "iframe { height: 90px !important; max-height: 90px !important; }";
    document.head.appendChild(st);
  });
  const r7c = await sendToGitHub(page);
  await r7c.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const capH = await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").getBoundingClientRect().height);
  check("7b. a page rule capping iframes doesn't squeeze the panel", capH > 200, `${capH}px`);
  await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").scrollIntoView({ block: "center" }));
  check("…and Create arms", await r7c.frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).then(() => true, () => false));
  await r7c.frame.click("#cancel");
  await sleep(400);
  await page.evaluate(() => document.getElementById("__cap").remove());

  // ══ 7c. A page that filters everything (e.g. a dark-mode extension) ══════
  // v2 says "hidden" for any filter on <html>; the content script's second
  // opinion must still arm Create. A click-through element BEHIND the ticket,
  // right under the panel, must not count as a cover.
  await page.evaluate(() => {
    const st = document.createElement("style");
    st.id = "__filter";
    st.textContent = "html { filter: invert(1) hue-rotate(180deg) !important; }";
    document.head.appendChild(st);
  });
  const r7d = await sendToGitHub(page);
  await r7d.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const f = document.querySelector("[data-tb-create-panel] iframe");
    f.scrollIntoView({ block: "center" });
    const r = f.getBoundingClientRect();
    const under = document.createElement("div");
    under.id = "__under";
    under.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:1;pointer-events:none;background:#0f0;`;
    document.body.insertBefore(under, document.body.firstChild);
  });
  const armed7c = await r7d.frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).then(() => true, () => false);
  check("7c. under a page-wide filter Create still arms (second check)", armed7c,
    (await r7d.frame.isVisible("#toWindowBox")) ? (await r7d.frame.textContent("#toWindowWhy")).trim() : "");
  check("…and no paused note", !(await r7d.frame.isVisible("#toWindowBox")));
  const before7c = posts.length;
  if (armed7c) await r7d.frame.click("#send");
  await r7d.frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check("…and a real click creates the issue in the panel", posts.length === before7c + 1 &&
    /Created/.test(await r7d.frame.textContent("#doneBox")));
  await r7d.frame.click("#cancel"); // "Close"
  await page.evaluate(() => { document.getElementById("__filter").remove(); document.getElementById("__under").remove(); });
  await page.keyboard.press("Escape");
  await sleep(400);
  await openTicket(page, "#orderBtn", "Faded ticket");

  // ══ 7d. A page that fades the panel's container almost to nothing ════════
  // (an invisible panel over a fake button is the classic clickjack)
  const r7e = await sendToGitHub(page);
  await r7e.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    document.querySelector("[data-tb-create-panel]").scrollIntoView({ block: "center" });
    document.querySelector("#tracebug-quick-bug-modal .tb-qb-footer").style.opacity = "0.05";
  });
  await r7e.frame.waitForSelector("#toWindowBox:not([hidden])", { timeout: 6000 }).catch(() => {});
  check("7d. a near-invisible panel stays paused", !(await armed(r7e.frame)));
  check("…and says why", /fades or hides/.test(await r7e.frame.textContent("#toWindowWhy")),
    (await r7e.frame.textContent("#toWindowWhy")).trim());
  await page.evaluate(() => { document.querySelector("#tracebug-quick-bug-modal .tb-qb-footer").style.opacity = ""; });
  check("…and arms once the page stops fading it",
    await r7e.frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).then(() => true, () => false));
  await r7e.frame.click("#cancel");
  await sleep(400);

  // ══ 7e. A real cover: a decoy drawn over the panel that clicks pass through
  await page.evaluate(() => {
    const st = document.createElement("style");
    st.id = "__filter";
    st.textContent = "html { filter: invert(1) !important; }";
    document.head.appendChild(st);
  });
  const r7f = await sendToGitHub(page);
  await r7f.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const f = document.querySelector("[data-tb-create-panel] iframe");
    f.scrollIntoView({ block: "center" });
    const r = f.getBoundingClientRect();
    const c = document.createElement("div");
    c.id = "__decoy";
    c.textContent = "Claim your prize";
    c.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:2147483647;pointer-events:none;background:rgba(255,255,255,0.92);`;
    document.getElementById("tracebug-quick-bug-modal").appendChild(c);
  });
  await r7f.frame.waitForSelector("#toWindowBox:not([hidden])", { timeout: 6000 }).catch(() => {});
  await sleep(1200);
  check("7e. a click-through decoy over the panel keeps Create paused", !(await armed(r7f.frame)));
  check("…the panel says something is drawn over it, and offers Open in a window",
    /drawn over/.test(await r7f.frame.textContent("#toWindowWhy")) && await r7f.frame.isVisible("#toWindow"),
    (await r7f.frame.textContent("#toWindowWhy")).trim());
  const winP7d = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("confirm-send.html"), timeout: 8000 }).catch(() => null);
  await r7f.frame.click("#toWindow", { force: true });
  const win7d = await winP7d;
  check("…which opens the extension window", !!win7d);
  await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
  check("…and removes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));
  if (win7d) {
    await win7d.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {});
    await win7d.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).catch(() => {});
    const before = posts.length;
    await win7d.click("#send");
    await win7d.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("…where the same request creates the issue", posts.length === before + 1 && /Created/.test(await win7d.textContent("#doneBox")));
    await win7d.close().catch(() => {});
  }
  await page.evaluate(() => { document.getElementById("__filter").remove(); document.getElementById("__decoy").remove(); });
  // Filing from the window closes the ticket (as before step 3): open another.
  await page.waitForFunction(() => !document.getElementById("tracebug-quick-bug-modal"), null, { timeout: 5000 }).catch(() => {});
  await openTicket(page, "#orderBtn", "After filter");

  // ══ 7f. A big page (~30k elements away from the Create row) ══════════════
  // The second check only styles and counts elements whose box meets the row,
  // so clutter elsewhere neither slows it down nor trips the size cap.
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "__clutter";
    box.style.cssText = "position:absolute;left:0;top:6000px;width:300px;";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 30000; i++) {
      const d = document.createElement("span");
      d.textContent = "x";
      d.style.cssText = i % 7 ? "" : "pointer-events:none";
      frag.appendChild(d);
    }
    box.appendChild(frag);
    document.body.appendChild(box);
    const st = document.createElement("style");
    st.id = "__filter";
    st.textContent = "html { filter: invert(1) !important; }";
    document.head.appendChild(st);
  });
  const nodes7f = await page.evaluate(() => document.querySelectorAll("*").length);
  const r7g = await sendToGitHub(page);
  await r7g.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").scrollIntoView({ block: "center" }));
  const t7f = Date.now();
  const armed7f = await r7g.frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 5000 }).then(() => true, () => false);
  const ms7f = Date.now() - t7f;
  check("7f. a ~30k-element page arms in about a second", armed7f && ms7f < 1500, `${nodes7f} elements, ${ms7f} ms`);
  check("…with no paused note (no size refusal)", !(await r7g.frame.isVisible("#toWindowBox")),
    (await r7g.frame.isVisible("#toWindowBox")) ? (await r7g.frame.textContent("#toWindowWhy")).trim() : "");
  await r7g.frame.click("#cancel");
  await sleep(400);
  await page.evaluate(() => { document.getElementById("__filter").remove(); document.getElementById("__clutter").remove(); });

  // ══ 8. Theme ═════════════════════════════════════════════════════════════
  const panelBg = async (theme) => {
    await page.evaluate((t) => { const r = document.getElementById("tracebug-root"); if (r) r.setAttribute("data-tb-theme", t); }, theme);
    const { frame: f } = await sendToGitHub(page);
    const bg = f ? await f.$eval("#panel", (e) => getComputedStyle(e).backgroundColor) : "none";
    if (f) { await f.click("#cancel"); await sleep(400); }
    return bg;
  };
  const dark = await panelBg("dark");
  const light = await panelBg("light");
  check("8. the panel follows the ticket's dark and light themes", dark === "rgb(20, 24, 35)" && light === "rgb(245, 246, 249)", `${dark} / ${light}`);

  // ══ 8b. The split button: "Send to GitHub" + ▾, the panel as its dropdown ═
  const SPLIT = "#tracebug-quick-bug-modal [data-tb-send-split]";
  const panelFrame = async () => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes("/create-issue.html"));
      if (f) { await f.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {}); return f; }
      await sleep(100);
    }
    return null;
  };
  const expanded = () => page.$$eval(`${SPLIT} [aria-haspopup]`, (b) => b.map((x) => x.getAttribute("aria-expanded")).join(","));
  const pageFocus = () => page.evaluate(() => {
    const a = document.activeElement;
    return !a ? "none" : a.matches("[data-tb-create-panel] iframe") ? "frame" : a.hasAttribute("data-tb-split-main") ? "main"
      : a.hasAttribute("data-tb-split-caret") ? "caret" : a.tagName;
  });
  check("8b. the ticket has a split button: Send to GitHub + ▾, and no plug icon",
    /Send to GitHub/.test(await page.textContent(`${SPLIT} [data-tb-split-main]`)) && !!(await page.$(`${SPLIT} [data-tb-split-caret]`)) &&
    !(await page.$('#tracebug-quick-bug-modal [data-action="tracker-status"]')));
  check('…both parts say aria-haspopup="dialog", collapsed',
    (await page.$$eval(`${SPLIT} [aria-haspopup]`, (b) => b.map((x) => x.getAttribute("aria-haspopup")).join(","))) === "dialog,dialog" &&
    (await expanded()) === "false,false");

  // Keyboard: Enter on the main part → panel above it, focus inside, Create focused once armed → Enter files.
  await page.focus(`${SPLIT} [data-tb-split-main]`);
  await page.keyboard.press("Enter");
  const fk = await panelFrame();
  check("…Enter on the main part opens the panel", !!fk);
  if (fk) {
    await sleep(300);
    const geo = await page.evaluate((sel) => {
      const sl = document.querySelector("[data-tb-create-panel]");
      const r = sl.getBoundingClientRect(), b = document.querySelector(sel).getBoundingClientRect();
      return { place: sl.getAttribute("data-place"), above: r.bottom <= b.top + 1 };
    }, SPLIT);
    check("…as a dropdown that opens upward (no room below the footer)", geo.place === "up" && geo.above, JSON.stringify(geo));
    check("…aria-expanded is true on both parts", (await expanded()) === "true,true");
    check("…focus moved into the panel", (await pageFocus()) === "frame");
    const onSend = await fk.waitForFunction(() => document.activeElement && document.activeElement.id === "send", null, { timeout: 5000 }).then(() => true, () => false);
    check("…and lands on Create once it arms", onSend);
    const before = posts.length;
    await page.keyboard.press("Enter");
    await fk.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("…Enter files the issue", posts.length === before + 1);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Esc closes it and focus returns to the button", (await pageFocus()) === "main", await pageFocus());
    check("…aria-expanded back to false", (await expanded()) === "false,false");
  }

  // Alt+Down → the panel on the tracker picker; Esc → back to the button.
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  await openTicket(page, "#applyBtn", "Split ticket");
  await page.focus(`${SPLIT} [data-tb-split-main]`);
  await page.keyboard.press("Alt+ArrowDown");
  const fa = await panelFrame();
  const onPicker = fa ? await fa.waitForFunction(() => document.activeElement && document.activeElement.id === "tracker", null, { timeout: 5000 }).then(() => true, () => false) : false;
  check("…Alt+Down opens it with focus on the tracker picker", !!fa && onPicker,
    !fa ? "no panel" : `hint=${await page.getAttribute("#tracebug-quick-bug-modal", "data-tb-panel-focus")} page=${await pageFocus()} frame=${await fa.evaluate(() => (document.activeElement || {}).id || (document.activeElement || {}).tagName)}`);
  if (fa) {
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Esc closes it, focus back on the button", (await pageFocus()) === "main", await pageFocus());
  }

  // ▾ by mouse; Tab past the last control closes it and focus returns to ▾.
  await page.click(`${SPLIT} [data-tb-split-caret]`);
  const fc = await panelFrame();
  check("…clicking ▾ opens the same panel", !!fc);
  if (fc) {
    await fc.waitForFunction(() => document.activeElement && document.activeElement.id === "tracker", null, { timeout: 5000 }).catch(() => {});
    await fc.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).catch(() => {});
    await fc.focus("#send");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Tab past Create closes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));
    check("…and focus returns to ▾", (await pageFocus()) === "caret", await pageFocus());
    check("…nothing was filed by closing it", (await pending()).length === 0);
  }

  // The Integrations hub is reached from inside the panel now.
  await page.click(`${SPLIT} [data-tb-split-caret]`);
  const fm = await panelFrame();
  if (fm) {
    const tabP = ctx.waitForEvent("page", { predicate: (pg) => pg.url().includes("options.html#integrations"), timeout: 5000 }).catch(() => null);
    await fm.click("#manageInt");
    const opt = await tabP;
    check("…'Manage integrations' in the panel opens Settings → Integrations", !!opt);
    if (opt) await opt.close();
    await fm.click("#cancel");
    await sleep(400);
  }

  // ══ 9. Small viewport ════════════════════════════════════════════════════
  await page.setViewportSize({ width: 360, height: 640 });
  await sleep(400);
  const { frame: f9 } = await sendToGitHub(page);
  const box = f9 ? await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").getBoundingClientRect().width) : 0;
  const fits = f9 ? await f9.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1) : false;
  check("9. at 360 px the panel fits its width without sideways scrolling", !!f9 && box > 0 && box <= 360 && fits, `frame ${box}px`);
  if (f9) {
    await page.evaluate(() => document.querySelector("[data-tb-create-panel] iframe").scrollIntoView({ block: "center" }));
    await f9.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 5000 }).catch(() => {});
    check("…and Create arms once it is scrolled fully into view", await armed(f9),
      JSON.stringify(await page.evaluate(() => { const sl = document.querySelector("[data-tb-create-panel]"); const r = sl.querySelector("iframe").getBoundingClientRect(); const sh = document.querySelector("#tracebug-quick-bug-modal .tb-qb-shell").getBoundingClientRect(); return { place: sl.getAttribute("data-place"), top: r.top, bottom: r.bottom, h: r.height, shellTop: sh.top, shellBottom: sh.bottom, vh: innerHeight }; })) +
      " " + (await f9.isVisible("#toWindowBox") ? await f9.textContent("#toWindowWhy") : ""));
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // ══ 10. Navigating away cleans up ════════════════════════════════════════
  check("10. a panel is open before navigating", (await pending()).some((r) => r.mode === "panel"));
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(1200);
  check("…after the page navigates, the request is gone", (await pending()).length === 0, JSON.stringify(await pending()));
  await inject(page, GLOB);
  await openTicket(page, "#orderBtn", "After navigation");
  const r10 = await sendToGitHub(page);
  check("…and the next Send works (no 'already waiting')", !!r10.frame);
  if (r10.frame) { await r10.frame.click("#cancel"); await sleep(400); }

  // ══ 11. A frame the page breaks → the extension window ═══════════════════
  await page.evaluate(() => {
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) {
        const f = n.querySelector && n.querySelector("iframe");
        if (f && /create-issue/.test(f.src)) f.src = "about:blank";
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  const r11 = await sendToGitHub(page);
  const win11 = await r11.winP;
  check("11. when the frame never comes up, the extension window opens instead", !!win11);
  check("…and the broken panel is removed", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));
  if (win11) {
    await win11.waitForSelector("#panel:not([hidden])", { timeout: 8000 }).catch(() => {});
    check("…the window carries the same request (repo prefilled)", (await win11.inputValue("#container").catch(() => "")) === REPO);
    await win11.close();
    await sleep(600);
  }

  // ══ 12. A strict-CSP site ════════════════════════════════════════════════
  const strict = await ctx.newPage();
  await strict.goto(STRICT, { waitUntil: "load" });
  await sleep(300);
  await inject(strict, GLOB.replace("/*", "/strict.html"));
  await strict.fill("#q", "x");
  await openTicket(strict, "#b", "Strict CSP ticket");
  const r12 = await sendToGitHub(strict);
  const win12 = r12.frame ? null : await r12.winP;
  const how = r12.frame ? "panel" : win12 ? "window" : "nothing";
  check("12. on a strict-CSP site (frame-src 'none') the user still gets a Create panel or the window", how !== "nothing", how);
  if (r12.frame) {
    await r12.frame.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).catch(() => {});
    await r12.frame.click("#send");
    await r12.frame.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    check("…and filing works there", (await r12.frame.textContent("#issueLink")).trim() === `#${nextNumber - 1}`);
  } else if (win12) {
    await win12.close();
  }
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
