# Store listings — Chrome Web Store and Firefox Add-ons

The one place for every word and image the two stores show. Current for **1.14.0**. When a release
changes what a listing says, update this file in the same commit. How to upload a release is in
[RELEASING.md](RELEASING.md); images live in `assets/` (gitignored, see `assets/README.md`).

**Per release, edit two blocks here** — the Chrome "New in x.y.z" paragraph (§2) and the Firefox
release notes (§3) — then run `node scripts/release-sheet.mjs`. It writes
`docs/release-sheets/<version>.md`: every field of both stores, npm, the MCP registry, the website and
the GitHub release, in upload order, ready to copy and paste. `scripts/release-sheet.mjs` finds the
blocks by the bold labels further down this file (Description, Single purpose, Release notes, Notes
to reviewer) — keep those labels as they are.

## 1. Name and summary (they come from the manifest)

Both stores show the manifest `name` as the title and the manifest `description` as the summary, so
the listing can't differ from the manifest. Set both in `tracebug-extension/build/manifest.base.json`
and the dev `tracebug-extension/manifest.json`; `npm run check:versions` keeps them in step on `name`
and `description` (not `short_name`).

| Field | Chrome limit | Firefox limit | Current value |
|---|---|---|---|
| `name` | 75 | **45** (binding: one manifest feeds both) | `TraceBug: Bug Report Recorder & Replay` (38) |
| `short_name` | 12 | 12 | `TraceBug` |
| `description` | 132 | 132 | `Record a browser bug: replay, console and network in one offline file your AI agent (Claude Code, Cursor) can fix. Free, no upload.` (131; leads with capture since 2026-11-16, growth audit) |

A name over 45 characters passes Chrome but fails `npm run ext:lint` and AMO. The base manifest stores
`—` raw, the dev manifest as `—`; keep each file's convention.

## 2. Chrome Web Store

Dashboard → TraceBug → **Store listing**, **Privacy**, **Package**.

### Store listing

- **Category:** Developer Tools. **Language:** English (United States).
- **Screenshots** (1280×800 JPEG, no alpha, 5 max): `assets/chrome-store/` in this order —
  `1-audit`, `2-report`, `3-record`, `4-ai-agent`, `5-privacy` (1.12.0: the audit slide leads; console
  dropped to stay at 5. Previous set: `assets/archive/store-pre-audit-2026-11-12/`).
- **Promo tiles:** `assets/banners/promo-tiles/small-440x280.jpg`, `marquee-1400x560.jpg`.
- **Promo video:** https://www.youtube.com/watch?v=-U64GIPfeiQ (57 s). Short:
  https://www.youtube.com/shorts/Q1toEvFVW0c. Channel: https://www.youtube.com/@tracebugdev.
- **Website:** `https://tracebug.dev` · **Support:** `https://github.com/prashantsinghmangat/tracebug-ai/issues`
  · **Privacy policy:** `https://tracebug.dev/privacy`

**Description.** Chrome has no release-notes field: for the first few weeks after a release, put a
short "New in x.y.z" block at the top (from the CHANGELOG), then take it out.

