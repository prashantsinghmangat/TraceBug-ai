# The injected SDK must never adopt a page-defined `window.TraceBug`

Found during the product-flow audit (`docs/audit/product-flow.md`, Finding 1) and confirmed with a
live repro: `website/public/try.html` loaded its own copy of the SDK and called `.init()` in page
mode before the extension's injected copy ran. `TraceBug.init()` is a no-op past the first call
(`src/index.ts` ~L304, `"Already initialized."`), so the extension's
`init({transport:"extension"})` was silently dropped, and `isExtensionMode()` (`src/ext-transport.ts`)
stayed `false` for the rest of the page's life — breaking real sends (falls back to clipboard copy)
and the settings pointer (shows the page-mode bring-your-own-token form instead) on **any** host
page that embeds its own copy of the SDK, not just try.html. The website side is fixed (try.html no
longer self-starts), but that only closes the one page we control. Any real app that integrates the
npm SDK and later has a user install the extension hits the exact same collision.

## Root cause, precisely

Both the npm SDK and the extension's injected copy are **the same bundle**
(`src/index.ts` → `tracebug-sdk.js`), built once by `tsup.config.ts`'s IIFE entry. Its footer
(`tsup.config.ts` ~L143-152) is the actual collision point:

```js
if (typeof window !== 'undefined' && typeof TraceBugModule !== 'undefined' && !window.__TRACEBUG_LOADED__) {
  window.__TRACEBUG_LOADED__ = true;
  window.TraceBug = TraceBugModule.default || TraceBugModule;
  window.TraceBugSDK = TraceBugModule;
}
```

Whichever `<script>` tag runs this footer **first** wins `window.TraceBug` for the rest of the
page's life — a page-mode script tag if the host page has one, or the extension's injected copy if
not. `tracebug-init.js:11` only checks `typeof window.TraceBug === "undefined"`, which is true
either way once *some* copy has run, so it always proceeds to call `.init()` on whatever instance
already claimed the global — and that call is dropped silently if it's not the first call.

## The fix: the extension gets its own global, never shares `window.TraceBug`

1. **A second IIFE build entry** in `tsup.config.ts`, same `entry: { ...: "src/index.ts" }` as the
   existing `tracebug-sdk` entry, but with its own footer that publishes under a name no page script
   could ever collide with by accident — e.g. `window.__TraceBugExtension` /
   `window.__TraceBugExtensionSDK` — guarded by its own `__TRACEBUG_EXT_LOADED__` flag, entirely
   independent of `window.__TRACEBUG_LOADED__`. Output file: `tracebug-sdk-ext.js`, alongside
   `tracebug-sdk.js` in `tracebug-extension/`.
2. **`tracebug-init.js`** (and `ensureActive()` inside it) talks *only* to the new global — every
   `window.TraceBug.*` / `window.TraceBugSDK.*` reference in that file becomes
   `window.__TraceBugExtension.*` / `window.__TraceBugExtensionSDK.*`. It must never read or write
   `window.TraceBug` at all, so a page-defined instance under that name is invisible to it and can't
   be adopted.
