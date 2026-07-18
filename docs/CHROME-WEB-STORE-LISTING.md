# Chrome Web Store Listing — Paste-Ready Copy

Copy each section into the matching field in the Chrome Web Store developer dashboard:
**Dashboard → Item → Store Listing**.

All copy below is optimized for (a) the first-glance 5-second decision, (b) Chrome Web Store search ranking, and (c) the lightbox preview on the Store card.

---

## 1. Product Name (max 75 chars)

Current: `TraceBug — QA Bug Reporter`

### Recommended:

```
TraceBug — Capture Bug → Root Cause → GitHub Issue in 5 Seconds
```

(64 chars. Lands the promise in the name itself. Store search weighs product name heavily — terms "Bug", "Root Cause", and "GitHub Issue" all rank here.)

---

## 2. Short Description (max 132 chars) — **MOST IMPORTANT field**

This is the line that appears under your name on the Store card and in search results. It's what decides whether someone clicks.

```
Capture → Know the cause → Create GitHub issue in 5 seconds. No setup. No backend. Free debugging assistant for devs & QA.
```

(131 chars. Hits the 3-step promise verbatim, calls out "free", "no setup", "no backend" — three Chrome Store buyer objections eliminated in one line.)

---

## 3. Detailed Description (max 16,000 chars)

Paste the entire block below into the "Description" field. The formatting uses the Store's supported markdown subset (line breaks, bullets via `•`, no HTML).

```
Capture → Know the cause → Create GitHub issue in 5 seconds.

TraceBug is a free, zero-backend debugging assistant that turns "the page is broken" into a complete, developer-ready bug report — automatically.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHY TRACEBUG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every bug report opens with:

🔍 Possible Cause (high confidence): API POST /orders failed with 500 after clicking 'Place Order'
📋 TL;DR: TypeError on /checkout when clicking 'Place Order' button

No logs to dig through. No guessing. Just clarity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IT CAPTURES — AUTOMATICALLY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Click + element context (tag, text, selector, aria-label, test-id)
• Form inputs (passwords auto-redacted)
• Navigation (route changes)
• API calls (URL, method, status, response snippet on failure)
• Console errors, unhandled promise rejections, stack traces
• Full page screenshots with auto-naming
• Environment — browser, OS, viewport, device, connection
• Session timeline with millisecond-precision timestamps

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW IT WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Click the extension icon → toggle TraceBug ON
2. Use the website normally — TraceBug records silently
3. When a bug happens, press Ctrl+Shift+B (or Cmd+Shift+B on Mac)
4. Review the auto-filled report — root cause, steps, errors, network failures, screenshot
5. Click "Open in GitHub" → opens a new issue in your repo, pre-filled

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHO IT'S FOR
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Frontend developers fixing UI bugs without opening DevTools
• Indie hackers shipping SaaS — debug faster, ship faster
• Small teams reporting bugs without back-and-forth
• QA engineers — zero typing, auto-filled reports with everything a dev needs
• PMs and clients who can't read stack traces but want to report bugs properly

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT MAKES IT DIFFERENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

vs Sentry / LogRocket / FullStory:

✓ 100% free, no subscription, no account
✓ Zero backend — works on ANY website instantly
✓ Privacy-first — your data never leaves your browser
✓ Deterministic root-cause engine — no AI APIs, no tracking
✓ 2-click bug capture vs. 10+ clicks in dashboards
✓ One-click GitHub issue vs. dashboards you never check
✓ Open source (MIT)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY & SECURITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• All session data lives in your browser's localStorage — nothing is uploaded anywhere
• Sensitive fields (passwords, tokens, credit cards, SSNs) are auto-redacted before storage
• Sensitive query params in URLs (api_key, token, secret, auth) are replaced with [REDACTED]
• No analytics, no telemetry, no third-party scripts
• Open source — audit the code at github.com/prashantsinghmangat/tracebug-ai

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPORT FORMATS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• GitHub Issue (one-click — opens pre-filled issue in your repo)
• Jira Ticket (priority, labels, markup auto-generated)
• PDF Report (print-optimized)
• JSON / Plain Text (for custom pipelines)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECHNICAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Works on any website (http/https)
• Zero impact on page performance — events are buffered in memory, flushed asynchronously
• Fetch + XMLHttpRequest intercepted safely (never breaks your requests)
• Failed network response bodies captured up to 10KB, binary responses skipped
• Compatible browsers: Chrome, Edge, Brave, Opera

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Live demo: https://tracebug.dev
• GitHub: https://github.com/prashantsinghmangat/tracebug-ai
• npm (for developers): https://www.npmjs.com/package/tracebug-sdk
• Issues / feedback: https://github.com/prashantsinghmangat/tracebug-ai/issues

Built by an indie developer who was tired of bad bug reports.
```

---

## 4. Category

```
Developer Tools
```

(Chrome Web Store sub-category. Do NOT pick "Productivity" — lower intent audience.)

---

## 5. Language

```
English (United States)
```

---

## 6. Screenshots (1280×800 each, 5 max)

**Ready to upload — real product captures in `releases/store-assets/` (regenerated per release by scripting the live sandbox):**