```text
New in 1.14.0: send a bug straight to GitHub. Connect GitHub once — sign in on GitHub's own page with a short code, no token to create — then pick the repository, labels and assignee in a GitHub tab inside the ticket, and Create files the issue and opens it. TraceBug remembers your choices per site, so the next bug is two clicks. Your GitHub sign-in stays in the extension on your device; the site you're testing never sees it. Prefer a token? Paste one instead. Linear and Slack keep working as before. Also new: a cleaner Settings page with a light/dark switch.

Record a bug once. Get a report a developer can actually reproduce: a replay of what happened, the console errors, the failed requests and the steps, in one file that opens offline.

Free and open source (MIT). No account for bug capture, nothing uploaded. Site Audit asks for a free account (just your email) after 3 audits.

Watch the 1-minute demo: https://www.youtube.com/watch?v=-U64GIPfeiQ

━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━

1. Click the TraceBug icon → Capture Bug (or press Alt+B).
2. Reproduce the bug. TraceBug records clicks, typing, navigation, console output and network requests.
3. Click Stop. Review the report, then export it or send it to your tracker.

Want video too? Turn on "Events + Video". Tab mode records the current tab in one click, with no "Choose what to share" dialog; Desktop mode records any window or screen through Chrome's share dialog. Narrate with your microphone, pick which mic, and blur sensitive areas before you start.

━━━━━━━━━━━━━━━━━━━━
AUDIT ANY PAGE
━━━━━━━━━━━━━━━━━━━━

Click "Audit this page" for a 0–100 score and a list of real problems, each with where it is and how to fix it:

• Accessibility: axe-core WCAG 2.0–2.2 A/AA, plus keyboard checks (focus outline, focus hidden by a sticky header)
• Layout and phone width: overflow, overlapping controls, cut-off text, broken images, the page at 390px
• Speed: LCP, layout shift, main-thread blocking, heavy and oversized images
• SEO: title, description, canonical, headings, social tags, structured data, robots.txt and sitemap
• Errors: console errors and failed requests on the page

Locate each problem on the page, copy the fixes for your AI agent, or export the audit. Results the checks can't decide are listed for a person to check, not guessed. The audit never clicks, types or submits anything; it reads the site's robots.txt and sitemap.xml and loads the page once more, hidden, at phone width.

━━━━━━━━━━━━━━━━━━━━
WHAT'S IN A REPORT
━━━━━━━━━━━━━━━━━━━━

• A DOM replay of the session (and the video, if you recorded one)
• Console errors and warnings with stack traces
• Network requests, with the failed ones flagged
• Repro steps: every click, input, select and navigation, in order
• Environment: browser, OS, viewport, timezone, connection
• Screenshots of the visible area or a cropped region, which you can annotate
• A pattern-based hint at the likely cause, e.g. "POST /api/orders failed with 404 after clicking Place order"

━━━━━━━━━━━━━━━━━━━━
FIX IT WITH YOUR AI AGENT
━━━━━━━━━━━━━━━━━━━━

Export the report, then connect TraceBug's local MCP server once (Claude Code: "claude mcp add -s user tracebug -- npx -y tracebug mcp"). Claude Code, Cursor or any MCP client reads the report locally and works the bug in your codebase. It can also generate a failing Playwright test from the repro steps. Nothing is uploaded.

━━━━━━━━━━━━━━━━━━━━
EXPORT AND SHARE
━━━━━━━━━━━━━━━━━━━━

• One self-contained .html replay anyone on your team can open offline
• GitHub (sign in once, or use a token), Linear and Slack (with your own token); you confirm every send
• Jira markup, Markdown, .zip, HAR, and a failing Playwright test (.spec.ts)

━━━━━━━━━━━━━━━━━━━━
PRIVATE BY DEFAULT
━━━━━━━━━━━━━━━━━━━━

• Reports and settings stay on your device; your captures and reports never go to TraceBug. Only your email goes to tracebug.dev, and only if you sign in for Site Audit or join the update list.
• Passwords, tokens, card numbers and secret URL parameters are masked as they're captured. Add your own redaction rules for anything else.
• Blur any element before or during a recording.
• No analytics, no telemetry, no remote code.
• Chrome words the tab-recording permission as "Read and change all your data on all websites". TraceBug uses it only to record the tab you start a recording on, after you press Start.
• Open source: github.com/prashantsinghmangat/tracebug-ai

━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━

QA engineers, frontend developers, designers checking accessibility, and anyone who has had to answer "can you send me the steps?"

━━━━━━━━━━━━━━━━━━━━
LINKS
━━━━━━━━━━━━━━━━━━━━

• Website and live demo: https://tracebug.dev
• Source: https://github.com/prashantsinghmangat/tracebug-ai
• npm SDK (add TraceBug to your own app): https://www.npmjs.com/package/tracebug-sdk
• Issues and feedback: https://github.com/prashantsinghmangat/tracebug-ai/issues
```

### Privacy tab

**Single purpose:**
```text
TraceBug captures a browser bug on the tab where the user starts a capture: a replay of their clicks, inputs and navigation, the console errors, the network requests, and optionally a screen recording with microphone narration. It turns them into one bug report the user can review, save on their device, export as a file, or send to their own issue tracker or AI tool. On request it also audits that page for accessibility, layout, performance and SEO problems, so they can be reported and fixed the same way.
```

**Permission justifications** — one box per permission the manifest requests. Never justify a
permission the manifest doesn't ask for.