3. **`background.js`'s `injectSDK`** (~L346, the `chrome.scripting.executeScript({files:
   ["tracebug-sdk.js"], world: "MAIN"})` call at ~L386 per the grep) injects `tracebug-sdk-ext.js`
   instead.
4. **Both manifests' `web_accessible_resources`** (`tracebug-extension/manifest.json` and
   `build/manifest.base.json`, the `resources` array that currently lists `"tracebug-sdk.js"`
   alongside `"tracebug-init.js"`, `"player.html"`, `"player.js"`) gain `"tracebug-sdk-ext.js"`
   alongside the existing entry — check at implementation time whether the existing
   `tracebug-sdk.js` entry there is load-bearing for `chrome.scripting.executeScript` (likely not —
   that API doesn't need web-accessible-resources — or for some other path, e.g. a script tag in
   `player.html`/`offscreen.html`) and mirror whatever that path turns out to be.
5. **Keep `tracebug-sdk.js` itself unchanged** — the npm SDK and any page-mode `<script>` tag (the
   website's own opt-in demo button, any real app's own integration) keep working exactly as before,
   under `window.TraceBug`, same as today. Nothing about page mode changes; only the extension stops
   competing for that name.
6. **Everywhere else in the extension that currently assumes `window.TraceBug` is "the SDK"** needs
   a pass to confirm it isn't reaching across the two instances — `content-script.js`'s bridge talks
   over DOM `CustomEvent`s (`tracebug-ext-action`, `tracebug-provider-request`, etc.), which don't
   reference a window global directly, so these should be unaffected; verify this holds at
   implementation time rather than assuming it from this description.

## The e2e test this needs (write it as part of implementing this fix)

A new spec, e.g. `e2e/ext-sdk-isolation.e2e.mjs`, proving the fix rather than just the old
behavior:

1. Load a page that defines **its own** `window.TraceBug` and calls
   `window.TraceBug.init({projectId: "host-app"})` in page mode (default transport) — exactly like
   a real app using the npm SDK, simulating a user who has that app open and then installs the
   extension.
2. Inject the extension (`secret-migration.js`, `content-script.js`, `tracebug-sdk-ext.js` in the
   `MAIN` world, `tracebug-init.js`) — the real injection sequence `background.js` runs.
3. Assert, all in the same page:
   - the page's own `window.TraceBug` instance is **untouched** — still in page mode, still the
     exact object the host app created, never reassigned or mutated by the extension.
   - the extension's own instance (reached via `window.__TraceBugExtension`) is in **extension
     mode**: its own `isExtensionMode()`-gated behavior is active, independent of the page's
     instance.
   - triggering a capture through the extension's action bridge (`tracebug-ext-action` →
     `"record"` / `"capture-now"`) opens the **extension's own** ticket modal, not anything driven
     by the page's instance.
   - "Configure integrations…" in that modal shows the **settings pointer**
     (`showSettingsPointerModal`), never the page-mode bring-your-own-token form.
   - clicking the tracker-send button with a configured integration opens the real
     **`confirm-send.html`** window — not a clipboard copy.
   - **none of the extension's data** (the configured GitHub token/repo, the integration booleans)
     is reachable from the page's own `window.TraceBug` instance or from arbitrary page-world JS —
     assert this the same way `e2e/ext-provider-confirm.e2e.mjs`'s "nothing leaked into the page"
     check (§10) already does.
4. Re-run the *existing* `e2e/ext-provider-confirm.e2e.mjs` unchanged against the new injected file
   name — it should keep passing exactly as today, since nothing about the extension's own behavior
   is meant to change, only which global it lives under.

## Status: implemented (2026-10-22)

Everything above shipped as written — `tracebug-sdk-ext.js` (its own tsup entry, its own global,
its own `__TRACEBUG_EXT_LOADED__` guard), `tracebug-init.js` rewritten to talk only to
`window.__TraceBugExtension`/`window.__TraceBugExtensionSDK`, `background.js`'s `injectPageWorld`
injecting the new file, both manifests' `web_accessible_resources` updated, `build-ext.mjs`'s file
list updated. All 7 pre-existing extension e2e specs were updated to the new filename/global and
still pass unchanged otherwise (confirmed: 144 checks across them, plus 919 unit tests).

**One thing the original brief above didn't anticipate, found by writing the e2e it asked for:**
giving the extension's bundle its own `window` global isolates *state* (config, transport mode,
secrets) — but both the host page's instance and the extension's instance still mount their UI into
the *same shared DOM*, under the same hardcoded ids (`#tracebug-root`, `#tracebug-compact-toolbar`,
`src/dashboard.ts`). `mountDashboard()`'s own "don't mount twice" guard
(`document.getElementById("tracebug-compact-toolbar")`) is keyed on that shared id, not scoped to
which module instance is asking — so if a host page's own SDK already has its toolbar up, the
extension's `mountDashboard()` call silently no-ops. State is correctly isolated; the UI isn't, and
two TraceBug toolbars on one page is the wrong outcome anyway.

### The decision: one interface per page, not two DOM-namespaced toolbars

Deliberately **not** fixed by giving the extension's mounted UI separate DOM ids (which would let
both toolbars coexist) — that was considered and rejected. Two simultaneous TraceBug toolbars on one
page is confusing regardless of whether they're visually distinct, and the fix would touch
`dashboard.ts`, `compact-toolbar.ts`, and `quick-bug.ts` throughout for a UI nobody asked for.
Instead: **detect the collision before injecting, and defer entirely.**

