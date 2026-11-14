// ── TraceBug extension build ─────────────────────────────────────────────────
// Single source → two targets. Emits dist/chrome and dist/firefox from the
// shared files in tracebug-extension/, generating a per-target manifest from
// manifest.base.json. The version is pulled from the root package.json so the
// extension version is never hand-edited.
//
//   node build/build-ext.mjs            → builds both targets
//   node build/build-ext.mjs chrome     → just Chrome
//   node build/build-ext.mjs firefox    → just Firefox
//
// Chrome and Firefox differ only in the fields the build injects below
// (background type + the offscreen permission on Chrome; gecko settings on
// Firefox). Everything else is identical shared source.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_DIR = join(__dirname, "..");          // tracebug-extension/
const ROOT_DIR = join(EXT_DIR, "..");           // repo root
const DIST_DIR = join(EXT_DIR, "dist");

const version = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf8")).version;
const base = JSON.parse(readFileSync(join(__dirname, "manifest.base.json"), "utf8"));

/**
 * Is screen recording switched on in the extension?
 *
 * Read from `src/video-recorder.ts` rather than duplicated here, because a
 * second flag is a second thing to forget: 1.11.1 flips ONE constant and the
 * recorder files come back with it. Parsed, not imported - this is a plain
 * node script and the constant lives in TypeScript.
 *
 * If the shape ever changes, fail loudly rather than guessing: silently
 * defaulting to "off" would ship a build with no recorder at all.
 */
function videoEnabledInExtension() {
  const src = readFileSync(join(ROOT_DIR, "src", "video-recorder.ts"), "utf8");
  const m = /export const VIDEO_ENABLED_IN_EXTENSION\s*=\s*(true|false)\s*;/.exec(src);
  if (!m) {
    throw new Error(
      "build-ext: could not read VIDEO_ENABLED_IN_EXTENSION from src/video-recorder.ts. " +
      "If it was renamed or its shape changed, update this parser - do not guess a default."
    );
  }
  return m[1] === "true";
}

const VIDEO_ON = videoEnabledInExtension();

/**
 * The recorder document, shipped only when it can be opened.
 *
 * `offscreen.html` hosts the MediaRecorder (as an offscreen document on
 * Chrome, as a small popup window on Firefox, which has no offscreen API).
 * While video is paused nothing sends a `tb:rec:*` message, so nothing ever
 * creates it - and a whole document the manifest can never open is an obvious
 * oddity in a reviewed package. Excluded with the feature, restored with it.
 *
 * Note `background.js` still computes `chrome.runtime.getURL("offscreen.html")`
 * at load. That is a string, never fetched unless a `tb:rec:*` message
 * arrives, so a missing file costs nothing. `web_accessible_resources` does
 * not list it, so nothing is orphaned there either.
 */
const RECORDER_FILES = ["offscreen.js", "offscreen.html"];

// Shared runtime files copied verbatim into every target. Dev-only helpers
// (generate-*.html) and generated artifacts are intentionally excluded.
const SHARED_FILES = [
  "background.js",
  "content-script.js",
  "secret-migration.js",
  "provider-bridge.js",
  "page-support.js",
  "diagnostics.js",
  "tracebug-provider-api.js",
  ...(VIDEO_ON ? RECORDER_FILES : []),
  "popup.js",
  "popup.html",
  "options.js",
  "options.html",
  "welcome.js",
  "welcome.html",
  "confirm-send.js",
  "confirm-send.html",
  "signin.js",
  "signin.html",
  "player.js",
  "player.html",
  "styles.css",
  "tracebug-injected-styles.css",
  "tracebug-init.js",
  // tracebug-sdk.js is NOT packaged here — the extension never loads it
  // (background.js's injectPageWorld injects tracebug-sdk-ext.js exclusively,
  // under its own window.__TraceBugExtension global; see
  // docs/launch/sdk-isolation-1.11.2.md). tsup builds tracebug-sdk.js
  // straight into website/public/, not this directory, and it is not
  // declared in either manifest's web_accessible_resources, below.
  "tracebug-sdk-ext.js",
];
const SHARED_DIRS = ["icons"];

/**
 * axe-core for the Site Audit (docs/audit-quality/implementation-plan.md B1).
 * The injected SDK bundle stubs axe out (tsup.config.ts) to stay small; the
 * worker injects this file into the page only when the user clicks "Run audit"
 * (background.js `injectAxe`). It is the library's own published `axe.min.js`,
 * copied byte for byte — never re-bundled — so store reviewers can match it to
 * the axe-core release. Also written into tracebug-extension/vendor/ (gitignored)
 * so the unpacked dev folder and the e2e suites have it.
 */
