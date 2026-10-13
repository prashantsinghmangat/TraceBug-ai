# v1.11 launch work - progress log

Add <=5 lines per phase: what changed, files touched, how it was verified, open issues.
Newest entry at the bottom. Keep the last two entries here; move older ones to
`PROGRESS-archive.md` when this file passes ~150 lines. Current state lives in `STATE.md`, not here.

## Phase 4, Step B - the share dialog explained, and macOS answered (2026-10-12)
- **`surfaceMode` was a dead setting in the extension.** The popup persisted it, `background.js` and
  `content-script.js` forwarded it, the `tb:rec:start` RPC carried it - and `offscreen.js` never read
  it (grep: zero hits). Only `src/video-recorder.ts`'s in-page path honoured it, so the two
  transports disagreed and `docs/chrome-extension.md:66` described the SDK's behaviour as the
  extension's. `preferCurrentTab` is now passed when the user chose "Current tab", matching the SDK.
- **A macOS Screen-Recording denial read as a user cancel.** `getDisplayMedia` raises
  `NotAllowedError` for both, and `offscreen.js` collapsed every `NotAllowedError` into
  `"cancelled"` - so a blocked browser produced "Recording cancelled" and nothing pointing at System
  Settings. New `src/capture-errors.ts` branches on the MESSAGE ("Permission denied by system"), not
  on the platform or the user agent: macOS is the only OS with this gate, so the error identifies the
  situation and UA-sniffing would only add a worse guess on top of a good one. A new `"blocked"`
  status (distinct from `"error"`) carries it, so the union makes TypeScript point at any caller that
  forgets, and the notice is sticky with a **Capture without video** button rather than a 2.5s toast
  - a four-step instruction ending in "restart your browser" cannot be on a timer. **Found while
  wiring it:** the popup's capture path passes no `onStatus` at all, so this failure was previously
  *completely silent* there - no dialog, no capture, no message.
- **The picker line** lives in `src/ui/pre-record.ts` (the module that already owns the moment before
  a recording) and is called from `video-recorder.startVideoRecording` - the one function every
  transport and every caller funnels through - and cleared in its `finally`, which covers started,
  cancelled and failed alike. Copy branches on the mode because the dialog does: with
  `preferCurrentTab` there is no list to "pick this tab" from.
- Files: new `src/capture-errors.ts`, `tests/{capture-errors,picker-hint,offscreen-capture}.test.ts`;
  edited `src/{video-recorder,index,compact-toolbar}.ts`, `src/ui/{pre-record,toast}.ts`,
  `tracebug-extension/offscreen.js`, `e2e/ext-events-capture.e2e.mjs`,
  `docs/{quickstart.md,chrome-extension.md}`, `CHANGELOG.md`. `showActionToast` gained an optional
  `autoDismissMs` (`null` = until dismissed); its 8s default is unchanged for existing callers.
- Verified: typecheck + lint clean; `npm test` **38 files / 626 passing** (+36 across
  capture-errors, picker-hint and offscreen-capture). *(Corrected: this line first said
  37 files / 618 - a misread run. The commit `fde3619` adds exactly those three files, and a
  re-run of the suite at that commit gives 38/626.)* `build` + `build:ext` OK; `ext:lint` 0
  errors / **69** warnings, distribution unchanged again; `ext:firefox` installs.
  `ext-events-capture` **22/22** (+1: no picker hint on the events path). `ext-provider-confirm`,
  `ext-secret-migration` 26/26 and `ext-redaction` all still green.
- Notable test choices: `tests/offscreen-capture.test.ts` runs the REAL `offscreen.js` in a
  `node:vm` with a fake `navigator.mediaDevices` and asserts the constraints it passes - an offscreen
  document is not a Playwright page, so no real browser can see them. `tests/capture-errors.test.ts`
  pulls the local `isSystemPermissionDenial` copy out of `offscreen.js` and runs it against the same
  cases as the SDK's, so the duplicated predicate (the file cannot import SDK modules) cannot drift
  silently.
- Open issues: (1) **the macOS block itself is still unverifiable here** - it needs a real Mac with
  the permission off; what is tested is that the error string maps correctly, in both copies.
  (2) Whether **Firefox** honours `preferCurrentTab` and what its OS-denial message says are both
  manual rows. (3) The in-page (npm SDK) path's system-denial branch has unit coverage of the
  predicate but no browser test, same reason as (1).

## Phase 4 - two additions after Step B (2026-10-12)

