# Chrome Extension

The TraceBug Chrome Extension lets non-developers (QA, PMs, support) capture bugs on **any website** — no code changes required.

## Install from Chrome Web Store

**[Install TraceBug](https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj)** — one-click, works immediately.

## Browser Compatibility

| Browser | Supported | How to install |
|---------|-----------|----------------|
| Chrome  | Yes | Chrome Web Store |
| Edge    | Yes | Chrome Web Store (Edge runs Chrome extensions) |
| Brave   | Yes | Chrome Web Store |
| Opera   | Yes | Install "Install Chrome Extensions" add-on first, then Chrome Web Store |
| Firefox | No (different extension format) | Use the npm SDK: `npm install tracebug-sdk` |
| Safari  | No | Use the npm SDK |

## Install from Source (Developers)

```bash
git clone https://github.com/prashantsinghmangat/tracebug-ai
cd tracebug-ai && npm install && npm run build
```

Then in `chrome://extensions/`:
1. Enable **Developer mode** (top-right)
2. Click **Load unpacked** → select `tracebug-extension/`

After code changes, run `npm run build` and click the **reload** icon on the TraceBug card.

## Usage

The extension popup has four actions:

| Action | What it does |
|--------|--------------|
| **Capture Bug** (primary) | Starts an events-only capture — console, network, your clicks and an interactive DOM replay. No screen-share dialog opens. A floating HUD shows the capture timer plus Screenshot, Draw, Blur (droplet icon — click an element to blur it, click again to unblur), and Stop. |
| **Screenshot** | One-shot capture of the current viewport. Opens the ticket modal directly with the screenshot attached. |
| **View tickets** | Opens the dashboard panel on the current page. |
| **Inspect element** | DevTools-style inspection: hover shows a box-model highlight + computed-style tooltip; click attaches the element with its full style evidence (typography, colors as hex, box model, WCAG contrast) to the report as an `inspect` annotation. |

### ⚙ Record options

A collapsible panel below the Capture Bug button — options persist per user and flow popup → background → content script → `prepareRecording()`. The capture-surface and microphone rows are not shown in 1.11: they only describe a screen recording, and screen recording is paused (see above).

What remains:

- **Start delay** — none, **3 s**, or **5 s**, with an on-page 3-2-1 countdown overlay before recording rolls.
- **Blur before recording** — arms the element-level blur tool *before* capture starts: click elements to blur/unblur, then a floating **"● Start recording / Cancel"** bar (with **Undo** for the last blur) begins the recording with the redaction applied from the very first frame. Cancel clears the blurs.

### 🛡 Redaction rules

A collapsible panel for app-specific PII the built-in token patterns can't know about:

- **Sensitive field names** — comma/newline separated; matches form fields, storage keys, URL params, and JSON keys in captured data (`email` also covers `customer_email`).
- **Mask patterns** — one regex per line, case-insensitive. Masked in console
  output, network response bodies, error text and the DOM replay. **Not** applied
  to URLs, storage values, or screenshots and video — URLs and storage keys are
  matched by *field name* instead (the box above), and images are never scanned.

