// Run: node e2e/ext-secret-migration.e2e.mjs   (headful; needs `npx playwright install chromium`)
//
// The REAL upgrade path for Phase 2a, in one script: load the previous store
// build (1.10.1), let IT write integration tokens and an AI key the way it
// always did (into the HOST PAGE's localStorage), then load the 1.11 build over
// the same browser profile and assert the migration moved and deleted them.
//
// Two origins are used — localhost and 127.0.0.1 on the same port are separate
// origins with separate localStorage — because a user may have saved DIFFERENT
// tokens per site. The conflict rule keeps the first config and names the
// second site in a notice; this checks that, not just the happy path.
//
// The old build is expected at $TB_OLD_EXT (default D:/tmp/tb-1101/...), which
// is produced by:  git worktree add D:/tmp/tb-1101 v1.10.1
// (1.10.1 commits its built tracebug-sdk.js, so no build step is needed.)
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
const EXT_NEW = withGrantedHostAccess(join(REPO, "tracebug-extension"), "migration-new");
const EXT_OLD = process.env.TB_OLD_EXT || "D:/tmp/tb-1101/tracebug-extension";
const PUBLIC_DIR = join(REPO, "website", "public");

const PORT = 4176;
const SITE_A = `http://localhost:${PORT}/try.html`;
const SITE_B = `http://127.0.0.1:${PORT}/try.html`;

// Fake credentials. Distinct per site so we can tell which one survived.
const TOK_A = "ghp_FAKE123";
const TOK_B = "ghp_FAKE_SECOND_SITE";
const AI_A = "sk-ant-FAKE-AAA";
const AI_B = "sk-ant-FAKE-BBB";
const ALL_SECRETS = [TOK_A, TOK_B, AI_A, AI_B];

if (!existsSync(join(EXT_OLD, "manifest.json"))) {
  console.error(`FATAL  old build not found at ${EXT_OLD}`);
  console.error(`       run: git worktree add D:/tmp/tb-1101 v1.10.1`);
  process.exit(2);
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = join(PUBLIC_DIR, decodeURIComponent(new URL(req.url, "http://x").pathname));
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

// One browser profile, reused across both extension versions — that is what
// makes this an upgrade rather than two unrelated runs.
const userDir = mkdtempSync(join(tmpdir(), "tb-migration-e2e-"));

async function launch(extDir) {
  const ctx = await chromium.launchPersistentContext(
    userDir,
    extensionLaunchOptions([`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`]),
  );
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  return { ctx, sw };
}

/**
 * Inject exactly the pipeline background.js uses (file list from background.js:118-131).
 *
 * `sdkFile` defaults to the current build's isolated bundle (tracebug-sdk-ext.js,
 * window.__TraceBugExtension — see docs/launch/sdk-isolation-1.11.2.md). The
 * OLD 1.10.1 build this script also loads predates that split and genuinely
 * only has tracebug-sdk.js under window.TraceBug/TraceBugSDK, so its one call
 * site below passes that filename explicitly rather than this picking wrong.
 */
async function activate(sw, urlGlob, { migration, sdkFile = "tracebug-sdk-ext.js" }) {
  await sw.evaluate(async ({ urlGlob, migration, sdkFile }) => {
    const [tab] = await chrome.tabs.query({ url: urlGlob });
    const cs = migration ? ["secret-migration.js", "content-script.js"] : ["content-script.js"];
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: cs });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [sdkFile], world: "MAIN" });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["tracebug-init.js"], world: "MAIN" });
  }, { urlGlob, migration, sdkFile });
}

const pageKeys = (page) => page.evaluate(() => ({
  integrations: localStorage.getItem("tracebug_integrations"),
  ai: localStorage.getItem("tracebug_ai_config"),
  legacy: localStorage.getItem("tracebug_ai_key"),
}));

