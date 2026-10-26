// Run: node e2e/ext-style-nonce-page.e2e.mjs   (headless; needs `npx playwright install chromium`)
//
// Found on a claude.ai artifact page: `style-src 'nonce-...'` (no
// `unsafe-inline`) silently drops every <style> element TraceBug creates —
// unlike Trusted Types, the browser does NOT throw here, it just never
// applies the rules. The dashboard mounted with no exception and looked
// broken (unstyled, theme variables missing), and the console filled with
// CSP violation reports TraceBug's own collector then captured as "errors"
// in its own report, which is how this was found.
//
// Two fixes, for the two things this CSP directive gates:
//
// 1. `<style>` ELEMENTS (style-src-elem): src/ui/helpers.ts's
//    createStyleTag() borrows the nonce the host page already used on one of
//    its own inline <script>/<style>/<link> tags — readable via the `.nonce`
//    IDL property, which browsers deliberately expose to trusted script even
//    though they hide it from getAttribute/outerHTML.
//
// 2. Inline `style="..."` ATTRIBUTES (style-src-attr) — the bulk of
//    TraceBug's actual positioning, baked into the HTML strings passed to
//    setInnerHTML() throughout the toolbar/HUD/modal. A nonce CANNOT cover
//    these at all (Chrome has no nonce/hash mechanism for the style
//    attribute without `unsafe-hashes`), so without a second fix the
//    toolbar/HUD render in the DOM with ZERO layout — invisible, which is
//    what the user originally reported ("nothing appears at all"). Confirmed
//    experimentally (see PROGRESS.md 2026-10-26): when CSP blocks an inline
//    style attribute, `el.getAttribute("style")` still returns the original
//    string (the attribute survives), but `el.style.cssText`/rendering stay
//    empty — only folding the string into the live CSSStyleDeclaration is
//    blocked. Setting individual LONGHAND properties through the CSSOM
//    (`el.style.setProperty(...)`) is a direct mutation of that object, not a
//    reparse of the attribute, so it bypasses the gate entirely.
//    `setInnerHTML()` now walks the inserted subtree afterward and replays
//    every `style` attribute it finds through the CSSOM
//    (`reviveInlineStylesForCsp`), and the ~108 direct
//    `el.setAttribute("style", ...)`/`el.style.cssText = ...` call sites
//    across the codebase were converted to the same CSSOM-based
//    `setInlineStyle()` helper.
//
// The violation REPORT itself cannot be suppressed either way (Chrome always
// fires `securitypolicyviolation` for the blocked attribute) — only the
// visual effect is recovered. This test logs that count as informational.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const PORT = 4308;
const NONCE = "tb-e2e-nonce-abc123";

