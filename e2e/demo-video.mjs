// Run: node e2e/demo-video.mjs
// Produces an HONEST, editor-style demo of the REAL product via Playwright's
// built-in recorder — animated title intro, kinetic lower-third captions, a top
// progress bar, and black-dip scene transitions. No mockups.
//   intro → bug → Ctrl+Shift+B capture → evidence → hand-off → live /proof → outro
// It also writes marks.json (timestamped narration beats) so demo-audio can lay
// a synced voiceover under it. Output: D:/tmp/tracebug-video/demo.webm (1280x800).
import { chromium } from "playwright";
import { readFileSync, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "website", "public");
const OUT = "D:/tmp/tracebug-video";
mkdirSync(OUT, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webm": "video/webm", ".png": "image/png", ".svg": "image/svg+xml" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" });
  res.end(readFileSync(p));
});
await new Promise((r) => server.listen(4179, r));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
const wait = (ms) => page.waitForTimeout(ms);

// ── Narration beats: recorded with wall-clock offsets so the VO stays in sync ──
let recStart = 0;
const marks = [];
function mark(id) { marks.push({ id, t: (Date.now() - recStart) / 1000 }); }

// Inject the reusable style + caption/transition helpers into the current DOM.
// Re-run after every navigation (nav wipes it). Safe to call repeatedly: it also
// re-appends the chrome layer to the end of <body> so it stays ABOVE the Quick
// Bug modal (a max-z-index overlay) — for equal z-index, DOM order wins.
async function injectChrome(elapsedMs = 0) {
  await page.evaluate((elapsed) => {
    // Our overlay layer lives as a child of <html> AFTER <body>. The Quick Bug
    // modal auto-saves and re-appends itself inside <body>, but that never
    // changes <html>'s child order — so this layer stays on top permanently.
    if (!document.getElementById("__top__")) {
      const top = document.createElement("div");
      top.id = "__top__";
      top.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
      document.documentElement.appendChild(top);
    }
    if (document.getElementById("__tbstyle__")) return;
    const s = document.createElement("style");
    s.id = "__tbstyle__";
    s.textContent = `
      @keyframes __capIn { from { opacity:0; transform:translateY(26px) } to { opacity:1; transform:translateY(0) } }
      @keyframes __barIn { from { transform:scaleX(0) } to { transform:scaleX(1) } }
      #__cap__ { position:fixed; left:0; right:0; bottom:44px; z-index:2147483647;
        display:flex; justify-content:center; pointer-events:none; }
      #__cap__ .box { display:inline-flex; align-items:center; gap:16px;
        background:rgba(11,11,16,.82); backdrop-filter:blur(8px);
        border:1px solid rgba(129,140,248,.35); border-radius:14px;
        padding:16px 26px 16px 20px; box-shadow:0 18px 50px rgba(0,0,0,.5);
        animation:__capIn .5s cubic-bezier(.16,1,.3,1) both; }
      #__cap__ .bar { width:5px; align-self:stretch; border-radius:3px;
        background:linear-gradient(#818CF8,#4F46E5); }
      #__cap__ .txt { color:#EAECF3; font:600 27px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        letter-spacing:-.01em; }
      #__prog__ { position:fixed; top:0; left:0; height:4px; z-index:2147483647;
        width:100%; transform-origin:left; transform:scaleX(0);
        background:linear-gradient(90deg,#818CF8,#4F46E5); }
      #__wm__ { position:fixed; right:18px; top:16px; z-index:2147483647;
        display:flex; align-items:center; gap:8px; opacity:.9;
        font:700 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:#EAECF3;
        text-shadow:0 1px 6px rgba(0,0,0,.6); pointer-events:none; }
      #__wm__ .m { width:20px; height:20px; border-radius:6px;
        background:linear-gradient(135deg,#16163E,#0B0B10); display:inline-flex;
        align-items:center; justify-content:center; }
      #__dip__ { position:fixed; inset:0; z-index:2147483647; background:#0B0B10;
        opacity:0; transition:opacity .45s ease; pointer-events:none; }
    `;
    document.head.appendChild(s);

    if (!document.getElementById("__chrome__")) {
      const layer = document.createElement("div");
      layer.id = "__chrome__";
      const wm = document.createElement("div");
      wm.id = "__wm__";
      wm.innerHTML = `<span class="m"><svg width="13" height="13" viewBox="0 0 96 96"><path d="M30 33 L47 48 L30 63" fill="none" stroke="#EAECF3" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><rect x="52" y="41" width="14" height="14" rx="4" fill="#818CF8"/></svg></span>TraceBug`;
      const pr = document.createElement("div");
      pr.id = "__prog__";
      layer.appendChild(wm);
      layer.appendChild(pr);
      document.getElementById("__top__").appendChild(layer);
      // Drive the top progress bar with a JS ticker. `elapsed` carries the
      // clip time across navigations (window is wiped on nav) so the bar keeps
      // advancing instead of resetting. ~40s total estimate.
      window.__tbT0 = performance.now() - elapsed;
      const tick = () => {
        const el = document.getElementById("__prog__");
        if (!el) return;
        el.style.transform = "scaleX(" + Math.min(1, (performance.now() - window.__tbT0) / 40000) + ")";
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    if (!document.getElementById("__dip__")) {
      const d = document.createElement("div");
      d.id = "__dip__";
      document.getElementById("__top__").appendChild(d);
    }
  }, elapsedMs);
}

// Animated caption (kinetic lower-third). Re-triggers the entrance each call.
async function caption(text) {
  await page.evaluate((t) => {
    const old = document.getElementById("__cap__");
    if (old) old.remove();
    const c = document.createElement("div");
    c.id = "__cap__";
    c.innerHTML = `<div class="box"><div class="bar"></div><div class="txt"></div></div>`;
    c.querySelector(".txt").textContent = t;
    (document.getElementById("__top__") || document.body).appendChild(c);
  }, text);
}

// Black-dip transition: fade to black, then (after the caller navigates) fade back.
async function dipOut() { await page.evaluate(() => { const d = document.getElementById("__dip__"); if (d) d.style.opacity = "1"; }); await wait(480); }
async function dipIn() {
  await injectChrome(Date.now() - recStart);
  // Start the freshly-loaded page fully black, then fade to reveal (hides the
  // new page's load flash).
  await page.evaluate(() => {
    const d = document.getElementById("__dip__");
    if (!d) return;
    d.style.transition = "none"; d.style.opacity = "1"; void d.offsetWidth;
    d.style.transition = "opacity .45s ease";
    requestAnimationFrame(() => { d.style.opacity = "0"; });
  });
  await wait(480);
}

try {
  // ── 0:00 Animated title intro ────────────────────────────────────────────
  recStart = Date.now();
  await page.goto("http://localhost:4179/try.html", { waitUntil: "load" });
  await page.evaluate(() => {
    const ov = document.createElement("div");
    ov.id = "__intro__";
    ov.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:22px;text-align:center;" +
      "background:radial-gradient(1200px 700px at 50% 35%,#16163E 0%,#0B0B10 60%);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;";
    ov.innerHTML = `
      <style>
        @keyframes __logoIn { from{opacity:0;transform:scale(.6) translateY(10px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes __wordIn { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
        @keyframes __lineIn { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes __subIn  { from{opacity:0} to{opacity:1} }
        /* Hide the live app's own capture toolbar while the title card shows. */
        [id^="tracebug-"],[id^="bt-"],[class*="tb-hud"],[class*="tb-rs"],[class*="tb-qb"]{visibility:hidden!important}
      </style>
      <div style="width:96px;height:96px;border-radius:26px;background:linear-gradient(135deg,#16163E,#0B0B10);
                  box-shadow:0 20px 60px rgba(79,70,229,.45),0 0 0 1px rgba(129,140,248,.25) inset;
                  display:flex;align-items:center;justify-content:center;animation:__logoIn .8s cubic-bezier(.16,1,.3,1) both">
        <svg width="56" height="56" viewBox="0 0 96 96"><path d="M30 33 L47 48 L30 63" fill="none" stroke="#EAECF3" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><rect x="52" y="41" width="14" height="14" rx="4" fill="#818CF8"/></svg>
      </div>
      <div style="font-size:64px;font-weight:800;letter-spacing:-.03em;animation:__wordIn .7s .25s cubic-bezier(.16,1,.3,1) both">TraceBug</div>
      <div style="height:4px;width:220px;border-radius:3px;background:linear-gradient(90deg,#818CF8,#4F46E5);transform-origin:center;animation:__lineIn .7s .5s cubic-bezier(.16,1,.3,1) both"></div>
      <div style="font-size:26px;color:#A8AEC4;font-weight:600;animation:__subIn 1s .8s both">Capture the bug. Let AI fix it.</div>`;
    document.body.appendChild(ov);
  });
  mark("intro");
  await wait(3600);
  // Fade the intro away to reveal the live app.
  await page.evaluate(() => { const i = document.getElementById("__intro__"); if (i) { i.style.transition = "opacity .6s ease"; i.style.opacity = "0"; } });
  await wait(700);
  await page.evaluate(() => { const i = document.getElementById("__intro__"); if (i) i.remove(); });
  await injectChrome(Date.now() - recStart);

  // ── The bug ──────────────────────────────────────────────────────────────
  await page.evaluate(() => window.TraceBug.startRecording());
  await caption("A bug just happened.");
  mark("bug");
  await wait(700);
  for (const sel of ["#applyBtn", "#orderBtn"]) {
    try { await page.click(sel, { timeout: 2000 }); } catch {}
    await wait(900);
  }
  await wait(2200);

  // ── Capture ────────────────────────────────────────────────────────────────
  await caption("One shortcut captures everything that broke.");
  mark("capture");
  await page.keyboard.press("Control+Shift+KeyB");
  try {
    await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
    const addShot = await page.$('#tracebug-quick-bug-modal [data-action="add-screenshot"]');
    if (addShot) {
      await addShot.click();
      await wait(900);
      await page.mouse.move(340, 200); await page.mouse.down();
      await page.mouse.move(1050, 560, { steps: 8 }); await page.mouse.up();
      await page.waitForSelector("#tracebug-quick-bug-modal", { timeout: 8000 });
    }
  } catch {}
  await injectChrome(); // re-append chrome above the just-opened modal
  await wait(2600);

  // ── The evidence ─────────────────────────────────────────────────────────
  await caption("Not a screenshot — the actual evidence.");
  mark("evidence");
  for (const tab of ["Console", "Network", "Actions"]) {
    try {
      await page.locator("#tracebug-quick-bug-modal").getByText(tab, { exact: true }).first().click({ timeout: 1500 });
      await wait(1700);
    } catch { await wait(900); }
  }

  // ── Hand it to the agent ───────────────────────────────────────────────────
  await caption("Hand it to your AI agent — one command.");
  mark("handoff");
  await page.evaluate(() => {
    const el = document.createElement("div");
    el.id = "__cmd__";
    el.style.cssText =
      "position:fixed;left:50%;top:46%;transform:translate(-50%,-50%) scale(.92);z-index:2147483647;opacity:0;" +
      "transition:opacity .45s ease, transform .45s cubic-bezier(.16,1,.3,1);" +
      "background:#0B0B10;color:#EAECF3;border:1px solid #26262E;border-radius:12px;" +
      "padding:22px 26px;font:600 21px ui-monospace,Menlo,Consolas,monospace;" +
      "box-shadow:0 24px 70px rgba(0,0,0,.6);";
    el.innerHTML = `<span style="color:#6EE7B7">$ </span>claude mcp add tracebug -- npx -y tracebug mcp`;
    (document.getElementById("__top__") || document.body).appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "translate(-50%,-50%) scale(1)"; });
  });
  await wait(3600);

  // ── The real proof (live page) ─────────────────────────────────────────────
  await dipOut();
  let proofOk = false;
  try {
    await page.goto("https://tracebug.dev/proof", { waitUntil: "domcontentloaded", timeout: 15000 });
    await dipIn();
    proofOk = true;
    await caption("It reads the real evidence and finds the root cause.");
    mark("proof");
    await wait(600);
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy({ top: 420, behavior: "smooth" }));
      await wait(1400);
    }
  } catch {
    await injectChrome();
  }

  // ── Animated outro ─────────────────────────────────────────────────────────
  await dipOut();
  await page.evaluate(() => {
    document.getElementById("__dip__")?.remove();
    document.getElementById("__cap__")?.remove();
    const el = document.createElement("div");
    el.id = "__outro__";
    el.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;" +
      "align-items:center;justify-content:center;gap:18px;text-align:center;" +
      "background:radial-gradient(1200px 700px at 50% 40%,#16163E 0%,#0B0B10 60%);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;";
    el.innerHTML = `
      <style>@keyframes __oIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}</style>
      <div style="width:76px;height:76px;border-radius:22px;background:linear-gradient(135deg,#16163E,#0B0B10);
           box-shadow:0 0 0 1px rgba(129,140,248,.25) inset;display:flex;align-items:center;justify-content:center;animation:__oIn .6s both">
        <svg width="44" height="44" viewBox="0 0 96 96"><path d="M30 33 L47 48 L30 63" fill="none" stroke="#EAECF3" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><rect x="52" y="41" width="14" height="14" rx="4" fill="#818CF8"/></svg>
      </div>
      <div style="font-size:50px;font-weight:800;letter-spacing:-.02em;animation:__oIn .6s .12s both">Capture the bug. Let AI fix it.</div>
      <div style="font-size:26px;color:#818CF8;font-weight:700;animation:__oIn .6s .24s both">tracebug.dev</div>
      <div style="font-size:17px;color:#A1A1AA;animation:__oIn .6s .36s both">Free · MIT · local-first · no backend</div>`;
    document.body.appendChild(el);
  });
  mark("outro");
  await wait(6200); // hold long enough for the closing VO to play at natural speed
} catch (err) {
  console.error("recording error:", err);
} finally {
  const video = page.video();
  await context.close(); // finalizes the .webm
  await browser.close();
  server.close();
  writeFileSync(join(OUT, "marks.json"), JSON.stringify(marks, null, 2));
  if (video) {
    const raw = await video.path();
    const final = join(OUT, "demo.webm");
    try { renameSync(raw, final); } catch { /* leave raw name */ }
    console.log("VIDEO:", existsSync(final) ? final : raw);
  }
  console.log("MARKS:", JSON.stringify(marks));
}
