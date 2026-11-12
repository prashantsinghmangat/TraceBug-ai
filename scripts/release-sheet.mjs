// Run: node scripts/release-sheet.mjs        (writes docs/release-sheets/<version>.md)
//
// One page per release with every field of every surface, in upload order,
// ready to copy and paste: Chrome Web Store, Firefox Add-ons, npm (SDK + CLI),
// the MCP registry, the website, the tag and the GitHub release.
//
// Nothing is written by hand here. The sheet is assembled from the files that
// already own each fact, so it cannot drift from them:
//   package.json / manifest.json / packages/tracebug/*   versions, name, summary, permissions
//   docs/STORE-LISTINGS.md                               all store text (found by its bold labels)
//   CHANGELOG.md                                         the release's section
//   git                                                  the previous tag, for "what changed"
// Per release you edit two blocks in STORE-LISTINGS.md (Chrome "New in", Firefox
// release notes) and the CHANGELOG, then run this.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const json = (p) => JSON.parse(read(p));
const git = (...args) => {
  try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; }
};
const fail = (msg) => { console.error("release-sheet: " + msg); process.exit(1); };

// ── Facts ────────────────────────────────────────────────────────────────
const pkg = json("package.json");
const cliPkg = json("packages/tracebug/package.json");
const server = json("packages/tracebug/server.json");
const manifest = json("tracebug-extension/manifest.json");
const V = pkg.version;
for (const [what, v] of [["packages/tracebug/package.json", cliPkg.version], ["server.json", server.version], ["manifest.json", manifest.version]]) {
  if (v !== V) fail(`${what} is ${v}, package.json is ${V} — run \`npm run check:versions\` first`);
}

const prevTag = git("tag", "--list", "v*", "--sort=-v:refname").split("\n").find((t) => t && t !== `v${V}`) || "";
const prevManifest = (() => {
  if (!prevTag) return null;
  try { return JSON.parse(git("show", `${prevTag}:tracebug-extension/manifest.json`)); } catch { return null; }
})();
const perms = manifest.permissions || [];
const prevPerms = prevManifest ? prevManifest.permissions || [] : null;
const addedPerms = prevPerms ? perms.filter((p) => !prevPerms.includes(p)) : [];
const removedPerms = prevPerms ? prevPerms.filter((p) => !perms.includes(p)) : [];
// The Firefox build drops the Chrome-only permissions (scripts/build-ext.mjs).
const firefoxPerms = perms.filter((p) => p !== "offscreen" && p !== "tabCapture");

// ── Text from STORE-LISTINGS.md, located by its bold labels ──────────────
const listings = read("docs/STORE-LISTINGS.md");
function blockAfter(label, from = 0) {
  const at = listings.indexOf(label, from);
  if (at < 0) fail(`label not found in docs/STORE-LISTINGS.md: ${label}`);
  const open = listings.indexOf("```", at);
  const bodyStart = listings.indexOf("\n", open) + 1;
  const close = listings.indexOf("\n```", bodyStart);
  if (open < 0 || close < 0) fail(`no fenced block after: ${label}`);
  return listings.slice(bodyStart, close);
}
// A "- **Label:** …" bullet together with its wrapped continuation lines, as one line.
function bullet(prefix) {
  const at = listings.indexOf(prefix);
  if (at < 0) fail(`bullet not found in docs/STORE-LISTINGS.md: ${prefix}`);
  const blank = listings.indexOf("\n\n", at);
  const nextBullet = listings.indexOf("\n- ", at + 2);
  const stop = Math.min(blank < 0 ? Infinity : blank, nextBullet < 0 ? Infinity : nextBullet);
  return listings.slice(at, stop).replace(/^- /, "").replace(/\s*\n\s*/g, " ");
}
const chromeDescription = blockAfter("**Description.**");
const singlePurpose = blockAfter("**Single purpose:**");
const amoDescription = blockAfter("**Description** (AMO Markdown)");
const amoReleaseNotes = blockAfter("**Release notes**");
const reviewerNotes = blockAfter("**Notes to reviewer**").replaceAll("<x.y.z>", V);
const justifications = Object.fromEntries(
  [...listings.matchAll(/^\| `([A-Za-z]+)` \| (.+) \|$/gm)].map((m) => [m[1], m[2]]),
);
const optionalHosts = (listings.match(/^\| Optional host permissions \| (.+) \|$/m) || [])[1] || "";
const captions = [...listings.matchAll(/^\| `(\d-[a-z-]+\.jpg)` \| (.+) \|$/gm)].map((m) => ({ file: m[1], caption: m[2] }));
const newIn = chromeDescription.split("\n")[0];
if (!newIn.startsWith(`New in ${V}`)) {
  console.warn(`release-sheet: WARNING — the Chrome description starts "${newIn.slice(0, 40)}…", not "New in ${V}". Update docs/STORE-LISTINGS.md §2.`);
}

