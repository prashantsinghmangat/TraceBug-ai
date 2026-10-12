# Phase 0 findings - ARCHIVED

**Investigated 2026-10-11, and most of it has since been acted on.** Phases 1, 2a, 2b, 3 and Phase 4
Steps A+B all landed after this was written, so large parts of it describe code that no longer exists.
Its still-true findings were folded into `docs/launch/STATE.md` on 2026-10-12 - **read that instead.**

Known to be out of date here, specifically:

- Item 1's permission table: `<all_urls>` is now in `optional_host_permissions`, and `alarms` was added.
  There is no longer any install warning at all.
- Item 4 (secrets in page `localStorage`): fixed by Phase 2a/2b. Tokens and the AI key are in
  `chrome.storage.local`, entered in the extension's own settings page, and every provider call runs in
  the worker. Saved tickets are still per-origin page `localStorage` - that is the v2.0 IndexedDB item.
- Item 5 (restricted pages): the webstore, PDF-viewer and `file://` gaps were closed by Phase 3, which
  also added the demo-page button.
- Item 6 (orphaned tabs, updates): both handled by Phase 3, on top of the `tb_sw_state_v1` persistence
  this report found.
- Item 7 (first run): still true - the remote welcome page is Phase 4 Step C, still open.
- Item 8 (capture without video): wired to the popup by Phase 4 Step A.
- Item 9's Slack item: resolved by Phase 2b, which reads Slack's real reply.
- Every mention of **`Ctrl+Shift+B` as the capture shortcut** is now wrong. Phase 3 registered a real
  browser command, default **`Alt+B`**. `Ctrl+Shift+B` only opens Quick Bug once TraceBug is on the tab.
- The "Proposed order of changes" section is spent - Phases 1-4 are done in a different order than it
  suggested.

What is still live from this report: item 10 (Playwright/extension loading, which Phase 8 must respect),
the two-manifest sync trap in item 1, and the Phase 9 doc contradictions at the end. All three are in
`STATE.md` or `PLAN.md` already.

---

Investigated 2026-10-11 against `develop` (manifest version 1.10.1). Every line below is read from code, not docs.
Verdicts: **CONFIRMED** = audit was right · **REFUTED** = already done or not true · **PARTLY** = right problem, wrong detail.

## 1. Permissions and install warnings

`tracebug-extension/build/manifest.base.json:9-20` is the single source; `build/build-ext.mjs:66-104` adds the
per-target fields. `tracebug-extension/manifest.json` is the hand-maintained **unpacked/dev** copy (same content
+ `offscreen` + `minimum_chrome_version`) - it must be kept in sync by hand, which is a trap for Phase 1.

| | Chrome | Firefox |
|---|---|---|
| `permissions` | activeTab, storage, unlimitedStorage, scripting, **offscreen** | activeTab, storage, unlimitedStorage, scripting |
| `host_permissions` | `<all_urls>` | `<all_urls>` (Firefox treats these as opt-in) |
| other | `minimum_chrome_version: 116` | `strict_min_version: 128.0`, gecko id, `data_collection_permissions: ["none"]` |

`web_accessible_resources` also matches `<all_urls>` (manifest.base.json:33-38) - it does not add a warning, but
it does need to stay `<all_urls>` for the CSP-proof player iframe (see item 10).

**Install warnings today (Chrome):** one - *"Read and change all your data on all websites"* (from `<all_urls>`).
There is **no** *"Read your browsing history"* warning. activeTab, storage, unlimitedStorage, scripting and
offscreen are all silent permissions.

## 2. `tabCapture` - **REFUTED, already removed**

Not in either manifest. Only three *comments* mention it, documenting its deliberate removal:
`background.js:448`, `:552`, `:555` ("No more silent tabCapture path. We always route to getDisplayMedia").
**Phase 1 has nothing to do here.** The docs that still call it "reserved (currently unused)" are the stale part.

## 3. `tabs` - **REFUTED as a permission; but the code depends on `<all_urls>` for tab URLs**

`tabs` is **not** in either manifest, so no history warning. (Correction to an earlier draft of this report: it
was not "never there" - `CHANGELOG.md` 1.10.1 records removing it precisely because it added a "Read your
browsing history" warning for nothing. That release is what the live store build is, so the audit was reading
pre-1.10.1 docs. Useful precedent: that removal shipped without breaking existing users.) But `chrome.tabs.*` is used heavily
(`background.js:13,182,187,217,225,289,304,336,339,686,695,707,709`; `popup.js:81,144`). Two of those reads need
URL access, which today comes from `<all_urls>`, **not** from `tabs`:

- `background.js:189` - `if (changeInfo.status !== "complete" || !tab.url) return;` **This is the landmine.**
  Drop `<all_urls>` to optional and, until it is granted, `tab.url` is `undefined` on most tabs, so this
  listener returns early and **re-injection after navigation stops working entirely**. The guard is also
  unnecessary: the re-inject decision at `:207` only uses `tabId` against `activeTabs` / `_recordingTabId`.
  Removing `|| !tab.url` is the correct Phase 1 fix.
