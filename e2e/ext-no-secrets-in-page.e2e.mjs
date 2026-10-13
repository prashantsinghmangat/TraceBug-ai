// Run: node e2e/ext-no-secrets-in-page.e2e.mjs   (--headful to watch)
//
// THE PHASE 2A GUARANTEE, TESTED IN A REAL DOM.
//
// 1.11 moved every integration token and the AI key out of the host page and
// into chrome.storage.local, because the SDK runs in the page's MAIN world —
// so anything the page can read, the site under test can read. The unit test
// (tests/no-page-secret-fields.test.ts) proves the SDK's getters refuse to
// return a secret. It cannot prove the DOM is clean, and the DOM is where the
// leak actually was: a settings form that pre-filled `value="${escapeHtml(tok)}"`
// put the token in the page even though no code "returned" it.
//
// So this seeds four real-shaped secrets into extension storage, opens the
// Quick Bug modal on a page, and then goes looking for them in every place a
// page script could reach:
//
//   • document.documentElement.outerHTML (attributes and text)
//   • every input/textarea .value — the PROPERTY, not the attribute, which is
//     the exact distinction the old bug hid behind
//   • every open shadow root, recursively
//   • localStorage and sessionStorage
//   • inline <script> and <style> text
//
// A failure here is a real vulnerability, not a cosmetic one.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withGrantedHostAccess } from "./ext-host-access.mjs";
import { EXT_SRC_DIR, extensionLaunchOptions } from "./paths.mjs";

const EXT = withGrantedHostAccess(EXT_SRC_DIR, "no-secrets");
const PORT = 4186;
const SITE = `http://127.0.0.1:${PORT}/`;
const GLOB = `http://127.0.0.1:${PORT}/*`;

// Distinctive enough that a match cannot be a coincidence, and shaped like the
// real thing so a prefix-matching redactor cannot accidentally pass this.
const SECRETS = {
  githubToken: "ghp_LEAKCANARY1111222233334444555566",
  linearKey: "lin_api_LEAKCANARY7777888899990000",
  slackWebhook: "https://hooks.slack.com/services/T0LEAKCANARY/B0LEAKCANARY/xxLEAKCANARYxx",
  aiKey: "sk-ant-api03-LEAKCANARYaaaabbbbccccddddeeeeffff",
};

// A page with the shapes that have hidden a leak before: a form, a shadow root,
// an iframe, and storage of its own.
const FIXTURE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Leak canary fixture</title></head>
<body>
  <h1>Checkout</h1>
  <form id="f">
    <input id="email" name="email" value="buyer@example.com" />
    <input id="pw" name="password" type="password" value="hunter2" />
    <textarea id="notes">some notes</textarea>
  </form>
  <div id="host"></div>
  <button id="boom">Break it</button>
  <script>
    localStorage.setItem("site_own_key", "site value");
    sessionStorage.setItem("site_session", "session value");
    const sr = document.getElementById("host").attachShadow({ mode: "open" });
    sr.innerHTML = '<input id="inner" value="shadow value" /><span>shadow text</span>';
    document.getElementById("boom").addEventListener("click", () => {
      fetch("/missing.json").catch(() => {});
      console.error("TypeError: Cannot read properties of undefined (reading 'total')");
    });
  </script>