- **The video pref moved to `chrome.storage.local`.** It lived in the popup's own `localStorage`,
  which a service worker can neither read nor write, so one question had no answer: has this user
  chosen whether to record video, or have they never been asked? A missing field is not a choice -
  and that ambiguity is what silently flipped a 1.10 always-video user to no-video. The blob is now
  `tb_record_opts` with an explicit `videoSetBy: "user" | "default"`, and `runtime.onInstalled`
  seeds a default that **differs by reason**: video **off** on install, video **on** on update,
  because a pre-Phase-4 user has been recording video on every capture whether they asked to or
  not, and flipping that silently would take away what they use TraceBug for. A `"user"` value is
  never overwritten in either direction. Two guards: on `update` a stored `video` boolean means
  this build already decided for this profile, so the update default does not re-apply (without it,
  a fresh installer who never opened Record options would have video switched **on** by their next
  update); and the popup's migration falls back to the stored seed rather than a literal `false`
  when the legacy blob carries no answer, or the first popup open would undo the update seed. The
  migration has to merge rather than skip-if-present: onInstalled always runs before the popup is
  first opened, so the seed is already there, and "only migrate when the key is absent" would
  discard the choice of a 1.11 user who had turned video on. `videoSetBy` is promoted to `"user"`
  only by the checkbox's own handler - not by a surface or delay change, and not by clicking
  Capture Bug, since accepting a default is not choosing one and a `"user"` stamp would freeze that
  profile on a default it never saw.
- **The exported replay heading names its page.** rrweb restarts on every document while an events
  capture deliberately survives a navigation, so the console/network/action lists span the whole
  capture and the replay beside them covers only the page it ended on. The heading now reads
  "Replay of the last page (/checkout/payment)" on the DOM-replay path. Not on the video path - a
  screen recording keeps rolling across navigations, so there the label would be the inaccuracy -
  and the timeline scrubber keeps its own "Replay" label, which is built from the session's events
  and really does span everything. The href is read from the rrweb Meta event (`type: 4`) and stored
  as `payload.rrwebPage` **before** gzipping, so the viewer need not inflate the stream to render a
  heading.
- Files: new `tests/{record-opts,replay-page-label}.test.ts`; edited
  `tracebug-extension/{background.js,popup.js}`, `src/exporters/{html-template,html-replay}.ts`.
  Deleted `docs/launch/designs/tracebug_welcome_page_variant_{a_split_workbench,b_guided_timeline}/`
  (unused, and carried invented claims a later session could have copied).
- Verified: typecheck + lint clean; `npm test` **40 files / 658 passing** (+32: 25 record-opts,
  7 replay-page-label). `build` + `build:ext` OK; `ext:lint` 0 errors / **69** warnings, baseline
  unchanged. `ext-events-capture` **22/22** - and its navigation checks corroborate the label: the
  capture crosses a navigation, the timer keeps counting, and the report comes back with 9 rrweb
  events, i.e. the last page's stream only.
- Notable test choice: `popup.js` is one `DOMContentLoaded` closure over the whole popup DOM, so it
  cannot be evaluated in a `node:vm` the way `offscreen.js` can. `tests/record-opts.test.ts` slices
  the real `loadRecordOpts` text out of the shipped file and runs that, injecting the two key
  constants and pinning their literals against the source so a rename cannot pass silently. Weaker
  than loading the file; stronger than a copy of the logic.
- Open issues: (1) The popup migration is **not** covered end-to-end in a browser - the slices test
  the precedence rules and the stamping, not the popup actually opening. Two manual passes worth
  doing: a profile with a `tracebug_record_opts` blob holding `video: true`, updated, should still
  show the checkbox ticked; and a pre-1.11 profile with no `video` field at all, updated, should
  show it ticked too (the update seed) rather than cleared. (2) The reason split means the two
  populations now see different first captures, so any manual script that says "the first capture
  records events, not video" is only true of a fresh install.

## Phase 4, Step C - a welcome page that works offline (2026-10-12)

- First run opened the REMOTE `tracebug.dev/try.html`, so the first thing a new user saw depended on
  their network and on a page that ships separately. Now `tracebug-extension/welcome.html` + `welcome.js`
  (bundled, no remote assets, in `SHARED_FILES`), with that playground as its step 2.
- Nothing is hardcoded that the page has no right to assert: version from `getManifest()`, the capture
  shortcut from `chrome.commands` (plus the "No shortcut set" variant), and the rebind link branches on
  the extension URL scheme with text-step fallback if Firefox refuses `about:addons`.
