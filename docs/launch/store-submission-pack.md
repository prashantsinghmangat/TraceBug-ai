# TraceBug 1.11.0 — store submission pack

## 1. Manifest name and description

The Chrome Web Store shows the manifest `name` as the listing title and the manifest `description` as the summary. They can't differ from the listing, so the new title only appears if the manifest carries it.

### The two stores have DIFFERENT name limits

| Field | Chrome Web Store | Firefox AMO |
|---|---|---|
| `name` | 75 characters | **45 characters** |
| `short_name` | 12 recommended | 12 recommended |
| `description` | 132 characters | 132 characters |

**45 is the binding limit**, because one manifest feeds both builds. Exceed it and `npm run ext:lint`
fails with `JSON_INVALID "/name" must NOT have more than 45 characters` — AMO rejects the upload, while
Chrome accepts it happily, so a Chrome-only check will not catch this.

The first attempt at this rename used `TraceBug: Bug Report Recorder — Console, Network & Replay`
(57 chars). Valid for Chrome, rejected by AMO. Shortened rather than split per store, to keep one
identity across both listings.

### Shipped in 1.11.0

- `name`: `TraceBug: Bug Report Recorder & Replay` (38 characters — fits both)
- `short_name`: `TraceBug` (keeps the toolbar tooltip short)
- `description` (132 max): `Record a bug once: replay, console errors and network in one offline file. For QA and devs. Free, no account, no upload.` (120 characters)

Set them in both `manifest.base.json` and the dev `manifest.json` — `npm run check:versions` enforces
that the two agree on `name` and `description`, though **not** on `short_name`. Then rebuild with
`npm run zip:ext` and check `ext:lint` before uploading anywhere.

Note the base manifest stores non-ASCII raw (a literal `—`) while the dev manifest stores the
JSON escape (`\u2014`). Both are the same character; only the encoding differs. Keep
each file's convention or the diff becomes a whole-file re-encode.

## 2. Section 7b — permission justifications

| Permission | Justification |
|---|---|
| `activeTab` | Lets TraceBug act only on the tab the user is looking at when they click Capture or Screenshot, or press the Alt+B shortcut: it injects the capture script there and takes the screenshot. It gives no access to any other tab. |
| `scripting` | Injects TraceBug's capture script and its stylesheet into the current tab, only after the user starts a capture or a screenshot. Nothing is injected automatically or in the background. |
| `storage` | Keeps the user's settings (record options, chosen microphone, redaction rules), the integration tokens they enter, and a finished screen recording on their own device, plus the state of a running capture so it survives the service worker restarting. |
| `unlimitedStorage` | A report with a replay or a video can exceed the default storage limit. It is stored only on the user's device. |
| `alarms` | Closes an unanswered "Send this report to GitHub / Linear / Slack?" confirmation window after two minutes, so a send the user never approved can't be confirmed later. A Manifest V3 service worker can't hold a timer that long on its own. |
| `offscreen` | Hosts the MediaRecorder for the optional screen recording the user starts ("Events + Video"). A service worker has no media APIs, and the recording must keep running while the user navigates the recorded tab. The document is created when the recording starts and closed when it stops. |
| `tabCapture` (optional) | Requested only when the user turns on "Record video too" and picks the **Tab** record mode, so the current tab can be recorded without Chrome's "Choose what to share" dialog appearing first. Never requested at install; declined, it falls back to the normal share picker. |
| Optional host permissions | Requested when the user saves a GitHub, Linear, Slack, OpenAI, Anthropic or Ollama integration (one fixed address each, or `localhost`/`127.0.0.1` for Ollama), so TraceBug can send the report to that service. Declared optional so TraceBug can request access to one specific address you enter for a self-hosted AI provider, only at the moment you save it, and never for all sites. |
| Remote code | No. All code ships in the package. |

**Single purpose:** TraceBug captures a browser bug on the tab where the user starts a capture: a replay of their clicks, inputs and navigation, the console errors, the network requests, and optionally a screen recording with microphone narration. It turns them into one bug report the user can review, save on their device, export as a file, or send to their own issue tracker or AI tool.

