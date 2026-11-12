# Store listings — Chrome Web Store and Firefox Add-ons

The one place for every word and image the two stores show. Current for **1.12.0**. When a release
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
| `description` | 132 | 132 | `Record a bug once: replay, console errors and network in one offline file. For QA and devs. Free, no account, no upload.` (120) |

A name over 45 characters passes Chrome but fails `npm run ext:lint` and AMO. The base manifest stores
`—` raw, the dev manifest as `—`; keep each file's convention.

## 2. Chrome Web Store

Dashboard → TraceBug → **Store listing**, **Privacy**, **Package**.

### Store listing

- **Category:** Developer Tools. **Language:** English (United States).
- **Screenshots** (1280×800 JPEG, no alpha, 5 max): `assets/chrome-store/` in this order —
  `1-report`, `2-record`, `3-console`, `4-ai-agent`, `5-privacy`.
- **Promo tiles:** `assets/banners/promo-tiles/small-440x280.jpg`, `marquee-1400x560.jpg`.
- **Promo video:** https://www.youtube.com/watch?v=-U64GIPfeiQ (57 s). Short:
  https://www.youtube.com/shorts/Q1toEvFVW0c. Channel: https://www.youtube.com/@tracebugdev.
- **Website:** `https://tracebug.dev` · **Support:** `https://github.com/prashantsinghmangat/tracebug-ai/issues`
  · **Privacy policy:** `https://tracebug.dev/privacy`

**Description.** Chrome has no release-notes field: for the first few weeks after a release, put a
short "New in x.y.z" block at the top (from the CHANGELOG), then take it out.

```text
New in 1.12.0: Site Audit. Score the page you are on for accessibility (axe-core), layout, performance, SEO and errors, from the popup or the toolbar's Audit button. A side panel stays open while you locate each problem on the page, and every finding says how to fix it and which WCAG criterion it maps to — for low contrast, the nearest colour that passes. Re-run to see what you fixed. Export the audit and your coding agent reads it with three new MCP tools. Everything still runs on your device.

Record a bug once. Get a report a developer can actually reproduce: a replay of what happened, the console errors, the failed requests and the steps, in one file that opens offline.

Free and open source (MIT). No account, no upload, no TraceBug server.

Watch the 1-minute demo: https://www.youtube.com/watch?v=-U64GIPfeiQ

━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━

1. Click the TraceBug icon → Capture Bug (or press Alt+B).
2. Reproduce the bug. TraceBug records clicks, typing, navigation, console output and network requests.
3. Click Stop. Review the report, then export it or send it to your tracker.

Want video too? Turn on "Events + Video". Tab mode records the current tab in one click, with no "Choose what to share" dialog; Desktop mode records any window or screen through Chrome's share dialog. Narrate with your microphone, pick which mic, and blur sensitive areas before you start.

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
• GitHub, Linear and Slack, with your own token (TraceBug asks before each send)
• Jira markup, Markdown, .zip, HAR, and a failing Playwright test (.spec.ts)

━━━━━━━━━━━━━━━━━━━━
PRIVATE BY DEFAULT
━━━━━━━━━━━━━━━━━━━━

• Reports and settings stay on your device. Nothing is sent to TraceBug.
• Passwords, tokens, card numbers and secret URL parameters are masked as they're captured. Add your own redaction rules for anything else.
• Blur any element before or during a recording.
• No analytics, no telemetry, no remote code.
• Chrome words the tab-recording permission as "Read and change all your data on all websites". TraceBug uses it only to record the tab you start a recording on, after you press Start.
• Open source: github.com/prashantsinghmangat/tracebug-ai

━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━

QA engineers, frontend developers, and anyone who has had to answer "can you send me the steps?"

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
| `activeTab` | Lets TraceBug act only on the tab the user is looking at when they click Capture or Screenshot, or press the Alt+B shortcut: it injects the capture script there and takes the screenshot. It gives no access to any other tab. |
| `storage` | Keeps the user's settings (record options, chosen microphone, redaction rules), the integration tokens they enter, and a finished screen recording on their own device, plus the state of a running capture so it survives the service worker restarting. |
| `unlimitedStorage` | TraceBug stores bug-capture sessions (screen recordings, DOM replay events and screenshots) locally in the user's browser until the user exports or deletes them. A single capture can be several megabytes, so the default storage quota would cut recordings off mid-session. The data stays on the user's device and is never sent to TraceBug; it leaves the device only when the user exports it or sends it to a service they chose. |
| `scripting` | Injects TraceBug's capture script and its stylesheet into the current tab, only after the user starts a capture or a screenshot. Nothing is injected automatically or in the background. |
| `alarms` | Closes an unanswered "Send this report to GitHub / Linear / Slack?" confirmation window after two minutes, so a send the user never approved can't be confirmed later. A Manifest V3 service worker can't hold a timer that long on its own. |
| `offscreen` | Hosts the MediaRecorder for the optional screen recording the user starts ("Events + Video"). A service worker has no media APIs, and the recording must keep running while the user navigates the recorded tab. The document is created when the recording starts and closed when it stops. |
| `tabCapture` | Records the tab the user opened TraceBug on when they start a recording in Tab mode (the default), without Chrome's "Choose what to share" dialog. Used only after the user clicks Start, and only for that tab; nothing is recorded in the background. The recording stays on the user's device unless they export or share it. Desktop mode does not use this permission and still shows Chrome's share dialog. Required rather than optional because Chrome only issues a tab stream ID for a tab the extension was invoked on while it already held this permission, so a runtime grant could never record the tab it was granted on. |
| Optional host permissions | Requested when the user saves a GitHub, Linear, Slack, OpenAI, Anthropic or Ollama integration (one fixed address each, or `localhost`/`127.0.0.1` for Ollama), so TraceBug can send the report to that service. Declared optional so TraceBug can request access to one specific address you enter for a self-hosted AI provider, only at the moment you save it, and never for all sites. |

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

**Disclose if they change** (found in a code review, 2026-10-26):
- "Open in Claude" / "Open in ChatGPT" (`src/exporters/ai-prompt.ts`) puts the report text into the
  destination URL's query string when it's ≤ 6000 characters, so it lands in browser history.
- A share-link upload to tracebug.dev exists in the code (`website/app/api/upload`, `PHASE2-CLOUD` in
  `src/ui/quick-bug.ts`) but is disabled in the shipped extension. If it ever ships, this listing, the
  data-use answers and the privacy policy must say so **before** that release.

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
| `1-report.jpg` | A bug report devs can reproduce: replay, console and network in one offline file |
| `2-record.jpg` | Record a tab, window or screen with mic narration, alongside every event |
| `3-console.jpg` | Console errors with stack traces, secrets masked as they're captured |
| `4-ai-agent.jpg` | Your AI agent reads the report through a local MCP server and fixes the bug |
| `5-privacy.jpg` | Private by default: blur any element, tokens auto-masked, nothing uploaded |
| `6-export.jpg` | Export to GitHub, Linear, Slack or Jira, or one self-contained .html file |

- AMO has no video field: the description links the demo.

**Description** (AMO Markdown):

```markdown
**One capture. Everything a developer — or an AI coding agent — needs to fix the bug.**