// ── CHANGELOG section ────────────────────────────────────────────────────
const changelog = read("CHANGELOG.md");
const head = changelog.indexOf(`## [${V}]`);
if (head < 0) fail(`CHANGELOG.md has no "## [${V}]" section`);
const next = changelog.indexOf("\n## [", head + 5);
const section = changelog.slice(head, next < 0 ? undefined : next).trim();
const releaseDate = (section.match(/^## \[[^\]]+\] - (\S+)/) || [])[1] || "";
const releaseBody = section.split("\n").slice(1).join("\n").trim();

// ── Files that must exist before uploading ───────────────────────────────
const have = (p) => (existsSync(join(ROOT, p)) ? "ready" : "**MISSING**");
const chromeZip = `releases/tracebug-extension-v${V}.zip`;
const firefoxZip = `releases/tracebug-firefox-v${V}.zip`;
const sourceZip = `releases/tracebug-source-v${V}.zip`;
// Chrome screenshot order comes from STORE-LISTINGS.md ("**Screenshots** … in this order — `1-…`, `2-…`"),
// so changing the set there updates the sheet (a hard-coded list went stale when 1.12.0 added the audit slide).
const shotLine = listings.slice(listings.indexOf("**Screenshots**"), listings.indexOf("**Promo tiles:**"));
const chromeNames = [...shotLine.matchAll(/`([0-9]+-[a-z-]+)`/g)].map((m) => m[1]);
if (!chromeNames.length) fail("no Chrome screenshot names after **Screenshots** in docs/STORE-LISTINGS.md");
const chromeShots = chromeNames.map((n) => `assets/chrome-store/${n}.jpg`);
const tiles = ["assets/banners/promo-tiles/small-440x280.jpg", "assets/banners/promo-tiles/marquee-1400x560.jpg"];

const fence = (lang, body) => "```" + lang + "\n" + body + "\n```";
const out = [];
const p = (...lines) => out.push(...lines);

p(`# Release sheet — TraceBug ${V}`, "",
  `Generated by \`node scripts/release-sheet.mjs\` from package.json, the manifest, STORE-LISTINGS.md and CHANGELOG.md.`,
  `Do not edit by hand: fix the source file and regenerate. Work top to bottom; every grey box is copy-and-paste.`, "",
  "| | |", "|---|---|",
  `| Version | **${V}** |`,
  `| CHANGELOG date | ${releaseDate || "not set"} |`,
  `| Previous release | ${prevTag || "none found"} |`,
  `| Commit | \`${git("rev-parse", "--short", "HEAD")}\` on \`${git("branch", "--show-current")}\`${git("status", "--porcelain") ? " — **working tree has uncommitted changes**" : ""} |`,
  `| Extension name | ${manifest.name} (${manifest.name.length} chars; AMO limit 45) |`,
  `| Extension summary | ${manifest.description} (${manifest.description.length} chars; limit 132) |`,
  `| Chrome permissions | ${perms.map((x) => "`" + x + "`").join(", ")} |`,
  `| Firefox permissions | ${firefoxPerms.map((x) => "`" + x + "`").join(", ")} |`,
  `| Permission changes since ${prevTag || "previous"} | ${addedPerms.length || removedPerms.length ? `added: ${addedPerms.join(", ") || "none"}; removed: ${removedPerms.join(", ") || "none"}` : "none — existing users are not asked to re-approve"} |`,
  `| npm \`tracebug-sdk\` | ${pkg.version} |`,
  `| npm \`tracebug\` (MCP CLI) | ${cliPkg.version} |`,
  `| MCP registry | \`${server.name}\` ${server.version} |`, "");

p("## 0. Before you upload", "",
  "1. Commit everything, then run the gates and build the packages:",
  fence("bash", "node scripts/check.mjs --full"),
  fence("bash", "npm run zip:ext"),
  fence("bash", `git archive --format=zip -o ${sourceZip} HEAD`),
  "2. Load `tracebug-extension/dist/chrome` unpacked (chrome://extensions) and run `npm run ext:firefox`. Do a capture → export → open the `.html`, plus the `docs/RELEASE_CHECKLIST.md` rows this release touches.",
  "3. Files:", "",
  "| File | Status |", "|---|---|",
  `| \`${chromeZip}\` | ${have(chromeZip)} |`,
  `| \`${firefoxZip}\` | ${have(firefoxZip)} |`,
  `| \`${sourceZip}\` | ${have(sourceZip)} |`,
  ...chromeShots.map((s) => `| \`${s}\` | ${have(s)} |`),
  ...captions.map((c) => `| \`assets/firefox-store/${c.file}\` | ${have("assets/firefox-store/" + c.file)} |`),
  ...tiles.map((s) => `| \`${s}\` | ${have(s)} |`), "");

p("## 1. Chrome Web Store", "",
  "Developer dashboard → TraceBug.", "",
  "### Package tab", "", `Upload \`${chromeZip}\`.`, "",
  "### Store listing tab", "",
  "**Title** (read from the package, shown for checking):", fence("text", manifest.name),
  "**Summary** (read from the package):", fence("text", manifest.description),
  "**Category:** Developer Tools · **Language:** English (United States)", "",
  "**Description** — replace the whole field:", fence("text", chromeDescription),
  "**Screenshots** — 1280×800, in this order:", "",
  ...chromeShots.map((s, i) => `${i + 1}. \`${s}\``), "",
  "**Promo tiles:**", "", ...tiles.map((s) => `- \`${s}\``), "",
  bullet("- **Promo video:**"), "",
  bullet("- **Website:**"), "",
  "### Privacy tab", "",
  "**Single purpose:**", fence("text", singlePurpose),
  "**Permission justifications** — one box per permission:", "");
for (const perm of perms) {
  p(`\`${perm}\`${addedPerms.includes(perm) ? " — **NEW in this release**" : ""}`,
    fence("text", justifications[perm] || `MISSING — add a row for ${perm} to docs/STORE-LISTINGS.md`));
}
if (optionalHosts) p("Host permissions (optional):", fence("text", optionalHosts));
p("**Remote code:** No, I am not using remote code.", "",
  "**Data usage:** tick Authentication information, Web history, User activity, Website content. Leave the rest unticked. Tick all three certifications.", "",
  "### Note to the reviewer", "");
if (addedPerms.length) {
  p(`This release adds ${addedPerms.map((x) => "`" + x + "`").join(", ")}. Fill in and paste:`,
    fence("text", `${V} adds the ${addedPerms.join(", ")} permission so <user-visible feature>. It is used only on user action, for <scope>. No data is sent to the developer; there is no backend.`));
} else {
  p("None needed: no new permission in this release.", "");
}
p("Then **Submit for review** (typically 1–3 days).", "");

p("## 2. Firefox Add-ons (AMO)", "",
  "Developer Hub → TraceBug → **Upload New Version**.", "",
  `1. Upload \`${firefoxZip}\`.`,
  `2. When asked for source code, upload \`${sourceZip}\`.`, "",
  "**Release notes:**", fence("text", amoReleaseNotes),
  "**Notes to reviewer:**", fence("text", reviewerNotes),
  "Then **Edit Product Page**.", "",
  "**Description** — replace the whole field:", fence("markdown", amoDescription),
  "**Screenshots** — in this order, with these captions:", "",
  "| # | File | Caption |", "|---|---|---|",
  ...captions.map((c, i) => `| ${i + 1} | \`assets/firefox-store/${c.file}\` | ${c.caption} |`), "",
  "Validation warnings about `chrome.offscreen` / `chrome.tabCapture` are expected. Errors must be 0.", "");

p("## 3. npm", "",
  fence("bash", "npm whoami"),
  "Must print `prashantsinghmangat`; otherwise `npm login`. (A 404 on publish means \"not logged in\".)", "",
  `**SDK — \`tracebug-sdk@${V}\`:**`, fence("bash", "npm publish"),
  `**MCP CLI — \`tracebug@${V}\`:**`, fence("bash", "npm run build:cli"), fence("bash", "npm publish ./packages/tracebug"),
  "**Check** (can take a few minutes to appear; an `E404 No match found for version` right after publishing is that delay, not a failure — `dist-tags` updates first):",
  fence("bash", "npm view tracebug-sdk dist-tags"),
  fence("bash", "npm view tracebug dist-tags"),
  fence("bash", `npm view tracebug@${V} bin`),
  "Both `latest` tags must show " + V + ", and the last one must print `{ tracebug: 'bin.mjs' }`.", "");

p("## 4. MCP registry", "",
  `Server \`${server.name}\`, version ${server.version}. Publish only after \`tracebug@${V}\` is live on npm.`, "",
  "**Description on the registry** (from `server.json`, must be ≤ 100 chars):",
  fence("text", `${server.description} (${server.description.length} chars)`),
  "PowerShell (`mcp-publisher` is not on PATH, so call it with `&` and the full path). Run both from `packages\\tracebug`, where `server.json` lives. Let the login finish (\"Successfully logged in\") before publishing; an interrupted login leaves an expired token and publish fails with 401 — just log in again.",
  fence("powershell", "cd D:\\Project\\TraceBug-ai\\packages\\tracebug"),
  fence("powershell", "& C:\\tools\\mcp-publisher.exe login github"),
  fence("powershell", "& C:\\tools\\mcp-publisher.exe publish"),
  fence("powershell", "cd ..\\.."),
  "**Check** — the new version must show `\"isLatest\": true` (PowerShell needs `curl.exe`):",
  fence("powershell", `curl.exe -s "https://registry.modelcontextprotocol.io/v0/servers?search=${server.name}"`), "");

p("## 5. Website and tag — after the Chrome Web Store approves", "",
  fence("bash", "git checkout main"), fence("bash", "git pull"), fence("bash", "git merge develop"), fence("bash", "git push"),
  fence("bash", "git checkout develop"), fence("bash", "git merge --ff-only origin/main"),
  fence("bash", `git tag v${V}`), fence("bash", `git push origin v${V}`),
  "**Check the site serves the new SDK** — the two hashes must match:",
  fence("bash", "sha256sum website/public/tracebug-sdk.js"),
  fence("bash", "curl -s https://tracebug.dev/tracebug-sdk.js | sha256sum"), "");

p("## 6. GitHub release", "",
  `Releases → Draft a new release → tag \`v${V}\`.`, "",
  "**Title:**", fence("text", `TraceBug ${V}`),
  "**Notes:**", fence("markdown", releaseBody), "");

p("## 7. After release", "",
  `- [ ] Chrome Web Store listing shows ${V}`,
  `- [ ] AMO listing shows ${V}`,
  `- [ ] \`npm view tracebug-sdk version\` and \`npm view tracebug version\` print ${V}`,
  "- [ ] MCP registry shows the version with `isLatest`",
  `- [ ] tracebug.dev shows ${V} and the SDK hashes match`,
  "- [ ] First-run path works in an empty folder:",
  fence("bash", `npx -y tracebug@${V} mcp --help`),
  `- [ ] \`docs/launch/STATE.md\` says "${V} is live everywhere"; ≤5-line entry in \`docs/launch/PROGRESS.md\``,
  "- [ ] Remove the \"New in\" paragraph from the Chrome description a few weeks later", "");

const dir = join(ROOT, "docs", "release-sheets");
mkdirSync(dir, { recursive: true });
const file = join(dir, `${V}.md`);
writeFileSync(file, out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n", "utf8");
console.log(`wrote docs/release-sheets/${V}.md (${out.length} lines)`);

// ── Keep the newest KEEP sheets; delete older ones ─────────────────────────
// One sheet per release, at most KEEP of them (user decision 2026-11-12): when
// an 11th version's sheet is written, the oldest version's sheet is removed.
// Ordered by version number, not file date, so regenerating an old sheet never
// pushes out a newer one. Only files named <x.y.z>.md are counted or deleted.
const KEEP = 10;
const semver = (name) => name.replace(/\.md$/, "").split(".").map(Number);
const byVersion = (a, b) => {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
};
const sheets = readdirSync(dir).filter((n) => /^\d+\.\d+\.\d+\.md$/.test(n)).sort(byVersion);
for (const old of sheets.slice(0, Math.max(0, sheets.length - KEEP))) {
  unlinkSync(join(dir, old));
  console.log(`removed docs/release-sheets/${old} (keeping the newest ${KEEP})`);
}