(The pre-1.11 text said "all data is stored locally — nothing is sent to any server". That contradicts the user-initiated GitHub/Linear/Slack/AI sends declared below; don't reuse it.)

## 3. Data-use disclosure (the judgement call)

Declare on the cautious side. TraceBug never sends data to its developer. But at the user's request it sends report content to GitHub, Linear, Slack or an AI provider, and it stores user-supplied API tokens. Declaring these categories costs nothing; leaving out one that a reviewer thinks applies can cause a rejection.

- ✅ **Website content:** page text, console and network data inside a capture.
- ✅ **User activity:** clicks, inputs and navigation recorded during a capture.
- ✅ **Authentication information:** API tokens the user enters, stored on their device and sent only to the service they chose.
- ✅ **Web history:** a report carries the URL of the captured page and the pages navigated to during the capture, and goes to the user's chosen tracker when they send it.
- Leave unticked: personally identifiable, health, financial, personal communications, location. Microphone audio stays inside the local video file and is never transmitted by TraceBug.
- ✅ Tick all three certifications: not sold to third parties; not used for purposes unrelated to the single purpose; not used for creditworthiness or lending.
- Privacy policy URL: `https://tracebug.dev/privacy`. Updated 2026-10-29 for 1.11.3 (screen recording, microphone, where tickets are stored, Open in Claude/ChatGPT). **Deploy the website before submitting** so the live page matches these answers.

**Two mechanisms worth disclosing explicitly, found during a buyer's code review (2026-10-26):**
- **"Open in Claude" / "Open in ChatGPT"** (`src/exporters/ai-prompt.ts`) puts the full report text — console errors, URLs, user actions, stack traces — into the destination URL's query string when it's ≤6000 chars, then opens it. A URL is readable from browser history/autocomplete, unlike a clipboard copy or a POSTed form. Disclose this explicitly next to the AI-provider disclosure above, or switch the mechanism to clipboard-copy + paste before claiming otherwise.
- **The Share-link/upload-to-tracebug.dev feature exists in the codebase (Supabase-backed, `website/app/api/upload`, `website/app/api/share`, 14-day retention) but is currently disabled in the shipped extension** (`src/ui/quick-bug.ts`, tagged `PHASE2-CLOUD`, commented out for the offline-only release). The "Free, no account, no upload" manifest description is accurate **today**. If this ships in a future release, the listing, this pack's data-use section, and the privacy policy all need to mention it — including where reports are hosted and the retention window — *before* that release, not after.

## 4. What's new in 1.11.3 (store description, top)

1.11.2 never reached the stores, so this listing covers both. The 1.11.1 capture fixes stay
underneath because they are still what a new user meets first. A listing is read by people
installing for the first time, not only by upgraders.

- Screen recording is back, with a new **Tab** mode: record the current tab with no "Choose what to
  share" dialog (Chrome asks once). **Desktop** mode records a window or screen through the usual picker.
- Mic mute works during a recording, and the toolbar icon shows a red REC while one is running.
- Choose which microphone records; the popup shows whether the mic is on, off or blocked.
- Screenshot options: the visible area or a crop, now or after a 3- or 5-second delay.
- Works on sites with strict security policies (Trusted Types) that used to block TraceBug's toolbar.
- Works properly on sites that use the TraceBug npm SDK, and steps aside where that site's own
  TraceBug toolbar is already showing.
- Tracker buttons say what they do: "Send to GitHub" asks you first; "Copy" copies.
- No more dialog after every export — a one-line link opens the report in your AI agent.
- The "Keep capturing across sites" option is gone: TraceBug no longer asks for access to all sites.
- A new welcome page with the three steps and the `npx tracebug mcp` command.

From 1.11.1:

- Network requests are no longer listed twice, and a request method we can't determine now shows
  "—" instead of a guessed GET.
- Typing in rich editors — chat composers, comment boxes, document editors — is captured, under the
  same redaction rules as any other field.
- A capture no longer reappears after you leave a site. It ends when you go, the page you land on
  tells you where it went, and what you captured is still there when you return.
- The capture bar shows what it has: "Replay, not video · N events · M requests".
- A warning when the page's content sits inside embedded frames, which aren't captured yet.

Carried over from 1.11.0:

- No more "read and change all your data" warning: site access is asked for only when you need it.
- Tokens and API keys moved into TraceBug's own settings, and every GitHub, Linear or Slack send asks you first.
- If you set up GitHub, Linear, Slack or an AI key before 1.11, please revoke it and create a new one.

**Screenshots (1.11.3):** regenerated from the 1.11.3 build. Real captures come from
`node e2e/marketing-screenshots.mjs` (writes `D:/tmp/tracebug-shots/`); the store frames are 1280×800
JPEGs (the store rejects PNGs with alpha). Order for Chrome (5 max): report hero, Tab/Desktop
recording popup, Console tab, AI agent, privacy. Firefox also gets the export slide. Promo tiles:
440×280 small, 1400×560 marquee.

## 5. Store description (1.11.3) — paste into both listings

Replaces the pre-1.11 text, which promised a popup ON toggle, Ctrl+Shift+B, "full page screenshots",
localStorage storage, and PDF/JSON exports — none of which match the extension any more. For Firefox,
drop the "Tab mode" sentence (Firefox has no tab-capture API; it always uses the share picker).

```text
Record a bug once. Get a report a developer can actually reproduce: a replay of what happened, the console errors, the failed requests and the steps, in one file that opens offline.

Free and open source (MIT). No account, no upload, no TraceBug server.

━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━

1. Click the TraceBug icon → Capture Bug (or press Alt+B).
2. Reproduce the bug. TraceBug records clicks, typing, navigation, console output and network requests.
3. Click Stop. Review the report, then export it or send it to your tracker.

Want video too? Turn on "Events + Video". Tab mode records the current tab with no "Choose what to share" dialog (Chrome asks once for permission); Desktop mode records any window or screen. Narrate with your microphone, pick which mic, and blur sensitive areas before you start.

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

Export the report, then run "npx tracebug mcp". Claude Code, Cursor or any MCP client reads the report locally and works the bug in your codebase. It can also generate a failing Playwright test from the repro steps. Nothing is uploaded.

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
• Site access is asked for only when you capture, never for all sites at install.
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
