// Run: npm run build:ext && node e2e/welcome-screenshots.mjs
//
// Shoots the welcome page from the PACKAGED build, loaded as a real extension,
// at the two widths the v2 layout switches between and in both themes:
//
//   welcome-1280-light.png   welcome-1280-dark.png   three cards in a row
//   welcome-400-light.png    welcome-400-dark.png    stacked (<=760px)
//
// Loaded as an extension rather than over file://, because the three things
// this page refuses to hardcode — the version, the capture binding and the
// platform — all come from chrome.* at runtime. Over file:// they are all
// absent, and the shot would show step 3 in its empty state while claiming to
// be the page a user sees.
import { chromium } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXT_DIST_DIR, outDir, extensionLaunchOptions, requireBuilt } from "./paths.mjs";

const EXT = requireBuilt(EXT_DIST_DIR, "run `npm run build:ext` first");
const OUT = outDir();
const userDir = mkdtempSync(join(tmpdir(), "tb-welcome-shots-"));

const ctx = await chromium.launchPersistentContext(
  userDir,
  extensionLaunchOptions([`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]),
);

// The worker is how we learn our own extension id.
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
const extId = new URL(sw.url()).host;
const URL_ = `chrome-extension://${extId}/welcome.html`;
console.log(`extension ${extId}`);

// What the page will actually render, so the shots can be checked against it
// rather than guessed at.
const bound = await sw.evaluate(async () => {
  const list = await chrome.commands.getAll();
  const found = (list || []).find((c) => c && c.name === "tb-quick-capture");
  return { shortcut: (found && found.shortcut) || "", version: chrome.runtime.getManifest().version };
});
console.log(`manifest v${bound.version}, capture shortcut: ${bound.shortcut || "(none bound)"}`);

const WIDTHS = [1280, 400];
const THEMES = ["light", "dark"];

for (const theme of THEMES) {
  for (const width of WIDTHS) {
    const page = await ctx.newPage();
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(URL_, { waitUntil: "domcontentloaded" });
    // welcome.js fills the version and step 3 after two async round-trips.
    await page.waitForFunction(() => {
      const v = document.getElementById("version");
      const b = document.getElementById("keysBound");
      const n = document.getElementById("keysNone");
      return v && v.textContent && (b.style.display === "" || n.style.display === "");
    }, { timeout: 10000 });
    await page.waitForTimeout(250); // let the key caps lay out

    const name = `welcome-${width}-${theme}.png`;
    await page.screenshot({ path: join(OUT, name), fullPage: true });
    console.log(`  saved ${name}`);
    await page.close();
  }
}

// The three headings must share a baseline at 1280 — the whole point of the
// fixed-height illustration area. Worth asserting while a browser is open.
const probe = await ctx.newPage();
await probe.setViewportSize({ width: 1280, height: 900 });
await probe.goto(URL_, { waitUntil: "domcontentloaded" });
await probe.waitForTimeout(500);
const tops = await probe.$$eval(".step-t", (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
console.log(`step heading tops at 1280: ${tops.join(", ")}`);
if (new Set(tops).size !== 1) {
  console.error("FAIL  the three step headings do not line up");
  process.exitCode = 1;
} else {
  console.log("OK    the three step headings line up");
}
await probe.close();

await ctx.close();
console.log(`\nshots in ${OUT}`);
