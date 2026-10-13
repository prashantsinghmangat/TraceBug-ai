// Creates the store upload zips from the built extension, named with the
// current package version (releases/ is gitignored — upload artifacts, not
// source). Run via `npm run zip:ext`, which builds dist/ first.
//   Chrome Web Store: releases/tracebug-extension-v<x.y.z>.zip
//   Firefox AMO:      releases/tracebug-firefox-v<x.y.z>.zip
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const TARGETS = [
  { distDir: "tracebug-extension/dist/chrome", zipName: `tracebug-extension-v${version}.zip` },
  { distDir: "tracebug-extension/dist/firefox", zipName: `tracebug-firefox-v${version}.zip` },
];

mkdirSync("releases", { recursive: true });

for (const { distDir, zipName } of TARGETS) {
  if (!existsSync(distDir)) {
    console.error(`[zip-ext] ${distDir} not found — run \`npm run build:ext\` first`);
    process.exit(1);
  }
  const out = `releases/${zipName}`;
  rmSync(out, { force: true });

  if (process.platform === "win32") {
    // NOT Compress-Archive: it writes BACKSLASH entry names ("icons\icon.png"),
    // which violates the zip spec (APPNOTE 4.4.17 requires forward slashes).
    // Chrome tolerates it; AMO hard-rejects with "Invalid file name in
    // archive". bsdtar (ships with Windows 10+) writes compliant entries.
    //
    // By ABSOLUTE PATH, not `tar`. On any machine with Git Bash or MSYS2 on
    // PATH, `tar` resolves to GNU tar, which cannot write zips at all: given
    // `-a -c -f out.zip` it does not recognise the suffix and silently emits an
    // UNCOMPRESSED TAR named .zip. That is what shipped as the v1.11.0 store
    // archives until the magic-byte check below caught it — 3.8 MB of tar that
    // both stores would have rejected, after an "[OK] store zip" line.
    const entries = readdirSync(distDir).map((e) => `"${e}"`).join(" ");
    const bsdtar = join(process.env.SystemRoot || "C:/Windows", "System32", "tar.exe");
    const exe = existsSync(bsdtar) ? `"${bsdtar}"` : "tar";
    if (exe === "tar") {
      console.warn("[zip-ext] bsdtar not found at System32; falling back to `tar` on PATH.");
      console.warn("[zip-ext] If that is GNU tar the output will NOT be a zip — the check below will say so.");
    }
    execSync(`${exe} -a -c -f "${out}" -C "${distDir}" ${entries}`, { stdio: "inherit" });
  } else {
    execSync(`cd ${distDir} && zip -rq ../../../${out} .`, { stdio: "inherit" });
  }

  // Is it actually a zip? "PK" per APPNOTE 4.3.7. This is not
  // paranoia: the failure above was silent, produced a plausible-looking file
  // and printed success. A store rejection days later is a bad way to find out.
  const head = readFileSync(out).subarray(0, 4);
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    console.error(`[zip-ext] ${out} is NOT a zip — it starts with ${JSON.stringify(head.toString("latin1"))}.`);
    console.error("[zip-ext] Almost certainly GNU tar instead of bsdtar. Nothing usable was written.");
    rmSync(out, { force: true });
    process.exit(1);
  }
  console.log(`[OK] store zip: ${out}`);
}