try {
  // ───────────────────────── 1.10.1: the old build writes the secrets ───────
  {
    const { ctx, sw } = await launch(EXT_OLD);
    const ver = await sw.evaluate(() => chrome.runtime.getManifest().version);
    check("old build is 1.10.1", ver === "1.10.1", `got ${ver}`);

    for (const [url, glob, tok, key] of [
      [SITE_A, `http://localhost:${PORT}/*`, TOK_A, AI_A],
      [SITE_B, `http://127.0.0.1:${PORT}/*`, TOK_B, AI_B],
    ]) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: "load" });
      await page.waitForTimeout(400);
      await activate(sw, glob, { migration: false, sdkFile: "tracebug-sdk.js" });
      await page.waitForFunction(() => !!window.TraceBugSDK, null, { timeout: 15000 });

      // The OLD code path does the writing — not this script.
      await page.evaluate(({ tok, key }) => {
        window.TraceBugSDK.setIntegrationsConfig({
          github: { token: tok, repo: "acme/widgets" },
          slack: { webhookUrl: "https://hooks.slack.com/services/FAKE/B/C" },
        });
        window.TraceBugSDK.setAIConfig({ provider: "anthropic", apiKey: key, model: "claude-sonnet-4-6" });
      }, { tok, key });

      const before = await pageKeys(page);
      check(`1.10.1 wrote tokens into page localStorage on ${new URL(url).hostname}`,
        !!before.integrations && before.integrations.includes(tok) && !!before.ai && before.ai.includes(key));
      await page.close();
    }
    await ctx.close();
    await new Promise((r) => setTimeout(r, 1200)); // let the profile flush
  }

  // ───────────────────────── 1.11: the new build migrates them ──────────────
  {
    const { ctx, sw } = await launch(EXT_NEW);
    const extId = new URL(sw.url()).host;
    const ver = await sw.evaluate(() => chrome.runtime.getManifest().version);
    console.log(`      new build ${ver}, id ${extId}`);

    // --- site A: first origin seen, so its config wins -----------------------
    const a = await ctx.newPage();
    await a.goto(SITE_A, { waitUntil: "load" });
    await a.waitForTimeout(400);
    const carried = await a.evaluate(() => localStorage.getItem("tracebug_integrations"));
    check("page localStorage survived the upgrade (so this is a real upgrade)",
      !!carried && carried.includes(TOK_A));

    await activate(sw, `http://localhost:${PORT}/*`, { migration: true });
    await a.waitForTimeout(2000);

    const afterA = await pageKeys(a);
    check("site A: tracebug_integrations removed from the page", afterA.integrations === null,
      afterA.integrations ? "still present" : "");
    check("site A: tracebug_ai_config removed from the page", afterA.ai === null,
      afterA.ai ? "still present" : "");
    check("site A: legacy tracebug_ai_key absent", afterA.legacy === null);

    const stored = await sw.evaluate(() =>
      chrome.storage.local.get(["tb_integrations_v1", "tb_ai_config_v1", "tb_migration_notices"]));
    check("extension storage holds the GitHub token", stored.tb_integrations_v1?.github?.token === TOK_A,
      JSON.stringify(stored.tb_integrations_v1?.github?.token));
    check("extension storage holds the Slack webhook",
      !!stored.tb_integrations_v1?.slack?.webhookUrl);
    check("extension storage holds the AI key", stored.tb_ai_config_v1?.apiKey === AI_A);
    check("no notice yet (nothing was discarded on the first origin)",
      !stored.tb_migration_notices || stored.tb_migration_notices.length === 0,
      JSON.stringify(stored.tb_migration_notices || []));

    const caps = await a.evaluate(() => document.documentElement.getAttribute("data-tb-caps"));
    const capsObj = caps ? JSON.parse(caps) : {};
    check("data-tb-caps reports github + slack + ai configured",
      capsObj.github === true && capsObj.slack === true && capsObj.ai === true, caps || "absent");
    check("data-tb-caps carries no secret",
      !!caps && !ALL_SECRETS.some((s) => caps.includes(s)));

    // The Phase 2a guarantee, in a real DOM.
    const leakA = await a.evaluate((secrets) => {
      const hay = [document.documentElement.outerHTML];
      document.querySelectorAll("input,textarea").forEach((el) => hay.push(String(el.value || "")));
      for (let i = 0; i < localStorage.length; i++) hay.push(String(localStorage.getItem(localStorage.key(i))));
      for (let i = 0; i < sessionStorage.length; i++) hay.push(String(sessionStorage.getItem(sessionStorage.key(i))));
      const all = hay.join("\n");
      return secrets.filter((s) => all.includes(s));
    }, ALL_SECRETS);
    check("site A: no secret anywhere in the page after migration", leakA.length === 0, leakA.join(", "));

    // --- site B: second origin, different token -> kept config wins + notice -
    const b = await ctx.newPage();
    await b.goto(SITE_B, { waitUntil: "load" });
    await b.waitForTimeout(400);
    await activate(sw, `http://127.0.0.1:${PORT}/*`, { migration: true });
    await b.waitForTimeout(2000);

    const afterB = await pageKeys(b);
    check("site B: page keys removed too", afterB.integrations === null && afterB.ai === null);

    const stored2 = await sw.evaluate(() =>
      chrome.storage.local.get(["tb_integrations_v1", "tb_ai_config_v1", "tb_migration_notices"]));
    check("site A's token was KEPT, not overwritten by site B's",
      stored2.tb_integrations_v1?.github?.token === TOK_A,
      String(stored2.tb_integrations_v1?.github?.token));
    check("site A's AI key was kept", stored2.tb_ai_config_v1?.apiKey === AI_A);

    const notices = stored2.tb_migration_notices || [];
    check("a notice was recorded for the discarded site", notices.length === 1, JSON.stringify(notices));
    check("the notice names the second site (127.0.0.1)", notices[0]?.site === "127.0.0.1",
      String(notices[0]?.site));
    check("the notice says what was discarded",
      /integration tokens/.test(notices[0]?.what || "") && /AI key/.test(notices[0]?.what || ""),
      String(notices[0]?.what));
    check("no discarded secret leaked into the notice",
      !ALL_SECRETS.some((s) => JSON.stringify(notices).includes(s)));

    // --- the settings page is what the user actually looks at ---------------
    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${extId}/options.html`, { waitUntil: "load" });
    await opt.waitForTimeout(1200);
    const optText = await opt.evaluate(() => document.body.innerText);
    check("settings page renders", optText.trim().length > 50);
    check("settings page shows a Configured state", /configured/i.test(optText),
      optText.slice(0, 200).replace(/\s+/g, " "));
    check("settings page surfaces the discarded-token notice naming 127.0.0.1",
      /127\.0\.0\.1/.test(optText));
    const optHtml = await opt.content();
    check("settings page never prints a token in the DOM",
      !ALL_SECRETS.some((s) => optHtml.includes(s)));

    await ctx.close();
  }
} catch (err) {
  console.error("FAIL  threw:", err);
  failures++;
} finally {
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed — ${total()}` : `\nAll checks passed — ${total()}`);
process.exit(failures ? 1 : 0);
