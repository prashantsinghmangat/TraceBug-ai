# Releasing TraceBug

How to ship a version to every surface: Chrome Web Store, Firefox Add-ons (AMO), npm (`tracebug-sdk`
and the `tracebug` MCP CLI), the official MCP Registry, the website, and the git tag. Last used for
**1.11.5** (2026-11-01).

This file is the mechanics. The other release documents, one job each:

| What | Where |
|---|---|
| Manual test rows that can't be automated | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) |
| Every word both stores show (description, permission justifications, data-use answers, AMO notes) | [STORE-LISTINGS.md](STORE-LISTINGS.md) |
| Store screenshots, promo tiles, banners, icons, demo video (gitignored) | `assets/` — index in `assets/README.md` |
| Announcement posts per release (gitignored) | `docs-internal/marketing/posts-<x.y.z>.md` |
| What changed, for users | [CHANGELOG.md](../CHANGELOG.md) |

## What ships where

| Surface | Artifact | Built by | Published by |
|---|---|---|---|
| Chrome Web Store | `releases/tracebug-extension-v<x.y.z>.zip` | `npm run zip:ext` | Upload in the CWS developer dashboard |
| Firefox Add-ons | `releases/tracebug-firefox-v<x.y.z>.zip` + a source zip | `npm run zip:ext` | Upload on addons.mozilla.org (Developer Hub) |
| npm `tracebug-sdk` | repo root package (`dist/`) | `prepublishOnly` → `check:versions` + `build` | `npm publish` from the repo root |
| npm `tracebug` (MCP CLI) | `packages/tracebug/bin.mjs` | `npm run build:cli` | `npm publish ./packages/tracebug` |
| MCP Registry | `packages/tracebug/server.json` | hand-edited (version fields) | `mcp-publisher publish` |
| Website (tracebug.dev) | `website/` incl. `website/public/tracebug-sdk.js` | Netlify (`base = "website"`, `npm run build`) | Deploys from `main` |
| GitHub | tag `v<x.y.z>` | — | `git tag` + `git push origin v<x.y.z>` |

`releases/` is gitignored. Upload artifacts, never commit them.

## 1. Prepare (on `develop`)

1. Bump the version everywhere `scripts/check-versions.mjs` checks:
   - `package.json`
   - `tracebug-extension/manifest.json`
   - `packages/tracebug/package.json`
   - `packages/tracebug/server.json`: both `version` and `packages[0].version`
   - `website/lib/version.ts`: `SDK_VERSION` and `SDK_VERSION_TAG`
   - `CHANGELOG.md`: a new `## [x.y.z] - YYYY-MM-DD` heading
   - `docs/getting-started.md`: the `tracebug-sdk-x.y.z.tgz` example

   Also bump the root version in `package-lock.json`. `check:versions` doesn't guard it.
2. Write the CHANGELOG entry. Use **Added / Changed / Fixed / Security** and describe the effect a user
   sees, not the code that changed. The store "What's new" text and the GitHub release notes are copied
   from it.
3. Run the gates:
   ```bash
   node scripts/check.mjs --full
   ```
4. Commit on `develop` with `git commit --only <paths>`, never `git add -A`, then push.

## 2. Build and smoke-test the extension

```bash
npm run zip:ext
```
This checks versions, rebuilds `dist/chrome` and `dist/firefox`, and writes both zips to `releases/`.
`zip-ext.mjs` uses `bsdtar` deliberately: an earlier method silently produced an uncompressed TAR named
`.zip`, and that shipped as v1.11.0. Don't swap in another zip tool.

Keep only the two newest versions' zips in `releases/` (the current one and one to roll back to); older
ones can be rebuilt from their tag.

Before uploading, load each `dist/` folder unpacked (Chrome: `chrome://extensions` → Load unpacked;
Firefox: `npm run ext:firefox`). Exercise what this release changed, plus a basic capture →
export → open the `.html`. Run the rows in `RELEASE_CHECKLIST.md` that apply to this release.

## 3. Chrome Web Store

1. Developer dashboard → TraceBug → **Package** → upload `releases/tracebug-extension-v<x.y.z>.zip`.
2. **Store listing** tab: add the "New in x.y.z" block at the top of the description and change
   screenshots only if the release changes them. All text: [STORE-LISTINGS.md](STORE-LISTINGS.md) §2;
   images: `assets/chrome-store/`, `assets/banners/promo-tiles/`.
3. **Privacy** tab: if the permissions changed, a new box appears for each new permission — paste its
   justification from STORE-LISTINGS.md. Check the data-use answers still match it.
4. If `manifest.json` gained a **required** permission, existing users get disabled until they
   re-approve, and review takes longer. Never add one without deciding that explicitly (CLAUDE.md hard
   rule). Optional permissions update silently. Add the reviewer note from STORE-LISTINGS.md §2.
5. Submit for review. Review typically takes 1–3 days. The listing keeps showing the old version until
   it's approved.

## 4. Firefox Add-ons (AMO)

1. Developer Hub → TraceBug → **Upload New Version** → `releases/tracebug-firefox-v<x.y.z>.zip`.
2. AMO asks for **source code** because the bundle is generated. Upload a source zip of the tagged
   tree, for example:
   ```bash
   git archive --format=zip -o releases/tracebug-source-v<x.y.z>.zip HEAD
   ```
   Paste **Release notes** and **Notes to reviewer** from [STORE-LISTINGS.md](STORE-LISTINGS.md) §3
   (fill in the version; leave Chrome-only items out of the release notes).
