# Manual test: restricted pages, orphaned tabs, updates, and the keyboard shortcut

**Why this test exists.** Phase 3's whole claim is that TraceBug never fails silently. Most of that claim is
unit-tested (`tests/page-support.test.ts`, `tests/background-tab-lifecycle.test.ts` — the latter runs the real
`background.js` against a fake `chrome`), but four things can only be seen in a browser: the exact sentence a
real `chrome://` page produces, what a genuinely orphaned tab does, what the toolbar button shows when the
keyboard shortcut fails, and whether a shortcut key actually bound.

Takes about 20 minutes on Chrome and 10 on Firefox. Run both before submitting.

Every row below gives the **exact** expected title, line and button, so nothing is left to the tester's
judgement. Copy comes from `tracebug-extension/page-support.js`; if the wording in the browser and the wording
here disagree, one of them is a bug — say which.

## Setup

```sh
npm run build:ext      # → tracebug-extension/dist/chrome and dist/firefox
```

Chrome: a fresh profile (`--user-data-dir=D:/tmp/tb-phase3`), then `chrome://extensions` → Developer mode →
Load unpacked → `tracebug-extension/dist/chrome`.

**Do not grant site access** for the first pass. Phase 1 made `<all_urls>` optional and a fresh install has
none, which is the state most of these rows are about.

## 1. Pages TraceBug cannot run on (Chrome)

Open each URL, click the TraceBug toolbar icon, and compare the panel.

| # | Open this | Expected panel |
|---|---|---|
| 1.1 | `chrome://extensions` | **TraceBug can't run on this page** · "Browsers block extensions on their own pages and the extension store." · button **Try it on the bug playground** |
| 1.2 | `chrome://newtab` (or a new tab) | same as 1.1 |
| 1.3 | TraceBug's own settings page (`chrome-extension://…/options.html`) | same as 1.1 |
| 1.4 | `https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj` | same as 1.1 |
| 1.5 | `https://chrome.google.com/webstore/category/extensions` | same as 1.1 |
| 1.6 | `view-source:https://example.com/` | same as 1.1 |
| 1.7 | `https://arxiv.org/pdf/1706.03762` (the built-in PDF viewer) | same as 1.1 — but note it appears **after** you click an action, not before. A `.pdf` URL is indistinguishable from an HTML page until injection fails, so this one is mapped from the browser's error rather than from the URL. |

**Click the button in 1.1.** It must open `https://tracebug.dev/try.html` in a new tab. A panel with no way
out is the failure this phase exists to remove, so a dead or missing button is a FAIL.

## 2. Local files (Chrome)

| # | Step | Expected |
|---|---|---|
| 2.1 | With **"Allow access to file URLs" OFF** (the default), open any local `.html` file and click an action | **Allow access to local files** · "To capture pages opened from your computer, turn on "Allow access to file URLs" for TraceBug." · button **Open extension settings** |
| 2.2 | Click that button | `chrome://extensions/?id=<TraceBug's id>` opens, scrolled to TraceBug's details |
| 2.3 | Turn the toggle **on**, reload the local file, click **Capture Bug** | A normal capture. No panel. |

## 3. A normal page with site access withheld (Chrome)

| # | Step | Expected |
|---|---|---|
| 3.1 | Open `https://example.com`, click the icon | The popup shows **example.com** and `/` — **not** "TraceBug can't run on this page". A missing `tab.url` must never be read as a restriction. |
| 3.2 | Click **Screenshot**, decline the site-access prompt | The capture happens on this page, and the popup says capture stops after navigation. |
| 3.3 | Press the capture shortcut on a page TraceBug is already running on | The "Capturing this page only…" notice appears **once**. Press again — it must not repeat. |

## 4. Orphaned tabs (Chrome) — the silent failure

| # | Step | Expected |
|---|---|---|
| 4.1 | Open `https://example.com`, click **Screenshot** so TraceBug mounts, then close the modal. Leave the tab open. | The TraceBug toolbar is on the page. |
| 4.2 | Go to `chrome://extensions` and press **Reload** on the TraceBug card. **Do not reload the page.** | The tab now holds a dead copy of TraceBug. |
| 4.3 | Back on that tab, click the icon → **Screenshot** | **It works.** Before Phase 3 this did nothing at all and said nothing. |
| 4.4 | Look at the page | **Exactly one** TraceBug toolbar. Two means the repair re-injected the page-world SDK on top of a live one — a FAIL. |
| 4.5 | Repeat 4.1–4.3 but reload the page first, *then* reload the extension, *then* click an action | Also works (this is the no-page-SDK path, where the full re-injection is correct). |
| 4.6 | If any action ever leaves you stuck | The panel must read **Reload this tab to capture** · "TraceBug was updated while this tab was open." · button **Reload tab**, and that button must reload the tab. |

## 5. An update that lands mid-recording

