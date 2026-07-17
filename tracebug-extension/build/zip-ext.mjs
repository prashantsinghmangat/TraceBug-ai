// Creates the Chrome Web Store upload zip from the built extension, named
// with the current package version: releases/tracebug-extension-v<x.y.z>.zip
// (releases/ is gitignored — these are upload artifacts, not source).
// Run via `npm run zip:ext`, which builds dist/chrome first.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json");

const distDir = "tracebug-extension/dist/chrome";
if (!existsSync(distDir)) {
  console.error(`[zip-ext] ${distDir} not found — run \`npm run build:ext\` first`);
  process.exit(1);
}

mkdirSync("releases", { recursive: true });
const out = `releases/tracebug-extension-v${version}.zip`;
rmSync(out, { force: true });

if (process.platform === "win32") {
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${distDir}/*' -DestinationPath '${out}' -Force"`,
    { stdio: "inherit" }
  );
} else {
  execSync(`cd ${distDir} && zip -rq ../../../${out} .`, { stdio: "inherit" });
}
console.log(`[OK] store zip: ${out}`);