- `background.js:289` - `chrome.tabs.captureVisibleTab` needs `activeTab` or a granted host permission.
- `popup.js:144-166` - the restricted-page guard reads `tab.url`; with no host permission it sees `undefined`
  and falls into the "can't run here" branch for **every** page. Needs `activeTab` to be in play or a different
  signal.

`webNavigation` is **not** used anywhere. It is not needed either - `tabs.onUpdated` + the `activeTabs` set
already cover HUD re-mount. **Do not add it.**

## 4. Secrets and saved tickets - **CONFIRMED, the most serious item**

There is no extension-mode branch anywhere. The SDK is injected into the page's **MAIN world**
(`background.js:121-131`, `world: "MAIN"`), so all of this is host-page storage the site under test can read:

| Data | Key | Where | Code |
|---|---|---|---|
| Integration tokens (GitHub PAT, Linear key, Slack webhook) | `tracebug_integrations` | page `localStorage` | `src/integrations/tracker-client.ts:69,73-85` |
| AI provider key + config | `tracebug_ai_config` (legacy `tracebug_ai_key`) | page `localStorage` | `src/ai/llm-client.ts:39,41,74,87,99` |
| Saved tickets / sessions | `tracebug_sessions` | page `localStorage`, **per origin** | `src/storage.ts:6,72` |
| Redaction rules | - | **`chrome.storage.sync`** (already correct) | `e2e/ext-redaction.e2e.mjs:4-6` |

Two exposure paths, not one: the key is readable at rest *and* every provider call is a `fetch()` from the page
world (`tracker-client.ts:159,187,224`; `llm-client.ts:178,230,268`), so a page that has monkey-patched
`window.fetch` sees the `Authorization` header too. Moving storage without moving the fetch fixes only half.

Both config modules carry the comment *"localStorage only - never leaves the browser"*
(`tracker-client.ts:71`, `llm-client.ts:70`). True about the network, misleading about the host page.
Redaction rules are the one thing already in extension storage - Phase 2 should leave them alone.

## 5. Restricted pages - **PARTLY: a guard exists, with real gaps**

`popup.js:146-166` already blocks `chrome://`, `chrome-extension://`, `edge://`, `about:`, `moz-extension://`,
`view-source:`, `resource://`, `addons.mozilla.org`, `accounts.firefox.com`, and shows the `#unavailable` panel
(`popup.html:32-36`): *"Can't run on this page / TraceBug works on any website. Open a regular tab to get
started."*

