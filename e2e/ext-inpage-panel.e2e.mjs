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
  // The demo page from a site that blocks clipboard writes in every frame.
  if (path === "/noclip.html") {
    res.writeHead(200, { "content-type": "text/html", "permissions-policy": "clipboard-write=()" });
    res.end(readFileSync(join(PUBLIC_DIR, "try.html")));
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
let dropApiRepo = false; // leg 6b: acme/api is gone from the account
let bigList = false;     // leg 6c: the account has more repos than the list holds (500)
await ctx.route("https://api.github.com/**", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  // CORS too: leg 13 files from a plain page (script-tag SDK) with its own token.
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, accept, x-github-api-version", "access-control-allow-methods": "GET, POST" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const ok = (body) => route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
  if ((req.headers()["authorization"] || "") !== `Bearer ${TOKEN}`) {
    return route.fulfill({ status: 401, headers: cors, contentType: "application/json", body: '{"message":"Bad credentials"}' });
  }
  const p = url.pathname;
  if (p === "/user") return ok({ login: "tester" });
  if (p === "/user/repos") {
    if (bigList) return ok(Array.from({ length: 500 }, (_, i) => ({ full_name: `acme/r${i}` })));
    return ok(dropApiRepo ? [{ full_name: "acme/web" }] : [{ full_name: REPO }, { full_name: "acme/web" }]);
  }
  if (p === `/repos/${REPO}` && dropApiRepo) return route.fulfill({ status: 404, headers: cors, contentType: "application/json", body: '{"message":"Not Found"}' });
  if (p === `/repos/${REPO}/labels`) return ok([{ name: "bug" }, { name: "ui" }]);
  if (p === "/repos/acme/web/labels" || p === "/repos/acme/web/assignees" || p === "/repos/acme/web/milestones") return ok([]);
  if (p === "/repos/acme/web") return ok({ permissions: { push: true } });
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
  // A screenshot in this ticket (for "Copy screenshot" after Create).
  await page.click('#tracebug-quick-bug-modal [data-action="add-screenshot"]').catch(() => {});
  await sleep(600);
  // It's a drag-to-select region capture.
  await page.mouse.move(120, 120);
  await page.mouse.down();
  await page.mouse.move(420, 320, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector("#tracebug-quick-bug-modal [data-delete-screenshot]", { state: "attached", timeout: 10000 }).catch(() => {});
  await page.waitForSelector('#tracebug-quick-bug-modal [data-action="open-github"]', { state: "visible", timeout: 10000 }).catch(() => {});

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
  check('5. a real click creates: "Created #100" in the panel', (await frame.textContent("#issueLink")).trim() === "#100",
    await frame.evaluate(() => `msg="${document.getElementById("panelMsg").textContent}" send=${document.getElementById("send").disabled ? "off" : "on"} toWindow=${!document.getElementById("toWindowBox").hidden}`));
  check("…exactly one issue, with the picks", posts.length === 1 && JSON.stringify(posts[0].labels) === '["bug"]' &&
    JSON.stringify(posts[0].assignees) === '["octo"]' && posts[0].milestone === 4, JSON.stringify(posts));
  await sleep(800);
  const issueTabs = () => sw.evaluate(async () => (await chrome.tabs.query({})).map((t) => t.pendingUrl || t.url)
    .filter((u) => /github\.com\/.*\/issues\/\d+/.test(u)));
  const opened5 = await issueTabs();
  check("…like Jam, the issue opens in a new tab (Open the issue after creating: on by default)",
    opened5.some((u) => u.endsWith(`/${REPO}/issues/100`)), JSON.stringify(opened5));
  check("…and the ticket stays where it is, showing \"Created #100\"", ctx.pages().length >= tabsBefore &&
    await page.locator("#tracebug-quick-bug-modal").isVisible());
  // Close it and come back to the ticket (a background tab stops drawing, and
  // the panel's visibility check with it).
  await sw.evaluate(async () => { for (const t of await chrome.tabs.query({})) if (/\/issues\/\d+/.test(t.pendingUrl || t.url || "")) await chrome.tabs.remove(t.id); });
  await page.bringToFront();
  // The rest of this suite files with the setting off.
  await sw.evaluate(() => chrome.storage.local.set({ tb_open_issue_after_create_v1: false }));
  await page.waitForFunction(() => window.__tbResults.length > 0, null, { timeout: 5000 }).catch(() => {});
  const results = await page.evaluate(() => window.__tbResults);
  check("…the page heard only the result (link and number), no token", results.some((r) => r.includes("issues/100")) &&
    !results.some((r) => r.includes(TOKEN)));
  // Copy screenshot (GitHub can't take files): on a real click only.
  const shots5 = await page.$$eval("#tracebug-quick-bug-modal [data-delete-screenshot]", (b) => b.length);
  check("5b. with a screenshot in the ticket, \"Copy screenshot\" is offered after Create", shots5 > 0 && await frame.isVisible("#copyShot"), `${shots5} screenshot(s)`);
  // B1/B5: the frame's allow="clipboard-write" must match the document that
  // loads (the extension origin, not the dynamic src URL) or every write fails.
  check("…the clipboard is really allowed in the frame on an ordinary site",
    await frame.evaluate(() => document.featurePolicy.allowsFeature("clipboard-write")));
  check("…\"Download screenshot\" sits next to it: a blob: link with a file name (U5)",
    await frame.isVisible("#downloadShot") && /^blob:/.test(await frame.getAttribute("#downloadShot", "href")) &&
    /\.(png|jpg|webp)$/.test(await frame.getAttribute("#downloadShot", "download")));
  await frame.evaluate(() => {
    window.__clip = [];
    navigator.clipboard.write = async (items) => { window.__clip.push({ types: items.map((i) => i.types.join()).join("|"), active: navigator.userActivation.isActive }); };
  });
  await frame.evaluate(() => document.getElementById("copyShot").click());
  await sleep(200);
  check("…a click a script made writes nothing", (await frame.evaluate(() => window.__clip.length)) === 0);
  await frame.click("#copyShot");
  await frame.waitForFunction(() => window.__clip.length > 0, null, { timeout: 5000 }).catch(() => {});
  const clip = await frame.evaluate(() => window.__clip);
  check("…a real click puts the screenshot on the clipboard as a PNG", clip.length === 1 && clip[0].types === "image/png" && clip[0].active, JSON.stringify(clip));
  check("…and says what to do with it", (await frame.textContent("#panelMsg")).trim() === "Screenshot copied. Paste it into a comment on the issue.");
  check("…the screenshot never reached GitHub", !JSON.stringify(posts[0]).includes("base64") && !("attachments" in posts[0]));
  await frame.click("#issueLink");
  check("…the link opens the issue when clicked", (await frame.evaluate(() => window.__opened[0])) === `https://github.com/${REPO}/issues/100`);
  check('…and no toast repeats it over the button bar: only the panel\'s "Created #100" (U11), no "Creating…" either',
    !(await page.locator("text=/GitHub issue created/").count()) && !(await page.locator("text=/Creating GitHub/").count()));
  await frame.click("#cancel"); // "Close"
  await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
  check("…Close removes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));

  // ══ 6. A repeat bug is one click ═════════════════════════════════════════
  await page.keyboard.press("Escape");
  await sleep(400);
  await openTicket(page, "#applyBtn", "Panel ticket two");
  // No screenshot in this ticket: "Copy screenshot" must not appear.
  for (let i = 0; i < 10; i++) {
    const del = await page.$("#tracebug-quick-bug-modal [data-delete-screenshot]");
    if (!del) break;
    await del.evaluate((b) => b.click());
    await sleep(250);
  }
  const r6 = await sendToGitHub(page);
  const f6 = r6.frame;
  await f6.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  check("6. the next panel starts with the last repo, label, assignee and milestone",
    (await f6.inputValue("#container")) === REPO && (await f6.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true" &&
    (await f6.inputValue('select[data-field="assignee"]')) === "octo" && (await f6.inputValue('select[data-field="milestone"]')) === "4");
  await f6.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 5000 }).catch(() => {});
  const shown6 = await f6.$$eval('button.chip[aria-pressed="true"]', (b) => b.map((x) => x.value));
  const sets6 = await f6.$$eval('fieldset[data-field="labels"]', (f) => f.length);
  await f6.click("#send");
  await f6.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
  check('…one click on Create → "Created #101"', (await f6.textContent("#issueLink")).trim() === "#101" && posts.length === 2,
    JSON.stringify(posts.map((p) => p.n)));
  check("…prefilled labels: exactly the ones shown are sent (B6)", sets6 === 1 && !!posts[1] &&
    JSON.stringify(posts[1].labels) === JSON.stringify(shown6), `${sets6} fieldset(s), shown ${JSON.stringify(shown6)}, sent ${JSON.stringify(posts[1] && posts[1].labels)}`);
  check("…no screenshot in the ticket: no \"Copy screenshot\"",
    (await page.$$eval("#tracebug-quick-bug-modal [data-delete-screenshot]", (b) => b.length)) === 0 && !(await f6.isVisible("#copyShot")));
  await sleep(600);
  check("…with \"Open the issue after creating\" off, no tab opens", (await issueTabs()).length === 0, JSON.stringify(await issueTabs()));
  await f6.click("#cancel");

  // ══ 6b. Remembered per site ════════════════════════════════════════════════
  const SITE_ORIGIN = `http://localhost:${PORT}`;
  const sites = () => sw.evaluate(async () => (await chrome.storage.local.get("tb_tracker_sites_v1")).tb_tracker_sites_v1 || {});
  const s6 = await sites();
  const pick6 = s6[SITE_ORIGIN] && s6[SITE_ORIGIN].picks && s6[SITE_ORIGIN].picks["github|token:"];
  check("6b. filing remembers the repo and fields for this site's origin (extension storage)",
    !!pick6 && pick6.container === REPO && JSON.stringify(pick6.fields.labels) === '["bug"]' &&
    Object.keys(s6).every((o) => /^https?:\/\/[^/]+$/.test(o)), JSON.stringify(s6).slice(0, 200));
  // The global default now points elsewhere: the site's own pick still wins.
  await sw.evaluate(async () => {
    const g = (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1 || {};
    g.github = Object.assign({}, g.github, { container: "acme/web", fields: {} });
    await chrome.storage.local.set({ tb_tracker_prefs_v1: g });
  });
  const r6b = await sendToGitHub(page);
  await r6b.frame.waitForSelector('button.chip[value="bug"]', { timeout: 8000 }).catch(() => {});
  check("…reopening on this site prefills that repo and labels (not the global default)",
    (await r6b.frame.inputValue("#container")) === REPO && (await r6b.frame.getAttribute('button.chip[value="bug"]', "aria-pressed")) === "true");
  const armed6b = await r6b.frame.waitForFunction(() => document.activeElement && document.activeElement.id === "send" && !document.getElementById("send").disabled, null, { timeout: 6000 }).then(() => true, () => false);
  check("…with Create focused: a repeat bug is Send, then Enter", armed6b);
  await r6b.frame.click("#cancel");
  await sleep(400);
  // The repo is gone from the account: fall back to the default, say so in one line.
  dropApiRepo = true;
  const r6c = await sendToGitHub(page);
  await r6c.frame.waitForFunction(() => /no longer available/.test(document.getElementById("panelMsg").textContent), null, { timeout: 8000 }).catch(() => {});
  check("…a remembered repo that's gone isn't selected: default instead, with a note",
    (await r6c.frame.inputValue("#container")) === "acme/web" &&
    (await r6c.frame.textContent("#panelMsg")).trim() === `${REPO} is no longer available, using your default acme/web.`,
    `${await r6c.frame.inputValue("#container")} | ${(await r6c.frame.textContent("#panelMsg")).trim()}`);
  await r6c.frame.click("#cancel");
  await sleep(400);
  // A list that hit the 500 cap can't vouch for the pick: it's asked about directly.
  dropApiRepo = false;
  bigList = true;
  const r6d = await sendToGitHub(page);
  await r6d.frame.waitForFunction((r) => document.getElementById("container").value === r, REPO, { timeout: 8000 }).catch(() => {});
  check("6c. list at the 500 cap: the remembered repo is checked directly and kept",
    (await r6d.frame.inputValue("#container")) === REPO && !/no longer available/.test(await r6d.frame.textContent("#panelMsg")),
    `${await r6d.frame.inputValue("#container")} | ${(await r6d.frame.textContent("#panelMsg")).trim()}`);
  // U7/U10: the suggestions are the panel's own list — under the field, inside
  // the panel's width, a max height with scroll — not the browser's popup.
  await r6d.frame.fill("#container", "acme/r1");
  await r6d.frame.press("#container", "ArrowDown");
  await r6d.frame.waitForSelector("#containerSuggest:not([hidden])", { timeout: 5000 }).catch(() => {});
  const sg = await r6d.frame.evaluate(() => {
    const ul = document.getElementById("containerSuggest"), input = document.getElementById("container");
    const p = document.getElementById("panel").getBoundingClientRect(), r = ul.getBoundingClientRect(), i = input.getBoundingClientRect();
    return { open: !ul.hidden, n: ul.children.length, below: r.top >= i.bottom - 1, inside: r.left >= p.left && r.right <= p.right + 0.5,
      capped: ul.clientHeight <= 170 && ul.scrollHeight > ul.clientHeight, noDatalist: !input.hasAttribute("list"),
      expanded: input.getAttribute("aria-expanded"), active: input.getAttribute("aria-activedescendant") };
  });
  check("…repository suggestions: the panel's own list, below the field, inside the panel, scrolling past a max height (U7/U10)",
    sg.open && sg.n > 5 && sg.below && sg.inside && sg.capped && sg.noDatalist && sg.expanded === "true" && sg.active === "sg_0", JSON.stringify(sg));
  await r6d.frame.press("#container", "Enter");
  check("…Enter picks the highlighted one and closes the list",
    (await r6d.frame.inputValue("#container")) === "acme/r1" && !(await r6d.frame.isVisible("#containerSuggest")),
    `${await r6d.frame.inputValue("#container")} | list open: ${await r6d.frame.isVisible("#containerSuggest")}`);
  await r6d.frame.press("#container", "ArrowDown");
  await r6d.frame.press("#container", "Escape");
  check("…Esc closes the list, not the panel", !(await r6d.frame.isVisible("#containerSuggest")) && await r6d.frame.isVisible("#panel"));
  await r6d.frame.click("#cancel");
  await sleep(400);
  dropApiRepo = true;
  const r6e = await sendToGitHub(page);
  await r6e.frame.waitForFunction(() => /no longer available/.test(document.getElementById("panelMsg").textContent), null, { timeout: 8000 }).catch(() => {});
  check("…and when that check fails, the same fallback and note",
    (await r6e.frame.inputValue("#container")) === "acme/web" &&
    (await r6e.frame.textContent("#panelMsg")).trim() === `${REPO} is no longer available, using your default acme/web.`,
    `${await r6e.frame.inputValue("#container")} | ${(await r6e.frame.textContent("#panelMsg")).trim()}`);
  await r6e.frame.click("#cancel");
  await sleep(400);
  bigList = false;
  dropApiRepo = false;
  await sw.evaluate(async (repo) => {
    const g = (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1 || {};
    g.github = Object.assign({}, g.github, { container: repo });
    await chrome.storage.local.set({ tb_tracker_prefs_v1: g });
  }, REPO);
  const pageSide = await page.evaluate(() => document.documentElement.outerHTML.replace(/https:\/\/github\.com\/[^"' <]+/g, "") +
    JSON.stringify(localStorage) + (document.documentElement.getAttribute("data-tb-caps") || ""));
  check("…nothing remembered reaches the page (no repo, no picks, no store)",
    !pageSide.includes("acme/") && !pageSide.includes("tb_tracker_sites"));
  // The worker's rules, run in the worker itself.
  const rules = await sw.evaluate(async (origin) => {
    const prefsBefore = (await chrome.storage.local.get("tb_tracker_prefs_v1")).tb_tracker_prefs_v1;
    const intsBefore = (await chrome.storage.local.get("tb_integrations_v1")).tb_integrations_v1;
    const before = JSON.stringify((await chrome.storage.local.get("tb_tracker_sites_v1")).tb_tracker_sites_v1 || {});
    await rememberForSite({ origin: "https://private.example", incognito: true }, "github", "token:", "acme/secret", {});
    const afterPrivate = JSON.stringify((await chrome.storage.local.get("tb_tracker_sites_v1")).tb_tracker_sites_v1 || {});
    await rememberForSite({ origin: "https://app.example/some/path?q=1", incognito: false }, "github", "token:", "acme/api", {});
    for (let i = 0; i < 205; i++) await rememberForSite({ origin: `https://s${i}.example`, incognito: false }, "github", "token:", "acme/api", {});
    const all = (await chrome.storage.local.get("tb_tracker_sites_v1")).tb_tracker_sites_v1 || {};
    const capped = Object.keys(all).length;
    const keptNewest = !!all["https://s204.example"] && !all["https://s0.example"];
    await disconnectTracker(providerApi(), providerApi().trackerAdapter("github"), false);
    const afterDisconnect = (await chrome.storage.local.get("tb_tracker_sites_v1")).tb_tracker_sites_v1 || {};
    // Disconnect also cleared the default repo and (GitHub's one connection)
    // the token; the next legs need both back.
    await chrome.storage.local.set({ tb_tracker_prefs_v1: prefsBefore, tb_integrations_v1: intsBefore });
    return { privateUnchanged: before === afterPrivate, originOnly: !JSON.stringify(all).includes("/some/path"), capped, keptNewest,
      cleared: !Object.keys(afterDisconnect).length, ownSiteBack: origin };
  }, SITE_ORIGIN);
  check("…private windows store nothing", rules.privateUnchanged);
  check("…only the origin is kept, never the path", rules.originOnly);
  check("…at most 200 origins, the least recently used dropped", rules.capped === 200 && rules.keptNewest, JSON.stringify(rules));
  check("…disconnecting a tracker deletes its remembered picks", rules.cleared);

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

  // ══ 8b. One "Send to GitHub" button (U1/U2), the panel as its dropdown ═══
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
    return !a ? "none" : a.matches("[data-tb-create-panel] iframe") ? "frame" : a.hasAttribute("data-tb-split-main") ? "main" : a.tagName;
  });
  check("8b. the ticket has ONE Send to GitHub button — no ▾ half, no plug icon (U1/U2)",
    /Send to GitHub/.test(await page.textContent(`${SPLIT} [data-tb-split-main]`)) && !(await page.$(`${SPLIT} [data-tb-split-caret]`)) &&
    (await page.$$(`${SPLIT} button`)).length === 1 && !(await page.$('#tracebug-quick-bug-modal [data-action="tracker-status"]')));
  check('…it says aria-haspopup="dialog", collapsed, Alt+Down in its shortcuts and tooltip',
    (await page.$$eval(`${SPLIT} [aria-haspopup]`, (b) => b.map((x) => x.getAttribute("aria-haspopup")).join(","))) === "dialog" &&
    (await expanded()) === "false" && (await page.getAttribute(`${SPLIT} [data-tb-split-main]`, "aria-keyshortcuts")) === "Alt+ArrowDown" &&
    /GitHub · connected \(Alt\+↓: choose where to send\)/.test(await page.getAttribute(`${SPLIT} [data-tb-split-main]`, "title")));

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
    check("…aria-expanded is true", (await expanded()) === "true");
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
    check("…aria-expanded back to false", (await expanded()) === "false");
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

  // The button by mouse; Tab past the last control closes it and focus returns to the button.
  await page.click(`${SPLIT} [data-tb-split-main]`);
  const fc = await panelFrame();
  check("…clicking the button opens the panel, the tracker choice inside it", !!fc && (await fc.inputValue("#tracker")) === "github");
  if (fc) {
    await fc.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).catch(() => {});
    await fc.focus("#send");
    await page.keyboard.press("Tab");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Tab past Create closes the panel", await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")));
    check("…and focus returns to the button", (await pageFocus()) === "main", await pageFocus());
    check("…nothing was filed by closing it", (await pending()).length === 0);
  }

  // B4: closing the ticket closes the panel first — never over the confirm.
  await page.click(`${SPLIT} [data-tb-split-main]`);
  const fb4 = await panelFrame();
  if (fb4) {
    await page.click('#tracebug-quick-bug-modal [data-action="close"]');
    await page.waitForSelector("#tb-qb-close-confirm", { timeout: 5000 }).catch(() => {});
    check("…closing the ticket (✕) closes the panel first; the confirm stands alone (B4)",
      await page.evaluate(() => !document.querySelector("[data-tb-create-panel]")) && await page.isVisible("#tb-qb-close-confirm"));
    check("…and the panel's request is cancelled, nothing filed", await (async () => { await sleep(500); return (await pending()).length === 0; })());
    await page.click('#tb-qb-close-confirm [data-cc="keep"]');
  } else check("…closing the ticket (✕) closes the panel first (B4)", false, "no panel");

  // The Integrations hub is reached from inside the panel now.
  await page.click(`${SPLIT} [data-tb-split-main]`);
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

  // ══ 8c. Room below the button → the panel drops down ══════════════════════
  await page.addStyleTag({ content: "#tracebug-quick-bug-modal .tb-qb-footer { order: -1 !important; }" }).then((h) => h.evaluate((el) => { el.id = "__footerTop"; }));
  await sleep(300);
  await page.click(`${SPLIT} [data-tb-split-main]`);
  const fd = await panelFrame();
  if (fd) {
    await sleep(400);
    const g = await page.evaluate((sel) => {
      const sl = document.querySelector("[data-tb-create-panel]");
      return { place: sl.getAttribute("data-place"), below: sl.getBoundingClientRect().top >= document.querySelector(sel).getBoundingClientRect().bottom - 1 };
    }, SPLIT);
    check("8c. with the button near the top, the panel opens downward", g.place === "down" && g.below, JSON.stringify(g));
    check("…and Create still arms there",
      await fd.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 6000 }).then(() => true, () => false));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
  } else check("8c. with the button near the top, the panel opens downward", false, "no panel");
  await page.evaluate(() => document.getElementById("__footerTop").remove());

  // ══ 8d. A ~400 px tall window: the panel scrolls inside, Create stays reachable ═
  await page.setViewportSize({ width: 1280, height: 400 });
  await sleep(400);
  await page.focus(`${SPLIT} [data-tb-split-main]`);
  await page.keyboard.press("Enter");
  const fs4 = await panelFrame();
  if (fs4) {
    await sleep(500);
    const g4 = await page.evaluate(() => {
      const r = document.querySelector("[data-tb-create-panel] iframe").getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight };
    });
    check("8d. at 400 px tall the panel stays inside the window", g4.top >= 0 && g4.bottom <= g4.vh, JSON.stringify(g4));
    check("…and scrolls inside (content taller than the panel)",
      await fs4.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 4),
      await fs4.evaluate(() => `${document.documentElement.scrollHeight} > ${window.innerHeight}`));
    check("…with Create reachable: it arms and takes focus",
      await fs4.waitForFunction(() => !document.getElementById("send").disabled && document.activeElement && document.activeElement.id === "send", null, { timeout: 6000 }).then(() => true, () => false));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("[data-tb-create-panel]"), null, { timeout: 5000 }).catch(() => {});
    check("…Esc closes it and focus returns to the button", (await pageFocus()) === "main", await pageFocus());
  } else check("8d. at 400 px tall the panel stays inside the window", false, "no panel");
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(300);

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

  // ══ 12b. A site that blocks the clipboard (Permissions-Policy) ═══════════
  const noclip = await ctx.newPage();
  await noclip.goto(`http://localhost:${PORT}/noclip.html`, { waitUntil: "load" });
  await sleep(300);
  await inject(noclip, GLOB.replace("/*", "/noclip.html"));
  await noclip.fill("#coupon", "SAVE20");
  await openTicket(noclip, "#orderBtn", "No-clipboard site ticket");
  await noclip.click('#tracebug-quick-bug-modal [data-action="add-screenshot"]').catch(() => {});
  await sleep(600);
  await noclip.mouse.move(120, 120);
  await noclip.mouse.down();
  await noclip.mouse.move(420, 320, { steps: 8 });
  await noclip.mouse.up();
  await noclip.waitForSelector("#tracebug-quick-bug-modal [data-delete-screenshot]", { state: "attached", timeout: 10000 }).catch(() => {});
  await noclip.waitForSelector('#tracebug-quick-bug-modal [data-action="open-github"]', { state: "visible", timeout: 10000 }).catch(() => {});
  const f12b = (await sendToGitHub(noclip)).frame;
  check("12b. a site with Permissions-Policy clipboard-write=() still gets the panel", !!f12b);
  if (f12b) {
    await f12b.waitForFunction(() => !document.getElementById("send").disabled, null, { timeout: 8000 }).catch(() => {});
    await f12b.click("#send");
    await f12b.waitForSelector("#doneBox:not([hidden])", { timeout: 10000 }).catch(() => {});
    const blocked = await f12b.evaluate(() => document.featurePolicy ? !document.featurePolicy.allowsFeature("clipboard-write") : null);
    check("…the site's policy reaches our frame (clipboard-write blocked there)", blocked === true, String(blocked));
    await f12b.click("#copyShot"); // the real clipboard, not a stub
    await f12b.waitForFunction(() => document.getElementById("panelMsg").textContent.trim() !== "", null, { timeout: 5000 }).catch(() => {});
    const msg12b = (await f12b.textContent("#panelMsg")).trim();
    check("…Copy screenshot says it couldn't copy on this site (not silent)",
      msg12b === "This site blocks copying. Use Download screenshot instead.", msg12b);
    check("…and Download screenshot is right there", await f12b.isVisible("#downloadShot") &&
      /^blob:/.test(await f12b.getAttribute("#downloadShot", "href")));
  }
  await noclip.close();

  // ══ 13. Script-tag SDK (no extension, no panel): toast + the issue in a new tab ══
  const sdkPage = await ctx.newPage();
  await sdkPage.goto(SITE, { waitUntil: "load" });
  await sdkPage.evaluate((t) => localStorage.setItem("tracebug_integrations", JSON.stringify({ github: { token: t, repo: "acme/api" } })), TOKEN);
  await sdkPage.evaluate(() => { const sc = document.createElement("script"); sc.src = "/tracebug-sdk.js"; document.body.appendChild(sc); });
  await sdkPage.waitForFunction(() => !!window.TraceBug, null, { timeout: 15000 });
  await sdkPage.evaluate(() => window.TraceBug.init({ projectId: "inpage-panel-sdk", enabled: "all" }));
  await sleep(500);
  await sdkPage.evaluate(() => { try { window.TraceBug.startEventsCapture && window.TraceBug.startEventsCapture(); } catch (e) {} });
  await sdkPage.fill("#coupon", "SAVE20");
  await sdkPage.click("#orderBtn");
  await sleep(600);
  await sdkPage.keyboard.press("Control+Shift+KeyB");
  await sdkPage.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
  await sleep(800);
  check("13. script-tag SDK: no split button and no panel (the extension isn't involved)",
    !(await sdkPage.$("#tracebug-quick-bug-modal [data-tb-send-split]")));
  const before13 = posts.length;
  const tabP13 = ctx.waitForEvent("page", { timeout: 8000 }).catch(() => null);
  await sdkPage.locator('#tracebug-quick-bug-modal [data-action="open-github"], #tracebug-quick-bug-modal [data-action="github"]').first().click();
  const tab13 = await tabP13;
  // The toast lives in the SDK's shadow root: look for it there.
  const toast13 = () => sdkPage.evaluate(() => {
    let hit = null;
    const walk = (r) => r.querySelectorAll("*").forEach((e) => {
      if (!hit && e.dataset && e.dataset.tracebug === "toast") hit = e;
      if (e.shadowRoot) walk(e.shadowRoot);
    });
    walk(document);
    const a = hit && hit.querySelector("a");
    return hit ? { text: hit.textContent, href: a && a.href, target: a && a.target, rel: a && a.rel, link: a && a.textContent } : null;
  });
  let t13 = null;
  for (let i = 0; i < 20 && !(t13 && /issue created/.test(t13.text)); i++) { await sleep(200); t13 = await toast13(); }
  check("…filing shows the toast with the issue number", posts.length === before13 + 1 && !!t13 &&
    t13.text === `✓ GitHub issue created #${nextNumber - 1}`, JSON.stringify(t13));
  const link13 = t13 && t13.href ? { href: t13.href, target: t13.target, rel: t13.rel, text: t13.link } : null;
  check("…and the number is a real link (new tab, no opener)", !!link13 && link13.href.endsWith(`/acme/api/issues/${nextNumber - 1}`) &&
    link13.target === "_blank" && /noopener/.test(link13.rel) && link13.text === `#${nextNumber - 1}`, JSON.stringify(link13));
  check("…and opens the issue in a new tab", !!tab13 && tab13.url().includes(`/acme/api/issues/${nextNumber - 1}`), tab13 ? tab13.url() : "no tab");
  check("…and no panel frame appeared", !sdkPage.frames().some((f) => f.url().includes("/create-issue.html")));
  if (tab13) await tab13.close().catch(() => {});
} finally {
  await ctx.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