**This row cannot be triggered locally.** `chrome.runtime.onUpdateAvailable` does not fire for an unpacked
extension — there is no update channel — and no local trick reproduces it. The logic is unit-tested
(`tests/background-tab-lifecycle.test.ts`, "an extension update never kills a recording": held while
recording, applied after it ends via two different end paths, survives a worker restart, and ignores a flag
left by an already-applied version).

So this is a **post-release watch item, not a pre-release check**: on the first real store update after 1.11,
confirm that a user recording at the time keeps their recording and gets the ticket modal. Note it on the
release checklist.

## 6. The keyboard shortcut (Chrome)

The default is **`Alt+B`**. It is deliberately *not* `Ctrl+Shift+B`: Chrome uses that to toggle the bookmarks
bar and `Alt+Shift+B` to focus it, and silently leaves a colliding `suggested_key` **unbound** — measured, not
assumed (`e2e/ext-provider-confirm.e2e.mjs` asserts a key really bound, and 11 candidates were probed to
confirm the collision rather than an environment quirk).

| # | Step | Expected |
|---|---|---|
| 6.1 | `chrome://extensions/shortcuts` | TraceBug shows **Alt+B** against "Capture a bug on the current tab". A **blank** here is a FAIL — it means the shipped default collided and needs changing. |
| 6.2 | Open a brand-new page TraceBug has **never** run on and press `Alt+B` | A capture starts and the Quick Bug modal opens. This is the whole point: the shortcut used to do nothing here. |
| 6.3 | Open the popup | The tip names **Alt+B** — not a hardcoded key. |
| 6.4 | Rebind the command to `Ctrl+Shift+Y` in 6.1, reopen the popup | The tip now names **Ctrl+Shift+Y**. |
| 6.5 | **Clear** the shortcut in 6.1, reopen the popup | The tip reads "No capture shortcut is set." with a **Set a shortcut** button that opens `chrome://extensions/shortcuts`. |
| 6.6 | Rebind the command **onto `Ctrl+Shift+B`**, open a page where TraceBug is already running, press it once | Quick Bug opens **once**, not twice. This is the only configuration where the browser command and the in-page handler share a key. |
| 6.7 | Set the shortcut back to `Alt+B`, go to `chrome://extensions`, press `Alt+B` there | The toolbar button turns into a red **!** and its tooltip reads "TraceBug — TraceBug can't run on this page / Browsers block extensions…", clearing after ~8 seconds. A service worker has no popup and TraceBug has no notifications permission, so the button is the only surface it has — this is expected, not a bug. |
| 6.8 | With `Alt+B` bound, press `Ctrl+Shift+B` on a page where TraceBug is running | Quick Bug opens. Both keys work by default and do different jobs: `Alt+B` captures from anywhere, `Ctrl+Shift+B` opens Quick Bug on a page that already has TraceBug. |

## 7. Firefox

Install `tracebug-extension/dist/firefox` via `about:debugging` → This Firefox → Load Temporary Add-on, or
`npm run ext:firefox`.

| # | Open this | Expected panel |
|---|---|---|
| 7.1 | `about:debugging` | **TraceBug can't run on this page** · "Browsers block extensions on their own pages and the extension store." · **Try it on the bug playground** |
| 7.2 | `about:addons` | same as 7.1 |
| 7.3 | `about:config` | same as 7.1 |
| 7.4 | TraceBug's settings page (`moz-extension://…/options.html`) | same as 7.1 |
| 7.5 | `https://addons.mozilla.org/en-US/firefox/` | same as 7.1 |
| 7.6 | `resource://gre/modules/XPCOMUtils.sys.mjs` | same as 7.1 |
| 7.7 | `view-source:https://example.com/` | same as 7.1 |

Firefox differences to check, not to be surprised by:

- **No file-access row.** Firefox has no `isAllowedFileSchemeAccess()`, so TraceBug never claims local files
  are blocked — a `file://` page either works or produces the ordinary injection error. Section 2 is
  Chrome-only by design.
- **The shortcut lives elsewhere.** `about:addons` → the gear menu → **Manage Extension Shortcuts**. Confirm
  **Alt+B** is bound there and run 6.2–6.6 against it. Firefox's own `Ctrl+Shift+B` (bookmarks Library) is
  another reason the default is not that combo.
- **Site access is a toggle, not a prompt.** `about:addons` → TraceBug → Permissions → *Access your data for
  all websites*. Section 3 behaves the same with it off.
- Run the orphan test (section 4) by reloading the temporary add-on in `about:debugging`.

## Pass / fail

**PASS** = every row matches, and in particular: no panel is a dead end, 4.3 works with exactly one toolbar,
and 6.1 shows a real key.

**FAIL that blocks the release:**
- 3.1 showing "can't run on this page" on normal sites — that breaks every page, not an edge case.
- 6.1 blank — the shortcut the docs name does nothing on a fresh install, which is the bug Phase 3 set out to
  fix. Change the default key rather than the documentation.
- 4.4 showing two toolbars — the repair is corrupting live pages.
