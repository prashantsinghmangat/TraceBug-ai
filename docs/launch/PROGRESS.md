# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## CSP style-src nonces: TraceBug's own `<style>` tags were silently dropped (2026-10-26)

- **What:** on a claude.ai artifact page (`style-src 'nonce-...'`, no `unsafe-inline`), every `<style>`
  element TraceBug creates — theme variables, the dashboard's CSS reset, every animation keyframe —
  was silently ignored: unlike Trusted Types, this CSP directive doesn't throw, so there was no
  exception to catch, just an unstyled, broken-looking dashboard and a console full of CSP violation
  reports (which TraceBug's own collector then captured as "errors" in its own bug report, which is how
  the user found it — first stack frame: `theme.ts`'s `_applyThemeVars`).
- **Fix:** a new `createStyleTag()` in `src/ui/helpers.ts` borrows the nonce the host page already used
  on one of its own inline `<script>`/`<style>`/`<link>` tags, via the `.nonce` IDL property (browsers
  deliberately expose it to trusted script even though `getAttribute`/`outerHTML` hide it, to stop a
  nonce leaking out through injected markup). All 17 `document.createElement("style")` call sites
  across `src/` now go through it — same chokepoint pattern as `setInnerHTML` for Trusted Types.
- **Scope, stated at the time:** this fixed `style-src-elem` violations only, not `style-src-attr`
  (inline `style="..."` attributes) — see the next entry, which closed that gap the same day once the
  user reported the dashboard was still completely invisible on claude.ai.
- **Verified:** new `e2e/ext-style-nonce-page.e2e.mjs` — a real nonce-gated CSP fixture. `check.mjs
  --full` all green (939/58); re-run clean: `ext-trusted-types-page` 9/9, `ext-shipping-path` 16/16,
  `ext-video-recording` 8/8, `ext-sdk-isolation` 17/17.

## The style-src-attr gap closed for real: inline style="" attributes survive the same CSP (2026-10-26)

- **What:** the user reported TraceBug worked on temp-mail.org but "nothing appears at all" on the same
  claude.ai artifact page the nonce fix above targeted. Root cause: nearly all of TraceBug's actual
  layout comes from inline `style="..."` HTML ATTRIBUTES — baked into the markup passed to
  `setInnerHTML()` across the toolbar/HUD/modal, plus ~108 direct `el.setAttribute("style", ...)`/
  `el.style.cssText = ...` call sites. A nonce cannot cover attributes at all (Chrome has no nonce/hash
  path for `style=""` without `unsafe-hashes`), so every one of those was silently dropped — the
  dashboard mounted into the DOM with zero positioning, invisible rather than broken-looking.
- **Key finding, confirmed experimentally** (a throwaway Playwright probe against a real nonce-CSP
  page, not assumed): when this CSP blocks an inline style attribute, `el.getAttribute("style")` still
  returns the original string — the attribute itself survives. What's blocked is folding that string
  into the element's live `CSSStyleDeclaration` (`el.style.cssText` reads back empty, nothing renders).
  Setting individual LONGHAND properties through the CSSOM (`el.style.setProperty(prop, value)`) is a
  direct mutation of that object, not a reparse of the attribute — it does not go through the CSP gate
  at all, and took effect immediately in the probe.
- **Fix, two parts:** (1) `setInnerHTML()` (`src/ui/helpers.ts`) now calls a new
  `reviveInlineStylesForCsp()` after every assignment, which walks the inserted subtree and replays
  each element's `style` attribute through the CSSOM via a new `setInlineStyle()` (a small
  paren-depth-aware declaration-list parser, needed so a value like
  `url(data:image/png;base64,AAAA==)` doesn't get sliced apart by its embedded `;`/`:`). This covers
  the bulk of the problem — nearly every styled element in every HTML template — with ONE chokepoint
  change, not hundreds of call-site edits. (2) The ~108 direct `setAttribute("style", ...)`/
  `style.cssText = ...` sites across 11 files (`compact-toolbar.ts`, `dashboard.ts`, `draw-mode.ts`,
  `element-annotate.ts`, `inspect-mode.ts`, `quick-bug.ts`, `pre-record.ts`, `review-ask.ts`,
  `milestone-ask.ts`, `toast.ts`, `annotation-store.ts`) were mechanically converted to
  `setInlineStyle()` via a one-off codemod script (deleted after use) — written with a dry-run-first,
  diff-reviewed-before-trusting workflow after its first pass corrupted `milestone-ask.ts` by mistaking
  an apostrophe inside a `//` comment ("the modal's overlay") for a string delimiter; fixed by making
  the scanner skip `//` and `/* */` comments, then re-verified clean via `tsc --noEmit` + a full diff
  review of all 11 files before trusting it.
- **Collateral fix:** `tests/picker-hint.test.ts` asserted on the exact serialized `getAttribute('style')`
  string (`"position:fixed!important"`, no spaces) — which legitimately changes format now that the
  value is built via individual `setProperty()` calls rather than one raw attribute string. Rewritten to
  assert against the live CSSOM (`el.style.position`, `el.style.getPropertyPriority(...)`) instead,
  which is a strictly stronger check of actual behavior, immune to incidental serialization differences.
- **Verified:** `e2e/ext-style-nonce-page.e2e.mjs` extended to 7/7 — now asserts the real toolbar (built
  via `setInnerHTML` with inline `style=""` attributes, not a synthetic probe) actually renders with
  non-zero size and has a genuinely clickable button under the nonce CSP, not just that a `<style>` tag
  carries a nonce. `check.mjs --full` all green (939/58, unchanged baseline) after fixing the one
  resulting test. Re-run clean: `ext-trusted-types-page` 9/9, `ext-shipping-path` 16/16,
  `ext-video-recording` 8/8, `ext-sdk-isolation` 17/17, `ext-events-capture` 22/22,
  `ext-reload-reinject` 8/8, `ext-worker-restart-reinject` 4/4, `ext-badge-host-ui-defer` 4/4.

## External fresh-eyes review (Brutally.ai), no code changes (2026-10-27)

- **What:** an outside AI tool scored TraceBug 6.8/10, flagging adoption friction and monetization as
  the main risks. Logged as input to the recurring fresh-eyes/buyer audit, not as new engineering work.
- **Mostly stale/already done:** its "build one-click GitHub/Linear export" fix already exists
  (`src/github-issue.ts`, `src/linear-issue.ts`, tracker "Send to…" buttons). Its other three asks
  (aggressive integration push, open-core/enterprise tier) are speculative features with no user
  evidence — out of scope per the engineering allowlist.
- **One open question worth checking, not building:** can a non-technical QA/PM trigger a capture and
  export in under two clicks without the terminal, using the *current* popup flow? No code changed here
  to answer that — needs an actual walkthrough, not a feature.

## The TraceBug logo now links home wherever it appears in a header (2026-10-26)

- **What:** the logo+wordmark in the popup header, `welcome.html`'s top bar, and the in-page dashboard
  panel header was a static, non-interactive mark in all three places — user-requested click-through.
- **Fix:** each wrapped in an `<a target="_blank" rel="noopener">` to `tracebug.dev`, with
  hover/focus-visible styles added. `welcome.html` sets the href via `welcome.js` at runtime
  (`id="homeLogo"`, same pattern as its other outbound links) rather than hardcoding it in the markup —
  `tests/first-run.test.ts` asserts the bundled first-run page ships zero literal `https:` hrefs, so it
  can render fully offline. `popup.html`'s footer already links `tracebug.dev` directly with no such
  constraint, so its logo link is a plain hardcoded href. Checked other candidate headers
  (`options.html`, the ticket modal, the compact toolbar, `confirm-send.html`, `player.html`) — none
  have a logo mark to begin with, so there was nothing to change there.
- **Verified:** `check.mjs --full` all green (939/58, unchanged baseline) after fixing the
  `first-run.test.ts` regression the first pass caused by hardcoding the welcome-page href.
