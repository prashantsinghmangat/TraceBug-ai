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
  "player.js",
  "player.html",
  "styles.css",
  "tracebug-init.js",
  "tracebug-sdk.js",
];
const SHARED_DIRS = ["icons"];

/**
 * Chrome MV3: service-worker background.
 *
 * NO `offscreen` permission in 1.11. The offscreen document existed solely to
 * host the screen recorder, and screen recording is paused in the extension -
 * see VIDEO_ENABLED_IN_EXTENSION in src/video-recorder.ts and
 * docs/launch/video-1.11.1.md. Nothing sends a `tb:rec:*` message any more, so
 * nothing would create one. Shipping a permission the code cannot exercise is
 * a question at review for no benefit. Restore this line with the feature.
 */
function chromeManifest() {
  return {
    ...base,
    version,
    permissions: [...base.permissions],
    background: { service_worker: "background.js" },
    // Hard API floors: offscreen (109), storage.session (102),
    // runtime.getContexts (116). Without this, Chrome ≤108 installs the
    // extension and recording silently breaks.
    minimum_chrome_version: "116",
  };
}

/** Firefox MV3: event-page background (has DOM); no offscreen API; gecko id. */
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
        // AMO requires new submissions to declare data collection. TraceBug
        // is local-first: nothing is collected or transmitted. Firefox < 140
        // ignores this key (web-ext warns about that — expected and benign;
        // we keep min_version 115 for reach rather than silencing the warning).
        data_collection_permissions: { required: ["none"] },
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
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`[OK] ${name}: dist/${name}/  (v${version})`);
}

const targets = process.argv.slice(2);
const wantChrome = targets.length === 0 || targets.includes("chrome");
const wantFirefox = targets.length === 0 || targets.includes("firefox");

if (wantChrome) buildTarget("chrome", chromeManifest());
if (wantFirefox) buildTarget("firefox", firefoxManifest());