| Permission | Justification |
|---|---|
| `activeTab` | Lets TraceBug act only on the tab the user is looking at when they click Capture, Screenshot or Audit this page, or press the Alt+B shortcut: it injects the capture script there, takes the screenshot, or runs the page audit. It gives no access to any other tab. |
| `storage` | Keeps the user's settings (record options, chosen microphone, redaction rules), the integration tokens they enter, and a finished screen recording on their own device, plus the state of a running capture so it survives the service worker restarting. |
| `unlimitedStorage` | TraceBug stores bug-capture sessions (screen recordings, DOM replay events and screenshots) locally in the user's browser until the user exports or deletes them. A single capture can be several megabytes, so the default storage quota would cut recordings off mid-session. The data stays on the user's device and is never sent to TraceBug; it leaves the device only when the user exports it or sends it to a service they chose. |
| `scripting` | Injects TraceBug's capture script and its stylesheet into the current tab, only after the user starts a capture or a screenshot, and the packaged accessibility checker (axe-core, part of the extension package) only when the user runs a Site Audit. Nothing is injected automatically or in the background, and no code is loaded from outside the package. |
| `alarms` | Closes an unanswered "Send this report to your AI provider?" confirmation window after two minutes, so a send the user never approved can't be confirmed later. A Manifest V3 service worker can't hold a timer that long on its own. (Issue-tracker sends have no timer: they wait for the user's Create or Cancel.) |
| Optional `identity` (Chrome only) | Requested only when the user clicks **Connect** for an issue tracker that signs in through a browser window (Linear; not switched on in 1.14.0, so not requested in this version), to open that tracker's own sign-in page with `chrome.identity.launchWebAuthFlow` and receive the sign-in on the extension's own redirect address. Never requested at install; GitHub's sign-in doesn't need it (GitHub uses a device code). The Firefox build doesn't declare it. |
| `offscreen` | Hosts the MediaRecorder for the optional screen recording the user starts ("Events + Video"). A service worker has no media APIs, and the recording must keep running while the user navigates the recorded tab. The document is created when the recording starts and closed when it stops. |
| `tabCapture` | Records the tab the user opened TraceBug on when they start a recording in Tab mode (the default), without Chrome's "Choose what to share" dialog. Used only after the user clicks Start, and only for that tab; nothing is recorded in the background. The recording stays on the user's device unless they export or share it. Desktop mode does not use this permission and still shows Chrome's share dialog. Required rather than optional because Chrome only issues a tab stream ID for a tab the extension was invoked on while it already held this permission, so a runtime grant could never record the tab it was granted on. |
| Optional host permissions | Requested when the user saves a GitHub, Linear, Slack, OpenAI, Anthropic or Ollama integration (one fixed address each, or `localhost`/`127.0.0.1` for Ollama), so TraceBug can send the report to that service. Declared optional so TraceBug can request access to one specific address you enter for a self-hosted AI provider, only at the moment you save it, and never for all sites. |
| `https://api.github.com/*`, `https://github.com/*` (optional) | Requested when the user clicks **Connect GitHub** (or saves a GitHub token). `github.com` carries GitHub's device sign-in (the user types a short code on GitHub's own page; TraceBug never sees their password) and lets TraceBug read one parameter (`setup_action`) from the address of the GitHub App install window it opened, to tell the user an organisation owner still has to approve. `api.github.com` lists the user's repositories, labels and assignees and creates the issue they confirmed. Nothing is injected into github.com. |

**Remote code:** No, I am not using remote code.

**Data usage.** Declare on the cautious side: TraceBug never sends data to its developer, but at the
user's request it sends report content to GitHub, Linear, Slack or an AI provider, and it stores
user-supplied API tokens. Leaving out a category a reviewer thinks applies can cause a rejection.

- ✅ **Authentication information:** API tokens the user enters, stored on their device and sent only to the service they chose.
- ✅ **Web history:** a report carries the URL of the captured page and the pages visited during the capture, and goes to the user's tracker when they send it.
- ✅ **User activity:** clicks, inputs and navigation recorded during a capture.
- ✅ **Website content:** page text, console and network data, and the screen recording.
- Leave unticked: personally identifiable, health, financial, personal communications, location.
  Microphone audio stays inside the local video file and is never transmitted by TraceBug.
- ✅ All three certifications.

