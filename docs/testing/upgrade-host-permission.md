# Manual test: an already-granted `<all_urls>` survives the 1.11 upgrade

**Why this test exists.** 1.11 moves `<all_urls>` from `host_permissions` (required, granted at install) to
`optional_host_permissions` (granted on request). Chrome and Firefox are both documented to *keep* a grant when
a pattern moves between those two keys, which would mean existing users notice nothing. But "documented" is not
"verified", and the failure mode is bad and silent: capture would stop at the first cross-origin navigation and
the user would never be told why. Run the Chrome half before Phase 3 gets far — and the popup check in the
**fresh-install** section below first of all: if the popup shows "Can't run on this page" on normal sites,
stop, because Phases 3 and 4 both build on it.

Takes about 15 minutes. Run it once on Chrome and once on Firefox.

**What this test cannot cover.** A real Web Store update. There is no way to test the store's own update path
before publishing, and no local trick reproduces it faithfully. The same-folder swap below is the closest
approximation. The live listing's ~25 users are the real test: watch uninstalls and support mail for the first
48 hours after 1.11 goes live.

**And a second limitation, so nobody reads a pass here as more than it is.** Reloading an unpacked extension
never raises Chrome's "new permissions" dialog and never *disables* the extension pending approval, which is
what a store update does when a release adds a permission that needs consent. So a pass here is **not**
evidence of "no re-prompt on a store update" in general — it cannot catch an update that would arrive disabled
for existing users. It is sound for **this** release because 1.11 only removes or makes optional what was
already granted, and its one addition (`alarms`) carries no warning. The fresh-install check below is what
actually confirms that, by confirming zero warnings. Any future release that adds a permission needs its own
reasoning, not this test.

## What you need

- The **previous store build** (1.10.1) — `git worktree add D:/tmp/tb-1101 v1.10.1` gives you one with
  `tracebug-sdk.js` already committed, so no build step is needed.
- The **1.11 build**: `npm run build:ext` → `tracebug-extension/dist/chrome` and `.../dist/firefox`.
- Two origins you can navigate between. `http://localhost:5173` → `http://127.0.0.1:5173` works, **but read
  step 6 first** — if Ollama's optional permissions are granted in the profile, that pair passes for the wrong
  reason. `https://example.com` → `https://example.org` is immune to that and needs no local server.

## Chrome

1. **Fresh profile.** Launch Chrome with `--user-data-dir=D:/tmp/tb-upgrade-profile` so nothing is inherited.
2. **Set up a swappable folder.** An unpacked extension's ID is derived from its **folder path**, so the
   upgrade has to happen *inside one folder*:
   ```sh
   mkdir -p D:/tmp/tb-upgrade-ext
   cp -r D:/tmp/tb-1101/tracebug-extension/. D:/tmp/tb-upgrade-ext/
   ```
   Load **`D:/tmp/tb-upgrade-ext`** (not the worktree) via `chrome://extensions` → Developer mode → Load
   unpacked. **Write down the extension ID shown on the card.**
3. **Confirm the pre-existing grant.** On the extension's details page, **Site access = On all sites**. That is
   the grant this whole test is about. Do not change it.
4. **Prove it works on 1.10.1.** Open the first origin, click the TraceBug icon, start a capture, then navigate
   to the second origin. The floating toolbar must still be there after the load — that is re-injection using
   the host permission.
5. **Upgrade in place, same folder.**
   ```sh
   rm -rf D:/tmp/tb-upgrade-ext/*
   cp -r D:/Project/TraceBug-ai/tracebug-extension/dist/chrome/. D:/tmp/tb-upgrade-ext/
   ```
   Then press **Reload** on the TraceBug card. **The ID on the card must be unchanged** — if it changed, this
   is a fresh install wearing a costume and proves nothing. (Copying a `key` field from the 1.10.1 manifest
   into the 1.11 one also pins the ID, but the same-folder swap already does it. Do **not** try the `.crx`
   route: stable Chrome on Windows and macOS refuses `.crx` files from outside the Web Store unless an
   enterprise policy allows it.)
6. **Check the permission survived, without touching anything.** Site access must still read **"On all
   sites"**, with **no prompt** at any point. Then open the service-worker console (`chrome://extensions` →
   TraceBug → *service worker*) and run:
   ```js
   chrome.permissions.contains({ origins: ["<all_urls>"] }).then(console.log)   // expect: true
   chrome.permissions.getAll().then(p => console.log(p.origins))                 // expect: includes "<all_urls>"
   ```
   **Rule out a false pass from the Ollama grant.** Phase 2b added `http://localhost/*` and
   `http://127.0.0.1/*` as optional permissions, requested when an Ollama AI provider is saved. If either is
   granted, a `localhost` → `127.0.0.1` navigation keeps working with **no** `<all_urls>` at all and this test
   passes for the wrong reason. So: Ollama must **not** be configured in this profile, and the `origins` list
   above must contain **no `localhost` or `127.0.0.1` entry of its own**. If it does, either revoke it or
   switch to `example.com` → `example.org`.