Not silent, then - but **missing**: `chromewebstore.google.com` and `chrome.google.com/webstore` (grep for
"webstore" in the extension returns nothing - this is the audit's first-run scenario), the built-in **PDF
viewer** (a normal `https://…pdf` URL passes the guard, then injection fails), and **`file://`** (passes the
guard; fails without "Allow access to file URLs"). The panel has **no demo-page button**.

Popup action failures are **not** silent: `runCombo` toasts `res.error` or the caught message
(`popup.js:320,336-338`). The silent failure is in orphaned tabs - see item 6.

## 6. Orphaned tabs and updates - **CONFIRMED (silent by design), no update handling at all**

`content-script.js` deliberately **suppresses** orphan errors in four places - `:81`, `:227`, `:367-371`
(`window.error`), `:372-378` (`unhandledrejection`) - all matching `/Extension context invalidated|Receiving end
does not exist/`. The intent (a clean host-page console) is sound, but nothing re-injects and nothing tells the
user, so the popup action just does nothing. There is **no ping/health-check** pattern anywhere (grep for
`PING` returns nothing).

`chrome.runtime.onUpdateAvailable` is **not handled** (grep returns only false hits inside the built bundle), so
an auto-update during a recording kills it. Note the recording is more survivable than it looks: SW state
(`activeTabs`, `_recordingTabId`) is persisted to `chrome.storage.session` under `tb_sw_state_v1`
(`background.js:40-56`) and rehydrated on every worker start - the deferral Phase 3 wants can build on that.

## 7. First run - **PARTLY: a handler exists, but it opens a remote page**

`background.js:11-15` handles `onInstalled` with `reason === "install"` and opens
`https://tracebug.dev/try.html?welcome=extension`. So "no welcome page" is wrong - but there is **no bundled
`welcome.html`**, no pin-to-toolbar step, no shortcut hint and no privacy box, and it depends on the network on
first run. `reason === "update"` is already correctly ignored.

## 8. Capture without video - **exists in the SDK, but is not the popup's path**

Events-only capture is a first-class mode: `ACTIVE_CAPTURE_MODE_KEY` is `"events" | "video"`
(`src/storage.ts:13-14`) and the on-page toolbar resumes event-only sessions across navigation
(`src/compact-toolbar.ts:224`). It is reachable only from the **on-page toolbar**, not the popup.

The popup's primary button goes straight to video: `btnCaptureBug` -> `TB_START_RECORDING`
(`popup.js:267-275`) -> offscreen `getDisplayMedia` (`offscreen.js:287`, "Always use getDisplayMedia").
So the first-run screen-share wall is **CONFIRMED** - but Phase 4 is wiring an existing mode to the popup,
not building a new capture path.

## 9. Large exports, Slack, Jira - **all three are smaller than the audit assumed**

- **Size:** already estimated and shown next to the export button (`src/ui/quick-bug.ts:632`,
  `_estimateHtmlExportBytes`) and in a note at `:3338`. Missing: the **20 MB / 25 MB threshold warning** (no hit
  for either string anywhere in `src/`).
- **Slack:** `tracker-client.ts:231-232` already returns `{ ok: true, opaque: true }` with the comment "We can't
  read an opaque response - report success optimistically". The UI ignores the flag and shows a bare
  `"✓ Sent to Slack"` (`quick-bug.ts:1884`). **One-line fix** using a field that already exists.
- **Jira:** already copy-only and mostly honest - the toast says `"✓ Copied as Jira Ticket"`
  (`quick-bug.ts:980`). Only the bare menu label `"Jira"` (`quick-bug.ts:648`) needs to become "Copy for Jira".

## 10. Playwright extension loading - **works, but not as Phase 8 assumes**

Two harnesses already load the unpacked extension via `launchPersistentContext` with
`--disable-extensions-except` / `--load-extension`: `e2e/ext-redaction.e2e.mjs:27-30` and
`e2e/ext-player-csp.e2e.mjs:27-30`. Three blockers for CI:

1. **Branded Chrome 137+ silently ignores `--load-extension`** (`ext-player-csp.e2e.mjs:2-3,25-26`), so it uses
   bundled Chromium deliberately. **Phase 8's "nightly run against Chrome Beta" cannot load the extension this
   way** - that item needs rethinking (bundled Chromium nightly, or `--headless=new` research).
2. Both run `headless: false` and are plain `node` scripts, not Playwright specs - and `playwright.config.ts`
   (`testDir: "./e2e"`) only matches `*.spec.ts`, so neither runs under `npx playwright test` today.
3. Both hardcode `D:/Project/TraceBug-ai/...` absolute paths. Must be repo-relative before CI.

Also: `playwright.config.ts` uses `channel: "chrome"` (wrong for extension tests, per #1) and attaches the
TraceBug reporter, and `e2e/demo-failure.spec.ts` **fails on purpose**. A smoke spec dropped into `testDir` would
inherit both. Phase 8 needs a separate Playwright *project* with its own channel and reporter.

## Proposed order of changes

Phase 2 is the only real engineering; much of the rest is smaller than planned.

1. **Phase 2 (secrets + tickets)** - biggest, riskiest, and the one that makes the privacy claim true. Do it
   while the context is freshest. Storage *and* fetch must move together.
2. **Phase 1 (permissions)** - now small: flip `<all_urls>` to `optional_host_permissions` in
   `manifest.base.json`, sync `tracebug-extension/manifest.json`, remove the `!tab.url` guard at
   `background.js:189`, and fix the `popup.js:152` URL read. The request/decline/degrade flow **already
   exists** - see below.
3. **Phase 3 (restricted pages, orphans, updates)** - add webstore/PDF/`file://`, the demo button, a ping+
   re-inject, and `onUpdateAvailable` on top of the existing `tb_sw_state_v1` persistence.
4. **Phase 4 (first run)** - bundled `welcome.html`, and point the popup at the existing events-only mode.
5. **Phase 6 + 9 (copy/threshold fixes)** - cheap; mostly one-liners. Could merge into one commit.
6. **Phase 5, 7** - new surface, no dependencies.
7. **Phase 8 last**, and rescope it per item 10.

## Things in the plan or audit that are wrong

- **Phase 1 is largely already built.** `popup.js:295-339` (`runCombo`) already calls
  `chrome.permissions.request({origins:["<all_urls>"]})` as the first await inside the click handler, remembers a
  decline in `chrome.storage.local` (`tb_host_perm_declined`), and shows almost exactly the degradation copy the
  plan specifies: *"Works on this page for now - TraceBug stops after navigation without site access…"*. It was
  written for Firefox's opt-in model. Chrome just needs the manifest flip. **Do not rewrite this.**
- **`tabCapture` and `tabs` are not in the manifest** (audit fixes #1/#2 assume both). The only install warning
  is the `<all_urls>` one. There is no browsing-history warning to remove.
- **"Restricted pages fail silently"** overstates it - there is a guard and a panel; the gaps are webstore, PDF
  and `file://`.
- **"No welcome page after install"** is wrong - it opens a remote sandbox page today.
- **Jira already says "Copied"** in its toast; only the menu label is misleading.
- **The nightly Chrome Beta run in Phase 8 will not work** with `--load-extension` (item 10.1).
- **Doc/code contradictions confirmed for Phase 9:** the popup has **four** actions (`popup.html:83,130,134,138`
  - Capture Bug, Screenshot, View tickets, Inspect), not three. `src/storage.ts:2` claims "Nothing leaves the
  machine" and both config modules claim "never leaves the browser", which the AI debugger and integrations
  contradict. `website/components/faq-data.ts` "Does my data leave the browser?" says "no uploads" with the same
  problem.
- **Watch out:** `tracebug-extension/manifest.json` (dev) and `build/manifest.base.json` (source of truth) are
  separate files that must be edited together. Worth considering generating the dev one in Phase 1.