**Email ask (next release after 1.12.0 — update the data-use answers BEFORE submitting it):** the popup may
offer an optional email signup after the 2nd saved ticket/export (audits don't trigger it; Site Audit has its own sign-in). It sends the address the user types to
tracebug.dev and, only if they tick a box, three counts (audits, saved tickets, exports). CWS: tick
**Personally identifiable information** (email); purpose "product update emails, user
opted in"; not sold, not used for credit. AMO: the listing's privacy policy link covers it (updated 2026-11-13).
What happens after it is sent (website side, not the extension): one confirm email (double opt-in), then at
most one update a month with a one-click unsubscribe; delivered by Resend, named on the privacy page. The
extension itself still talks only to tracebug.dev, so no new host or permission to declare. Don't release
the popup ask until `/api/confirm` and `/api/unsubscribe` are live and a test signup went through end to end.
The SDK's 5th-ticket card already sent a typed email before this, so the old "leave PII unticked" answer was
arguably wrong already.

**Site Audit sign-in (ADR 009 — ships in 1.13.0).** Text applied 2026-11-16: the Chrome description and "New in 1.13.0", the AMO description, release notes and reviewer note. **Still to do in the dashboards at upload:** the CWS data-use ticks, the CWS reviewer note, AMO's add-on policy check, and screenshots that say "no account" (marked ☐ below).
- ☑ Description: replace "No account, no upload, no TraceBug server." with
  "No account for bug capture, nothing uploaded. Site Audit asks for a free account (just your email) after 3 audits."
  Add to the 1.13 "New in" paragraph: "Site Audit remembers its last result, shows the old and new score after a
  re-scan, and opens findings in Claude. After 3 free audits it asks for a free account (email + code)."
- ☐ CWS data-use: tick **Personally identifiable information** (email) and **Authentication information** (the
  one-time code). Purpose: "account sign-in for Site Audit; product emails only if the user ticks a separate box".
  Not sold, not used for credit. The audit's results, pages and URLs are never sent.
- ☐ CWS reviewer note: "Site Audit asks for a free account after 3 audits. Sign-in is email + 6-digit code on an
  extension page (signin.html); the extension calls only tracebug.dev. No new permissions. Test account: any
  email you control." AMO: same note; check the current add-on policies on features that need an account and
  say it in the listing.
- ☐ Screenshots/slides that say "no account" for the whole product: recaption.
- ☑ **AMO copy too** (added by the 2026-11-13 security audit — the lines above only covered CWS): the AMO
  description's "No account. No upload. No telemetry." and "nothing goes to TraceBug", and the AMO reviewer note's
  "Data is sent only when the user clicks Send…" — reword them the same way (bug capture: no account, nothing
  uploaded; Site Audit sign-in and the optional email ask send the email address to tracebug.dev).
- ☑ **Firefox data collection** (`build-ext.mjs`): the manifest now declares `required: ["none"]` plus
  `optional: ["personallyIdentifyingInfo", "technicalAndInteraction"]`, requested at the moment of the first send
  (`requestDataConsent` in `signin.js` and `popup.js`; Firefox 140+, ignored below). In the AMO reviewer note say:
  "Bug capture collects nothing. Optional data collection is requested only when the user types an email for Site
  Audit sign-in or the update list (and the usage counts only if they tick that box)." Check `web-ext lint` stays
  at the baseline.
- Privacy policy (tracebug.dev/privacy) already describes both, names the private contact (tracebugdev@gmail.com,
  `CONTACT_EMAIL` in `website/lib/site.ts`) and the delete path.

**Disclose if they change** (found in a code review, 2026-10-26):
- "Open in Claude" / "Open in ChatGPT" (`src/exporters/ai-prompt.ts`) puts the report text into the
  destination URL's query string when it's ≤ 6000 characters, so it lands in browser history.
- A share-link upload to tracebug.dev exists in the code (`website/app/api/upload`, `PHASE2-CLOUD` in
  `src/ui/quick-bug.ts`) but is disabled in the shipped extension. If it ever ships, this listing, the
  data-use answers and the privacy policy must say so **before** that release.

**Chrome reviewer note for 1.14.0** (paste in the Privacy tab's note; the release sheet only has a generic template):
```text
1.14.0 adds GitHub issue creation. Connect GitHub uses GitHub's device flow (a public GitHub App, "TraceBug App", no client secret, no backend). It requests the optional hosts https://github.com/* and https://api.github.com/* only when the user clicks Connect GitHub (or saves a GitHub token). The optional `identity` permission is for a tracker sign-in that opens a browser window (Linear); that sign-in is not switched on in 1.14.0, so this version never requests it. The GitHub sign-in token is kept in chrome.storage.local and used only by the service worker; web pages never see it. The Create panel is the extension's own page (create-issue.html, web-accessible with use_dynamic_url) shown inside the ticket so the user can pick the repository; the host page cannot read it. Test: capture a bug on any page, open the ticket, GitHub tab → Connect GitHub (or ⋯ → Use a personal token instead, which needs no account on our side).
```

### Note to the reviewer (when a release adds a permission)

```text
<x.y.z> adds the <permission> permission so <user-visible feature>. It is used only on user action, for <scope>. No data is sent to the developer; there is no backend.
```
1.11.5 example: "adds the tabCapture permission so "Tab" recording mode can record the current tab
without the screen-share dialog, after the user clicks Start…"

## 3. Firefox Add-ons (AMO)

Developer Hub → TraceBug → **Edit Product Page** (description, screenshots) and **Upload New Version**
(release notes, reviewer notes, source zip).

- **Screenshots:** `assets/firefox-store/`, in this order, with these captions:

| File | Caption |
|---|---|
| `1-audit.jpg` | Audit any page: a 0–100 score and every problem with where it is and how to fix it |
| `2-report.jpg` | A bug report devs can reproduce: replay, console and network in one offline file |
| `3-record.jpg` | Record a window or screen with mic narration, alongside every event |
| `4-console.jpg` | Console errors with stack traces, secrets masked as they're captured |
| `5-ai-agent.jpg` | Your AI agent reads the report through a local MCP server and fixes the bug |
| `6-privacy.jpg` | Private by default: blur any element, tokens auto-masked, nothing uploaded |
| `7-export.jpg` | Export to GitHub, Linear, Slack or Jira, or one self-contained .html file |

- AMO has no video field: the description links the demo.

**Description** (AMO Markdown):

```markdown
**One capture. Everything a developer — or an AI coding agent — needs to fix the bug.**

TraceBug records what actually happened in your browser: a DOM replay, console errors, network requests, screenshots and your repro steps, and bundles it into one self-contained .html file that stays on YOUR machine. No account for bug capture. No upload. No telemetry.

Watch the 1-minute demo: https://www.youtube.com/watch?v=-U64GIPfeiQ

**How it works**
1. Click the TraceBug icon → **Capture Bug** (or press **Alt+B**)
2. Reproduce the bug — TraceBug records clicks, typing, navigation, console output and network requests
3. Click **Stop**, review the report → **Export replay (.html)**
4. Hand the file to a developer, attach it to an issue — or let an AI agent read it through TraceBug's local MCP server (`claude mcp add -s user tracebug -- npx -y tracebug mcp`) and fix the bug

**Audit any page**
Click **Audit this page** for a 0–100 score and real problems with fixes: accessibility (axe-core, WCAG 2.0–2.2 A/AA, keyboard checks), layout and phone width, speed (load timings, LCP, heavy and oversized images), SEO (tags, structured data, robots.txt, sitemap) and page errors. Locate each one on the page, copy the fixes for your AI agent, or export the audit. It never clicks, types or submits anything.

**What makes it different**
- **Local-first** — reports and settings stay on your device; your captures never go to TraceBug. Site Audit asks for a free account (just your email) after 3 audits.
- **AI-native** — Claude Code, Cursor and any MCP client can read every report; TraceBug can also generate a *failing Playwright test* that goes green when the bug is fixed.
- **Complete evidence** — screen recording with mic narration, interactive DOM replay, console, network, environment, annotated screenshots.
- **Private by default** — passwords, tokens, card numbers and secret URL parameters are masked as they're captured.
- **One-click hand-off** — GitHub, Linear and Slack (with your own token; you confirm every send), plus Jira markup, Markdown, HAR, .zip and the .html replay.

**Firefox notes (honest ones)**
- Screen recording goes through Firefox's own "Share screen" prompt each time. The Chrome-only "Tab" mode (no prompt) isn't available, because Firefox has no tab-capture API.
- Firefox can't capture tab audio; turn on the microphone to narrate instead.
- The Site Audit's layout shift, main-thread blocking and render-blocking checks need timing data Firefox doesn't expose; the audit says "not measured in this browser" instead of guessing.

Free. Open source (MIT): https://github.com/prashantsinghmangat/tracebug-ai
Try it on a page with intentional bugs: https://tracebug.dev/try.html
Privacy policy: https://tracebug.dev/privacy
```

**Release notes** (per version): the CHANGELOG section, minus Chrome-only items (Tab mode, `tabCapture`).
Current:
```text
- New: send a bug straight to GitHub with a personal access token. Settings → Integrations → GitHub → Connect checks the token with GitHub before saving it. Send to GitHub opens TraceBug's Create window: pick the repository, labels, assignee and milestone, and Create files the issue and opens it. (GitHub sign-in without a token is Chrome-only for now.)
- Your repository and labels are remembered per site, so the next bug is two clicks. Forget them in Settings.
- GitHub's API can't attach files, so after Create you can copy or download the screenshot (and download the recording) to add to the issue.
- Plain messages for the awkward cases: single sign-on organisations, archived repositories, Issues turned off, rate limits, a revoked token. Your ticket is never lost; Retry checks first so an issue is never filed twice.
- A cleaner Settings page: Integrations, AI Debugger, Recording, Privacy, Account and Help in a sidebar, and an Auto / Light / Dark theme switch shared with the popup.
- Cleaner GitHub issue text: no severity prefix in the title, one footer.
- A screenshot ticket no longer leaves the toolbar showing it's tracking, so ✕ closes TraceBug in one click.
- Captured text also hides GitHub App and Linear sign-in tokens.
- The manifest lists a new optional host permission, https://github.com/*, for GitHub's sign-in pages (Chrome-only for now); it's never asked for at install. Linear and Slack work as before.
```

**Notes to reviewer** (fill in the version):

```text
Source code: tracebug-source-v<x.y.z>.zip is `git archive` of tag v<x.y.z> from
https://github.com/prashantsinghmangat/tracebug-ai (public, MIT).

Generated files in the package (not hand-written): tracebug-sdk-ext.js and tracebug-provider-api.js
are bundled from TypeScript in src/ by tsup (esbuild), not minified. Every other .js file except
vendor/axe.min.js (below) is hand-written and appears as-is in tracebug-extension/.

Third-party library: vendor/axe.min.js is axe-core 4.11.4 (https://github.com/dequelabs/axe-core,
MPL-2.0), the package's own published axe.min.js, unmodified. build-ext.mjs copies it from
node_modules/axe-core/axe.min.js. sha256:
fb83a4378d978ecb7d2dae48a3a3778a84c971ac692f3afd45d714fba89c0f0d
It is injected only when the user runs a Site Audit (from the popup or the on-page toolbar's
Audit button), only into that tab, never on page load. The audit's only network requests are the
audited site's own /robots.txt and sitemap, fetched from the page itself.

Build (Node 18+, npm; bsdtar or zip on PATH):
  npm ci
  npm run zip:ext
Output: releases/tracebug-firefox-v<x.y.z>.zip (also unpacked in tracebug-extension/dist/firefox/).

Validator warnings: chrome.offscreen / chrome.tabCapture references are UNSUPPORTED_API on Firefox.
Firefox never reaches them: each is behind a feature check, and those permissions are not in the
Firefox manifest. innerHTML uses go through one setInnerHTML() helper (src/ui/helpers.ts) that renders
TraceBug's own templates, with page-derived values escaped, via a Trusted Types policy where the page
requires one.

No remote code, no eval of downloaded code, no analytics or telemetry. Bug capture collects nothing. Optional
data collection is requested only when the user types an email for Site Audit sign-in (email + 6-digit
code on the extension page signin.html, after 3 free audits; the extension calls only tracebug.dev) or for
the update list (and the usage counts only if they tick that box). Report data is sent only when the user
clicks Send to GitHub / Linear / Slack or asks for AI analysis with their own API key; each send shows
a confirmation window first.

How to test:
1. Open https://tracebug.dev/try.html (a demo page with deliberate bugs).
2. Click the TraceBug toolbar icon -> Capture Bug, click "Apply coupon" and "Place order", then click
   Stop on the on-page bar. The report opens with the replay, console errors and the failing request.
3. For video: popup -> Capture Bug options -> "Events + Video". Firefox shows its normal screen-share
   prompt (Tab mode is hidden in Firefox, which has no tab-capture API).
```

## 4. Regenerating the images

- Product screenshots: `npm run build:ext && node e2e/marketing-screenshots.mjs` →
  `assets/screenshots/product/`.
- Store frames (1280×800) and promo tiles: `assets/source/store-frames/` (`README.md` there).
- Social banners: `assets/source/banners/banners.mjs`. YouTube art: `assets/source/youtube/`.
- Demo video: `marketing/demo-video/README.md`.
