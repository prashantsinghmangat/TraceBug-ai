# TraceBug — Stitch prompts for the in-product screens

Six screens for Phase 4 and Phase 5. Use Stitch for the **design only**. Claude Code then rebuilds each screen in plain HTML/CSS inside the repo (prompt at the bottom), because:

- extension pages can't load Tailwind's CDN, Google Fonts or any remote script (MV3 content security policy), and Stitch's output uses all three;
- the shortcut key and version number must be filled in at runtime, not typed into the design.

One screen per Stitch generation: paste the **style block** first, then that screen's prompt.

| # | Screen | Where it lives | Phase |
|---|---|---|---|
| 1 | Welcome page | `welcome.html`, bundled in the extension, opens on install | 4 |
| 2 | Uninstall survey + thank-you | `tracebug.dev/bye` on the website | 5 |
| 3 | Popup: "Can't run here" states | the extension popup | 3 |
| 4 | Popup: "What's new" after an update | the extension popup | 4 |
| 5 | Review request card | inside the page, after the 3rd export | 5 |
| 6 | Team setup page (optional) | `tracebug.dev/teams` | 5 |

---

## Style block (paste first, every time)

```
You are designing ONE screen for TraceBug, a free, open-source browser extension that records a bug (DOM replay, console errors, network requests) into one offline file. Use the copy I give you word for word. Do not invent features, numbers, testimonials, ratings, user counts, logos of other companies, or claims. No stock photos, no people, no emoji, no illustrations of robots or bugs.

LOOK: calm, precise developer tool. Generous white space, clear hierarchy, nothing decorative that doesn't explain something. It must look like the same product as this existing popup: white cards with 1px borders, 12px radius, indigo primary button, Geist type.

THEME — design the light theme; also provide the dark theme with the same layout.
Light: page #FAFAFA, card #FFFFFF, border #E4E4E7, text #111113, secondary text #52525B, muted #71717A, primary #4F46E5 (hover #4338CA), primary-soft background rgba(99,102,241,0.08) with border rgba(99,102,241,0.30), success #16A34A, danger #DC2626, code background #F4F4F5.
Dark: page #0B0B10, card #13131A, border #27272A, text #FAFAFA, secondary #A1A1AA, muted #71717A, primary #6366F1 (hover #818CF8), code background #1E1B4B.

TYPE: Geist for all text, Geist Mono for code, keys and URLs. Page title 32px SemiBold, letter-spacing -0.02em. Section title 17px SemiBold. Body 15px, line-height 1.6. Small/meta 13px. Never smaller than 13px.

COMPONENTS:
- Primary button: #4F46E5, white text 15px Medium, 10px radius, 12px×18px padding.
- Secondary button: white, 1px #D4D4D8 border, text #111113.
- Keyboard key (kbd): Geist Mono 13px, background #F4F4F5, 1px #E4E4E7 border, 2px bottom border, 6px radius, 2px×8px padding.
- Numbered step: 28px circle, indigo-soft background, indigo number, then title + one line of help.
- Info box: indigo-soft background and border, 12px radius, 16px padding.

LOGO: a dark navy rounded tile (#16163E to #0B0B10) with a white ">" chevron and a small #6366F1 square, followed by the word "TraceBug" in Geist SemiBold. Use a placeholder box labeled LOGO if you can't draw it exactly.

ACCESSIBILITY: text contrast at least 4.5:1, visible focus rings (2px #6366F1 outline, 2px offset), every icon paired with a text label.
```

---

## 1. Welcome page (opens right after install)

