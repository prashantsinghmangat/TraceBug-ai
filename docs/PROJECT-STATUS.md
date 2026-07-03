# TraceBug — Project Status & Launch Readiness

> **Purpose:** the current, verified state of the project — what ships now (Phase 1), what is built but disabled (Phase 2), and everything changed in the July 2026 hardening pass. Share this with any agent or reviewer who needs to cross-verify the product flow against the code.
>
> **Last updated:** 2026-07-02 · branch `feature/cloud-sharing` · version **1.3.0**
>
> Companion docs: [PROJECT-CONTEXT.md](PROJECT-CONTEXT.md) (deep orientation, May 2026 — note its cloud section describes code that is now UI-disabled), [SHARE-PORTAL-PLAN.md](SHARE-PORTAL-PLAN.md) (cloud portal design spec), [../ARCHITECTURE.md](../ARCHITECTURE.md) (module-level architecture).

---

## 1. What the product is

TraceBug is a local-first bug-reporting tool for QA and developers. It captures user sessions in the browser (clicks, inputs, navigations, network requests, console output, screenshots, optional screen recording), builds a structured bug report with a root-cause hint, and exports it as a self-contained offline `.html` replay or as GitHub / Jira / Linear / Slack / AI-prompt text.

**Ship artifacts:**

| Artifact | Source | Built by |
|---|---|---|
| npm package `tracebug-sdk` (ESM + CJS + types + CLI) | `src/`, `cli/` | tsup → `dist/` |
| Chrome extension (MV3) | `tracebug-extension/` + IIFE bundle of `src/` | tsup → `tracebug-extension/tracebug-sdk.js` (committed) |
| Cloud portal website (Next.js + Supabase) | `website/` | Netlify (separate deploy; **Phase 2, not required for launch**) |

---

## 2. Phase 1 — launchable now (v1.3.0, offline/local)

Everything below is live in the shipping UI and verified working:

