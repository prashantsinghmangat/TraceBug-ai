# Release Checklist — v1.6.0 (Phase 1, offline)

> This document covers the checks a human must run before shipping — cross-browser regression, extension smoke test, and profiling — plus the state of everything already verified. Re-stamp the version each release.

## 0. Already verified (automated)

- [x] `tsc --noEmit` clean · 155/155 tests · all builds succeed (`prebuild` regenerates the rrweb runtime)
- [x] npm tarball resolution: `npx @arethetypeswrong/cli tracebug-sdk-1.6.0.tgz` → **no problems** (node10 / node16-CJS / node16-ESM / bundler all green — covers Vite, Webpack, Next.js, CRA resolution)
- [x] SSR safety: ESM `import` and CJS `require` of the packed tarball succeed in bare Node with no `window` (Next.js server-side import won't crash); `default.init` present
- [x] Version consistency: package.json = manifest.json = 1.6.0; CHANGELOG has a 1.6.0 entry (+ `[Unreleased]`)
- [x] LICENSE file (MIT), SUPPORT.md, GitHub issue templates present
- [x] Security review of exported HTML: every `innerHTML` sink in the export template and ticket modal escapes captured data (`esc()` / `escapeHtml()`); `</script>` breakout in the embedded JSON payload correctly escaped; media dataUrls assigned via `.src` property (no attribute injection)
- [x] Redaction: password/sensitive inputs masked at capture; sensitive URL query params redacted; storage + cookie values redacted by key/value patterns; **network response snippets now token-scrubbed at capture** (fixed 2026-07-02 — previously reached local .html exports unscrubbed)
- [x] Browser-compat fixes: `structuredClone` fallback (was Safari <15.2 / Firefox <94 break in the share path), `ResizeObserver` guard in draw mode (was Safari <13.1 break)

## 1. Cross-browser regression matrix (manual, ~45 min)

Run on the latest stable of each browser against `example-app/` (`cd example-app && npm install && npm run dev`).
The extension is Chrome-only by design — rows marked ⬛ are npm-SDK-only checks in Firefox/Safari.

| Check | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| SDK init, toolbar renders, no console errors | ☐ | ☐ | ☐ | ☐ |
| Click/input/route/API events captured (check ticket event count) | ☐ | ☐ | ☐ | ☐ |
| Console error/warn/log captured; page's own console still works | ☐ | ☐ | ☐ | ☐ |
| Screenshot (full page + region), annotation editor opens | ☐ | ☐ | ☐ | ☐ |
| Screen recording start → HUD → stop → video plays full duration in modal | ☐ | ☐ | ☐ ⬛ | ☐ ⬛ (Safari: expect `isVideoSupported()` gating — verify graceful "not supported" toast, no crash) |
| Ticket modal: title/description edit, priority select, tabs, draft autosave | ☐ | ☐ | ☐ | ☐ |
| Export .html → open the file → replay, tabs, description below replay, priority chip | ☐ | ☐ | ☐ | ☐ |
| Exported .html opens correctly in ALL browsers (it travels!) | ☐ | ☐ | ☐ | ☐ |
| GitHub/Jira/Linear/Slack copy + clipboard-denied path shows "Copy failed" | ☐ | ☐ | ☐ | ☐ |
| localStorage quota pressure: fill storage, verify oldest-session trim warning, no data corruption | ☐ | — | — | — |
| Page with CSP headers (e.g. a strict site): SDK still initializes | ☐ | — | ☐ | ☐ |

## 2. Chrome extension smoke test — clean profile (manual, ~20 min)

```
1.  chrome --user-data-dir=%TEMP%\tb-clean-profile   (fresh profile, no other extensions)
2.  chrome://extensions → Developer mode → Load unpacked → tracebug-extension/
```

- [ ] Extension loads with no errors on chrome://extensions (check "Errors" button)
- [ ] Service-worker console clean at idle (no `No tab with id` spam — fixed 2026-07-02, verify)
- [ ] Popup opens on a normal site; per-tab enable injects toolbar; badge shows **ON**
- [ ] Navigate within the site → toolbar survives (re-injection); close tab → no orphan errors
- [ ] Toolbar ✕ disables for the tab; badge clears; next navigation does NOT re-inject
- [ ] Record ("this tab") → interact → Stop → modal shows video with correct duration
- [ ] Record → hit browser-native "Stop sharing" → modal still opens with the video
- [ ] Record → reload the page mid-recording → recording recovered from offscreen after reload
- [ ] 2-minute cap: warnings at 1:30/1:55, auto-stop at 2:00, modal opens
- [ ] Screenshot via popup and via toolbar on a cross-origin-image-heavy page
- [ ] Saved tickets popover lists saved tickets; open + delete work
- [ ] Restricted pages (chrome://settings, Chrome Web Store): popup degrades gracefully, no crash
- [ ] No cloud/account UI visible anywhere (Phase 2 disabled)

## 3. Performance & memory profiling (manual, ~30 min)

Recordings auto-stop at 2:00, so the long-session risk is **event capture + storage flush**, not video.

- [ ] **Long session soak**: enable SDK on a busy app, interact for 30 min WITHOUT recording video. DevTools → Performance monitor: JS heap should plateau (events cap at 200/session, 50 sessions), not climb monotonically.
- [ ] **Flush cost** (known hot spot — see PROJECT-STATUS §6): with a ~200-event session, DevTools Performance trace for 30 s of active clicking. `saveSessions`' `JSON.stringify` frames should stay <10 ms on desktop. If a future release raises `maxEvents`, revisit — full-array stringify runs on a 1 s cadence.
- [ ] **Screenshot memory**: take 20 screenshots → heap snapshot → expect roughly `count × imageSize`, hard-capped at 50 with FIFO eviction.
- [ ] **Recording overhead**: record 2 min while scrolling a heavy page; page FPS should stay usable (capture runs in the compositor/offscreen, not page JS).
- [ ] **Modal open time** on a 200-event session with 10 screenshots: < 1 s.

## 4. Framework install verification (semi-automated, ~30 min)

Module resolution + SSR safety already verified (§0). Per-framework runtime smoke:

- [ ] **Next.js**: `example-app/` uses `file:..` — `npm install && npm run build && npm run dev`, verify no SSR crash and toolbar appears client-side (this is the canonical integration test)
- [ ] **Vite + React**: `npm create vite@latest tb-vite -- --template react` → install tarball → `TraceBug.init()` in a `useEffect` → dev + `vite build` both work
- [ ] **Vue 3 (Vite)**: same, init in `onMounted`
- [ ] **Webpack (CRA or custom)**: install tarball → build passes → CJS path exercised
- [ ] **Plain JS**: `<script type="module">import TraceBug from './node_modules/tracebug-sdk/dist/index.js'` → init works
- [ ] For each: `npx tracebug init` detects the framework and prints the right snippet

## 5. Release mechanics

- [ ] **Rotate Supabase keys** (blocker — see PROJECT-STATUS §5) even for Phase-1-only launch
- [ ] Commit the working-tree changes, merge to `main`, CI green
- [ ] Decide version: move the CHANGELOG `[Unreleased]` section (offline replay + compression + AI export + nav-capture fix + shadcn) under a new version heading and bump `package.json`
- [ ] `npm publish` (runs `prepublishOnly` → build); verify `npm view tracebug-sdk` after
- [ ] Zip `tracebug-extension/` → Chrome Web Store upload; listing copy from docs/CHROME-WEB-STORE-LISTING.md; justify `<all_urls>` with the per-tab opt-in model
- [ ] Tag the release + GitHub release notes from CHANGELOG

## 6. Support readiness (state as of 2026-07-02)

| Channel | Status |
|---|---|
| Issue tracking | ✅ GitHub Issues + bug/feature templates (`.github/ISSUE_TEMPLATE/`) |
| Support doc | ✅ `SUPPORT.md` (bug reporting, questions, security disclosure path) |
| Crash reporting | ✅ **Deliberately none** — the SDK is the privacy-first alternative; it never phones home. All internal failures degrade silently or log `[TraceBug]`-prefixed warnings, which SUPPORT.md asks users to include. Do not add telemetry without a public opt-in policy. |
| Security disclosure | ✅ Private-email path documented in SUPPORT.md (no public issues for vulns) |
| Docs | ✅ docs/ + README; status doc for contributors ([PROJECT-STATUS.md](PROJECT-STATUS.md)) |