- The "Rolling this out to a team?" card is ABSENT - `tracebug.dev/teams` does not exist. `TEAM_GUIDE_URL`
  is empty and the card builds itself when set. Corrected `screens.md`, which told a future session to
  draw a fixed Ctrl/Shift/B key group - a keystroke that captures nothing since Phase 3.
- Files: new `welcome.html`, `welcome.js`, `tests/first-run.test.ts`; edited `background.js`,
  `build/build-ext.mjs`, `screens.md`, `CHANGELOG.md`. Verified: check.mjs --full all green,
  669 passing / 41 files (+11), ext:lint 0 errors / 69 warnings.
- Open: the page has never been RENDERED (tests assert source, not layout); and `dist/**` is read-denied
  by `.claude/settings.json`, so the build output could not be inspected here - only `SHARED_FILES`.

## Phase 4, Step D - what's new, per version (2026-10-12)

- An update no longer steals a tab. `background.js` `flagWhatsNew` writes the landed version to
  `tb_whats_new` and holds no copy at all; `popup.js` owns a literal per-version `WHATS_NEW` table and
  renders the card only when that version has an entry. A release that forgets an entry shows nothing
  rather than an empty box, and the stale flag is dropped so it is not reconsidered on every open.
- **The card is invisible until the version bump** - the table is keyed `1.11.0`, the manifest says
  `1.10.1`. That is the design working, not a bug: copy appears when the release it describes ships.
- `ext:lint` caught a real one. The check icon was built with `innerHTML`, which web-ext flags
  UNSAFE_VAR_ASSIGNMENT - warnings went 69 -> 70 and the baseline failed the gate. Rebuilt with
  `createElementNS` (`wnCheckIcon`); back to 69. Exactly what the baseline is for.
- Files: new `tests/whats-new.test.ts`; edited `background.js`, `popup.js`, `popup.html`, `styles.css`,
  `tests/helpers/chrome-mock.ts` (version now settable), `CHANGELOG.md`. Verified: check.mjs --full all
  green, 685 passing / 42 files (+16), ext:lint 0 errors / 69 warnings; ext-events-capture 22/22,
  ext-redaction 4/4.
- Open: the card has never been RENDERED - no screenshot, no real popup. Needs a profile updated from
  a 1.11.0 build, which cannot exist until the version is bumped.

## Phase 4, Step E - which page, and why you left (2026-10-12)

- The popup's "can't run here" panel now says WHICH page it means: a host/path card fed by a new
  `describePage` in `page-support.js` (there, not popup.js, so the worker could reuse it and it is unit
  testable). It returns null - card absent, not blank - when `tab.url` is invisible, which since Phase 1
  is the normal state. Plus one glyph per reason, indigo only where one click fixes it; `csp`,
  `needs-access` and `unknown` keep the pixel-bug fallback, as `screens.md` names no glyph for them.
- `runtime.setUninstallURL` -> `https://tracebug.dev/bye?v=<version>`, set at worker start rather than on
  install so a profile running since before this version still gets it. Version only: a test asserts the
  query string has exactly one key, because the page's fine print promises that.
- New `website/app/bye` (page + client form): seven reasons, optional note and email, Send and an
  equally prominent Skip, thank-you state with GitHub-issue and reinstall links. No navbar, no footer,
  noindex - someone who just uninstalled is not a lead. POSTs via Netlify Forms like `/feedback`;
  registered in `public/__forms.html`, without which submissions are accepted and silently dropped.
- Files: new `website/app/bye/{page.tsx,ByeForm.tsx}`, `tests/uninstall-and-page-card.test.ts`; edited
  `page-support.js`, `popup.{js,html}`, `styles.css`, `background.js`, `__forms.html`, chrome-mock
  (records the uninstall URL), `CHANGELOG.md`. Verified: check.mjs --full green, 708 passing / 43 files
  (+23), ext:lint 0/69, website `tsc --noEmit` clean, ext-events-capture 22/22, ext-redaction 4/4.
- Open: neither the popup states nor `/bye` has been RENDERED. `/bye` also needs one real submission
  against Netlify to prove the form is collected - that cannot be tested locally.

## Phase 4, Step F - the review ask, and a footer you can remove (2026-10-12)