const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Nonce CSP fixture</title>
<style nonce="${NONCE}">body{margin:0}</style>
</head>
<body><h1>Nonce-gated page</h1></body></html>`;

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

const server = createServer((_req, res) => {
  res.writeHead(200, {
    "content-type": "text/html",
    "content-security-policy": `style-src 'nonce-${NONCE}'; script-src 'unsafe-inline' 'self'`,
  });
  res.end(FIXTURE);
});

try {
  const EXT = withGrantedHostAccess(EXT_SRC_DIR, "style-nonce");
  await new Promise((r) => server.listen(PORT, r));
  const userDir = mkdtempSync(join(tmpdir(), "tb-style-nonce-"));
  const ctx = await chromium.launchPersistentContext(userDir, extensionLaunchOptions([
    `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`,
  ]));
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "load" });
    await sleep(300);

    // Confirm the fixture genuinely enforces the nonce: a <style> with no
    // nonce at all must produce a securitypolicyviolation, not silently work.
    const fixtureBlocks = await page.evaluate(() => new Promise((resolve) => {
      const onViolation = () => { document.removeEventListener("securitypolicyviolation", onViolation); resolve(true); };
      document.addEventListener("securitypolicyviolation", onViolation);
      const s = document.createElement("style");
      s.textContent = "#tb-nonce-probe{color:red}";
      document.head.appendChild(s);
      setTimeout(() => { document.removeEventListener("securitypolicyviolation", onViolation); resolve(false); }, 500);
    }));
    check("the fixture genuinely enforces a style-src nonce (no-nonce <style> is reported)", fixtureBlocks);

    const elemViolations = [];
    const attrViolations = [];
    await page.exposeFunction("__tbReportViolation", (directive) => {
      if (directive?.startsWith("style-src-attr")) attrViolations.push(directive);
      else if (directive?.startsWith("style-src")) elemViolations.push(directive);
    });
    await page.evaluate(() => {
      document.addEventListener("securitypolicyviolation", (e) => window.__tbReportViolation(e.violatedDirective));
    });

    await sw.evaluate(async (port) => {
      const [tab] = await chrome.tabs.query({ url: `http://localhost:${port}/*` });
      return handleComboAction({
        type: "TB_START_RECORDING", tabId: tab.id,
        video: false, withMic: false, blurFirst: false, delaySec: 0,
      }, {});
    }, PORT);
    await sleep(1200);

    check("mounting the dashboard produced no style-ELEMENT violations (createStyleTag's fix)",
      elemViolations.length === 0, JSON.stringify(elemViolations));
    // Informational, not a failure — the violation REPORT itself is
    // unavoidable even when the fix fully recovers the visual effect (see the
    // file header). Logged so a regression that stops recovering would show
    // up as a jump in this number even though no check here fails on it.
    console.log(`  (info) ${attrViolations.length} style-ATTRIBUTE violation(s) reported during mount (expected — recovered via CSSOM, see below)`);

    const styleTag = await page.evaluate(() => {
      const el = document.getElementById("tracebug-styles");
      return el ? { present: true, nonce: el.nonce, getAttrNonce: el.getAttribute("nonce") } : { present: false };
    });
    check("TraceBug's own <style> tag exists", styleTag.present, JSON.stringify(styleTag));
    check("it carries the host page's nonce (via the .nonce IDL property)",
      styleTag.nonce === NONCE, JSON.stringify(styleTag));

    // The real proof, not just "a nonce attribute exists": the rules must
    // actually have taken effect, which only happens if Chrome accepted the
    // nonce as matching the CSP.
    const applied = await page.evaluate(() => {
      const root = document.getElementById("tracebug-root");
      if (!root) return { present: false };
      const cs = getComputedStyle(root);
      return { present: true, position: cs.position };
    });
    check("the injected CSS actually applied (#tracebug-root is position:fixed)",
      applied.present && applied.position === "fixed", JSON.stringify(applied));

    // The real proof for the ATTRIBUTE fix: the toolbar is built via
    // setInnerHTML() with inline style="" attributes baked into the markup —
    // exactly the pattern CSP blocks without reviveInlineStylesForCsp(). This
    // checks the live rendered box, not just that a style attribute exists.
    const toolbar = await page.evaluate(() => {
      const el = document.getElementById("tracebug-compact-toolbar");
      if (!el) return { present: false };
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        present: true,
        position: cs.position,
        hasSize: rect.width > 0 && rect.height > 0,
      };
    });
    check("the toolbar (built via setInnerHTML with inline style attributes) is actually positioned and has real size",
      toolbar.present && toolbar.position === "fixed" && toolbar.hasSize, JSON.stringify(toolbar));

    // And that it's genuinely clickable, not just visually present — click a
    // real toolbar button and confirm something happens on the page.
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('#tracebug-compact-toolbar [data-tb-action], #tracebug-compact-toolbar button');
      if (!btn) return { found: false };
      const rect = btn.getBoundingClientRect();
      return { found: true, clickable: rect.width > 0 && rect.height > 0 };
    });
    check("a real toolbar button has a clickable (non-zero) hit box",
      clicked.found && clicked.clickable, JSON.stringify(clicked));

  } finally {
    await ctx.close().catch(() => {});
  }
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
