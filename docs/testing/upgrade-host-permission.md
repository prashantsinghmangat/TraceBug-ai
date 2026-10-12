# Manual test: an already-granted `<all_urls>` survives the 1.11 upgrade

**Why this test exists.** 1.11 moves `<all_urls>` from `host_permissions` (required, granted at install) to
`optional_host_permissions` (granted on request). Chrome and Firefox are both documented to *keep* a grant when
a pattern moves between those two keys, which would mean existing users notice nothing. But "documented" is not
"verified", and the failure mode is bad and silent: capture would stop at the first cross-origin navigation and
the user would never be told why. Run this before submitting to either store.

Takes about 10 minutes. Run it once on Chrome and once on Firefox.

## What you need

- The **previous store build** (1.10.1) — `git worktree add D:/tmp/tb-1101 v1.10.1` gives you one with
  `tracebug-sdk.js` already committed, so no build step is needed.
- The **1.11 build**: `npm run build:ext` → `tracebug-extension/dist/chrome` and `.../dist/firefox`.
- Two origins you can navigate between. `http://localhost:5173` → `http://127.0.0.1:5173` is enough: different
  hosts, so crossing between them needs real site access and not `activeTab`.

## Chrome

1. **Fresh profile.** Launch Chrome with `--user-data-dir=D:/tmp/tb-upgrade-profile` so nothing is inherited.
2. **Install 1.10.1.** `chrome://extensions` → Developer mode → Load unpacked → `D:/tmp/tb-1101/tracebug-extension`.
   On the extension's details page, confirm **Site access = On all sites**. That is the pre-existing grant this
   test is about. Do not change it.
3. **Prove it works on 1.10.1.** Open `http://localhost:5173`, click the TraceBug icon, start a capture, then
   navigate to `http://127.0.0.1:5173`. The floating toolbar must still be there after the load — that is
   re-injection using the host permission.
4. **Upgrade in place.** Back on `chrome://extensions`, **Remove nothing.** Click the 1.10.1 card's **Load
   unpacked** replacement path instead: point Load unpacked at `tracebug-extension/dist/chrome`. Loading a
   different directory creates a second extension with a different id, which would NOT be an upgrade — so
   either:
   - **Preferred:** pack both builds with the *same* key. Copy the `key` field from the 1.10.1 build's
     `manifest.json` into the 1.11 build's `manifest.json` (or generate one with `chrome://extensions` →
     Pack extension and reuse the resulting `.pem` for both), so the two loads share an id and the second is a
     real update. Then press **Update** on `chrome://extensions`.
   - **Acceptable fallback:** install both from a locally-hosted `.crx` signed with the same `.pem`.
   An upgrade test done across two different ids proves nothing — it is a fresh install wearing a costume.
5. **Check the permission survived, without touching anything.** On the details page, **Site access must still
   read "On all sites"** and there must have been **no prompt**. Then open the service-worker console
   (`chrome://extensions` → TraceBug → *service worker*) and run:
   ```js
   chrome.permissions.contains({ origins: ["<all_urls>"] }).then(console.log)   // expect: true
   chrome.permissions.getAll().then(p => console.log(p.origins))                 // expect: includes "<all_urls>"
   ```
6. **Prove cross-origin capture still works, with no re-prompt.** Repeat step 3 on the 1.11 build. The toolbar
   must survive the `localhost` → `127.0.0.1` navigation, and **no permission dialog may appear at any point.**
7. **Check the page-side signal agrees.** On the test page console:
   ```js
   JSON.parse(document.documentElement.getAttribute("data-tb-caps")).hostAccess   // expect: true
   ```
   This is what suppresses the "capturing this page only" hint. If it says `false` while step 5 said `true`, the
   `TB_HOST_ACCESS` round trip is broken, not the permission.

**PASS** = steps 5, 6 and 7 all hold with no prompt shown.
**FAIL** = any re-prompt, `contains` returning `false`, or the toolbar vanishing after the cross-origin load.
A FAIL blocks the release: it means every existing user silently loses navigation-surviving capture.

## Firefox

Same shape, with two differences:

1. Firefox has always treated manifest `host_permissions` as **opt-in**, so a 1.10.1 Firefox user may or may not
   have granted `<all_urls>` already. Grant it first (`about:addons` → TraceBug → Permissions → *Access your
   data for all websites* → on), so there is a grant to preserve.
2. `about:debugging` → This Firefox → Load Temporary Add-on is **not** an upgrade path — a temporary add-on's
   grants do not persist. Use two signed builds with the same `browser_specific_settings.gecko.id` (the id is
   already fixed in the manifest), installed from file.

Then run the same checks: the Permissions toggle stays on, no prompt, and cross-origin capture survives.

## Fresh-install sanity check (same session, 2 minutes)

In a *second* clean profile, install only the 1.11 build and confirm the opposite case:

- The install dialog lists **no site-access warning** (see the before/after table in
  `docs/launch/PROGRESS.md`).
- **The popup still knows which page you are on.** Open it on a normal `https://` page: it must show that
  page's hostname and path, **not** "Can't run on this page". This is the one thing in Phase 1 that cannot be
  verified automatically, and the highest-risk item: `popup.js` reads `tab.url`, which without a host
  permission comes from `activeTab` — granted because opening the popup *is* the invocation. If every page
  shows "Can't run on this page", that assumption is wrong and the popup needs a different signal
  (`popup.js:144-166`).
- A capture on one page works immediately, from `activeTab` alone.
- Navigating cross-origin **ends** the capture, and the keyboard-shortcut path shows the "capturing this page
  only" notice naming where to allow site access.
- Clicking a popup action shows the site-access request, and choosing **Allow** makes cross-origin capture work
  from then on without asking again.