- New `src/links.ts` is the one place store URLs and UTM tags live (Phase 5's last item). **I had
  invented a store id and an AMO slug on the first pass**; the real Chrome id is
  `fdemmibikigigkfjngclmdheeajhdgaj`, verified against CHANGELOG.md and three docs that agree. The
  repo has no confirmed AMO slug, so there is deliberately **no Firefox listing constant** - a guessed
  store URL baked into an export is a dead link for whoever reads that report later. Also corrected the
  invented slug I had put in `website/app/bye/ByeForm.tsx` during Step E.
- The exported `.html` footer already existed, pointing at `tracebug.dev/?ref=replay`. Retargeted to the
  store listing with `utm_source=report&utm_medium=export`, and made removable: `showFooter` on the
  payload, `tracebug_show_export_footer` as the pref, and a `menuitemcheckbox` in the export menu. An
  export is often attached to a public issue or sent to a client; a promotional line must not be
  unremovable there.
- New `src/ui/review-ask.ts`: asks after the 3rd successful export, **never in the user's first
  session**, once more at the 10th if dismissed, then never. Marked asked at SHOW time, so ignoring it
  counts. Counting hooks the two export paths only after a file exists. No rating, no count, no social
  proof, no incentive - asserted as rules in the tests, not as implementation.
- Files: new `src/links.ts`, `src/ui/review-ask.ts`, `tests/review-ask.test.ts`; edited
  `src/exporters/{html-template,html-replay}.ts`, `src/ui/quick-bug.ts`, `website/app/bye/ByeForm.tsx`,
  `docs/launch/{PLAN,STATE}.md`, `CHANGELOG.md`. Verified: check.mjs --full green, 730 passing /
  44 files (+22), ext:lint 0/69; milestone-ask 5/5, ext-events-capture 22/22, ext-player-csp green.
- Open: the card has never been RENDERED, and the review link cannot be clicked through in a test.
  Phase 5 is now down to the **issue signature** alone; `PLAN.md` Phase 5 is annotated accordingly.

## Phase 5 closed - the issue signature (2026-10-12)

- New `src/integrations/issue-signature.ts`: "Reported with TraceBug" linking to the listing with
  `utm_source=issue`. Applied at `tracker-client.ts`'s `issueBody` and a new `slackText`, which is the
  one chokepoint GitHub, Linear, the page-world path AND the extension bridge path all pass through -
  signing at the call sites would have let the bridge path drift from the page path silently.
- Slack already ended every post with an unlinked `_Reported via TraceBug_`. That line is REPLACED, not
  appended to; two credits in one message would be worse than either. With the signature off, the old
  line is left alone rather than silently deleted.
- Idempotent by design (`body.includes(TEXT)` guard), because a body can pass through more than one
  helper. Toggle sits beside the export-footer one in the export menu, default on, labelled
  "Issue credit: on/off" - an issue body is written into someone else's tracker and stays there.
- Files: new `src/integrations/issue-signature.ts`, `tests/issue-signature.test.ts`; edited
  `src/integrations/tracker-client.ts`, `src/ui/quick-bug.ts`, `docs/launch/{PLAN,STATE}.md`,
  `CHANGELOG.md`. Verified: check.mjs --full green, 746 passing / 45 files (+16), ext:lint 0/69,
  ext-provider-confirm 61/61 (it inspects real send bodies).
- **Phase 5 is now complete** and `PLAN.md` says so. `STATE.md` was rewritten rather than appended to:
  it had grown a per-step changelog, which is what PROGRESS is for. Next: Phases 6-9.

## Phase 6 - edge cases (2026-10-13)

- **Oversize exports.** Above a 20 MB estimate the modal now says so, names GitHub's 25 MB attachment
  cap, and offers what is actually possible. PLAN.md's "DOM replay only (no video)" fallback **cannot
  fire**: when a DOM replay exists the exporter already drops the video, so that is the small export.
  The oversize case is the opposite branch - no replay, WebM base64-embedded - where the offers are
  "Export without video" (new path, `includeVideo: false`) and taking the `.webm` separately. Warned at
  20 rather than 25 because the figure is an estimate and a 26 MB surprise after a wait is the failure.
- **Canvas pages.** New `src/replay-fidelity.ts`: rrweb runs with `recordCanvas: false`, so a
  canvas-driven page replays as a correctly-sized empty box. Warned at events-capture start, where
  "turn on video" is still an option, measured on RENDERED area vs viewport (>25%) so sparklines and
  2000px-backing-store icons don't trigger it. TraceBug's own draw canvas and anything under
  `#tracebug-root` are excluded. Auto-dismisses after 12s with a Stop action - a sticky notice over the
  page you are reproducing a bug on would be worse than the problem.
- **Jira** menu item is now "Copy for Jira", with a tooltip saying why it cannot file (Jira Cloud is
  CORS-blocked for browser XHR). The Slack item needed nothing - resolved by Phase 2b.
- Files: new `src/replay-fidelity.ts`, `tests/phase6-edges.test.ts`; edited `src/index.ts`,
  `src/ui/quick-bug.ts`, `tests/review-ask.test.ts`, `docs/launch/{PLAN,STATE}.md`, `CHANGELOG.md`.
  Verified: check.mjs --full green, 763 passing / 46 files (+17), ext:lint 0/69; ext-events-capture
  22/22, blur-tracking 7/7, pre-record 7/7.
- One test of mine needed loosening: `review-ask` pinned `showFooter` to exactly 2 call sites, and the
  new no-video path is a legitimate third. Now asserts coverage of every export path instead of a count.

## Phase 7 - diagnostics without telemetry (2026-10-13)

- New `tracebug-extension/diagnostics.js`: a scrubber, a 20-entry error ring in
  `chrome.storage.session`, and a report builder. Loaded by the worker (importScripts + Firefox
  `background.scripts`) and the popup, same pattern as `page-support.js`. No `fetch`, no
  `sendBeacon`, no `WebSocket` - a test asserts that, because a network call here would make "no
  telemetry" false.
- The scrubber is the privacy boundary: whatever it misses, the user pastes into a public issue.
  **The leak test PLAN.md asked for found a real leak on the first run** - a 16-digit card number
  inside `<input value="...">` passed every rule (my opaque-run rule needed 24+ chars). Fixed with a
  12+-digit rule AND an HTML-markup strip that runs FIRST, before the placeholders that themselves
  look like tags. Tests assert against real browser error strings, not against the regexes.
- Stack frames are filtered to TraceBug's own files, so a host-page script path - which is both a URL
  and useless for fixing TraceBug - never appears. Granted origins are matched against our own
  declared list and anything else is counted, not named: a user who pointed Ollama at
  `llm.acme.internal` has granted their own infrastructure.
- The UA is read in exactly one place, reduced to a browser name + MAJOR version and an OS family.
  That is reporting, not branching - the project's feature-detect rule is about deciding behaviour.
- Files: new `diagnostics.js`, `tests/diagnostics.test.ts`; edited `background.js`, `popup.{js,html}`,
  `build/build-ext.mjs`. Verified: check.mjs --full green, 796 passing / 47 files (+33), ext:lint
  0 errors / 69 warnings; ext-redaction 4/4, ext-events-capture 22/22, ext-provider-confirm 61/61.
- `ext:lint` caught a broken string literal in popup.js that `typecheck` and `lint` both missed -
  extension JS is outside the TS pipeline, so web-ext is the only parser that sees it.

## Phase 8 (partial) - the Phase 2a guarantee, in a real DOM (2026-10-13)

- New `e2e/ext-no-secrets-in-page.e2e.mjs`. Seeds a GitHub PAT, a Linear key, a Slack webhook and an AI
  key into `chrome.storage.local`, runs the real injection chain, opens the ticket modal and the
  settings pointer, then harvests everything a page script could read - FROM INSIDE THE PAGE, because
  that is the threat model. 13 checks, all passing.
- **Proved it can fail.** Planted the token as a `.value` PROPERTY only, the way the old
  `value="${escapeHtml(tok)}"` prefill did: `clean: outerHTML` passed while the `.value` check failed.
  An outerHTML-only test would have missed it entirely - which is the whole reason PLAN.md asked for
  this one.
- That exercise found two reporting flaws of mine: shadow-root input values were bucketed as plain
  inputs (so a failure pointed at the wrong part of the DOM), and the settings-pointer check printed
  "DOM still clean" even when it wasn't. Both fixed, then re-verified with a shadow-only leak, which
  now reports as a shadow leak with the other buckets correctly clean.
- The suite also asserts the harvester can see the page's OWN values (`hunter2`, a shadow value, a
  storage value). Without that, every "clean" result could be a false negative from a broken harvester.
- Added to `ci.yml`'s e2e job - possible now that extension loading works headless - and to
  `e2e/README.md`. Verified: check.mjs green, 796 passing / 47 files; the suite 13/13.
- **Phase 8 steps 2-4 (fixtures, smoke spec, golden report, CI nightly) are deferred to after
  submission**, by decision. Only this item was pulled forward.

