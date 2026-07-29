# Browser Compatibility & Known Limitations

Honest status per surface. ✅ supported & exercised · ⚠ works with caveats /
lightly tested · ❌ not available. "Untested" means exactly that — we won't
claim a ✅ we haven't verified.

## Compatibility matrix

| Feature | Chrome / Edge / Chromium | Firefox | Safari |
|---|---|---|---|
| SDK event capture (clicks, inputs, network, console) | ✅ | ✅ | ⚠ expected — untested |
| DOM replay recording (rrweb) | ✅ | ✅ | ⚠ untested |
| Exported `.html` viewer (open a report) | ✅ | ✅ | ⚠ needs `DecompressionStream` (Safari 16.4+); falls back to screenshots |
| Screenshots / region screenshots | ✅ | ✅ | ⚠ SDK path only |
| Screen recording (tab / desktop capture) | ✅ picker opens directly | ✅ via a "Share screen" click in the recorder window (Firefox requires the gesture there) | ❌ |
| Tab / system audio in recordings | ✅ | ⚠ not supported by Firefox — enable the **microphone** toggle for narration | ❌ |
| Sentry mode (rolling buffer, 📸 Capture) | ✅ | ✅ | ❌ |
| Save Ticket (local, offline) | ✅ | ✅ | ⚠ SDK path expected |
| HTML / HAR / zip / Playwright exports | ✅ | ✅ | ⚠ untested |
| Element-level blur (CSS filter + `tb-mask`) | ✅ | ✅ | ✅ (standard CSS) |
| Compressed exports (`CompressionStream`) | ✅ | ✅ | ✅ (16.4+); older ships uncompressed fallback |
| **Browser extension** | ✅ Chrome Web Store (Edge can sideload) | ✅ Firefox 128+ (AMO submission in progress) | ❌ not planned |
| Site access after navigation | ✅ automatic | ✅ after the one-time host-permission prompt on first capture | n/a |
| MCP server (`npx tracebug mcp`) | n/a — runs in Node 18+, any OS | n/a | n/a |

## Version support policy

- **Chrome / Edge:** latest two stable releases (the extension targets
  Manifest V3, Chrome 109+ APIs; `CompressionStream` paths need 103+).
- **Firefox:** SDK targets current ESR and later; the extension requires
  **Firefox 128+** (`strict_min_version: 128` — the SDK is injected via
  `scripting.executeScript({world: "MAIN"})`, which Firefox added in 128;
  128 is also an ESR).
- **Safari:** SDK best-effort on 16.4+ (where `CompressionStream` /
  `DecompressionStream` exist); no extension.
- **Node (CLI/MCP):** 18+ (`engines` enforced in the package).

The SDK compiles to ES2018 and feature-detects the modern APIs it uses —
older browsers degrade (uncompressed exports, screenshot gallery instead of
DOM replay) rather than break.

## Known limitations

- **Firefox differences (by platform design, not bugs):**
  - *Tab/system audio* can't be captured via `getDisplayMedia` on Firefox —
    recordings are silent unless the microphone toggle is on (the recorder
    window says so during recording).
  - *Screen recording needs one extra click*: Firefox requires a user gesture
    in the recorder window, so a small "Share screen" popup appears before
    the native picker (Chrome's picker opens directly).
  - *Site access is a one-time prompt*: Firefox treats host permissions as
    opt-in, so the first capture asks for site access; declining limits
    TraceBug to the current page view until re-invoked (navigation loses it).
- **Canvas/WebGL-heavy apps lose replay fidelity** — rrweb records DOM, and
  `recordCanvas` is off for size. Use video recording for those apps.
- **Very large reports:** sessions with embedded video reach tens of MB.
  GitHub issue attachments cap at 25 MB — prefer DOM replay (the default),
  or the `.zip` export.
- **Background tabs** are throttled by browsers; timers and rrweb activity
  in a backgrounded tab may be coarser. Recording a tab you're actively
  using is the supported path.
- **Redaction is pattern-based.** Token *shapes* and declared `redact`
  fields are masked; free-form PII the patterns can't know about, and
  anything visible in screenshots/video, is not auto-detected — use
  element-level blur before/while recording. (See
  [bug-reporting.md → Privacy](bug-reporting.md).)
- **Strict-CSP host pages** can block inline viewer pieces in unusual
  setups; the extension ships a CSP-proof player for recordings, but exotic
  page CSPs may still affect in-page UI.
- **The `redact`/blur pipeline protects captured data**, not your app's own
  network traffic — TraceBug observes; it doesn't proxy.