- `page-support.js` gained `detectHostTraceBugUI(doc)` (DOM-free — takes a document-like object, so
  the file keeps its no-DOM/testable-in-`node:vm` property) and the shared `HOST_UI_ERROR` /
  `HOST_UI_TITLE` / `HOST_UI_DETAIL` constants, next to `classifyPage`.
- `content-script.js`'s existing `TB_PING` handler (previously an inline
  `!!document.getElementById("tracebug-root")` check, originally built only for the *repair* case —
  "did my own prior instance survive an extension reload") now calls the shared detector instead.
  The same DOM signal means something different depending on which code path asks: in
  `ensureAlive()` (repair), `pageSdk: true` can only mean a *prior extension instance* of ours
  survived — unchanged, still correctly skips re-injecting the page world. In `injectSDK()` (first
  injection on a tab, never injected before), `pageSdk: true` can **only** mean a host page's own
  UI, since there is no prior instance of ours it could be detecting instead — this is the new check.
- `injectSDK()` pings right after `injectBridge()` and, on `pageSdk: true`, throws
  `HOST_UI_ERROR` instead of calling `injectPageWorld()` — reusing the function's existing
  catch-cleans-up-`injectedTabs`/`activeTabs` path, no new bookkeeping needed.
- `page-support.js`'s `ERROR_MAP` gained a `"host-ui"` entry so the thrown error flows through the
  *same* `explainInjectionError` → `showUnavailable` pipeline every other "can't run here" state
  already uses (`action: "demo"`, reusing the restricted-page layout) — the popup shows **"This site
  runs its own TraceBug. Use its bug button, or capture on another page."** the moment any popup
  action is attempted on such a page.
- `Alt+B` has no popup to render that panel in, and the badge-tooltip fallback
  (`flashActionError`) is easy to miss (hover-only). For this one reason specifically,
  `commands.onCommand`'s catch block instead injects a tiny on-page notice: a host element with
  `all: initial` plus its own `attachShadow({mode:"open"})`, so neither the page's CSS can reach
  in nor the notice's own styles leak out. Auto-removes after 6 seconds.

### Coexisting with a host page's own TraceBug toolbar: deliberately not supported

If a page already shows its own TraceBug UI (a real app using the npm SDK with
`enableDashboard` at its default `true`), the extension will never mount anything on that page —
not its toolbar, not its ticket modal, not even its page-world SDK instance. The user sees "This site
runs its own TraceBug" from the popup, or the shadow-root notice from `Alt+B`, and is pointed at the
host app's own bug button or at capturing on a different page instead. This is intentional, not a
gap to close later: showing two TraceBug interfaces on one page is a worse outcome than showing
none, and solving it any other way means permanently namespacing `dashboard.ts` /
`compact-toolbar.ts` / `quick-bug.ts`'s DOM for a scenario this narrow. A host page whose own SDK
integration passes `enableDashboard: false` (no UI, data/API use only) is unaffected — the extension
isolates and runs normally there, exactly as the rest of this document describes.

### The e2e, as shipped

`e2e/ext-sdk-isolation.e2e.mjs`, two scenarios (17 checks total):

- **Host toolbar present** (`enableDashboard` left at its `true` default): asserts the popup shows
  the new panel with the exact copy above, exactly one toolbar remains on the page throughout (no
  second one ever appears), and neither `window.__TraceBugExtension` nor
  `window.__TraceBugExtensionSDK` is ever created — nothing of the extension's SDK was injected at
  all, not even under its own global.
- **Host SDK present, no UI** (`enableDashboard: false`): the original scenario from the brief above,
  unchanged — distinct instances, extension mode reached, real send via `confirm-send.html`, nothing
  leaked to the page.

A matching unit test lives in `tests/background-tab-lifecycle.test.ts` ("defers entirely on a tab
that already has a host TraceBug UI"), and the pre-existing tests in that file that happened to set
`pageSdk: true` on a *fresh* tab (meant to represent "a normal working tab," inert before this fix
since `injectSDK` never looked at `pageSdk`) were corrected to `false` — that value now means
something real, and left at `true` it would have made every "first action on a fresh tab" test
accidentally simulate the deferral case.
