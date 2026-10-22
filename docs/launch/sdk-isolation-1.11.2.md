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
