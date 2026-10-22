# Launch state — read this, not the archives

Engineering state only, verified against code. Last updated 2026-10-22. Calendar, channels and the
32-item audit tracker are OUTSIDE the repo: `docs-internal/GROWTH-PLAN-30DAY.md` (gitignored).
History: `PROGRESS{,-archive}.md`, `PLAN-archive.md`. Open phases: `PLAN.md` 8, 10b, 11, 12.

**1.11.2 is release-ready** (PLAN Phase 10a, correctness). 1.11.1 is tagged (`v1.11.1`, `42becbb`)
and pushed. Branch `develop`, **1.11.2** on the eight surfaces `check:versions` guards.
`check.mjs --full`: **928 passing / 57 files**, `ext:lint` 0 errors / 69 warnings. The npm packages
(`tracebug-sdk`, `tracebug`) are still **1.10.1 on npm** — 1.11.x has never been published there.

**Screen recording is PAUSED in the extension — it returns in 1.11.3** (PLAN Phase 10b).
`VIDEO_ENABLED_IN_EXTENSION` in `src/video-recorder.ts`, enforced at the transport; a stored
`tb_record_opts.video: true` is read and ignored, never erased, and the `offscreen` permission is out
of both manifests with it. Four bugs and the restore checklist: `video-1.11.1.md` (the FILE name is
historical). The npm SDK is untouched and records video as before.

## What 1.11.2 contains

- **Bug 0 — SDK isolation** (`docs/launch/sdk-isolation-1.11.2.md`): the extension injects
  `tracebug-sdk-ext.js` under `window.__TraceBugExtension`; it never adopts a page's `window.TraceBug`,
  and **defers entirely** when a host page's own toolbar is up. `tracebug-sdk.js` is no longer in the
  package (~700 KB smaller). `e2e/ext-sdk-isolation.e2e.mjs` 17/17.
- **T-01/T-02**: Summary skips noise requests; tracker buttons say "Send to…" when configured.
- **T-05**: no MCP modal after export — a one-line "Open in your AI agent →" link on the toast.
- **T-06**: the live error card drops its Capture button while a capture runs.
- **T-13**: popup "Keep capturing across sites" row removed; `tb_host_perm_declined` no longer
  written. Options shows an existing `<all_urls>` grant with **Remove**. `<all_urls>` stays declared
  optional — it is what lets settings request a single custom Ollama host.
- Ollama: changing/removing a custom host releases the old origin. Welcome page v2 (three steps,
  `npx tracebug mcp` + Copy, `⌥` on Mac, Firefox pin copy).

## Left before release — all of it needs a person

1. **Commit** the uncommitted 1.11.2 work (suggested split in the session that prepared it), push
   `develop`, merge to `main`, tag `v1.11.2`.
2. **`docs/RELEASE_CHECKLIST.md`**, at least rows 10a–10h plus 10 (diagnostics), in Chrome **and**
   `npm run ext:firefox` (not a gate — `web-ext run` blocks until Firefox closes).
3. **Store screenshots**: the popup lost a row and the welcome page is new; check the five listing
   shots still match.
4. **Build zips** (`npm run zip:ext`), upload to CWS and AMO with the §4 copy in `store-submission-pack.md`.
5. **npm**: publish `tracebug-sdk` and `packages/tracebug` 1.11.2 (and the MCP registry `server.json`).
6. **Deploy the website** (Netlify, `website/`), then check `/privacy`, `/try`, `/bye`. One real `/bye`
   submission must show in Netlify Forms under `uninstall`.

## Gotchas that are still true

- **Two manifests, hand-synced.** `build/manifest.base.json` is the source of truth;
  `tracebug-extension/manifest.json` is the unpacked/dev copy (it alone carries `background`,
  `version`, `minimum_chrome_version`) — `build-ext.mjs` writes only to `dist/`.
- **Version bumps touch eight surfaces** (`check:versions` names them; `manifest.base.json` has no
  version field by design), and a release needs a new `WHATS_NEW` entry in `popup.js` — no entry, no card.
- **`zip:ext` calls bsdtar by ABSOLUTE path** (`C:\Windows\System32\tar.exe`) and refuses to report success unless
  the output starts with `PK`. Bare `tar` is GNU tar wherever Git Bash is on PATH, and GNU tar
  silently writes an uncompressed TAR named `.zip` — 1.11.0's first archives were exactly that.
- **AMO caps manifest `name` at 45 chars, Chrome 75**, and one manifest feeds both. The slug is
  **`tracebug-bug-reports-for-ai`** (verified by GUID, in `src/links.ts`); `/addon/tracebug/` is a 404.
- **`tab.url` is normally `undefined`** now `<all_urls>` is optional — classify with `classifyPage`
  (`page-support.js`); read the shortcut from `chrome.commands` at runtime (`Alt+B`).
- **The offscreen files follow `VIDEO_ENABLED_IN_EXTENSION`.** `build-ext.mjs` parses it out of
  `src/video-recorder.ts` and ships `offscreen.{html,js}` only when true, so 1.11.3 (video,
  `docs/launch/PLAN.md` Phase 10b — renamed from "1.11.2" when 1.11.2 became the correctness phase)
  flips one constant and they return (28 files -> 30). It **throws** if the constant is renamed: a
  silent "off" would ship a build with no recorder.
- **Two TraceBug instances on one page isolate STATE but not DOM.** The extension's injected SDK
  (`tracebug-sdk-ext.js`, `window.__TraceBugExtension`) and a host page's own npm-SDK integration
  (`tracebug-sdk.js`, `window.TraceBug`) are separate globals since `docs/launch/sdk-isolation-1.11.2.md`
  — but both still mount into the same shared DOM under the same hardcoded ids
  (`src/dashboard.ts`), so state isolation alone doesn't stop a second toolbar from trying to appear.
  **Deliberately not supported**: if a host page's own TraceBug toolbar is already up, the extension
  defers entirely (no injection at all, not even under its own global) rather than mounting a second
  one — `background.js`'s `injectSDK()` detects this via `page-support.js`'s
  `detectHostTraceBugUI()` before injecting, same signal `content-script.js`'s `TB_PING` already used
  for repair. The popup shows "This site runs its own TraceBug"; `Alt+B` shows the same sentence as
  an on-page shadow-root notice. A host page whose own SDK integration passes
  `enableDashboard: false` is unaffected.
- **The DOM replay never records canvas**, so a canvas page replays as an empty box;
  `src/replay-fidelity.ts` warns above 25% of the viewport, branching its advice on `isVideoOffered()`.
- **`diagnostics.js` `scrub()` is a privacy boundary.** Rules run in a fixed order (markup FIRST) and tests assert against real browser error text — add a rule there, with a case, not a call-site filter.
- **e2e pre-grants `<all_urls>`** so it never exercises the declined path (unit tests do), and **branded
  Chrome 137+ ignores `--load-extension`** — e2e uses bundled Chromium, so Phase 8's Beta nightly cannot work.
- `web_accessible_resources` must stay `<all_urls>` (CSP-proof player iframe); `webNavigation` must
  not be added; `chrome.storage.sync` redaction rules are correct; worker state lives in
  `chrome.storage.session` (`tb_sw_state_v1`) — mutate only after awaiting `_hydrated`. The SDK runs
  in the page's **MAIN world**: no secrets in page `localStorage`, ever.