Rules are validated on save, synced across your browsers via `chrome.storage.sync`, and applied **live** — even to a page that's already recording. Same engine as the SDK's [`redact` config](configuration.md#redact); the content script hands them to the page-world SDK via `<html data-tb-redact>`.

### Capture flow

1. Click **Capture Bug**. No screen-share dialog appears: TraceBug records the console, the network, your clicks and an interactive **DOM replay**. (Optionally set a start delay or blur-first in **⚙ Record options**.)
2. Reproduce the bug. The HUD timer ticks; use **Draw** to highlight elements, or the droplet **Blur** button to click-blur sensitive elements (the element's text is masked in the DOM replay).
3. Click **Stop** in the HUD.
4. The ticket modal opens with the replay, screenshots, console, network, and action chips all populated. Fill in title/description and export as HTML, GitHub issue, Jira ticket, Linear issue, or Slack message.

The capture follows you across pages. If it spans more than one, the DOM replay covers the page you finished on — the console, network and action timeline cover all of them.

#### Adding a screen recording

> **Screen recording is paused in 1.11.** The extension captures the console,
> the network, your clicks and an interactive DOM replay — everything except the
> pixels. Video returns in 1.11.3; the npm SDK records it today. If you had the
> option on, your setting is kept and comes back with the feature.

**macOS, for when it returns (and for the npm SDK today):** screen recording needs your browser ticked under **System Settings → Privacy & Security → Screen Recording**, and the browser has to be quit and reopened afterwards. If it isn't, TraceBug says so and offers to capture without video instead — your browser reports an OS refusal the same way it reports you closing the dialog, so TraceBug reads the error text to tell them apart.

### Per-tab indicator

The toolbar icon shows a green **ON** badge while TraceBug is injected in the current tab. The badge clears automatically when you reload the page.

## How It Works

Manifest V3 architecture with three extension contexts in 1.11:

```
Popup ──sendMessage──▶ Background (service worker)
                         │
                         ├─ chrome.scripting.executeScript ─▶ Content script (page tab)
                         │                                          │
                         │                                          └─ CustomEvent ─▶ SDK (page main world)
                         │
                         └─ provider sends (GitHub / Linear / Slack / AI), behind a confirmation window
```

**Why do provider calls run here?** The SDK runs in the host page's main world, so anything it holds
is readable by the site under test. Tokens live in `chrome.storage.local` and never reach the page:
the worker makes the call and shows you what it is about to send first.

**A fourth context returns in 1.11.3.** Screen recording runs in an **offscreen document**, because
service workers can't hold a `MediaStream` and get killed when idle; the offscreen document keeps a
recording alive across page reloads, navigation and tab switches. It is not created in 1.11 — see
`docs/launch/video-1.11.1.md`.

**Why proxy storage through the background?** `chrome.runtime.sendMessage` silently truncates responses larger than ~10 MB. A 30-second recording's base64 dataUrl is several MB, so we keep it out of IPC entirely: the recorder writes to storage, content-script reads from storage, page receives the bytes via a CustomEvent (in-process, no size limit).

## Permissions

Rebuilt from `tracebug-extension/build/manifest.base.json`. **A fresh install shows no
permission warning at all** — everything that would trigger one is optional and asked for later,
in context.

Required:

| Permission | Why |
|-----------|-----|
| `activeTab` | Act on the tab you are looking at, from your own click on the popup or the shortcut |
| `storage` | Remember your options, your redaction rules and your saved tickets |
| `unlimitedStorage` | A report with a DOM replay can exceed the default storage quota. It is stored only on your device |
| `scripting` | Inject the TraceBug SDK into the page when you start a capture |
| `alarms` | Cancel an unanswered send-confirmation window after two minutes |

Optional host permissions — **not requested at install**, asked for only at the moment they are
needed, and the extension degrades gracefully if you decline:

| Origin | Asked when |
|---|---|
| `<all_urls>` | Never requested as a whole since 1.11.2 — the popup's "Keep capturing across sites" row is gone, because a capture ends when you leave its site either way. It stays declared so the settings page can ask for **one** host when you point Ollama at an address other than `localhost`/`127.0.0.1`. Granted all-sites access in an earlier version? Settings shows it with a Remove button |
| `https://api.github.com/*` | You save a GitHub token in TraceBug settings |
| `https://api.linear.app/*` | You save a Linear key |
| `https://hooks.slack.com/*` | You save a Slack webhook (this one also lets TraceBug read Slack's real reply instead of guessing) |
| `https://api.openai.com/*`, `https://api.anthropic.com/*` | You save an AI key for that provider |
| `http://localhost/*`, `http://127.0.0.1/*` | You point the AI debugger at a local model (Ollama) |

Not present, and deliberately so: **`tabs`** (removed in 1.10.1 — it caused the "Read your browsing
history" warning), **`tabCapture`** (removed with it), and **`offscreen`** (removed in 1.11 with the
screen-recording pause; it returns in 1.11.3 with the feature).

Capture data stays in `chrome.storage.local` and the page's `localStorage`. **Nothing goes to TraceBug.** You choose what's sent to GitHub, Linear, Slack or your AI provider, and every send asks you first. See the [privacy policy](https://tracebug.dev/privacy).

## Files

```
tracebug-extension/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — SDK injection, provider sends, storage proxy
├── content-script.js   # Bridge between extension contexts and the page SDK
├── page-support.js     # Classifies restricted pages (webstore, PDF, file://)
├── diagnostics.js      # Copy-diagnostics report + the scrubber that keeps it private
├── secret-migration.js # Moves pre-1.11 page-stored tokens into extension storage
├── tracebug-init.js    # Page-context bootstrapper (talks only to __TraceBugExtension)
├── tracebug-sdk-ext.js # Auto-built IIFE bundle, own global window.__TraceBugExtension (DO NOT EDIT)
├── popup.html          # Four-action popup
├── popup.js            # Popup logic, Record options, "What's new" card
├── options.html / .js  # TraceBug settings — tokens and API keys live here
├── welcome.html / .js  # Bundled first-run page (no remote assets)
├── player.html / .js   # CSP-proof replay iframe
├── styles.css          # Popup styles
└── icons/              # 16 / 48 / 128 px extension icons

`offscreen.html` / `offscreen.js` are not in 1.11 — they host the `MediaRecorder` and come back
with screen recording in 1.11.3.
```

`tracebug-sdk.js` is auto-generated by `npm run build`. Do not edit it manually.
