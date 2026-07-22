# TraceBug — Architecture

System-level overview of how TraceBug is put together and how data flows through
it. For a file-by-file tour of the internals, see [`docs/architecture.md`](docs/architecture.md).
For the public API, see [`docs/api-reference.md`](docs/api-reference.md).

> **Offline-first.** Everything works with zero backend: capture, replay, and
> export all run in the browser and write only to `localStorage`. The optional
> cloud share portal and BYO-key AI features are strictly additive — nothing is
> uploaded unless the user explicitly asks.

---

## 1. Three surfaces, one core

The same core SDK (`src/`) ships in three ways:

| Surface | Entry | How it loads |
| --- | --- | --- |
| **npm SDK** (`tracebug-sdk`) | `TraceBug.init()` | App imports it; framework-agnostic, tree-shakeable (`dist/`). |
| **Chrome / Firefox extension** | `tracebug-extension/` | A content script injects the bundled IIFE (`tracebug-sdk.js`) into every page. |
| **MCP server** (`tracebug` package) | `npx tracebug mcp` | A separate ~24 KB zero-dep CLI that reads exported `.html` reports for coding agents (`cli/mcp-server.ts`). |

Heavy, optional dependencies (`html2canvas` for screenshots, `rrweb` for DOM
replay) are **lazy-imported** so the core bundle stays small and the SDK has no
mandatory peer deps.

---

## 2. Session model (idle-by-default, survives navigation)

TraceBug does **not** record automatically. On load the SDK is idle; a session
is armed only when the user acts:

- **Record** (video) or **Track session** (events-only) on the toolbar, or
- a programmatic `TraceBug.startRecording()`.

The active session id is persisted in `localStorage` (`tracebug_active_session`)
together with a **capture mode** (`tracebug_active_capture_mode` = `"events"` |
`"video"`). This is what lets an **event-only session survive a full-page
navigation**: on the next page the SDK restores the session id, keeps capturing,
and appends new events under the same id. A *video* session, whose tab-share
Chrome ends on navigation, is finalized instead and its ticket opened. See
`src/index.ts` (init/restore) and `src/storage.ts`.

Events flush to `localStorage` on a debounced schedule and durably on
`beforeunload` / `pagehide` / `visibilitychange:hidden`, so the last actions
before a navigation are never lost.

---

## 3. Data flow

```
 user action ─▶ collectors ─▶ in-memory session ─▶ localStorage (batched)
                    │                                     │
   console/network/clicks/route/rrweb DOM/video/screens   │
                                                           ▼
                                            report-builder ─▶ BugReport
                                                           │
        ┌──────────────┬───────────────┬──────────────────┼───────────────┐
        ▼              ▼               ▼                   ▼               ▼
   Export .html   Export for AI    Download .md        Export HAR      GitHub /
   (rrweb replay)   (.html, text)   (report)          (network)     Linear / Slack / Jira
```

- **Collectors** (`src/collectors.ts`, `src/environment.ts`, `src/rrweb-recorder.ts`,
  `src/video-recorder.ts`, `src/screenshot.ts`, `src/storage-capture.ts`) gather
  console lines, network requests, clicks/inputs/route changes, the DOM stream,
  optional screen video, screenshots, and a redacted Web-Storage snapshot.
- **Scanner / detectors** (`src/scanner/`) run a11y, broken-image, mixed-content,
  session-data, and frustration heuristics to surface issues and a root-cause hint.
- **Report builder** (`src/report-builder.ts`, `src/repro-generator.ts`,
  `src/title-generator.ts`) turns a session into a structured `BugReport`
  (summary, repro steps, environment, timeline, root cause).

---

## 4. The offline replay pipeline (headline feature)

Instead of shipping tens of MB of video, TraceBug records the **DOM** and replays
it. The exported `.html` reconstructs the page and re-applies every change.

```
capture:   rrweb.record()  ──▶  full DOM snapshot + incremental mutation events
                                 (inputs masked, .tb-block/.tb-mask respected,
                                  images inlined for true offline)
compress:  gzip(JSON events) ─▶ base64  (CompressionStream)   ~3–4× smaller file
export:    html-replay.ts ─────▶ single self-contained .html:
                                   • gzipped event stream (rrwebEventsGz)
                                   • inlined rrweb Replayer runtime
                                   • structured data (console/network/actions)
                                   • the viewer UI + CSS
playback:  open offline ───────▶ DecompressionStream inflates the stream,
                                  rrweb Replayer rebuilds the DOM in an <iframe>,
                                  scaled-to-fit, with a play/seek control bar.
```

Key files: `src/rrweb-recorder.ts` (capture), `src/exporters/html-replay.ts`
(payload assembly + `gzipToBase64`), `src/exporters/html-template.ts` (the
self-contained viewer + inflate/mount runtime), `src/exporters/rrweb-runtime.generated.ts`
(the inlined Replayer, regenerated by `npm run gen:rrweb` — a `prebuild` hook,
gitignored). If the Replayer or `DecompressionStream` is unavailable, the viewer
falls back to the screenshot gallery.

### Export formats

