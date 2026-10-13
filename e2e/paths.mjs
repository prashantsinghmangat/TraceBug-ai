// ── Where things are, relative to the repo ─────────────────────────────────
// Every e2e script used to hardcode `D:/Project/TraceBug-ai/...`, which meant
// none of them could run anywhere but one laptop — the blocker Phase 0 recorded
// against Phase 8 (item 10.3). Derived from this file's own URL instead, so a
// checkout anywhere works, CI included.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

/** The repo root. This file lives in <root>/e2e/. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const E2E_DIR = join(ROOT, "e2e");
export const PUBLIC_DIR = join(ROOT, "website", "public");
/** The unpacked extension, as loaded by `--load-extension`. */
export const EXT_SRC_DIR = join(ROOT, "tracebug-extension");
/** The packaged Chrome build (`npm run build:ext`). */
export const EXT_DIST_DIR = join(ROOT, "tracebug-extension", "dist", "chrome");
/** Gitignored run artefacts. Never a tracked file — see e2e/output/. */
export const OUT_DIR = join(E2E_DIR, "output");

/** Make OUT_DIR and return it, for scripts that write screenshots or files. */
export function outDir() {
  mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

/**
 * Headless unless told otherwise.
 *
 * Extension loading works in Chromium's NEW headless mode — verified here and
 * already relied on by e2e/marketing-screenshots.mjs. The OLD headless mode
 * ignores extensions entirely, which is where the "extension e2e must be
 * headful" belief came from. Pass `--headful`, or set `TB_E2E_HEADFUL=1`, to
 * watch a run locally.
 *
 * Returned as launch options rather than a boolean because the two settings go
 * together: `channel: "chromium"` selects the bundled build, and branded Chrome
 * 137+ silently ignores `--load-extension` whatever the mode.
 */
export function extensionLaunchOptions(extraArgs = []) {
  const headful = process.argv.includes("--headful") || process.env.TB_E2E_HEADFUL === "1";
  return {
    channel: "chromium",
    headless: false,
    args: [...extraArgs, ...(headful ? [] : ["--headless=new"])],
  };
}

/** True when a path exists, for scripts that need a built artefact first. */
export function requireBuilt(path, hint) {
  if (existsSync(path)) return path;
  console.error(`FATAL  missing ${path}`);
  console.error(`       ${hint}`);
  process.exit(1);
}
