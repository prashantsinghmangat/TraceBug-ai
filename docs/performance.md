# Performance

Measured numbers, not aspirations. Every figure below comes from the
reproducible benchmark script in the repo — re-run it yourself:

```bash
node e2e/benchmark.mjs
```

## Measured (2026-07-22)

Environment: headless Chromium (Playwright-bundled), Windows 11, Node 24.
Bench page: static HTML with 40 content sections; 300 synthetic click
interactions + 30 console warnings + 10 failed fetches per session.
Load/init figures are the median of 5 cold page loads.

| Metric | Measured |
|---|---|
| SDK bundle (IIFE, on disk — extension build) | 3.19 MB |
| Script load + eval | 18 ms |
| `TraceBug.init()` | 8.2 ms |
| Capture overhead per interaction | ~5 µs |
| 300 clicks with recording on | 11 ms (9 ms baseline with capture paused) |
| JS heap delta after a 200-event session | 0.5 MB |
| `buildReport()` | 5 ms |
| Export `.html` build | 7 ms |
| Export `.html` size (events-only session) | 130 KB |
| `.zip` wrap of the export | 8 ms → 28 KB |

## How to read these numbers

- **Recording overhead is noise-level.** The 300-click loop cost 2 ms more
  with capture on than off — ~5 µs per interaction. Event capture is
  passive listeners plus batched `localStorage` writes; it does not sit on
  the render path.
- **The 3.19 MB IIFE is the extension/script-tag build**, which inlines the
  rrweb replayer runtime and every lazy surface so it works with zero
  network requests. The **npm ESM build is code-split**: the core entry is
  ~65 KB with the heavy pieces (rrweb runtime ~262 KB, UI panels) loaded
  lazily only when used — a bundler app never pays the 3 MB.
- **Export size scales with what you captured.** The 130 KB figure is an
  events-only session. Real sessions grow with screenshots (~50–300 KB
  each), the rrweb DOM-replay stream (gzipped 8–12× at export via
  `CompressionStream` — a measured 2.96 MB stream shipped as 0.87 MB), and
  optional video (`.webm`, the dominant cost when included — tens of MB;
  DOM replay is the default precisely to avoid it).
- **Memory** is bounded by design: `maxEvents` (default 200) caps the
  per-session event buffer, non-error console capture is capped at 50
  entries per level, network failure snippets at 200 chars, and sessions
  are pruned at `maxSessions` (default 50).

## Extension startup

The extension injects the same IIFE bundle on user action (nothing runs
before you click), so extension startup cost = script eval + init from the
table above: **~26 ms** from click-to-capture-ready on the bench machine
(18 ms eval + 8.2 ms init). The popup itself is static HTML and opens
instantly.

## Website (Lighthouse)

`npx lighthouse https://tracebug.dev --preset=desktop`, measured 2026-07-22:

| Category | Score |
|---|---|
| Performance | 94 |
| Accessibility | 92 |
| Best Practices | 100 |
| SEO | 100 |

## Caveats

- Headless Chromium on a dev machine — absolute numbers vary with hardware;
  the *ratios* (overhead vs baseline) are the meaningful part.
- Synthetic clicks don't render app UI updates, so per-interaction overhead
  isolates TraceBug's cost, not your app's.
- Screen-recording (`getDisplayMedia`) cost is browser-managed encoding and
  is not measured here; the DOM-replay default exists so most sessions
  never pay it.
