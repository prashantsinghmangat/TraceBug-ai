# Production Readiness — v1.7.0

**Status: READY TO LAUNCH** — code, site, and store package are done and verified; four
operator actions remain (below). Last verified **2026-07-18**, HEAD `6d7f671`.

---

## 1. Surface-by-surface status

| Surface | Version | Status | Evidence |
|---|---|---|---|
| **Website** (tracebug.dev) | v1.7 | 🟢 **LIVE** | Deploys from `main`; 32 pages build; demo video, live sandbox, `/changelog` all verified on the production URL |
| **Live sandbox** (/try.html) | — | 🟢 **LIVE** | Full capture flow smoke-tested on the production URL: toolbar → track → bugs fire → live detector → Capture Bug → populated ticket. (Required two hotfixes — see §4) |
| **Chrome extension** | 1.7.0 | 🟡 **ZIP READY, not uploaded** | `releases/tracebug-extension-v1.7.0.zip` built by `npm run zip:ext`; store assets + listing copy ready (see §3) |
| **npm: tracebug-sdk** | 1.7.0 local / **1.5.0 on registry** | 🔴 **TWO RELEASES BEHIND** | Registry never got 1.6.0 either. `npm publish` from repo root |
| **npm: tracebug (CLI/MCP)** | 1.7.0 local / **1.5.0 on registry** | 🔴 **TWO RELEASES BEHIND** | `npm run build:cli` then `npm publish` from `packages/tracebug/`. Note: `npx -y tracebug mcp` users currently get 1.5.0 — **without Downloads/Desktop auto-discovery**, so the website's "no --dir needed" promise is broken until this ships |
| **Firefox extension** | — | ⚪ Deferred | Port paused after Phase 2 by choice; `dist/firefox` builds but unshipped |

## 2. Quality gates (all green at HEAD)

- **Tests:** 156/156 across 13 files (`npm test`)
- **Typecheck:** clean, browser + node configs (`npm run typecheck`)
- **Lint:** **0 errors, 0 warnings** (was 177 — cleared with real types, zero suppressions)
- **Builds:** SDK (cjs/esm/iife) ✓ · extension chrome+firefox ✓ · website (32 static pages) ✓
- **Dead weight:** dependency audit found **zero unused packages** (root + website); dead code, stale artifacts, and pre-rebrand assets removed
- **Adoption audit:** funnel walked end-to-end (land → install → capture → export → MCP); all blockers fixed (broken store badge, dead docs domain, MCP command inconsistency, missing example-app README, popup shortcut/mic guidance)

## 3. Launch checklist — remaining operator actions

1. **🔴 Rotate Supabase keys** — old anon + service-role keys were in git history before the
   `git filter-repo` scrub; anyone who cloned earlier may hold them. Dashboard → Settings →
   API → new secret key (or Reset JWT secret) → update Netlify env
   (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`) →
   redeploy → verify old key returns 401. **Do this before announcing.**
2. **🔴 Publish npm (both packages)** — `npm publish` at root (tracebug-sdk), then
   `npm run build:cli && cd packages/tracebug && npm publish`. This unblocks the real MCP
   zero-config story for `npx` users.
3. **🟡 Upload to Chrome Web Store** — `releases/tracebug-extension-v1.7.0.zip` + everything
   in `releases/store-assets/` (5 real-UI screenshots, 2 promo tiles). Put
   `tracebug-demo.webm` on YouTube and paste the URL. Fill the `<all_urls>` justification
   from `docs/CHROME-WEB-STORE-LISTING.md` §7b. Review typically takes 1–3 business days.
4. **🟡 Post-deploy smoke** (5 min, after 1–3): install the published extension fresh →
   welcome tab opens the sandbox → capture → export → `claude mcp add tracebug -- npx -y
   tracebug mcp` → agent reads the report.

## 4. Incidents caught pre-launch (and their lessons)

- **Sandbox dead on production** — `enabled:"auto"` (correctly) disables the SDK on
  production hostnames; every earlier test ran on localhost where auto always enables.
  Fixed with `enabled:"all"` in try.html; verified on the live URL.
  *Lesson: anything meant to run on the deployed site must be verified on the deployed site.*
- **First hotfix used an invalid option** — `enabled: true` isn't in the option's union type
  and silently fell through to auto. *Open follow-up (non-blocking): accept booleans
  (`true`→`"all"`, `false`→`"off"`) or `console.warn` on unrecognized values — the next
  user will make the same mistake.*
- **Stale sandbox SDK copy** — `website/public/tracebug-sdk.js` drifted from the built
  bundle. Now auto-synced by `build:all` / `build:ext`; drift is no longer possible.

## 5. Known limitations & accepted debt (non-blocking)

- `TraceBugEvent.data` is typed as a documented `any`-alias (`JsonParsedValue`) — a strict
  type breaks seven downstream files; needs a dedicated event-pipeline refactor.
- The old canvas store-asset generators (`generate-promo-tiles.html`,
  `generate-store-screenshots.html`) still draw pre-rebrand art — superseded by real-UI
  captures in `releases/store-assets/`; don't use their output.
- Screenshot-editor toolbar (Ellipse / Line / Blur / Redo) — planned, not started.
- Firefox port — paused after Phase 2.
- Demo video is webm-only; Safari site visitors get the poster + sandbox-link fallback
  (by design). An mp4 twin needs ffmpeg.
- Extension store review may question `<all_urls>` — justification text is prepared.

## 6. Ops quick reference

| Task | Command / where |
|---|---|
| Full build + sandbox SDK sync | `npm run build:all` |
| Extension dists (chrome+firefox) | `npm run build:ext` |
| Store upload zip | `npm run zip:ext` → `releases/` |
| All gates | `npm run typecheck && npm run lint && npm test` |
| Website prod build | `cd website && npm run build` (never while a dev server owns `.next`) |
| Re-cut the demo video | Playwright script pattern in git history (`tmp-video6.mjs`, session of 2026-07-15) — drives `/try.html`, records 1280×720 |
| Regenerate store screenshots | Same pattern: script the sandbox at 1280×800, element-shot the promo tiles from `d:\tmp\promo-tiles.html` |
| Deploy | Push to `main` → Netlify auto-builds (~60–90 s); verify with the live-URL smoke test |
| Rollback | `git revert <sha>` + push (Netlify redeploys previous state); extension/npm are versioned — publish a patch, never unpublish |