const AXE_SRC = createRequire(join(ROOT_DIR, "package.json")).resolve("axe-core/axe.min.js");
const AXE_DEST = join("vendor", "axe.min.js");
mkdirSync(join(EXT_DIR, "vendor"), { recursive: true });
cpSync(AXE_SRC, join(EXT_DIR, AXE_DEST));

/**
 * Chrome MV3: service-worker background.
 *
 * `offscreen` is requested only while VIDEO_ON — see VIDEO_ENABLED_IN_EXTENSION
 * in src/video-recorder.ts and docs/launch/video-1.11.1.md. The offscreen
 * document exists solely to host the screen recorder; shipping the permission
 * with nothing that can open the document is a question at review for no
 * benefit, so it tracks the same flag that ships offscreen.{html,js}.
 */
function chromeManifest() {
  return {
    ...base,
    version,
    // tabCapture powers the no-picker "Tab" record mode. Required, not
    // optional: Chrome only issues a tab stream id for a tab the extension was
    // invoked on while it already held tabCapture, so a runtime grant from the
    // popup could never record the tab it was granted on — measured, see
    // docs/audit/recording-architecture-proposal.md. Jam and BetterBugs ship it
    // required for the same reason. Gated on VIDEO_ON like offscreen: it is
    // useless without the recorder.
    permissions: [...base.permissions, ...(VIDEO_ON ? ["offscreen", "tabCapture"] : [])],
    background: { service_worker: "background.js" },
    // Hard API floors: offscreen (109), storage.session (102),
    // runtime.getContexts (116). Without this, Chrome ≤108 installs the
    // extension and recording silently breaks.
    minimum_chrome_version: "116",
  };
}

/**
 * Firefox MV3: event-page background (has DOM); no offscreen API; gecko id.
 *
 * `chrome.tabCapture` has no Firefox equivalent that captures a live stream
 * (`browser.tabs.captureTab()` is a single still frame) — see
 * docs/audit/capture-flow-1.11.3.md §6. Only the Chrome build adds
 * `tabCapture`; the popup reads the manifest and shows Desktop only here.
 */
function firefoxManifest() {
  return {
    ...base,
    version,
    // Firefox event pages have no importScripts, so the worker-side scripts
    // are listed ahead of background.js and run in the same global.
    background: { scripts: ["tracebug-provider-api.js", "provider-bridge.js", "page-support.js", "diagnostics.js", "background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "tracebug@prashantsinghmangat",
        // 128 is the floor because the SDK is injected with
        // scripting.executeScript({world: "MAIN"}), which Firefox supports
        // only from 128 (also an ESR). 127+ additionally shows the
        // host-permission grant in the install prompt.
        strict_min_version: "128.0",
        // AMO requires new submissions to declare data collection. Bug capture
        // collects and transmits nothing ("none" required). Two opt-in actions
        // send data to tracebug.dev, so they are optional and requested right
        // before the first send (requestDataConsent in signin.js / popup.js):
        //   personallyIdentifyingInfo — the email for Site Audit sign-in (ADR 009)
        //                               and the email-updates ask;
        //   technicalAndInteraction   — the optional usage counts with that ask.
        // Firefox < 140 ignores this key (web-ext warns about that — expected
        // and benign; we keep min_version 128 for reach).
        data_collection_permissions: { required: ["none"], optional: ["personallyIdentifyingInfo", "technicalAndInteraction"] },
      },
    },
  };
}

function buildTarget(name, manifest) {
  const outDir = join(DIST_DIR, name);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const f of SHARED_FILES) {
    const src = join(EXT_DIR, f);
    if (!existsSync(src)) throw new Error(`missing shared file: ${f}`);
    cpSync(src, join(outDir, f));
  }
  for (const d of SHARED_DIRS) {
    cpSync(join(EXT_DIR, d), join(outDir, d), { recursive: true });
  }
  mkdirSync(join(outDir, "vendor"), { recursive: true });
  cpSync(AXE_SRC, join(outDir, AXE_DEST));
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[OK] ${name}: dist/${name}/  (v${version})`);
}

const targets = process.argv.slice(2);
const wantChrome = targets.length === 0 || targets.includes("chrome");
const wantFirefox = targets.length === 0 || targets.includes("firefox");

if (wantChrome) buildTarget("chrome", chromeManifest());
if (wantFirefox) buildTarget("firefox", firefoxManifest());