1. **`screenshot-1.jpg`** — The live sandbox with the TraceBug toolbar (the first-install welcome experience)
2. **`screenshot-2.jpg`** — The live error detector catching an uncaught TypeError with the **Capture Bug** button — the differentiator, shown early
3. **`screenshot-3.jpg`** — The populated Bug Ticket: auto-generated title, events, Console/Network badges
4. **`screenshot-4.jpg`** — The Network tab: both failed requests with status + waterfall
5. **`screenshot-5.jpg`** — The MCP hand-off card with the Claude Code / Cursor / VS Code tool picker

These are genuine screenshots of the real UI, not mockups — what reviewers install matches what the listing shows.

---

## 6b. Promo video

Upload `releases/store-assets/tracebug-demo.webm` to YouTube (unlisted is fine) and paste the URL into the listing's video field — the Store only accepts YouTube links. It's the 15-second captioned real-capture demo: crash happens → TraceBug catches it live → one click builds the ticket → export.

---

## 7. Promotional Images

**Ready to upload from `releases/store-assets/` (Slate Indigo brand, pixel-Trace mascot):**

- **`promo-small.jpg`** (440×280) — Trace + wordmark + "Bug reports your dev can actually open" + capability pills
- **`promo-marquee.jpg`** (1400×560) — the hero headline treatment, for the featured slot

(The old canvas generators `generate-promo-tiles.html` / `generate-store-screenshots.html` predate the rebrand — don't use their output.)

---

## 7b. Permission justification (paste into the "Privacy practices" tab)

Chrome flags `<all_urls>` host permissions at review and shows "can read data on all websites" at install. Use this justification:

> **Host permission (`<all_urls>`):** TraceBug is a bug-capture tool — users invoke it on whatever site they are testing, which cannot be known in advance. The SDK is injected **only when the user explicitly clicks a capture action** in the popup (no automatic injection, no background tracking), and all captured data stays in the browser: reports are saved as local files, and nothing is transmitted to any server.

The dashboard requires a filled justification box **per permission** — paste-ready:

> **`offscreen`:** Tab recording uses Chrome's MediaRecorder API, which requires a live document context that Manifest V3 service workers do not provide. TraceBug creates an offscreen document solely to run the screen/tab recording session that the user explicitly starts from the popup, and it is closed when the recording stops. No background monitoring occurs.

> **`unlimitedStorage`:** TraceBug stores bug-capture sessions (screen recordings, DOM replay events, and screenshots) locally in the user's browser until the user exports or deletes them. A single capture can be several megabytes, so the default storage quota would truncate recordings mid-session. All data remains on the user's device — nothing is uploaded to any server.

> **`scripting`:** Injects the TraceBug capture SDK into the current tab only when the user clicks a capture action in the popup. No automatic or background injection.

> **`tabs` / `activeTab`:** Used to identify the tab the user chose to capture, show its URL in the popup, and re-attach the recording UI after in-page navigation during an active, user-started session.

> **`storage`:** Persists the user's extension preferences (theme, mic toggle) and active-session state so a capture survives page navigations.

Single-purpose description, if asked: "Capture bug reports — recordings, console, network — locally in the browser." Data-usage checkboxes: all "does not collect" (nothing leaves the device).

---

## 8. Support / Privacy URLs

| Field | URL |
|---|---|
| Official website URL | `https://tracebug.dev` |
| Support URL | `https://github.com/prashantsinghmangat/tracebug-ai/issues` |
| Privacy policy URL | `https://tracebug.dev/privacy` |

All three are required by the Chrome Web Store — privacy policy especially. The existing `/privacy` page on the site satisfies the requirement.

---

## 9. What to improve after launch

After the listing is live for ~2 weeks:

1. **Check Store search analytics** (dashboard → Analytics → Impressions by keyword). See which queries surface your listing → double down on those terms in the Short Description.
2. **Collect 5-star reviews** — the first 5 reviews determine CTR on the Store card. Ask 5 friends who actually use it to leave honest reviews the week of launch.
3. **A/B test the Short Description** — swap wording every 3 weeks, compare impressions-to-installs. The Store allows changes without re-review.
4. **Add a "Featured" application** via the developer dashboard once you cross ~100 users — Chrome curates promoted extensions from this pool.

---

## Quick checklist before you click "Submit for Review"

- [ ] Name is ≤ 75 chars and contains "Bug" + "GitHub"
- [ ] Short description is ≤ 132 chars and starts with the 3-step promise
- [ ] 5 screenshots uploaded from `releases/store-assets/` (real UI, 1280×800)
- [ ] Promo tiles uploaded from `releases/store-assets/` (small + marquee)
- [ ] Demo video on YouTube, URL pasted into the listing
- [ ] `<all_urls>` + permission justifications filled in (section 7b)
- [ ] Privacy URL points to live `/privacy` page (not `#`)
- [ ] Category is "Developer Tools"
- [ ] Extension version in `manifest.json` matches the uploaded `.zip` (currently 1.7.0 — `releases/tracebug-extension-v1.7.0.zip`)
- [ ] Live site at `https://tracebug.dev` deployed (demo video + sandbox working)

Review time is typically 1-3 business days. Plan your HN/Reddit/ProductHunt launch for the day after you see "Published" in the dashboard.