3. Validation warnings are expected. The `tabCapture` `UNSUPPORTED_API` warnings are harmless because
   Firefox feature-detects and never reaches that code. Errors must be 0.
4. `strict_min_version` is 128. Don't lower it: main-world injection needs Firefox 128.

## 5. npm

npm credentials live in `~/.npmrc` on the machine you publish from. Check first:
```bash
npm whoami
```
It must print `prashantsinghmangat`. If it doesn't, run `npm login`.

**Gotcha:** when you aren't logged in, `npm publish` fails with **`E404 Not Found - PUT
.../tracebug-sdk`**, not a 401. A 404 on publish to an existing package means "log in", not "the
package is missing".

SDK, from the repo root (`prepublishOnly` runs `check:versions` and a full build):
```bash
npm publish
```
MCP CLI. Build its `bin.mjs` first, because `prepublishOnly` only checks that the file exists, not that
it's current:
```bash
npm run build:cli
```
```bash
npm publish ./packages/tracebug
```
- If the account uses 2FA, npm opens a browser auth step (or add `--otp=<code>`).
- The warning `"bin[tracebug]" script name bin.mjs was invalid and removed` is **harmless**. npm
  normalizes `./bin.mjs` → `bin.mjs`. Confirm afterwards that `npm view tracebug@<x.y.z> bin` prints
  `{ tracebug: 'bin.mjs' }`. If the bin is missing, `npx tracebug mcp` breaks for every user.
- `npm view <pkg> version` can keep showing the old version for several minutes after "Your package is
  being processed". Check with `npm view <pkg>@<x.y.z> version`, and wait before assuming it failed.

## 6. MCP Registry

The official registry lists the server as `io.github.prashantsinghmangat/tracebug`, pointing at the
npm `tracebug` package. Publish **after** the npm `tracebug` version is live, because the registry
verifies it.

```bash
cd packages/tracebug
mcp-publisher login github
mcp-publisher publish
```
- `server.json`'s `description` must be ≤ 100 characters.
- `mcp-publisher` is the official CLI from the
  [modelcontextprotocol/registry releases](https://github.com/modelcontextprotocol/registry/releases).
  On the release machine it lives at `C:\tools\mcp-publisher.exe` (not on PATH: call it by that path).
  To install it on Windows:
  ```powershell
  Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_amd64.tar.gz" -OutFile $env:TEMP\mcp-publisher.tar.gz
  tar xf $env:TEMP\mcp-publisher.tar.gz -C C:\tools mcp-publisher.exe
  ```
  `login github` prints a device code; approve it with the `prashantsinghmangat` GitHub account.
  Run `mcp-publisher validate` first if `server.json` changed shape.
- The query below also lists older versions; the new one should carry `"isLatest": true`.
- Verify:
  ```bash
  curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.prashantsinghmangat/tracebug"
  ```
  It should list the new version.

## 7. Website, tag, and GitHub release

1. Merge `develop` into `main` and push, then bring `develop` back level with `main`
   (`git checkout develop && git merge --ff-only origin/main`), so the next change doesn't start from
   an older tree. Netlify builds `website/` and deploys it.
2. Confirm the deploy really shipped the new SDK. The version badge isn't proof, so compare hashes:
   ```bash
   sha256sum website/public/tracebug-sdk.js
   ```
   ```bash
   curl -s https://tracebug.dev/tracebug-sdk.js | sha256sum
   ```
   The two hashes must match.
3. Tag the release commit and push the tag:
   ```bash
   git tag v<x.y.z>
   ```
   ```bash
   git push origin v<x.y.z>
   ```
4. Optional: create a GitHub release from the tag and paste the CHANGELOG section.

## 8. Announce (after the Chrome Web Store approves)

Wait for CWS approval: until then the store serves the old version, and anyone installing from a post
gets the old behaviour.

1. **Blog post** (the anchor every post links to): add an entry to `website/lib/blog.ts` and its images
   under `website/public/blog/<slug>/`; `cover` (1200×630) is also the link-preview image. The sitemap
   picks it up. Merge to `main` and confirm the page and its images return 200 before posting anywhere.
2. **Posts:** write `docs-internal/marketing/posts-<x.y.z>.md` (start from the newest one there). Banners
   go in `assets/banners/social-<x.y.z>/` (generator: `assets/source/banners/banners.mjs`).
3. **dev.to / Hashnode:** set the canonical URL to the blog post. If an image showed as broken once,
   append `?v=2` to its URL; dev.to caches failed fetches.
4. Log objections and "I keep using TraceBug because…" replies in `METRICS.md`.

## 9. After release

- Check every surface shows the new version: the CWS listing, the AMO listing, `npm view tracebug-sdk
  version`, `npm view tracebug version`, the MCP Registry query above, and the tracebug.dev badge.
- Run `npx -y tracebug@<x.y.z> mcp --help` on a clean folder. This is the real first-run path for
  agent users.
- Update `docs/launch/STATE.md` ("x.y.z is live everywhere") and add a ≤5-line entry to
  `docs/launch/PROGRESS.md`.

## Order, and what can run in parallel

Store reviews are the slow part, so submit to CWS and AMO first. npm → MCP Registry is strictly in that
order. The website deploy and the tag can go any time after the release commit is on `main`.
Announcements go last, after CWS approval.