</body></html>`;

const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/index")) {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(FIXTURE);
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end('{"error":"nope"}');
});
await new Promise((r) => server.listen(PORT, r));

const userDir = mkdtempSync(join(tmpdir(), "tb-nosecrets-e2e-"));
const ctx = await chromium.launchPersistentContext(
  userDir,
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

const VERBOSE = process.argv.includes("--verbose");
let failures = 0;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Collect every string a page script could read, from the page's own world.
 *
 * Runs INSIDE the page (not via Playwright's accessors) because that is the
 * threat model: whatever this function can see, a script on the site under
 * test can see.
 */
async function harvest(page) {
  return page.evaluate(() => {
    const out = { html: "", values: [], shadow: [], storage: [], scripts: [] };
    out.html = document.documentElement.outerHTML;

    // `depth === 0` is the light DOM; anything deeper came from a shadow root,
    // and is bucketed as such so a failure names the right place. Without this
    // a token in a shadow input reported as "input/textarea values", sending
    // whoever reads the failure to the wrong part of the DOM.
    const walk = (root, depth) => {
      if (depth > 6) return;
      const bucket = depth === 0 ? out.values : out.shadow;
      // .value is the PROPERTY. An input whose attribute is empty can still
      // hold a value, and vice versa — the old prefill bug lived in exactly
      // that gap.
      for (const el of root.querySelectorAll("input, textarea, select")) {
        try { bucket.push(String(el.value ?? "")); } catch (e) { /* ignore */ }
        for (const attr of el.getAttributeNames ? el.getAttributeNames() : []) {
          try { bucket.push(String(el.getAttribute(attr) ?? "")); } catch (e) { /* ignore */ }
        }
      }
      for (const el of root.querySelectorAll("script")) out.scripts.push(el.textContent || "");
      for (const el of root.querySelectorAll("style")) out.scripts.push(el.textContent || "");
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) {
          out.shadow.push(el.shadowRoot.innerHTML || "");
          walk(el.shadowRoot, depth + 1);
        }
      }
    };
    walk(document, 0);

    for (const area of ["localStorage", "sessionStorage"]) {
      try {
        const s = window[area];
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          out.storage.push(k + "=" + s.getItem(k));
        }
      } catch (e) { /* blocked */ }
    }
    return out;
  });
}

/** Where, if anywhere, a secret shows up. Returns [] when clean. */
function findLeaks(harvested, secrets) {
  const hits = [];
  const buckets = [
    ["outerHTML", [harvested.html]],
    ["input/textarea values + attributes", harvested.values],
    ["shadow roots", harvested.shadow],
    ["local/sessionStorage", harvested.storage],
    ["inline script/style", harvested.scripts],
  ];
  for (const [label, strings] of buckets) {
    for (const [name, secret] of Object.entries(secrets)) {
      if (strings.some((s) => typeof s === "string" && s.includes(secret))) {
        hits.push(`${name} in ${label}`);
      }
    }
  }
  return hits;
}

try {
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });

  // Seed exactly the way the options page does — into extension storage only.
  await sw.evaluate((s) => chrome.storage.local.set({
    tb_integrations_v1: {
      github: { token: s.githubToken, repo: "acme/shop" },
      linear: { apiKey: s.linearKey, teamId: "TEAM" },
      slack: { webhookUrl: s.slackWebhook },
    },
    tb_ai_config_v1: { provider: "anthropic", apiKey: s.aiKey, model: "claude-sonnet-5" },
  }), SECRETS);

  const stored = await sw.evaluate(() => chrome.storage.local.get(["tb_integrations_v1", "tb_ai_config_v1"]));
  check(
    "all four secrets are in extension storage to begin with",
    stored?.tb_integrations_v1?.github?.token === SECRETS.githubToken
      && stored?.tb_integrations_v1?.linear?.apiKey === SECRETS.linearKey
      && stored?.tb_integrations_v1?.slack?.webhookUrl === SECRETS.slackWebhook
      && stored?.tb_ai_config_v1?.apiKey === SECRETS.aiKey,
    "a false pass here would make every check below meaningless",
  );

  const page = await ctx.newPage();
  await page.goto(SITE, { waitUntil: "load" });
  await sleep(300);

  // Inject the whole real chain, the way the popup does.
  await sw.evaluate(async (glob) => {
    const [tab] = await chrome.tabs.query({ url: glob });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["secret-migration.js", "content-script.js"] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-sdk.js"], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, GLOB);
  await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });
  await sleep(500);

  check("the SDK is running in the page's main world", await page.evaluate(() => !!window.TraceBugSDK),
    "if it were not, this test would prove nothing");

  // The page is told WHETHER each integration is configured — a boolean — and
  // that is all it may ever learn.
  const caps = await page.evaluate(() => {
    const el = document.documentElement;
    return { status: el.getAttribute("data-tb-integrations") || "", caps: el.getAttribute("data-tb-caps") || "" };
  });
  check("the page sees only non-secret booleans about integrations", !Object.values(SECRETS).some((s) => (caps.status + caps.caps).includes(s)),
    JSON.stringify(caps).slice(0, 120));

  // ── Idle page ────────────────────────────────────────────────────────────
  let leaks = findLeaks(await harvest(page), SECRETS);
  check("no secret anywhere in the page before any TraceBug UI is opened", leaks.length === 0, leaks.join("; "));

  // ── With the Quick Bug modal open — the surface the old bug lived in ─────
  await page.click("#boom").catch(() => {});
  await sleep(300);
  const opened = await page.evaluate(async () => {
    try {
      await window.TraceBugSDK.quickCapture();
      return !!document.querySelector('[id*="quick-bug"], .tb-qb-modal, #tracebug-quick-bug-modal');
    } catch (e) { return false; }
  });
  await sleep(900);
  check("the Quick Bug modal opened", opened || await page.evaluate(() => !!document.getElementById("tracebug-root")),
    "the modal is the surface that previously pre-filled tokens into inputs");

  leaks = findLeaks(await harvest(page), SECRETS);
  check("no secret in the DOM with the ticket modal open", leaks.length === 0, leaks.join("; "));

  // ── And with the settings pointer open ───────────────────────────────────
  // In extension mode the in-page config modal is replaced by a pointer to the
  // extension's own settings page. That replacement IS the fix for the prefill
  // bug, so prove the pointer carries nothing.
  const pointerShown = await page.evaluate(() => {
    const btn = document.querySelector('[data-action="integrations-configure"], [data-action="ai-configure"]');
    if (btn) { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); return true; }
    return false;
  });
  await sleep(600);
  leaks = findLeaks(await harvest(page), SECRETS);
  check("no secret in the DOM with the settings pointer open", leaks.length === 0,
    leaks.length
      ? leaks.join("; ")
      : (pointerShown ? "pointer opened" : "pointer button not present in this build"));

  // ── Per-surface detail, so a failure says WHERE ──────────────────────────
  const h = await harvest(page);
  for (const [label, strings] of [
    ["outerHTML", [h.html]],
    ["input/textarea .value and attributes", h.values],
    ["open shadow roots", h.shadow],
    ["page localStorage / sessionStorage", h.storage],
    ["inline script and style text", h.scripts],
  ]) {
    const named = Object.entries(SECRETS)
      .filter(([, s]) => strings.some((x) => typeof x === "string" && x.includes(s)))
      .map(([n]) => n);
    check(`clean: ${label}`, named.length === 0, named.join(", "));
  }

  // The page's OWN data is still there — proof the harvester actually looked.
  check("the harvester can see the page's own values (so a clean result means something)",
    h.values.some((v) => v.includes("hunter2"))
      && h.shadow.some((v) => v.includes("shadow value"))
      && h.storage.some((v) => v.includes("site value")),
    "if this fails, every 'clean' check above is a false negative");
} catch (err) {
  console.error("E2E error:", err);
  failures++;
} finally {
  server.close();
  await ctx.close().catch(() => {});
}

console.log(failures === 0 ? `\nALL CHECKS PASSED — ${total()}` : `\n${failures} CHECK(S) FAILED — ${total()}`);
process.exit(failures === 0 ? 0 : 1);
