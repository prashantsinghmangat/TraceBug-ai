# Releasing TraceBug

How to ship a version to every surface: Chrome Web Store, Firefox Add-ons (AMO), npm (`tracebug-sdk`
and the `tracebug` MCP CLI), the official MCP Registry, the website, and the git tag. Last used for
**1.11.4** (2026-11-01).

Manual test rows that can't be automated live in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). This file
is the mechanics.

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

Before uploading, load each `dist/` folder unpacked (Chrome: `chrome://extensions` → Load unpacked;
Firefox: `npm run ext:firefox`). Exercise what this release changed, plus a basic capture →
export → open the `.html`. Run the rows in `RELEASE_CHECKLIST.md` that apply to this release.

## 3. Chrome Web Store

1. Developer dashboard → TraceBug → **Package** → upload `releases/tracebug-extension-v<x.y.z>.zip`.
2. Update the description/screenshots only if the release changes them.
3. If `manifest.json` gained a **required** permission, existing users get disabled until they
   re-approve. Never add one without deciding that explicitly (CLAUDE.md hard rule). Optional
   permissions update silently.
4. Submit for review. Review typically takes 1–3 days. The listing keeps showing the old version until
   it's approved.

## 4. Firefox Add-ons (AMO)

1. Developer Hub → TraceBug → **Upload New Version** → `releases/tracebug-firefox-v<x.y.z>.zip`.
2. AMO asks for **source code** because the bundle is generated. Upload a source zip of the tagged
   tree, for example:
   ```bash
   git archive --format=zip -o releases/tracebug-source-v<x.y.z>.zip HEAD
   ```
   Build instructions for the reviewer: Node 18+, `npm ci`, `npm run zip:ext`, then compare
   `tracebug-extension/dist/firefox`.
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
  Run `mcp-publisher validate` first if `server.json` changed shape.
- Verify:
  ```bash
  curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.prashantsinghmangat/tracebug"
  ```
  It should list the new version.

## 7. Website, tag, and GitHub release

1. Merge `develop` into `main` and push. Netlify builds `website/` and deploys it.
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

## 8. After release

- Check every surface shows the new version: the CWS listing, the AMO listing, `npm view tracebug-sdk
  version`, `npm view tracebug version`, the MCP Registry query above, and the tracebug.dev badge.
- Run `npx -y tracebug@<x.y.z> mcp --help` on a clean folder. This is the real first-run path for
  agent users.
- Update `docs/launch/STATE.md` ("x.y.z is live everywhere") and add a ≤5-line entry to
  `docs/launch/PROGRESS.md`.

## Order, and what can run in parallel

Store reviews are the slow part, so submit to CWS and AMO first. npm → MCP Registry is strictly in that
order. The website deploy and the tag can go any time after the release commit is on `main`.
