# Browser Compatibility & Known Limitations

Honest status per surface. ✅ supported & exercised · ⚠ works with caveats /
lightly tested · ❌ not available. "Untested" means exactly that — we won't
claim a ✅ we haven't verified.

## Compatibility matrix

| Feature | Chrome / Edge / Chromium | Firefox | Safari |
|---|---|---|---|
| SDK event capture (clicks, inputs, network, console) | ✅ | ✅ expected — untested in CI | ⚠ expected — untested |
| DOM replay recording (rrweb) | ✅ | ⚠ expected to work — untested | ⚠ untested |
| Exported `.html` viewer (open a report) | ✅ | ✅ | ⚠ needs `DecompressionStream` (Safari 16.4+); falls back to screenshots |
| Screenshots (html2canvas / captureVisibleTab) | ✅ | ⚠ SDK path only | ⚠ SDK path only |
| Screen recording (tab / desktop capture) | ✅ | ❌ extension recording (offscreen API is Chrome-only) | ❌ |
| Element-level blur (CSS filter + `tb-mask`) | ✅ | ✅ | ✅ (standard CSS) |
| Compressed exports (`CompressionStream`) | ✅ | ✅ (115+) | ✅ (16.4+); older ships uncompressed fallback |
| **Browser extension** | ✅ Chrome Web Store (Edge can sideload) | ⚠ port paused after Phase 2 — builds exist (`dist/firefox`), recording parity unfinished | ❌ not planned |
| MCP server (`npx tracebug mcp`) | n/a — runs in Node 18+, any OS | n/a | n/a |

## Version support policy

- **Chrome / Edge:** latest two stable releases (the extension targets
  Manifest V3, Chrome 109+ APIs; `CompressionStream` paths need 103+).
- **Firefox:** SDK targets current ESR and later; the extension build
  declares `strict_min_version: 115`.
- **Safari:** SDK best-effort on 16.4+ (where `CompressionStream` /
  `DecompressionStream` exist); no extension.
- **Node (CLI/MCP):** 18+ (`engines` enforced in the package).

The SDK compiles to ES2018 and feature-detects the modern APIs it uses —
older browsers degrade (uncompressed exports, screenshot gallery instead of
DOM replay) rather than break.

## Known limitations

- **Extension is Chrome-only today.** The Firefox port is paused with
  Phase 2 complete (shared codebase + Firefox manifest build exist); the
  remaining work is recording parity without Chrome's offscreen API.
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