```
[STYLE BLOCK]

SCREEN: the TraceBug welcome page, opened in a new tab right after the extension is installed. Desktop, 1280px wide, content column max 720px, centered. Single page, no navigation bar.

TOP: logo (left). Right side: small muted text "v{{version}}".

HERO (48px below): 
- Title: "You're set up. Let's catch your first bug."
- Subline (secondary color): "Three steps, about a minute. Nothing is recorded until you start a capture."

THREE NUMBERED STEPS, each in its own white card, stacked with 12px gap:

Step 1 — Title: "Pin TraceBug to your toolbar"
Help: "Click the puzzle-piece icon next to the address bar, then the pin next to TraceBug."
Right side of the card: a small, simple diagram of a browser toolbar: a puzzle-piece icon, an arrow, and a pin icon next to the TraceBug logo. Line icons only, 1.5px stroke, muted color with the pin in indigo.

Step 2 — Title: "Try it on a page with real bugs"
Help: "Our playground has a broken checkout on purpose. Click the TraceBug icon, then Capture Bug."
Button (primary): "Open the bug playground"

Step 3 — Title: "Your capture shortcut"
Help: "Start a capture on any page without opening the popup."
Show a kbd group rendering whatever "{{shortcut}}" actually is - the page splits the browser's own string on "+" and draws one key cap per part - then a text link "Change shortcut". DO NOT draw a fixed key combination here. Phase 3 made capture a real browser command whose default is Alt+B, the user can rebind or clear it, and Ctrl+Shift+B is a different, page-level handler that does nothing until TraceBug is already running on the tab. A fixed three-key Ctrl/Shift/B group would teach a keystroke that captures nothing.
Also design the EMPTY state of this card as a second variant: instead of keys, the text "No shortcut set" and a secondary button "Set a shortcut".

PRIVACY BOX (info box, 24px below the steps):
- Title with a shield line icon: "What TraceBug sees"
- Three small pill chips in a row directly under the title, each with a 12px check icon: "No account", "No upload", "No telemetry". Muted text, indigo check, 1px border, fully rounded.
- Two short paragraphs:
  "Only the tab you're capturing, only after you press Capture: clicks, console errors, network requests and a replay of the page. Passwords and tokens are masked as they're captured."
  "Nothing goes to TraceBug. Reports stay on your computer until you share them, and you choose what goes to GitHub, Linear, Slack or your AI provider."

TWO SMALL SECONDARY CARDS side by side (equal width, 12px gap):
- "Using an AI coding agent?" + line "Let Claude Code or Cursor read your reports locally." + a code chip "npx tracebug mcp"
- "Rolling this out to a team?" + line "Setup tips for QA leads." + text link "Team setup guide →"
  NOT SHIPPED YET: tracebug.dev/teams does not exist, and the welcome page must never link to a 404.
  welcome.js holds a TEAM_GUIDE_URL constant, empty, and builds this card only when it is set. Until
  then the MCP card stands alone. Design the single-card state too.

FOOTER (muted, 13px, centered, 48px below): "Free and open source (MIT)" · "GitHub" · "Send feedback"

Nothing else. No hero image, no testimonials, no pricing.
```

## 2. Uninstall survey (website, opens after uninstall)

```
[STYLE BLOCK]

SCREEN: the page that opens after someone uninstalls TraceBug, at tracebug.dev/bye. Desktop 1280px; content card max 560px, centered vertically and horizontally. Must also work at 390px mobile width. Tone: respectful, short, zero guilt.

CARD CONTENTS:
- Logo, small, at top.
- Title: "TraceBug is uninstalled"
- Subline: "Sorry it didn't work out. One question helps us fix what went wrong. It's optional and anonymous."

QUESTION: "Why did you uninstall?" — a single-choice list of radio rows, each row a full-width 48px-tall bordered option (selected row gets indigo border and indigo-soft background):
1. "It didn't work on the site I tested"
2. "Capturing or exporting broke"
3. "It was hard to figure out"
4. "I was worried about permissions or privacy"
5. "I switched to a different tool"
6. "I only needed it once"
7. "Something else"

Below: optional textarea, label "Anything else? (optional)", 3 rows, placeholder "What happened, or what would have made you stay?"
Optional email field, label "Email, only if you'd like a reply (optional)".

BUTTONS: primary "Send" and, to its right, a plain text link "Skip".

FINE PRINT (13px muted) under the buttons: "We only receive the version number (v{{version}}) and what you choose to send. No tracking on this page."

ALSO DESIGN THE THANK-YOU STATE of the same card (shown after Send or Skip):
- Title: "Thanks, that helps."
- Line: "If you hit a bug, a GitHub issue gets it fixed fastest."
- Two buttons: secondary "Open a GitHub issue", text link "Reinstall TraceBug".
```

## 3. Popup — "Can't run here" states

```
[STYLE BLOCK]

SCREEN: the TraceBug extension popup, exactly 340px wide, height fits content (max 520px). Design THREE variants of the same popup, side by side on one canvas, each labeled above it in small muted text: "Restricted page", "Local file", "Tab needs a reload".

Shared top of the popup (all three): header row with the logo at 20px and a monitor icon button on the right; below it a white card showing the page host in 15px and its path in Geist Mono 13px muted.

Variant A — Restricted page (host shows "Chrome settings", path "chrome://extensions"):
- Icon: a circle-slash line icon in muted color, 32px.
- Title: "TraceBug can't run on this page"
- Line: "Browsers block extensions on their own pages and the extension store."
- Primary button (full width): "Try it on the bug playground"

Variant B — Local file (host "Local file", path "file:///C:/…/index.html"):
- Icon: a file line icon.
- Title: "Allow access to local files"
- Line: "To capture pages opened from your computer, turn on "Allow access to file URLs" for TraceBug."
- Primary button: "Open extension settings"

Variant C — Tab needs a reload (host "app.example.com", path "/checkout"):
- Icon: a refresh line icon in indigo.
- Title: "Reload this tab to capture"
- Line: "TraceBug was updated while this tab was open."
- Primary button: "Reload tab"

Footer row on all three (13px muted, centered): "Site · Feedback · GitHub".
```

## 4. Popup — "What's new" after an update

