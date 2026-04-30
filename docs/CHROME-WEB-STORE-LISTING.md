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

• Live demo: https://tracebug.netlify.app
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

Upload in this order — the first 3 carry the weight:

1. **`01-root-cause-banner.png`** — The Quick Bug modal showing `🔍 Possible Cause (high confidence): ...` — this is the differentiator, shown first
2. **`02-github-issue-preview.png`** — The auto-filled GitHub issue (title, labels, TL;DR, steps, error, failed requests table)
3. **`03-bug-capture-flow.png`** — Composite showing the 3-step user flow: error appears → Ctrl+Shift+B → modal opens
4. **`04-toolbar-compact.png`** — The floating toolbar on a real-looking app
5. **`05-chrome-ext-popup.png`** — The extension popup with the ON/OFF toggle and recording indicator

**How to create them:** open `website/public/demo.html` locally (or the live site), pause at the key frames, and screenshot the 1080×720 demo area → scale up to 1280×800 in Figma/Photopea with the dark background extended. Take 5 minutes each.

---

## 7. Promotional Images

### Small promo tile (440×280) — used on Chrome Store promoted-sections

Design guide:
- Left half: the TraceBug logo (gradient purple/cyan) + product name
- Right half: a mini root-cause banner as the "money shot"
- Dark background (#0B0B0F) matching the product theme
- One line of copy: **"Root cause in 5 seconds"**

### Large promo tile (920×680) — optional but recommended

Same design, scaled. Include the 3-step flow icons: `⚡ Capture → 🔍 Cause → 🔗 GitHub`.

### Marquee (1400×560) — only if you get featured; skip for now

---

## 8. Support / Privacy URLs

| Field | URL |
|---|---|
| Official website URL | `https://tracebug.netlify.app` |
| Support URL | `https://github.com/prashantsinghmangat/tracebug-ai/issues` |
| Privacy policy URL | `https://tracebug.netlify.app/privacy` |

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
- [ ] 5 screenshots uploaded, each 1280×800, dark background
- [ ] Small promo tile (440×280) uploaded
- [ ] Privacy URL points to live `/privacy` page (not `#`)
- [ ] Category is "Developer Tools"
- [ ] Extension version in `manifest.json` matches the uploaded `.zip` (currently 1.3.0)
- [ ] `README.md` GIF in place so the GitHub fallback isn't embarrassing
- [ ] Live demo at `https://tracebug.netlify.app` is working (your iframe fix is deployed)

Review time is typically 1-3 business days. Plan your HN/Reddit/ProductHunt launch for the day after you see "Published" in the dashboard.