| Export | File | Best for |
| --- | --- | --- |
| **Export .html** | self-contained replay | Handing to a developer or an MCP-connected coding agent. |
| **Download .zip** | replay wrapped in `.zip` | Attaching to GitHub issues (which reject bare `.html`) — `src/exporters/zip-export.ts`, zero-dep ZIP writer. |
| **Download failing test** | `.spec.ts` | A generated Playwright spec that replays the session and asserts the captured failure is gone — `src/exporters/playwright-test.ts`. Also embedded in the `.html` payload for the MCP `get_playwright_test` tool. |
| **Export for AI (.html)** | tiny text-only report | Pasting/uploading into a chat (Claude/ChatGPT) — a few KB, no MCP needed. |
| **Download report (.md)** | markdown | Same as above, plain markdown. |
| **Export HAR** | `.har` | Opening network activity in DevTools / Charles / Postman. |
| **GitHub / Linear / Slack / Jira** | real issue/message | Filing directly via API (`src/integrations/tracker-client.ts`). |

The exported viewer itself also carries recipient-side actions (Open GitHub
issue / Copy issue markdown — precomputed at export, token-free only) and a
`Privacy` row summarizing what the sanitizers masked.

The full replay `.html` is built for a human browser and the MCP reader; the
**AI/`.md`** exports are the small, chat-safe artifacts. The `.html` replay and
AI export are triggered from the Quick Bug modal (not standalone public exports);
`buildHar` / `exportSessionAsHar` and the AI-prompt helpers *are* public API.

---

## 5. Extension internals

- **`content-script.js`** injects `tracebug-sdk.js` (the IIFE build) and re-injects
  on same-tab navigation, which is what makes cross-page event capture work.
- **`offscreen.js` / `offscreen.html`** own the screen recording in an offscreen
  document so a page reload doesn't kill an in-flight video.
- **`background.js`** tracks which tabs are active, brokers offscreen recording,
  and honors the toolbar ✕ ("turn off on this page" → stop re-injecting).
- **`popup.js` / `popup.html` / `styles.css`** are the browser-action popup.

Version is injected from `package.json` at build time (`build-ext.mjs`), so the
manifest never drifts.

---

## 6. UI layer

All in-page UI is self-contained, zero-dependency, and style-isolated (no leakage
to/from the host page). Design tokens live in `src/theme.ts` (a single
light/dark source of truth aligned to the website's shadcn palette); every widget
reads `--tb-*` variables.

- **Compact toolbar** (`src/compact-toolbar.ts`): Quick Bug · Screenshot · Region ·
  Record (video) · **Track session** (events-only) · View saved tickets · Close.
- **Quick Bug modal** (`src/ui/quick-bug.ts`): review/edit the ticket and export.
- **Recording HUD, live bug card, replay scrubber, draw/annotate tools, toasts**
  round out the surface.
- **Inspect mode** (`src/inspect-mode.ts`): hover box-model highlight + computed
  style tooltip; click attaches `StyleEvidence` (`src/style-evidence.ts`) to the
  report as an `inspect` annotation.
- **Pre-record flow** (`src/ui/pre-record.ts`): blur-first arming bar + 3-2-1
  countdown before `startVideoRecording`. Blur (`src/ui/blur-tool.ts`) is
  element-level — a CSS filter on the element itself plus `tb-mask` for the
  DOM replay, so it cannot lag behind scrolling.

---

## 7. Optional / additive subsystems

- **AI debugger** (`src/ai/llm-client.ts`): BYO-key analysis via Anthropic / OpenAI /
  Ollama. Keys stay in `localStorage`; nothing is proxied through a TraceBug server.
- **Integrations** (`src/integrations/tracker-client.ts`): create real GitHub /
  Linear / Slack / Jira issues from a report.
- **Playwright reporter** (`src/reporters/playwright.ts`): attaches a TraceBug
  `.html` to failing tests, ready for the MCP hand-off.
- **Cloud share portal** (`website/`, `src/exporters/share-link.ts`): upload a
  report and get a shareable link. Built but UI-gated off by default
  (`PHASE2-CLOUD`).

---

## 8. Privacy & security

- Data lives in `localStorage`; nothing leaves the machine unless the user
  exports, shares, or files an issue.
- rrweb inputs are masked (`maskAllInputs`); `.tb-block` / `.tb-mask` elements are
  blocked / text-masked; Web-Storage values for sensitive keys are redacted at
  capture.
- Exported `.html` escapes all session-derived strings before rendering and
  neutralizes `</script>` breakout in the embedded data block.
- No string-based script injection (CSP-safe); no crash telemetry.

---

## 9. Build & packaging

- **Bundler:** `tsup` (esbuild) → `dist/` (ESM + CJS + types) for the npm SDK; an
  IIFE build for the extension.
- **`npm run gen:rrweb`** regenerates the inlined Replayer runtime; a `prebuild`
  hook runs it before every build, so fresh clones build cleanly.
- **`npm run build:ext`** builds the SDK and packs the Chrome + Firefox extensions.
- Runtime dependencies: `html2canvas`, `axe-core`, `rrweb` (all lazy-loaded).

---

For the detailed, file-by-file internals (offscreen recording protocol, storage
batching, action-chip synthesis, fingerprinting, cache invalidation), continue to
[`docs/architecture.md`](docs/architecture.md).
