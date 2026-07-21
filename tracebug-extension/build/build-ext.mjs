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

// Shared runtime files copied verbatim into every target. Dev-only helpers
// (generate-*.html) and generated artifacts are intentionally excluded.
const SHARED_FILES = [
  "background.js",
  "content-script.js",
  "offscreen.js",
  "offscreen.html",
  "popup.js",
  "popup.html",
  "player.js",
  "player.html",
  "styles.css",
  "tracebug-init.js",
  "tracebug-sdk.js",
];
const SHARED_DIRS = ["icons"];

/** Chrome MV3: service-worker background + the offscreen API for recording. */
function chromeManifest() {
  return {
    ...base,
    version,
    permissions: [...base.permissions, "offscreen"],
    background: { service_worker: "background.js" },
  };
}

/** Firefox MV3: event-page background (has DOM); no offscreen API; gecko id. */
function firefoxManifest() {
  return {
    ...base,
    version,
    background: { scripts: ["background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "tracebug@prashantsinghmangat",
        strict_min_version: "115.0",
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