- **Capture**: clicks, inputs, select changes, form submits, route changes, fetch/XHR (with failure response snippets), console error/warn/log (per-session, capped at 50 logs), performance/network timing, environment info.
- **Screen recording**: in-page MediaRecorder or Chrome-extension offscreen transport; rolling and standard modes; 2-min duration cap with warnings (aligned with the future cloud upload cap); recording survives page reloads via offscreen recovery.
- **Screenshots**: full page (html2canvas, lazily loaded), region capture, extension `captureVisibleTab`, smart click-highlight, annotation editor, blur tool for redacting sensitive areas. In-memory, capped at 50 with FIFO eviction.
- **Bug Ticket modal** (Quick Bug): auto-generated title, editable description (open by default, included in exports), video player with grab-frame, replay scrubber synced to the event feed, Info / Actions / Console / Network / AI tabs (Notes tab appears only when annotations exist), priority selector (tester's call, persisted per session), Save Ticket, draft autosave.
- **Info captured per ticket**: URL, timestamp, OS/browser/viewport/screen/device/language/timezone/connection, session id, severity (auto) + priority (user), custom context, **localStorage + sessionStorage + non-HttpOnly cookies** (sensitive keys/values redacted at capture; TraceBug's own keys filtered out; explicit "empty" state shown when the page had none).
- **Exports**: self-contained `.html` replay (video + screenshots + unified event feed + tabs + user description below the replay + severity and priority chips in the header), GitHub issue (URL-prefill or markdown), Jira, Linear, Slack, structured AI prompt (Claude/ChatGPT), `.webm` video download, PDF (premium-flagged).
- **Extension**: per-tab opt-in injection, ON/OFF badge, re-injection across navigations, offscreen video recording, popup quick actions, saved-tickets popover, floating toolbar with record preflight (tab vs desktop, mic).
- **Auto-scanner / debugging assistant**: a11y scan (axe-core), error-pattern matching, root-cause hints, severity rules, live error capture prompt.
- **Redaction (defense in depth)**: sensitive storage keys/values masked at capture (`storage-capture.ts`); network/console token scrubbing; pre-upload sanitizer for the future cloud path (`sanitize/cloud-upload.ts`). Screenshots/video are **not** scanned — visual data is the tester's responsibility.
- **CLI**: `npx tracebug init` — framework detection + setup snippet (React, Vue, Angular, Next.js, Svelte, Nuxt, vanilla).
- **Freemium**: plan gates implemented but **OFF** (`PLANS_LIVE = false`) — everything free at launch. See `docs/freemium.md` and `docs/MONETIZATION-PLAN.md`.

## 3. Phase 2 — built but intentionally disabled (cloud sharing)

All code exists and compiles; the **UI entry points are commented out with `PHASE2-CLOUD` markers**. Nothing cloud-related runs for end users in v1.3.0.

**What exists:**

- `TraceBug.shareReport()` / `signIn()` / `signOut()` / `getCurrentUser()` / `getCloudQuotas()` / `openCloudDashboard()` — exported API (`src/index.ts`), functional if called programmatically.
- Hidden-iframe auth bridge to `tracebug.netlify.app/sdk-bridge` (`src/auth/iframe-bridge.ts`) — postMessage with origin validation, ready-timeout, request/reply correlation.
- Upload pipeline: sanitize → cap checks (5 screenshots / 2-min video / 50 MB) → thumbnail → signed PUT → share URL (`src/exporters/share-link.ts`).
- Website portal (`website/`): magic-link auth, `/dashboard` (quotas, thumbnails, extend/delete), public `/share/[token]` viewer, Supabase RLS, retention crons, CORS middleware for extension origins.
- Screenshot trim modal, share-consent modal, extension popup cloud-account block (also commented out).

**What re-enabling Phase 2 requires:**

1. Uncomment the `PHASE2-CLOUD` blocks in `src/ui/quick-bug.ts` (share button + handler + imports) and `tracebug-extension/popup.html`/`popup.js` (account block).
2. **Rotate the Supabase keys** (see §5 — the old ones are burned) and set them in Netlify env.
3. Set `NEXT_PUBLIC_SDK_ALLOWED_ORIGINS` in production — the sdk-bridge fails closed (refuses all parent origins) when empty.
4. Deploy `website/` and run the Supabase migrations.
5. Smoke-test: sign-in round trip, upload, quota enforcement, share-link view, retention cron.

## 4. July 2026 hardening pass — everything changed on this branch

### Security

- **`website/.env.local` untracked from git** (contained real Supabase anon + service-role keys); `.gitignore` now covers `.env.local` / `.env.*.local`. ⚠️ **Keys are still in git history and still valid until rotated — see §5.**
- **`cloudEndpoint` validation** — new leaf module `src/cloud-endpoint.ts` (`resolveCloudEndpoint()`): HTTPS enforced (plain HTTP only on localhost), `javascript:`/`data:`/malformed URLs rejected with fallback to production. Applied at every use: `IframeBridge` constructor, all 6 `src/index.ts` call sites, `share-link.ts`, `quick-bug.ts`. Unit-tested (`tests/cloud-endpoint.test.ts`).
- Chrome extension manifest: explicit `content_security_policy` added.

### Reliability / bug fixes

- **Video ↔ session ownership** (the big one): `getLastVideoRecording()` is a global "most recent recording" with no session binding. Fixed three ways:
  - `getSessionVideo(session)` in `report-builder.ts` — a recording is attached to a report only if it started after the session was created (10 s grace for extension transport ordering). Used by `buildReport` **and** the modal, so exporters and UI can never disagree again. Previously a screenshot-only ticket exported with a stale video from an earlier recording.
  - Toolbar record flow (`compact-toolbar.ts`) now arms the session **before** capture starts (was after → `createdAt` landed later than the video's `startedAt` and the modal suppressed the just-recorded video). Cancelling the picker releases the armed session.
  - Historical tickets (opened from saved list) strip `report.video` explicitly — a newer recording passes the time gate in that direction.
- **Modal video player WebM duration workaround** — Chrome MediaRecorder WebM has no duration header; the native `<video>` capped playback at the first cluster (~seconds of a 1-min recording). On `loadedmetadata`, if reported duration is Infinity/NaN/shorter than the recorded `durationMs`, we seek far past the end to force Chrome to compute the real duration, then snap back to 0.
- **`iframe-bridge.ready()`**: 20 s timeout — previously a never-loading bridge leaked a `message` listener forever and every `send()` hung on a dead promise. Timeout unmounts the iframe and resets so a later call retries.
- **`storage.deleteSession()`** flushes pending in-memory events before reading localStorage — deleting one session no longer drops up to 1 s of captured events from other sessions.
- **`background.js` badge updates awaited** — unhandled `"No tab with id"` promise rejections eliminated.
- **Clipboard failures surfaced** ("✗ Copy failed") on all dashboard copy buttons.
- ESLint errors fixed (emoji regex `u` flags, stray expression, extra semicolon); `pushScreenshot` side-path now respects the 50-screenshot cap.

### UX / export changes

- **Export `.html` now carries the user's edited title and description** (previously only auto-generated content); description renders **below the Replay** in the left pane (mirrors the modal) instead of a tab.
- Export tabs reduced to Info / Console / Network / Actions / AI / Events — **Notes and Description tabs removed**.
- **Priority chip in the export header** (🚩 tester's triage call) next to the auto-severity badge; priority flows user → session → report → all exports.
- **Cookies captured** (non-HttpOnly only — exactly the boundary we want) alongside local/sessionStorage, same redaction rules, shown in modal Info tab + export + scrubbed again by the cloud sanitizer.
- Info tab: TraceBug's own `tracebug_*` storage keys filtered at capture; empty-value env rows dropped; per-row storage icons removed; explicit "Web storage — empty on this page" state.
- Description `<details>` open by default; Notes tab only renders when annotations exist; "Fix with AI" button hover no longer goes white-on-white in light theme.

### Build / CI / packaging

- CI (`.github/workflows/ci.yml`) now runs **lint and tests** in addition to typecheck + build + bundle-size checks.
- `package.json`: `engines: node >=18` added. (`sideEffects: false` deliberately **not** added — the SDK registers module-level listeners.)

**Verified state:** `tsc --noEmit` clean · ESLint 0 errors (174 pre-existing `any` warnings) · **98/98 tests pass** (8 files) · all builds succeed. Bundle sizes: ESM ~70 KB, CJS ~77 KB, extension IIFE ~2.2 MB (includes axe-core; html2canvas stubbed).

## 5. Launch blockers & required ops actions

| # | Action | Who | Status |
|---|---|---|---|
| 1 | **Rotate Supabase anon + service-role keys** (Supabase dashboard → Settings → API). The old keys were committed in `website/.env.local` (commit `68d2bb3`) and remain in git history. | Owner | ⚠️ **PENDING — do before any launch or repo publication** |
| 2 | If the repo is/becomes public: scrub history (`git filter-repo` / BFG) | Owner | Pending |
| 3 | Commit + merge `feature/cloud-sharing` (all fixes above are uncommitted working-tree changes) | Owner | Pending |
| 4 | Reload/republish the Chrome extension bundle (rebuilt `tracebug-extension/tracebug-sdk.js`) | Owner | Pending |
| 5 | For Phase 2 only: Netlify env (`SUPABASE_*`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SDK_ALLOWED_ORIGINS`) | Owner | Not needed for Phase 1 |

**Phase 1 has no other code blockers.**

## 6. Known gaps / future work (non-blocking)

- **Docs drift**: README and `docs/getting-started.md` / `docs/ticket-flow.md` previously described cloud sharing as live ("new in v1.4") — corrected in this pass to mark it as an upcoming release. `docs/api-reference.md` doesn't document the cloud API yet (intentional while Phase 2 is off).
- Test coverage is concentrated on data/report logic (8 test files); collectors, UI components, and the extension have no automated tests.
- CI doesn't verify the committed extension IIFE bundle matches `src/` (stale-artifact risk); consider a build-and-diff step or gitignoring the artifact.
- 174 `@typescript-eslint/no-explicit-any` warnings, densest in the bridge message payloads.
- Video ↔ session binding is time-based (start-ordering + grace window), not id-based. Stamping the `sessionId` into the recording at start would be the airtight version.
- Screenshots/video are not scanned for secrets (text is); the share flow should warn about visual data when Phase 2 ships (consent modal exists).
- Freemium gates (`PLANS_LIVE`) and PDF-premium flow are dormant pending a pricing decision.
- `extension host_permissions: <all_urls>` is justified (works on any site, opt-in per tab) but will draw Chrome Web Store review attention — listing copy should explain the per-tab opt-in model.

## 7. How to verify this document against the code

```bash
npm ci
npx tsc --noEmit           # expect: clean
npm run lint               # expect: 0 errors
npm test                   # expect: 98 passed
npm run build              # expect: dist/ + tracebug-extension/tracebug-sdk.js
grep -rn "PHASE2-CLOUD" src/ tracebug-extension/   # the disabled cloud UI entry points
git log --oneline -5       # recent history
```

Key files for flow verification: `src/index.ts` (SDK surface + session lifecycle), `src/ui/quick-bug.ts` (ticket modal), `src/report-builder.ts` (report assembly + `getSessionVideo`), `src/exporters/html-replay.ts` + `html-template.ts` (export), `src/video-recorder.ts` (recording transports), `src/storage.ts` (persistence), `tracebug-extension/background.js` (injection/badge/recording relay).