```
[STYLE BLOCK]

SCREEN: the same 340px extension popup, with a dismissible "What's new" card inserted at the TOP, above the normal content. Show the normal content below it faded to show context: a full-width indigo "Capture Bug" button (subtitle "Records the tab · stop when done") and rows "Screenshot only", "View tickets", "Inspect element".

THE CARD (info box style, indigo-soft):
- Small uppercase label 12px indigo: "NEW IN 1.11"
- Four short lines, each with a 14px check icon:
  "New: capture without screen sharing. Turn off Record video too in Record options to try it."
  "No more 'read all your data' warning at install"
  "Tokens and API keys now live in TraceBug settings, not in the sites you test"
  "Every GitHub, Linear or Slack send asks you first"
  The capture line is phrased as an invitation, not an announcement, because
  this card is only ever shown on UPDATE and an updating user keeps video ON
  (background.js `seedRecordOptsDefault`). "Captures no longer share your
  screen" would be false for every single person who reads this card.
- A separate small warning line (amber #B45309 text, amber-soft background, 8px radius): "Set up GitHub, Linear, Slack or an AI key before 1.11? Please revoke and re-create it."
- Bottom right: text button "Got it".
```

## 5. Review request card (inside the page, after the 3rd export)

```
[STYLE BLOCK]

SCREEN: a small floating card that appears in the bottom-right corner of a web page (show it over a blurred, generic light web page background), 320px wide, 16px from the edges. It must not block the page.

CARD:
- Close "×" icon button top-right (with accessible label "Dismiss").
- Title 15px SemiBold: "Did TraceBug save you time?"
- Line 13px secondary: "A short review helps other testers find it."
- Buttons in a row: primary small "Rate TraceBug" (with a star line icon), text button "Not now".

Rules: no fake star ratings, no numbers, no "everyone loves it" copy. Calm, one-line, easy to dismiss.
```

## 6. Team setup page (optional, website)

```
[STYLE BLOCK]

SCREEN: tracebug.dev/teams, a simple guide page for QA leads. Desktop 1280px, content column 760px. Use the website's light theme.

- Title: "Roll out TraceBug to your team"
- Subline: "Free for every tester. No accounts to manage, no seats, no data on our servers."
- Section "1. Install for everyone": two cards side by side — "Share the store link" (with a copy-link button) and "Install with Chrome policy" (a code block showing a JSON snippet for ExtensionInstallForcelist with the extension ID, Geist Mono 13px).
- Section "2. Share your redaction rules": line "Paste the same sensitive field names and patterns into each tester's TraceBug settings." + a code block example: "email, customer_id, card_number".
- Section "3. Agree how bugs get filed": a checklist card with 4 rows: "Capture the bug before describing it", "Export the .html replay", "Attach it to the issue", "Developers open it offline or with npx tracebug mcp".
- Closing info box: "Questions? Open a GitHub discussion." with a secondary button "Open GitHub".
```

---

## Claude Code prompt (after you have the Stitch designs)

```
Implement these screens from the attached Stitch designs. Treat Stitch's HTML as a visual reference only: rebuild in plain HTML + CSS + JS in the repo's existing style. For extension pages: no Tailwind CDN, no Google Fonts, no remote scripts or images (MV3 CSP); bundle Geist from the existing site assets or fall back to the system font stack. Support light and dark mode with prefers-color-scheme.

1. tracebug-extension/welcome.html (+ welcome.js, welcome.css), added to SHARED_FILES in build/build-ext.mjs. Opened by runtime.onInstalled only when reason === "install" (replace the current remote page). Fill {{version}} from runtime.getManifest().version. Fill the shortcut from chrome.commands.getAll(); if it's empty show the "No shortcut set" variant. "Change shortcut" / "Set a shortcut" opens chrome://extensions/shortcuts via tabs.create (Firefox: about:addons with a short instruction). "Open the bug playground" opens https://tracebug.dev/try.html?welcome=extension. Links carry utm_source=welcome.
2. Uninstall survey at website/app/bye (Next.js). Reads ?v= for the version only. Submits through the existing Netlify Forms setup (see website/public/__forms.html — add a matching hidden "uninstall" form with fields reason, details, email, version). No analytics, no cookies, no other query params. background.js calls runtime.setUninstallURL("https://tracebug.dev/bye?v=" + version).
3. Popup states in popup.html/popup.js: restricted page, local file without file access (check with extension.isAllowedFileSchemeAccess), and tab needs reload (from Phase 3's ping/re-inject failure). One component, three variants.
4. "What's new" card in the popup: shown once after runtime.onInstalled with reason === "update", dismissed state stored in chrome.storage.local. Copy exactly as in the design.
5. Review card in the page UI (Phase 5 rule: after the 3rd successful export, never in the first session; once more after the 10th if dismissed; then never). Store counts in extension storage. "Rate TraceBug" opens the Chrome Web Store reviews page (Firefox: the AMO reviews page).
6. (Optional) website/app/teams page from the design.

Copy must match the designs word for word. Run build, test, typecheck, lint, build:ext, ext:lint and ext:firefox. Stop after each screen so I can commit it, update PROGRESS.md and suggest commit messages.
```
