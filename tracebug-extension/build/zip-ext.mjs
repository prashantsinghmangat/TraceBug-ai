// Creates the store upload zips from the built extension, named with the
// current package version (releases/ is gitignored — upload artifacts, not
// source). Run via `npm run zip:ext`, which builds dist/ first.
//   Chrome Web Store: releases/tracebug-extension-v<x.y.z>.zip
//   Firefox AMO:      releases/tracebug-firefox-v<x.y.z>.zip
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
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
    const entries = readdirSync(distDir).map((e) => `"${e}"`).join(" ");
    execSync(`tar -a -c -f "${out}" -C "${distDir}" ${entries}`, { stdio: "inherit" });
  } else {
    execSync(`cd ${distDir} && zip -rq ../../../${out} .`, { stdio: "inherit" });
  }
  console.log(`[OK] store zip: ${out}`);
}