7. **Prove cross-origin capture still works, with no re-prompt.** Repeat step 4 on the 1.11 build. The toolbar
   must survive the cross-origin navigation, and **no permission dialog may appear.**
8. **Check the page-side signal agrees.** `data-tb-caps` is published by the content script, so it does not
   exist until TraceBug has been injected — an absent attribute before that is normal, not a failure. After
   starting a capture, on the test page console:
   ```js
   JSON.parse(document.documentElement.getAttribute("data-tb-caps")).hostAccess   // expect: true
   ```
   This is what suppresses the "capturing this page only" hint. If it says `false` while step 6 said `true`,
   the `TB_HOST_ACCESS` round trip is broken, not the permission.

**PASS** = steps 6, 7 and 8 all hold, with no prompt shown and the ID unchanged.
**FAIL** = any re-prompt, a changed ID, `contains` returning `false`, or the toolbar vanishing after the
cross-origin load. A FAIL blocks the release: it means every existing user silently loses
navigation-surviving capture.

## Firefox

Same shape, with three differences:

1. **Use Developer Edition or Nightly.** Release Firefox will not install an unsigned build at all. In
   Developer Edition / Nightly, set `xpinstall.signatures.required` to `false` in `about:config`, then install
   both builds as **permanent** add-ons from file. The `browser_specific_settings.gecko.id` is fixed in the
   manifest, so both installs share an ID and the second is a real update. Signing both builds just for this
   test would mean AMO submissions you do not need.
   *Alternative for the "before" state:* install **1.10.1 from AMO** (it is live), then install the unsigned
   1.11 file over it in Developer Edition.
2. **`about:debugging` → Load Temporary Add-on is not an upgrade path** — a temporary add-on's grants do not
   persist, so it cannot show you whether a grant survived.
3. Firefox has always treated manifest `host_permissions` as **opt-in**, so a 1.10.1 Firefox user may or may
   not have granted `<all_urls>`. Grant it first (`about:addons` → TraceBug → Permissions → *Access your data
   for all websites* → on), so there is a grant to preserve.

Then run the same checks: the Permissions toggle stays on, no prompt, and cross-origin capture survives.

## Fresh-install sanity check (second clean profile, 5 minutes)

Install only the 1.11 build and confirm the opposite case. Keep Ollama unconfigured here too, or use
`example.com` → `example.org`, for the same reason as step 6.

- The install dialog lists **no permission warning at all** (see the before/after table in
  `docs/launch/PROGRESS.md`).
- **The popup still knows which page you are on.** Open it on a normal `https://` page: it must show that
  page's hostname and path, **not** "Can't run on this page". This is the one thing in Phase 1 that cannot be
  verified automatically, and the highest-risk item: `popup.js` reads `tab.url`, which without a host
  permission comes from `activeTab` — granted because opening the popup *is* the invocation. Check it again on
  a brand-new tab after a full browser restart. If every page shows "Can't run on this page", that assumption
  is wrong and the popup needs a different signal (`popup.js:144-166`), before Phase 3 or 4 build on it.
  (On `chrome://*` pages and the Web Store, "Can't run on this page" is the **correct** answer — Chrome never
  grants `activeTab` there.)
- A capture on one page works immediately, from `activeTab` alone.
- **Decline the access prompt, then navigate cross-site.** After the navigation the **toolbar and event
  capture do not come back on the new site**, and the keyboard-shortcut path shows the "capturing this page
  only" notice explaining why. Note what does *not* stop: a **video recording keeps running**, because it
  lives in the offscreen document and never depended on page access. Do not mark this failed because the
  recording continued — that is correct behaviour.
- **Run it again and accept.** Capture now continues across the cross-site navigation, and nothing asks again.
- **Press the shortcut on a fresh page, before touching the popup.** Open a brand-new page TraceBug has never
  run on and press the capture shortcut (default `Ctrl+Shift+B` / `Cmd+Shift+B`). Record what happens — this is
  a release-checklist row, not a one-off:
  - The key must be **bound**: `chrome://extensions/shortcuts` shows a key against TraceBug's command, not a
    blank. `Ctrl+Shift+B` is Chrome's bookmarks-bar toggle *and* Firefox's bookmarks Library shortcut, so a
    collision can leave it silently unassigned. If it is blank, the shipped default needs to change
    (`Alt+Shift+B`).
  - Pressing it on that fresh page must **start a capture**. Before the manifest `commands` entry exists, the
    shortcut is only a keydown handler inside the injected SDK and does nothing here — which is exactly what
    this row is for.
  - Whatever key is actually bound, the **UI must show that key**, read from `chrome.commands.getAll()` — never
    a hardcoded string. Rebind it in `chrome://extensions/shortcuts` and confirm the popup tip, welcome page
    and toast all show the new key; clear it and confirm they show "Set a shortcut" instead.
  - One press must trigger the capture **once**, on a page where the SDK is already running as well as on a
    fresh one.
