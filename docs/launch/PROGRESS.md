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

