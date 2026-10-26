// Run: node e2e/ext-trusted-types-page.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// Found by hand-testing: on a page that enforces Trusted Types CSP, every raw
// `el.innerHTML = htmlString` throws synchronously ("This document requires
// 'TrustedHTML' assignment"), since that CSP directive gates the
// innerHTML/outerHTML/insertAdjacentHTML sinks. That broke mounting the
// compact toolbar, the dashboard, the recording HUD and the ticket modal —
// all built markup with raw innerHTML assignments.
//
// DOMParser and Range.createContextualFragment are ALSO gated sinks (an
// earlier version of this fix assumed DOMParser was exempt and was wrong —
// confirmed by hand against a real CSP-enforcing fixture). The actual fix,
// src/ui/helpers.ts's setInnerHTML(), registers TraceBug's own Trusted Types
// policy and writes through that.
//
// Two fixtures:
//   - REALISTIC: `require-trusted-types-for 'script'` with no `trusted-types`
//     allow-list directive — confirmed via `curl -sD -` against
//     stitch.withgoogle.com's real response headers, the exact site this bug
//     was found on. Any policy name, ours included, is accepted here, so the
//     dashboard must mount fully and work normally.
//   - ADVERSARIAL: a `trusted-types` directive that also locks the policy
//     name allow-list to something that isn't ours. No string-to-HTML path
//     exists here at all; the fix can only degrade safely (no uncaught error,
//     no half-built DOM) — it can't make rich markup render.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const PORT = 4307;

const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Trusted Types fixture</title></head>
<body>
  <h1>Checkout</h1>
  <button id="pay">Pay now</button>
  <script>
    document.getElementById("pay").addEventListener("click", () => {
      fetch("/api/charge", { method: "POST" }).catch(() => {});
      console.error("TypeError: Cannot read properties of undefined (reading 'total')");
    });
  </script>
</body></html>`;

const VERBOSE = process.argv.includes("--verbose");
let failures = 0, passes = 0, _streaming = VERBOSE;
const _held = [];
const check = (name, ok, extra = "") => {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`;
  if (ok) passes++; else { failures++; _streaming = true; }
  if (!_streaming) { _held.push(line); return; }
  while (_held.length) console.log(_held.shift());
  console.log(line);
};
const total = () => `${passes}/${passes + failures} checks passed`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve(csp) {
  return createServer((req, res) => {
    if (req.url.startsWith("/api/")) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end('{"error":"charge failed"}');
      return;
    }
    res.writeHead(200, { "content-type": "text/html", "content-security-policy": csp });
    res.end(FIXTURE);
  });
}

// ── Scenario 1: the real-world CSP (stitch.withgoogle.com's own headers) ───
try {
  const EXT = withGrantedHostAccess(EXT_SRC_DIR, "trusted-types-realistic");
  const server = serve("require-trusted-types-for 'script'");
  await new Promise((r) => server.listen(PORT, r));
  const userDir = mkdtempSync(join(tmpdir(), "tb-tt-realistic-"));
  const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  ]));
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(300);

    const cspActuallyBlocks = await page.evaluate(() => {
      try { document.createElement("div").innerHTML = "<span></span>"; return false; }
      catch { return true; }
    });
    check("[realistic] the fixture genuinely enforces Trusted Types", cspActuallyBlocks);

    await sw.evaluate(async (port) => {
      const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
      return handleComboAction({
        type: "TB_START_RECORDING", tabId: tab.id,
        video: false, withMic: false, blurFirst: false, delaySec: 0,
      }, {});
    }, PORT);
    await sleep(1000);

    const hud = await page.evaluate(() => ({
      present: !!document.getElementById("tracebug-recording-hud"),
      stopBtn: !!document.querySelector('#tracebug-recording-hud [data-tb-hud="stop"]'),
    }));
    check("[realistic] the recording HUD mounted with real controls", hud.present && hud.stopBtn, JSON.stringify(hud));
    check("[realistic] no uncaught TrustedHTML error",
      !pageErrors.some((e) => /TrustedHTML/i.test(e)), JSON.stringify(pageErrors));

    await page.click("#pay");
    await sleep(800);
    await page.evaluate(() => {
      document.querySelector('[data-tb-hud="stop"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await sleep(2000);

    const modal = await page.evaluate(() => {
      const el = document.getElementById("tracebug-quick-bug-modal");
      return {
        present: !!el,
        hasContent: !!el && el.textContent.trim().length > 50,
        titleInput: !!document.getElementById("tb-qb-title"),
      };
    });
    check("[realistic] the ticket modal opened with real content", modal.present && modal.hasContent, JSON.stringify(modal));
    check("[realistic] the title field is there, not just an empty shell", modal.titleInput);
    check("[realistic] still no uncaught TrustedHTML error after opening the ticket",
      !pageErrors.some((e) => /TrustedHTML/i.test(e)), JSON.stringify(pageErrors));
  } finally {
    await ctx.close().catch(() => {});
    server.close();
  }
} catch (err) {
  console.error("[realistic] scenario error:", err);
  failures++;
}

// ── Scenario 2: adversarial CSP — policy names also locked down ────────────
try {
  const EXT = withGrantedHostAccess(EXT_SRC_DIR, "trusted-types-adversarial");
  const server = serve("require-trusted-types-for 'script'; trusted-types nonexistent-policy");
  await new Promise((r) => server.listen(PORT, r));
  const userDir = mkdtempSync(join(tmpdir(), "tb-tt-adversarial-"));
  const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  ]));
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(300);

    const policyBlocked = await page.evaluate(() => {
      try { window.trustedTypes.createPolicy("tracebug-html", { createHTML: (s) => s }); return false; }
      catch { return true; }
    });
    check("[adversarial] the fixture also refuses an unlisted policy name", policyBlocked);

    const started = await sw.evaluate(async (port) => {
      const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
      return handleComboAction({
        type: "TB_START_RECORDING", tabId: tab.id,
        video: false, withMic: false, blurFirst: false, delaySec: 0,
      }, {}).then(() => ({ ok: true })).catch((e) => ({ ok: false, error: String(e && e.message) }));
    }, PORT);
    await sleep(1000);

    // No usable string-to-HTML path exists on this page at all. The bar here
    // is "doesn't crash the extension or the host page" — not "renders a
    // full toolbar", which would need a plain-DOM-API rewrite this fix
    // doesn't attempt.
    check("[adversarial] starting a capture doesn't throw out to the caller", started.ok === true, JSON.stringify(started));
    check("[adversarial] no uncaught TrustedHTML error reaches the page",
      !pageErrors.some((e) => /TrustedHTML/i.test(e)), JSON.stringify(pageErrors));
  } finally {
    await ctx.close().catch(() => {});
    server.close();
  }
} catch (err) {
  console.error("[adversarial] scenario error:", err);
  failures++;
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
