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
| **Capture Bug** (primary) | Starts a screen recording. A floating HUD shows the recording timer plus Pause, Mic, Screenshot, Draw, Blur (droplet icon — click an element to blur it, click again to unblur; captured into the recording), and Stop. |
| **Screenshot** | One-shot capture of the current viewport. Opens the ticket modal directly with the screenshot attached. |
| **View tickets** | Opens the dashboard panel on the current page. |
| **Inspect element** | DevTools-style inspection: hover shows a box-model highlight + computed-style tooltip; click attaches the element with its full style evidence (typography, colors as hex, box model, WCAG contrast) to the report as an `inspect` annotation. |

A 🎤 toggle in the popup adds microphone audio to the recording.

### ⚙ Record options

A collapsible panel below the Capture Bug button — options persist per user and flow popup → background → content script → `prepareRecording()`:

- **Capture** — record the **current tab** directly, or open Chrome's **desktop / window picker**.
- **Start delay** — none, **3 s**, or **5 s**, with an on-page 3-2-1 countdown overlay before recording rolls.
- **Blur before recording** — arms the element-level blur tool *before* capture starts: click elements to blur/unblur, then a floating **"● Start recording / Cancel"** bar (with **Undo** for the last blur) begins the recording with the redaction applied from the very first frame. Cancel clears the blurs.

### 🛡 Redaction rules

A collapsible panel for app-specific PII the built-in token patterns can't know about:

- **Sensitive field names** — comma/newline separated; matches form fields, storage keys, URL params, and JSON keys in captured data (`email` also covers `customer_email`).
- **Mask patterns** — one regex per line, case-insensitive, masked anywhere in captured text.

Rules are validated on save, synced across your browsers via `chrome.storage.sync`, and applied **live** — even to a page that's already recording. Same engine as the SDK's [`redact` config](configuration.md#redact); the content script hands them to the page-world SDK via `<html data-tb-redact>`.

### Recording flow

1. Click **Capture Bug**. (Optionally set a capture surface, start delay, or blur-first in **⚙ Record options**.)
2. The share-picker appears — with **Capture: Current tab** it's pre-selected to the tab you're on; for flows that span tab navigation, pick **Desktop / window** in Record options (or "Window" / "Entire screen" in the picker).
3. Reproduce the bug. The HUD timer ticks; use **Draw** to highlight elements, or the droplet **Blur** button to click-blur sensitive elements (captured into the recording, masked in the DOM replay).
4. Click **Stop** in the HUD (or Chrome's native "Stop sharing" button).
5. The ticket modal opens with video, screenshots, console, network, and action chips all populated. Fill in title/description and export as HTML, GitHub issue, Jira ticket, Linear issue, or Slack message.

### Per-tab indicator

The toolbar icon shows a green **ON** badge while TraceBug is injected in the current tab. The badge clears automatically when you reload the page.

## How It Works

Manifest V3 architecture with four extension contexts:

```
Popup ──sendMessage──▶ Background (service worker)
                         │
                         ├─ chrome.scripting.executeScript ─▶ Content script (page tab)
                         │                                          │
                         │                                          └─ CustomEvent ─▶ SDK (page main world)
                         │
                         └─ chrome.offscreen.createDocument ─▶ Offscreen document (holds MediaRecorder)
```

**Why an offscreen document?** Service workers can't hold a `MediaStream`; they get killed when idle. The offscreen document keeps the recording alive across page reloads, navigation, and tab switches. It owns the `MediaRecorder` and persists the finalized recording to `chrome.storage.local` (proxied through the service worker because some Chrome builds don't expose `chrome.storage` to offscreen documents).

**Why proxy storage through the background?** `chrome.runtime.sendMessage` silently truncates responses larger than ~10 MB. A 30-second recording's base64 dataUrl is several MB, so we keep it out of IPC entirely: offscreen writes to storage, content-script reads from storage, page receives the bytes via a CustomEvent (in-process, no size limit).

## Permissions

| Permission | Why |
|-----------|-----|
| `activeTab` | Access the current tab when the popup is used |
| `storage` + `unlimitedStorage` | Persist the recording dataUrl (multi-MB) |
| `scripting` | Inject SDK into pages on demand |
| `tabs` | Detect navigation on the recording tab for HUD re-mount |
| `offscreen` | Create the offscreen document that holds `MediaRecorder` |
| `tabCapture` | Reserved (currently unused — recording uses `getDisplayMedia`) |
| `<all_urls>` | Work on any website |

All recording data stays in `chrome.storage.local` and the page's `localStorage`. Nothing leaves the browser.

## Files

```
tracebug-extension/
├── manifest.json       # Extension config (Manifest V3)
├── background.js       # Service worker — SDK injection, offscreen lifecycle, storage proxy
├── content-script.js   # Bridge between extension contexts and the page SDK
├── offscreen.html      # Host document for the recording context
├── offscreen.js        # MediaRecorder lifecycle, persists to chrome.storage.local
├── tracebug-init.js    # Page-context bootstrapper
├── tracebug-sdk.js     # Auto-built IIFE bundle (DO NOT EDIT)
├── popup.html          # Three-action popup
├── popup.js            # Popup logic
├── styles.css          # Popup styles
└── icons/              # 16 / 48 / 128 px extension icons
```

`tracebug-sdk.js` is auto-generated by `npm run build`. Do not edit it manually.
