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
// The fix: src/ui/helpers.ts's createStyleTag() borrows the nonce the host
// page already used on one of its own inline <script>/<style>/<link> tags —
// readable via the `.nonce` IDL property, which browsers deliberately expose
// to trusted script even though they hide it from getAttribute/outerHTML.
//
// Scope: this only fixes `style-src-elem` violations (<style> elements/
// blocks), which is what createStyleTag() and the 17 call sites migrated to
// it cover. It deliberately does NOT fix `style-src-attr` violations (inline
// `style="..."` HTML attributes on arbitrary elements, used throughout the
// HUD/toolbar/overlays via setAttribute("style", ...)) — a CSP this strict
// has no nonce or hash mechanism for those at all without `unsafe-hashes`,
// the only fix is rewriting each call site to the CSSOM (`el.style.prop =`),
// which doesn't go through CSP's inline-style gate. That is a much larger,
// separate pass (comparable in scope to the Trusted Types innerHTML sweep)
// and is NOT attempted here — this test asserts zero style-ELEMENT
// violations and reports (without failing on) any attribute violations, so a
// future attribute-sweep fix has a place to tighten this test further.
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
    // Informational, not a failure — see the file header. Logs the count so a
    // future attribute-sweep fix has a number to drive toward zero.
    console.log(`  (info) ${attrViolations.length} style-ATTRIBUTE violation(s) during mount — known, out of scope here`);

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
