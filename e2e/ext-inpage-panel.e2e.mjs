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
    check("…and Create arms once it is scrolled fully into view", await armed(f9));
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