TraceBug records what actually happened in your browser: a DOM replay, console errors, network requests, screenshots and your repro steps, and bundles it into one self-contained .html file that stays on YOUR machine. No account. No upload. No telemetry.

Watch the 1-minute demo: https://www.youtube.com/watch?v=-U64GIPfeiQ

**How it works**
1. Click the TraceBug icon → **Capture Bug** (or press **Alt+B**)
2. Reproduce the bug — TraceBug records clicks, typing, navigation, console output and network requests
3. Click **Stop**, review the report → **Export replay (.html)**
4. Hand the file to a developer, attach it to an issue — or let an AI agent read it through TraceBug's local MCP server (`claude mcp add -s user tracebug -- npx -y tracebug mcp`) and fix the bug

**What makes it different**
- **Local-first** — reports and settings stay on your device; nothing goes to TraceBug.
- **AI-native** — Claude Code, Cursor and any MCP client can read every report; TraceBug can also generate a *failing Playwright test* that goes green when the bug is fixed.
- **Complete evidence** — screen recording with mic narration, interactive DOM replay, console, network, environment, annotated screenshots.
- **Private by default** — passwords, tokens, card numbers and secret URL parameters are masked as they're captured.
- **One-click hand-off** — GitHub, Linear and Slack (with your own token; TraceBug asks before each send), plus Jira markup, Markdown, HAR, .zip and the .html replay.

**Firefox notes (honest ones)**
- Screen recording goes through Firefox's own "Share screen" prompt each time. The Chrome-only "Tab" mode (no prompt) isn't available, because Firefox has no tab-capture API.
- Firefox can't capture tab audio; turn on the microphone to narrate instead.

Free. Open source (MIT): https://github.com/prashantsinghmangat/tracebug-ai
Try it on a page with intentional bugs: https://tracebug.dev/try.html
Privacy policy: https://tracebug.dev/privacy
```

**Release notes** (per version): the CHANGELOG section, minus Chrome-only items (Tab mode, `tabCapture`).
Current:
```text
- New: Site Audit. The popup's Audit menu checks the page you are on for accessibility (axe-core 4.11, WCAG 2.0–2.2 A/AA, plus a keyboard pass), layout, performance (lab values from this load), SEO and errors. Each check says what it can't tell you; a check that could not run shows "Not run", never "no issues".
- A 0–100 score per check and overall, with the formula one click away. Checks that didn't run are never scored.
- The audit opens in a side panel that stays open: Locate on page highlights each problem without closing the list. The toolbar has an Audit button.
- Every finding says how to fix it, where it is and which WCAG criterion it maps to; low-contrast text gets the nearest colour that passes.
- Text that fades in on scroll is no longer silently skipped: the audit says so and can scroll the page and re-run.
- Re-run the audit to see what was fixed, what is still there, what is new and what regressed.
- Export report saves the audit as one offline .html file; the MCP server reads it with three new tools (get_audit, get_finding, compare_audits).
- axe-core is a separate packaged file, loaded only when you run an audit.
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
It is injected only when the user runs a Site Audit from the popup, never on page load.

Build (Node 18+, npm; bsdtar or zip on PATH):
  npm ci
  npm run zip:ext
Output: releases/tracebug-firefox-v<x.y.z>.zip (also unpacked in tracebug-extension/dist/firefox/).

Validator warnings: chrome.offscreen / chrome.tabCapture references are UNSUPPORTED_API on Firefox.
Firefox never reaches them: each is behind a feature check, and those permissions are not in the
Firefox manifest. innerHTML uses go through one setInnerHTML() helper (src/ui/helpers.ts) that renders
TraceBug's own templates, with page-derived values escaped, via a Trusted Types policy where the page
requires one.

No remote code, no eval of downloaded code, no analytics or telemetry. Data is sent only when the user
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
