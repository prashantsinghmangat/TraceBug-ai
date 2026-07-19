# Changelog

All notable changes to TraceBug are documented here.

## [1.7.0] - 2026-07-17

> The launch-polish release. A full **Slate Indigo rebrand** across every surface (widget, exports, extension, website — with "Trace", the pixel-sprite mascot), the exported replay slims down ~3–4× via gzip, issue-tracker exports file **real** GitHub/Linear/Slack items with your own token, and the website gains a live sandbox running the actual SDK plus a 15-second real-capture demo video. Zero lint warnings, dead code removed, adoption friction audited and fixed.

### Added

- **Slate Indigo brand + "Trace" the pixel mascot** (`src/theme.ts`, `website/`, `tracebug-extension/`) — one palette across all five token surfaces (widget, replay export, AI export, extension popup, website): slate-tinted near-black neutrals, a single refined indigo accent (`#6366F1`), green reserved strictly for success. New 8-bit mascot appears in the website flow diagram, 404, footer, hero headline (as the blinking caret), and the extension's "can't run here" state — crisp at every size because it *is* pixels. All icons (favicon, extension, apple-touch) regenerated.
- **Live sandbox — the real widget on the website** (`website/public/try.html`) — a checkout page with two intentional bugs (a TypeError and a failing `POST`) running the actual IIFE SDK bundle. Visitors trigger a bug, capture it with the real toolbar, and export a genuine self-contained report. Linked from the demo section; the extension opens it as the first-install welcome tab.
- **Real demo video** (`website/public/tracebug-demo.webm`) — a 15-second captioned screen recording of TraceBug catching a live crash on the sandbox (recorded by scripting the real product with Playwright, so re-cuts are a script run). Embedded in the website demo section with lazy mount, reduced-motion handling, and a poster fallback; replaces the scripted walkthrough iframe and the stale README GIF.
- **MCP tool picker on the hand-off card** (`src/ui/quick-bug.ts`) — the post-export card now shows the one-time setup command for **Claude Code / Cursor / VS Code** with per-tool copy, instead of assuming Claude Code.
- **First-install welcome** (`tracebug-extension/background.js`) — installing the extension opens the live sandbox with a tailored "try your first capture" banner instead of nothing.
- **`npm run zip:ext`** — reproducible Chrome Web Store upload zip, versioned from `package.json` into `releases/`.
- **Website: flow diagram, changelog page, and motion polish** — a Userback-style "everything connects" section with measured SVG beams; a `/changelog` page rendered from this file at build time; a self-assembling hero report card (events stream in, skeletons hand off to the root-cause box); cursor-spotlight cards; OS-level dark-mode auto-detect; a DevTools console easter egg.
- **html2canvas fallback for script-tag consumers** (`src/screenshot.ts`) — when the lazy `import("html2canvas")` can't resolve (no bundler — e.g. the IIFE bundle on a plain page), the SDK now picks up a page-provided `window.html2canvas` UMD global, so screenshots work outside bundled apps and the extension.
- **Real issue-tracker integrations (BYO-token)** (`src/integrations/tracker-client.ts`) — the GitHub / Linear / Slack export buttons now create a **real** issue/message via the provider's API using the user's own token, instead of only prefilling a URL or copying markdown. The call goes **directly from the browser to the provider** — token in `localStorage`, no OAuth, no TraceBug backend — the same privacy pattern as the BYO-key AI Debugger. GitHub uses a PAT (`POST /repos/{owner}/{repo}/issues`), which also **lifts the ~6–8 KB URL-prefill truncation cap** (the full report body travels in the request body); Linear uses a personal API key (GraphQL `issueCreate`, returns the issue URL + identifier); Slack uses an incoming webhook (fire-and-forget). A **🔗 Configure integrations** modal (More menu) stores per-provider tokens; when a provider is configured its export button files for real, otherwise it falls back to the existing URL/copy flow. Jira Cloud is intentionally excluded (CORS-blocked for browser XHR) and stays copy-markup. New SDK exports: `createTrackerIssue`, `createGitHubIssue`, `createLinearIssue`, `sendSlackMessage`, `getIntegrationsConfig`/`setIntegrationsConfig`/`clearIntegrationsConfig`, `hasIntegration`. (`src/ui/quick-bug.ts`, `tests/tracker-client.test.ts` — 11 tests)
- **Self-contained DOM replay export (rrweb)** (`src/rrweb-recorder.ts`, `src/exporters/html-replay.ts`, `src/exporters/html-template.ts`) — **Export .html** now embeds an interactive **DOM replay** instead of the multi-MB base64 video. rrweb records a full DOM snapshot plus incremental mutation events (KB, not MB); the exported `.html` inlines rrweb's Replayer runtime and reconstructs the page in a sandboxed `<iframe>`, scaled-to-fit, with a play/seek control bar and click-to-seek from the Console/Network/Events rows. Inputs are masked and `.tb-block`/`.tb-mask` respected; `inlineImages` embeds images so the replay is genuinely offline (no requests back to the original site). The Replayer runtime is regenerated by `npm run gen:rrweb` (a `prebuild` hook, gitignored). Falls back to the screenshot gallery if the Replayer or `DecompressionStream` is unavailable.
- **Compressed replay stream** (`gzipToBase64` in `html-replay.ts`; `inflateRrweb` in `html-template.ts`) — the rrweb event stream is gzip-compressed via the browser-native `CompressionStream` and base64-embedded (`rrwebEventsGz`), then inflated at load with `DecompressionStream`. Repetitive DOM JSON compresses ~8–12×, cutting a typical replay file ~3–4× (measured 2.96 MB → 0.87 MB) with a byte-exact round-trip. No bundled compression library. The **Export .html** button's size estimate reflects the compressed size.
- **Export for AI (.html)** (More menu; `generateAiHtml`/`exportReportAsAiHtml` in `src/exporters/ai-prompt.ts`) — a tiny (~5 KB) **text-only** HTML report for users who want to paste/upload a report into a chat (Claude/ChatGPT) without MCP. Renders the same capped/deduped structured content as the `.md` export — no rrweb runtime, no DOM blob, no base64 media — so it fits well under a chat's context limit. HTML-escaped throughout.

### Changed

- **`npx tracebug init` is now honest and actually useful** (`cli/bin.ts`) — it no longer claims to "set up" the project or print "Done! ready" when it only echoes a snippet. It now states plainly that it prints (doesn't install/edit), and — the real value — **leads with the framework gotcha** developers actually trip on: the Next.js App-Router `"use client"` + `useEffect` requirement, Nuxt's `.client.ts` SSR rule, and Svelte's `onMount`. All snippets now include the dev-only `enabled: "auto"` flag with an explainer. Website "CLI setup" tab updated to match.
- **shadcn (new-york) UI re-skin** — the injected widget (`src/theme.ts`), the exported replay viewer (`src/exporters/html-template.ts`), the AI export (`src/exporters/ai-prompt.ts`), and the extension popup (`tracebug-extension/styles.css`) all now share the website's brand palette (now the Slate Indigo palette — indigo-500 primary, slate near-black dark, hairline borders, 10/12/16 radii). Buttons match new-york variants (glow primary, `active` press, `focus-visible` rings via `--tb-ring`); the Quick Bug modal is a `rounded-2xl` card. Hardcoded off-palette colors in the draw/annotate tools were tokenized.
- **`prebuild` hook regenerates the rrweb runtime** — `src/exporters/rrweb-runtime.generated.ts` is gitignored and rebuilt by a `prebuild` step wired into all `build*` scripts, so a fresh clone builds cleanly.
- **Zero lint warnings** — cleared all 177 (`no-explicit-any` ×116, `no-unused-vars` ×61) with real types, not suppressions: proper axe-core/DOM/Web-Speech typings, small interfaces for provider API responses, `unknown` + narrowing for genuinely dynamic values. No `eslint-disable`, no `as any`. `DrawRegion` now officially includes the pen shape it always stored.
- **Dead code removed** — the cut v1 onboarding tour machinery (the surviving logo pulse now actually injects its keyframe — it silently never animated before), six dead toolbar functions and write-only state, orphaned website components, stale release zip, and the pre-rebrand `docs/demo.gif`.
- **Adoption audit fixes** — `npx tracebug` help pointed at a dead domain; the README's Chrome Web Store badge was a broken URL; docs led with `--dir` while the homepage taught the zero-config MCP form; the popup now surfaces the `Ctrl+Shift+B` shortcut and explains the mic toggle; `example-app/` gained a README; the website sandbox SDK copy is auto-synced by every build.

### Fixed

- **The exported replay no longer shows TraceBug's own UI** (`src/rrweb-recorder.ts`) — rrweb was recording the injected widget (`#tracebug-root`, the compact toolbar) and the blank draw canvas into the DOM stream, so they rendered on top of the user's page in the exported `.html` replay (an empty box + the floating toolbar). A `blockSelector` now excludes TraceBug's own overlay UI from the capture while keeping the draw **SVG** overlay, so the replay shows only the user's page + the annotations.
- **Pen drawing is smooth, not laggy** (`src/draw-mode.ts`) — freehand strokes re-stroked the *entire* growing path on every pointer move (O(n²), so it got laggier the longer you drew) and were raw polylines. Now each move draws only the newest segment (O(1)) and all strokes are quadratic-smoothed (canvas, the committed render, and the SVG replay path).
- **Pen/draw annotations now appear in the exported replay** (`src/draw-mode.ts`) — during a recording, freehand pen strokes and shapes are drawn on a `<canvas>`, which rrweb's DOM replay can't capture (`recordCanvas` is off), so they showed in the modal's video preview but vanished from the exported `.html` DOM replay. Each committed shape is now **mirrored as an SVG element** in the page DOM with the same appear→fade lifecycle, so rrweb records it as ordinary DOM mutations and the annotations replay at the exact moment they were drawn — no file-size cost, no `recordCanvas`.
- **Event capture no longer stops on full-page navigation** (`src/index.ts`, `src/storage.ts`, `src/compact-toolbar.ts`) — the **Track session** (events-only) capture now survives clicking a link to another page. A persisted **capture mode** (`tracebug_active_capture_mode`) lets the SDK resume an event-only session on the next page (keeping one session id across the whole flow) while still finalizing a *video* session whose tab-share Chrome ended. Also: durable flush on `pagehide`/`visibilitychange:hidden` (bfcache-safe), no duplicate `session:start` per navigation, and the toolbar's tracking state is restored after the load.
- **MCP server finds reports with zero setup** (`cli/mcp-server.ts`, `cli/bin.ts`) — `get_bug_report` (and the other `get_*` tools) now resolve a report by bare filename or fragment from the user's **Downloads/Desktop** folders — where browser exports land — in addition to `--dir`. Previously the copy-pasted hand-off prompt failed unless the server was pointed at the download folder. Shared folders are shallow-scanned and name-prefiltered (`tracebug-*`) to stay fast. `list_bug_reports` widens to those folders only when the server started **without** an explicit `--dir` (an explicit `--dir` stays scoped to that folder). The generated hand-off prompt (`generateMcpPrompt`) drops the `--dir` requirement. (`src/exporters/ai-prompt.ts`, `tests/mcp-server.test.ts`)

## [1.6.0] - 2026-07-09

> The agent-workflow release. Three ways to get a bug in front of an AI — and none of them phone home: **failed Playwright tests** become the same agent-ready `.html` reports (upload as a CI artifact), **BYO-key LLM analysis** runs browser-direct against Anthropic/OpenAI/Ollama with your key never leaving the page, and **HAR export** hands you your network capture as a standard file you own. Built on the v1.5 local MCP foundation.

### Added

- **HAR export** (`src/exporters/har-export.ts`) — a new **🌐 Export HAR** button in the Quick Bug modal writes the captured network activity as a standard HAR 1.2 (HTTP Archive) file that opens in Chrome/Firefox DevTools, Charles, Fiddler, and Postman. Reshapes the request/response data TraceBug already captures (method, url, status, timing, query string parsed into name/value pairs, failed-response bodies with a guessed mime type) into the spec — no new capture, no dependency. Spec-optional fields we don't capture (headers, cookies) are emitted as empty arrays / `-1` sentinels per the HAR schema, so the output validates. New SDK exports `buildHar` (pure) and `exportSessionAsHar` (build + download). Jam markets "everything a HAR offers" but ships no HAR export — this owns that axis. Docs: `docs/har-export.md`. (`src/ui/quick-bug.ts`, `tests/har-export.test.ts` — 8 tests)
- **AI Debugger — BYO-key LLM analysis** (`src/ai/llm-client.ts`) — the AI tab can now run real LLM root-cause analysis using the user's own API key (Anthropic / OpenAI / local Ollama). The call goes **directly from the browser to the provider** — no TraceBug backend — and the key is stored only in `localStorage`. The prompt (the same structured one the "copy prompt" flow builds) is scrubbed of secret token shapes via the existing sanitizer before it leaves the page; screenshots/video are never sent. The model returns markdown (Root cause / Evidence / Where to look / Suggested fix / Edge cases), rendered inline. Replaces the "coming soon" stub with a real provider+key+model config modal (migrates the legacy `tracebug_ai_key` bare-key storage). New SDK exports: `runLLMAnalysis`, `buildAnalysisPrompt`, `getAIConfig`/`setAIConfig`/`clearAIConfig`/`hasAIKey`, `DEFAULT_MODELS`, `ANTHROPIC_MODEL_CHOICES`, `PROVIDER_LABELS`. Completes the "private AI debugging" story (local heuristic + local MCP + BYO-key LLM). Docs: `docs/ai-debugger.md`. (`src/ui/quick-bug.ts`, `tests/llm-client.test.ts` — 11 tests)
- **Playwright reporter** (`tracebug-sdk/playwright`) — every failed test writes a self-contained TraceBug `.html` report to `outputDir` (default `bug-reports/`): assertion error + Playwright code snippet, `test.step()`/`pw:api` timeline as repro steps and timeline events, failure screenshots from attachments, project metadata, and a local root-cause hint (5xx → high, 4xx/page error → medium, assertion-only → low). Optional `traceBugPage` fixture adds page console, uncaught errors, network requests with failed-response bodies, and navigations (attached only on failure, 500-entry caps). Reports are written only for the final retry; the reporter can never fail the run; output is verified readable by the MCP server (fuzzy title lookup + investigation guide). Zero runtime deps — the module imports nothing from `@playwright/test` (structural types), so it builds and tests without Playwright installed. New `./playwright` subpath export, Node-side tsup entry, and `tsconfig.node.json` for typechecking Node code (`cli/`, `src/reporters/`). Docs: `docs/playwright.md`. (`src/reporters/playwright.ts`, `tests/playwright-reporter.test.ts` — 5 tests)

## [1.5.0] - 2026-07-08

> The MCP release: TraceBug exports become agent-ready. `npx -y tracebug mcp` gives Claude Code / Cursor / VS Code read access to every exported bug report — fully local, zero network connections.

### Added

- **Standalone `tracebug` npm package** — new ~24 KB, zero-dependency CLI package (`packages/tracebug`) publishing just `bin.mjs` (MCP server + `init`), so a developer who only *receives* bug reports runs `npx -y tracebug mcp` without pulling the full SDK. `tracebug-sdk` still bundles the same CLI; `npm run build:cli` generates the package's bin from `dist/bin.mjs`. (`packages/tracebug/`, `cli/bin.ts` version lookup now supports both layouts)
- **MCP server** — `npx -y tracebug mcp [--dir <path>]` starts a local [Model Context Protocol](https://modelcontextprotocol.io) server so AI coding agents (Claude Code, Cursor, Windsurf, VS Code) can read exported bug reports and debug from them. Six tools: `list_bug_reports`, `get_bug_report`, `get_console_errors`, `get_network_activity`, `get_repro_steps`, `get_screenshot` (returns real image content). Reads the self-contained `.html` exports directly (the embedded `tb-data` payload) — fully local, stdio-only, zero network connections, zero new dependencies (the JSON-RPC loop is hand-rolled). Includes a demo report (`demo-bug-reports/sample-report.html`) and a pre-configured `.mcp.json` so a fresh clone works with Claude Code out of the box. Docs: `docs/mcp.md`. (`cli/mcp-server.ts`, `cli/bin.ts`, `tests/mcp-server.test.ts`)
- **Investigation guide** — `get_bug_report` now returns a prioritized "what to fetch next" list computed from what the report actually contains (e.g. `[HIGH] get_network_activity — 2 failed requests captured…`), so agents spend their tool calls on the data that matters for that specific bug. Network leads when the root-cause hint blames a request; console leads otherwise; screenshots are promoted to a primary source when no errors were captured. (`cli/mcp-server.ts`)
- **Forgiving report resolution** — every MCP tool's `file` argument now accepts a path, a bare filename found anywhere under the scan dir, or a case-insensitive fragment of the filename or report title; unresolvable names error with the list of available reports. (`cli/mcp-server.ts`)
- **`debug_bug_report` MCP prompt** — the server now advertises the `prompts` capability with one prompt (optional `file` argument): the standard hand-off ("load the report, follow its investigation guide, cross-reference the codebase, propose a fix"). In Claude Code: `/tracebug:debug_bug_report`. (`cli/mcp-server.ts`)
- **Agent hand-off prompt in the extension** — after every **Export .html**, the Quick Bug modal shows the paste-into-Claude-Code/Cursor prompt for that export (auto-copied to the clipboard) with a link to the MCP setup guide. New `generateMcpPrompt()` exported from the SDK. (`src/ui/quick-bug.ts`, `src/exporters/ai-prompt.ts`)
- **Agent hand-off prompt in the export itself** — the exported `.html` viewer's AI tab now carries a "Debug with a coding agent (MCP)" card with the same prompt and a copy button, so whoever receives the file learns how to feed it to their agent. The filename is recovered from the `file://` URL at view time, so the prompt survives renames. The shipped demo report (`demo-bug-reports/sample-report.html`) was regenerated as a full viewer export, so it demos both the interactive replay and the agent card. (`src/exporters/html-template.ts`)
- **Website: /docs/mcp page** — `docs/mcp.md` is now on the website as a full docs page (workflow, hand-off prompt, Claude Code/Cursor/VS Code setup, tools reference, privacy, troubleshooting), linked from the docs TOC, a promo card on `/docs`, the footer Resources column, and the sitemap. (`website/app/docs/mcp/page.tsx`)

## [1.4.0] - 2026-07-06

> The hardening pass that made Phase 1 (fully offline) production-ready.

### Production hardening & bug-fix pass (July 2026)

#### Security

- **Removed committed Supabase credentials**: `website/.env.local` untracked from git; `.gitignore` now covers `.env.local` / `.env.*.local`. Keys must be rotated (they remain in git history).
- **`cloudEndpoint` validation** — new `src/cloud-endpoint.ts` with `resolveCloudEndpoint()`: HTTPS enforced (plain HTTP only for localhost), `javascript:`/`data:`/malformed URLs rejected with fallback to the production endpoint. Applied in the auth bridge constructor, all SDK call sites, share-link exporter, and the Quick Bug modal. Unit-tested.
- Chrome extension manifest: explicit `content_security_policy` for extension pages.

#### Fixed

- **Stale video bundled into unrelated exports / fresh video missing from the modal.** The global last-recording had no session binding and the ownership check existed only in the modal. New shared `getSessionVideo()` gate in `report-builder.ts` (recording must start after the session was created, 10 s transport grace) used by both `buildReport()` and the modal; the toolbar record flow now arms the session *before* capture starts; historical tickets strip the video explicitly. (`src/report-builder.ts`, `src/compact-toolbar.ts`, `src/ui/quick-bug.ts`)
- **Modal video played only a few seconds of long recordings.** Chrome MediaRecorder WebM lacks a duration header; the player now forces Chrome to compute the real duration (seek-past-end workaround) when the reported duration is Infinity/short. (`src/ui/quick-bug.ts`)
- **`iframe-bridge.ready()` could hang forever and leak a message listener** when the bridge iframe never loaded — added a 20 s timeout that unmounts, cleans up, and allows retry. (`src/auth/iframe-bridge.ts`)
- **`deleteSession()` silently dropped up to 1 s of pending events** from surviving sessions — pending flush now runs before the read. (`src/storage.ts`)
- **`Uncaught (in promise) Error: No tab with id`** spam from the extension service worker — badge API promises are now awaited inside the try/catch. (`tracebug-extension/background.js`)
- Clipboard copy failures now show "✗ Copy failed" instead of failing silently (`src/dashboard.ts`); "Fix with AI" button no longer renders white-on-white on hover in light theme; six ESLint errors fixed (emoji regex `u` flags, stray expression, extra semicolon); `pushScreenshot()` side-path now respects the 50-screenshot memory cap.

#### Changed

- **Exports now carry the user's edited title and description**; the description renders below the Replay (matching the ticket modal) instead of hiding in a tab. Notes and Description tabs removed from the export viewer (tabs: Info / Console / Network / Actions / AI / Events).
- **Tester-assigned priority is surfaced everywhere**: 🚩 priority chip in the export header next to the auto-severity badge; priority flows user → session → report → all exports.
- **Cookies captured** (non-HttpOnly only) alongside localStorage/sessionStorage with the same redaction rules; shown in the modal Info tab and export, scrubbed again by the cloud sanitizer.
- Info tab cleanup: TraceBug's own `tracebug_*` storage keys filtered at capture, empty env rows dropped, per-row storage icons removed, explicit "Web storage — empty on this page" state.
- Ticket modal: description editor open by default; Notes tab renders only when the session has annotations.
- CI now runs ESLint and the test suite on every push/PR; `package.json` declares `engines: node >=18`.

### Cloud sharing portal (Phase 6)

The local `.html` export still works exactly as before — this is an **optional** sharing layer on top of it. Local-first stays the product's spine.

#### Added

- **`TraceBug.shareReport()`** — uploads the bug report to TraceBug's cloud and returns a public URL like `https://tracebug.dev/share/<id>`. Recipient opens it in a browser without installing anything. (`src/exporters/share-link.ts`)
- **Sign-in via Supabase magic link** — `TraceBug.signIn()` / `TraceBug.signOut()` / `TraceBug.getCurrentUser()`. Auth happens in a hidden iframe pointed at `tracebug.dev/sdk-bridge`, so the customer's site never sees the auth token. (`src/auth/iframe-bridge.ts`, `website/app/sdk-bridge/page.tsx`)
- **🔗 Share link button** in the Bug Ticket modal next to "📦 Export .html". Shows inline spinner during upload; opens the public viewer in a new tab on success. (`src/ui/quick-bug.ts`)
- **Per-user quotas**: 5 active video shares + 10 active screenshot shares, max 5 screenshots per share, 50 MB upload cap. Enforced both client- and server-side. (`website/lib/quotas.ts`)
- **Screenshot trim picker** — when a report has more than 5 screenshots, a modal lets the user choose which 5 to upload (numbered selection, max-cap, grid view). Cancel preserves local report unchanged. (`src/ui/screenshot-trim-modal.ts`)
- **2-min video duration cap for cloud uploads** with warnings at 1:30 and 1:55, auto-stop at 2:00. Local recording stays uncapped if `shareReport()` is never called. (`src/video-recorder.ts`)
- **Pre-upload sanitization** — strips `Authorization` headers, password fields, and common token shapes (JWT, OpenAI `sk-`, Stripe, GitHub PAT, AWS keys, Slack tokens, Google API keys) from network logs, console output, and URLs before anything leaves the browser. Local download path keeps the unsanitized original. (`src/sanitize/cloud-upload.ts`)
- **Dashboard at `/dashboard`** — Jam.dev-style sidebar + grid layout with quota bars, real thumbnail previews (320×180 JPEG generated from the first screenshot or video frame at upload time), Copy / Extend +14d / Delete actions, video / screenshot filters, search. (`website/app/dashboard/*`)
- **Public viewer at `/share/[token]`** — no login required. Server fetches via service-role client with 5-min signed download URLs; renders report in sandboxed `<iframe srcdoc>`. OG tags so links unfurl in Slack/Teams. (`website/app/share/[token]/page.tsx`)
- **14-day default retention**, user-extendable +14d per click. Nightly `pg_cron` soft-deletes expired rows; hourly Netlify cron purges Storage objects. (`website/supabase/migrations/0001_initial.sql`, `website/app/api/cron/purge-expired/route.ts`)
- **Chrome extension popup gets a cloud account block** — shows signed-in email + quota (`🎥 X/5 · 📸 Y/10`), Sign-in button when out, dashboard link, sign-out. Reads endpoint from `chrome.storage.local.tracebug_cloud_endpoint` (default: production). (`tracebug-extension/popup.{html,js}`)
- **CORS middleware** echoes `Access-Control-Allow-Origin` for `chrome-extension://` and `moz-extension://` origins on `/api/*`. (`website/middleware.ts`)
- **`docs/SHARE-PORTAL-PLAN.md`** — the full design spec for the cloud sharing portal (architecture, quotas, RLS, files-changed, deployment, security checklist).
- **`docs/PROJECT-CONTEXT.md`** — single-doc orientation for agents/contributors picking up the project cold.

#### Database

- New table `public.sessions` with RLS policies (`sessions_select_own` / `_insert_own` / `_update_own` / `_delete_own`).
- New Storage RLS on `storage.objects` for the `reports` bucket — users can only PUT/GET/DELETE under their own `<user_id>/` folder.
- New `pg_cron` job `tracebug-expire-shares` runs daily at 03:00 UTC.

#### Internal

- Refactored `src/exporters/html-replay.ts` to extract `buildReplayPayload()` so the local download and cloud upload paths share the same assembly logic — touching one updates both.
- Fixed pre-existing bug in `src/video-recorder.ts` where in-page recordings were silently dropped: `isUsableRecording()` required a `dataUrl` that the in-page path never generated. Now FileReader-encodes the blob → base64 dataUrl before stashing.
- Fixed pre-existing bug where browser-native "Stop sharing" didn't trigger the toolbar UI reset (only the SDK's own Stop button did). The in-page `track.ended` handler now fires `_onAutoStop` callback too.
- Fixed pre-existing build break in `src/exporters/html-template.ts` where unescaped backticks inside a comment inside a template literal confused esbuild.

### Phase 5 — Console tab → unified event feed

### Phase 5 — Console tab → unified event feed

#### Changed

- **Console tab is now a unified, chronological event feed** (matches Jam.dev's mental model). One scrollable story per session: console logs of every level, page navigations, network errors, user clicks/inputs/selects/submits, and video start/stop markers — all merged and sorted by timestamp.
- **Six category-filter pills** above the list — `All` / `Console` / `Page navigations` / `Network errors` / `User activity` / `Video` — with live counts. Pills hide categories that have zero entries. Existing search input + "Errors only" toggle still apply.
- **Per-row layout**: 48 px elapsed-time gutter (`m:ss`) | 24 px SVG category icon | message text + optional collapsed stack trace. Replaces the old card-style log entries.
- **Category-aware coloring**: navigation rows tinted info-blue, network errors tinted error-red, console errors red text, console warnings amber, video markers in accent.
- **Mirrored in the HTML export** ([src/exporters/html-template.ts](src/exporters/html-template.ts)) — viewers reviewing an exported `.html` see the same unified feed with the same six pills and same filter behavior.

### Phase 4 — Video recording stabilization

#### Fixed

- **Empty `video` field in exports.** Multi-MB recording dataUrls were silently truncated by `chrome.runtime.sendMessage` (it drops responses >10 MB or so). The exported HTML had everything except the video bytes. Now the offscreen writes the recording into `chrome.storage.local` via the background service worker (which always has storage access), the content-script reads it back, and re-attaches the dataUrl to the page-side response. IPC carries metadata only. (`tracebug-extension/offscreen.js`, `background.js`, `content-script.js`)
- **`dataUrlToBlob` rejected valid base64.** Splitting on the first `,` was wrong because mime types can contain commas (e.g. `video/webm;codecs=vp9,opus`). Switched to splitting on the literal `;base64,` marker. The `atob` failure was the actual root cause of every previous empty-video export and the `NotSupportedError` on play. (`src/video-recorder.ts`)
- **`tb:rec:auto-stopped` broadcast dead-coded.** The generic `tb:rec:*` handler in `background.js` was registered before the dedicated auto-stop handler, so the latter never ran. Reordered so `tb:rec:auto-stopped` matches first. (`tracebug-extension/background.js`)
- **`content-script.js` re-injection crashed** with `SyntaxError: Identifier 'REC_DATA_KEY' has already been declared`. Wrapped the whole script in a `window.__TRACEBUG_CS_LOADED__` guard so re-injection is a no-op. (`tracebug-extension/content-script.js`)
- **Double share-picker.** Two concurrent `startVideoRecording` calls both passed the `isActive()` check (recorder doesn't exist yet — `getDisplayMedia` is in flight) and showed the picker twice. Added `_startInFlight` coalescing on both SDK and offscreen sides. (`src/video-recorder.ts`, `tracebug-extension/offscreen.js`)
- **Recording lost on page reload.** When the recording tab navigated and Chrome ended the share, the SDK's reinit cleared the stale `sessionId` flag but didn't recover the finalized recording. Added a recovery path that pulls `_lastBuiltRecording` from the offscreen on init. (`src/index.ts`)
- **Auto-stop finalize race.** The video track's `ended` event and the `MediaRecorder`'s `stop` event raced; the early bail on `isActive()` could miss the broadcast. Removed the bail and added `_autoStopBroadcast` dedup so finalize fires exactly once regardless of which signal arrives first. (`tracebug-extension/offscreen.js`)
- **In-modal play threw `NotSupportedError`.** `v.play()` returns a Promise that rejects on no-supported-sources, and the surrounding sync `try/catch` couldn't catch it. Added a `.catch()` that falls back to event-only timeline playback. (`src/ui/replay-scrubber.ts`)

#### Changed

- **Switched from silent `chrome.tabCapture` to `getDisplayMedia` picker.** Tab capture's silent-record path failed on many sites (cross-origin, sandboxed iframes, `chrome://` URLs) and produced recordings the modal couldn't play back. The picker is more reliable, lets the user record any tab / window / screen, and the `surfaceSwitching: "include"` option keeps the recording alive through tab navigation. (`tracebug-extension/offscreen.js`)
- **Recording HUD now has a "Draw" button** that toggles the existing draw-mode (rect / ellipse / redact, 5 colors) while recording continues. HUD slides down to `top: 64px` so it doesn't collide with the draw toolbar. (`src/ui/recording-hud.ts`)
- **`hydrateRecording` is non-throwing.** Even if `atob` fails for any reason, the recording is still returned with the dataUrl preserved, so the export still embeds the video. (`src/video-recorder.ts`)
- **`isUsableRecording` gate.** `revokeAndStash` no longer overwrites a real recording with an empty stub. The auto-stop broadcast and manual stop both go through this check before storing. (`src/video-recorder.ts`)
- **Manifest:** added `unlimitedStorage` permission for large recordings. (`tracebug-extension/manifest.json`)

### Phase 3 — UI overhaul + parity work

#### Added

- **Minimal popup** with one hero CTA ("Capture Bug Now") plus secondary "Record session" / "View tickets" buttons. The old toggle + 6 quick-action grid + active-sites list are gone. Three actions, three clicks max from "I see a bug" to "report filed".
- **Lazy SDK injection** — the SDK no longer loads until the user clicks a popup action. No persistent allowlist, no auto-inject on page load. Tracking is fully opt-in per session. (`tracebug-extension/background.js`, `popup.js`)
- **Silent tab capture (later replaced — see Phase 4)** — initial implementation used `chrome.tabCapture.getMediaStreamId` to avoid the share picker. Phase 4 reverted this to `getDisplayMedia` for reliability.
- **Quick Bug modal tabbed layout** — two-pane (replay left, tab strip right) with `Info | Console | Network | Actions | AI | Notes` tabs. Each renders real data from the BugReport. Theme toggle (🌗) in header. (`src/ui/quick-bug.ts`)
- **Action chips** — Actions tab renders chips with verb + HTML element preview (`<button class="play-btn" type="button"> +1 more`) and theme-aware syntax coloring. New module `src/action-chips.ts`, new `BugReport.actionChips` field. Text exports (GitHub/Jira/markdown) still use plain `sessionSteps[]`.
- **Full network capture** — Network tab shows ALL requests, not just failures. New `NetworkRequestEntry` type + `BugReport.networkRequests` field. Color-coded 2xx/3xx/4xx/5xx/err status badges. (`src/types.ts`, `src/report-builder.ts`)
- **Linear integration** — `src/linear-issue.ts` opens `https://linear.app/new?title=...&description=...` with prefilled markdown.
- **Slack export** — `src/slack-export.ts` returns Slack-flavored text (`*bold*`, code blocks, `>` quotes) for clipboard paste.
- **Redact (blur) tool** — third shape type in draw mode, solid hatched block, no comment prompt. (`src/draw-mode.ts`, `src/types.ts`)
- **HTML export tabbed layout + dual-theme** — standalone replay file mirrors the modal layout with `Info | Console | Network | Actions | AI | Notes | Events | Description` tabs. Both palettes embedded as CSS variables; auto-switches via `prefers-color-scheme`, manual override via in-header 🌗 toggle saved per file in `localStorage`. (`src/exporters/html-template.ts`, `src/exporters/html-replay.ts`)
- **Theme toggle in modal header** — cycles ☀ light → 🌙 dark → 🌗 auto. Per-origin preference saved in `localStorage.tracebug_theme_pref`, picked up on next SDK init. (`src/ui/quick-bug.ts`, `src/index.ts`)
- **Smarter dashboard search** — `renderFilteredSessions()` now also matches click text, input values, aria-labels, repro steps, request URLs — not just sessionId + errorMessage. (`src/dashboard.ts`)

#### Changed

- **Theme palette refresh** — softer zinc + violet ramps replacing navy + cyan. New syntax-highlighting tokens (`--tb-code-tag`, `--tb-code-attr-name`, `--tb-code-attr-val`, `--tb-code-text`, `--tb-code-bg`) so HTML element previews adapt to light/dark. Default mode changed from `"dark"` to `"auto"`. (`src/theme.ts`, `src/index.ts:254`)
- **Modal CSS polish** — more generous padding, real hover backgrounds (button lifts instead of dimming opacity), pill badges (border-radius 999px), refined focus rings, custom theme-aware scrollbar, larger radii, `-0.01em` letter-spacing on titles. (`src/ui/quick-bug.ts` — `_injectStyles()`)
- **Popup enable flow no longer reloads** the tab. SDK injects in-place via `chrome.scripting.executeScript`. User keeps current page state. (`tracebug-extension/popup.js`, `background.js` — `INJECT_SDK_NOW` handler)
- **Badge now reflects "SDK loaded on tab"** rather than "site enabled". Clears automatically on tab reload (since `injectedTabs` is wiped). (`tracebug-extension/background.js`)
- **"Jam" references removed** from all source comments. 17 mentions replaced with neutral wording.

#### Removed

- Persistent enabled-sites allowlist (`getEnabledSites` / `saveEnabledSites` / `isSiteEnabled` / `toggleSite` and the `TOGGLE_SITE` / `CHECK_SITE` message handlers).
- Auto-injection on page navigation.
- Popup's 6 quick-action buttons (Annotate / Draw / Screenshot / PDF Report / GitHub Issue / Jira Ticket) — they duplicated the on-page toolbar.
- Popup's Enable / Disable toggle row — replaced with informational hint.

#### Known issues

- `console.error` wrapper (in `src/collectors.ts:collectErrors()`) adds a frame at the top of every console.error stack trace once the SDK is loaded. Trace shows `tracebug-sdk.js` as the topmost frame; the actual caller is the line below. Fix candidates: install the wrapper only during active recording, add `//# sourceURL=` magic comment, or default `captureConsole` to `"none"`.

### Added — Sentry Mode (Rolling Video Buffer)

A "Capture this moment" recording flow inspired by NVIDIA Shadowplay / OBS replay buffer. The user arms a session once, then files multiple bug tickets from a single screen-share — no need to re-pick the screen.

- **New module: `src/video-recorder.ts`** — wraps `getDisplayMedia` + `MediaRecorder`. Supports two modes:
  - `mode: "rolling"` (default) — recording continues across captures; `captureRollingBuffer()` snapshots the in-progress recording into a finished `VideoRecording` while the screen-share keeps running.
  - `mode: "standard"` — classic record-then-stop flow.
- **New module: `src/ui/recording-hud.ts`** — floating pill with pulsing red dot, elapsed timer, "captures taken" counter, comment input (timestamped to recording time, Enter to save), 📸 Capture button (rolling mode only), and ⏹ Stop. Defensive CSS injected with `!important` to defeat host-page resets (Tailwind preflight, etc.).
- **Auto-capture on error** — when an unhandled error fires *and* a rolling session is armed, the existing error toast offers "Capture with video" instead of "Capture bug." One click captures the buffer + opens the ticket modal.
- **Smart Stop** — if the user already filed tickets via Capture, Stop ends silently with a toast. If no captures were taken, Stop opens the modal with the full recording (preserves the simple one-shot flow).
- **Public API:**
  - `TraceBug.startVideoRecording({ mode?, withMicrophone?, onStatus? })`
  - `TraceBug.stopVideoRecording(): Promise<VideoRecording | null>`
  - `TraceBug.captureRollingBuffer(): Promise<VideoRecording | null>`
  - `TraceBug.isVideoRecording()` / `isRollingMode()` / `getCaptureCount()`
  - `TraceBug.getLastVideoRecording()`
  - `downloadVideoRecording(rec, filename?)` (named export)
- **Toolbar:** new red Record button (between Region Screenshot and the right edge). Only enabled when the browser supports `getDisplayMedia`.
- **Exports updated:** GitHub issue, Jira ticket, and PDF report now include a "Screen Recording" section listing the auto-downloaded `.webm` filename, duration, file size, and any timestamped comments. Every export action auto-downloads the `.webm` alongside screenshots.
- **Comments reset on capture** — each ticket gets its own set of timestamped comments. Comments accumulate during the recording; capturing snapshots them into the recording and clears the buffer for the next bug.

### Added — Auto-Scanner (Phase 2)

A magnifying-glass toolbar button that runs six in-browser detectors in parallel and surfaces findings as severity-bucketed issues. Each issue offers Locate (flash the offending element), File Ticket (pre-fills the Quick Bug modal), and Dismiss.

- **New runtime dep: `axe-core@4.11.4`** — ~1.4 MB, lazy-loaded via `import("axe-core")` so the base bundle stays light. Only loaded the first time `scanPage()` is called. Extension IIFE bundle grew from 770 KB → 2.17 MB.
- **New module: `src/scanner/index.ts`** — orchestrator. Runs all detectors in parallel via `Promise.all` + per-detector catch wrapper (one failure doesn't block the others). Concurrent `scan()` calls are coalesced. Issues live in memory only — each scan is a fresh run, results clear on reload.
- **New module: `src/scanner/helpers.ts`** — shared selector builder (id → data-testid → tag+nth-of-type chain), severity coercion, ID generator.
- **Detectors** (one file each in `src/scanner/detectors/`):
  - **`a11y.ts`** — axe-core, restricted to WCAG 2.0/2.1 A+AA rules (skips noisy `best-practice`). Multi-element violations roll into one issue with a `(+ N more)` suffix.
  - **`broken-images.ts`** — `<img>` where `naturalWidth === 0 && complete === true`.
  - **`mixed-content.ts`** — `http://` resources on HTTPS pages. Covers `img`, `script`, `iframe`, `link[rel=stylesheet|preload|prefetch|manifest|icon]`, `audio`, `video`, `source`, `embed`, `object`.
  - **`session-data.ts`** — three detectors that classify already-collected session data: `console-error` (deduped by message), `failed-request` (4xx/5xx/network-error with response snippets), `slow-api` (successful requests over 2s).
- **New module: `src/ui/issues-panel.ts`** — modal grouped by severity. Defensive CSS with `!important` rules. Locate scrolls into view + outlines the element with a 2.4s purple flash. File Ticket pre-fills the Quick Bug modal via the new `prefilledTitle` / `prefilledDescription` options on `showQuickBugCapture()`.
- **New types in `src/types.ts`:** `Issue`, `IssueDetector` (`"axe-a11y" | "broken-image" | "mixed-content" | "console-error" | "slow-api" | "failed-request"`), `IssueSeverity` (`"critical" | "serious" | "moderate" | "minor"`).
- **Public API:**
  - `TraceBug.scanPage(): Promise<ScanResult>`
  - `TraceBug.showIssuesPanel({ rescan? })` — runs a fresh scan first by default
  - `TraceBug.getIssues({ includeDismissed? })`
  - `TraceBug.dismissIssue(id)` / `undismissIssue(id)` / `clearIssues()`
  - `TraceBug.getIssue(id)` / `getIssueCounts()` (severity-bucketed counts)
  - Named exports: `scan`, `getIssues`, `dismissIssue`, etc.

### Changed — UX Cleanup (v1.0 polish pass)

The toolbar grew to 10 buttons over multiple feature releases. Many overlapped or competed for attention. This release cuts the noise so the daily-use surface is just **capture, scan, record**.

- **Toolbar reduced from 10 → 6 elements:** Logo · ⚡ Quick Bug · 🔍 Scan · 📷 Screenshot · ⬚ Region · 🔴 Record. Removed: standalone recording-state dot, Annotate button, Draw button, Annotation List button + badge, Settings card button, Help button.
- **Quick Bug modal exports reduced from 5 → 3:** Open in GitHub · Copy as GitHub · Copy as Jira. Removed: Copy as Plain Text (GitHub markdown is pasteable anywhere), Download Screenshots (every export already auto-downloads them).
- **First-run onboarding tour removed.** Most users skipped it. Logo pulse retained as a subtle "we're here" hint; button tooltips are the only discovery aid.
- **Source files retained for all cut features.** `src/element-annotate.ts`, `src/draw-mode.ts`, `src/onboarding.ts`, `src/pdf-generator.ts` still ship in the bundle and remain accessible programmatically — `TraceBug.activateAnnotateMode()`, `TraceBug.activateDrawMode()`, `TraceBug.downloadPdf()`, `replayOnboarding()`. Only the default UI surface changed.
- **`shortcuts.annotate` and `shortcuts.draw` config keys retained** in the `TraceBugConfig` type for backwards compatibility. They're now no-ops since the corresponding toolbar buttons aren't mounted.
- **Build artifacts:** Extension IIFE 2.17 MB (axe-core dominates). npm DTS 32 KB. All 74 tests pass.

### Added — Freemium Plan

Local-only Free/Premium split. No backend, no auth, no payment. Plan is a flag in `chrome.storage.local` / `localStorage`. Free users get the full bug-reporting workflow; premium unlocks polish features.

- **New module: `src/plan.ts`** — `getPlan()`, `isPremium()`, `setPlan()`, `hydratePlan()`, `FREE_LIMITS`. Plan exposed on the SDK singleton and as named exports.
- **New module: `src/ui/upgrade-modal.ts`** — minimal centered modal with a placeholder "Upgrade — Coming Soon" CTA and a dev-only toggle for flipping the plan flag locally.
- **Gates:**
  - **Screenshots** — free users capped at 2 per ticket (`FREE_LIMITS.screenshots`). Both `takeScreenshot()` and `takeRegionScreenshot()` return `null` and show the upgrade modal at the cap. Toolbar buttons enforce the same.
  - **PDF export** — `TraceBug.downloadPdf()` opens upgrade modal; no PDF is generated.
  - **Jira ticket** — `TraceBug.getJiraTicket()` returns `null` and opens upgrade modal. The Quick Bug modal renders the Jira button as `🔒 Jira Ticket (Premium)` (muted) for free users; premium gets the blue `🎫 Copy as Jira Ticket`.
  - **Advanced metadata** — `consoleErrors` and `networkErrors` arrays in the generated report are blanked out for free users. Capture still happens (cheap); only the export is redacted.
  - **Custom branding** — new `companyName` config option, ignored on free. On premium, every export is prefixed with `> _Reported via TraceBug — {companyName}_`.
- **UI surfaces:**
  - Toolbar settings card now shows a `Free Plan` / `✨ Premium` badge next to the screenshot count (clickable; opens upgrade modal). Screenshot count line shows `N / 2` cap on free.
  - Quick Bug modal footer shows the same badge alongside "Draft auto-saved".
- **Dev toggle** — the upgrade modal exposes a small `Dev: enable Premium` button so testers can flip the flag without redeploying. Persists across sessions.
- **Backwards compat:** `getJiraTicket()` and `downloadPdf()` previously always succeeded for any caller; they now return `null` / open the modal for free users. Existing premium-equivalent flows (programmatic `generateGitHubIssue`, etc.) are unchanged.

(The full free/premium gate spec lives in internal docs; all gates are currently dormant — everything is free.)

### Changed — Ticket-First Capture Flow

Screenshot capture is no longer an instant download. Captured shots accumulate in the active **bug ticket**; downloads happen only when the user exports the ticket.

- **Toolbar Screenshot button** — captures a full-viewport screenshot and stores it in the ticket. Toast: "Added to ticket · N screenshots". No file is written to disk.
- **Toolbar Region Screenshot button** — same flow: drag-to-crop, store in the ticket, no download.
- **`TraceBug.stopRecording()`** — pauses recording **and** auto-opens the ticket-review modal so the user sees every step + every screenshot before exporting.
- **Ticket-review modal** (the renamed Quick Bug modal — title is now "Bug Ticket — Review & Export"):
  - Renders **all** screenshots in the active ticket as a numbered thumbnail strip below the primary preview.
  - Click any thumbnail to swap it into the primary preview.
  - Header shows screenshot count (e.g. "3 screenshots attached · download/copy includes all screenshots").
- **Bulk export** — every export action (Open in GitHub, Copy as GitHub Issue, Copy as Jira Ticket, Copy as Plain Text, Download Screenshots) downloads **every** screenshot in the ticket, staggered 120ms apart so the browser doesn't drop concurrent downloads.
- Toast labels updated to reflect the count, e.g. "✓ Copied as Jira Ticket · downloading 3 screenshots".

### Added — Region Screenshot (Snipping Tool)

- **`TraceBug.takeRegionScreenshot()`** — drag-to-select-area screenshot. Shows a fullscreen overlay with a translucent dim layer; user drags a rectangle; the cropped PNG is pushed to `getScreenshots()`. Press `Esc` to cancel.
  - Reuses the existing `captureScreenshot()` pipeline, so it inherits `chrome.tabs.captureVisibleTab` in extension context and the html2canvas fallback in plain-SDK context — no new dependencies.
  - Crops via canvas with DPR-aware scaling (`naturalWidth / window.innerWidth`).
  - Returns `null` if the user presses `Esc` or selects a region smaller than 5×5 px.
  - New module: `src/region-screenshot.ts`
  - New export: `captureRegionScreenshot`
- **Toolbar button** — a corner-square icon next to the existing camera, tooltip "Region Screenshot — drag to select, added to ticket".
- Overlay carries `data-tracebug="region-overlay"` so the existing `isTraceBugElement` filter ignores its own clicks.

### Added — Recording Aliases

- **`TraceBug.startRecording()`** — alias for `resumeRecording()`. Semantic only; behavior is unchanged.
- **`TraceBug.stopRecording()`** — calls `pauseRecording()` **and** auto-opens the ticket-review modal. The modal flow above is the only behavioral difference from `pauseRecording()`.

## [1.3.0] - 2026-04-13

### Added — Debugging Assistant

- **🔍 Root Cause Hint Engine** — every report now leads with a one-line, confidence-tiered cause hint. Deterministic, no AI APIs.
  - `HIGH` — when a failed network request is present: `"API POST /orders failed with 500 after clicking 'Place Order'"`
  - `MEDIUM` — when only a runtime error is present: `"TypeError suggests undefined/null data — the response or upstream value was likely missing"`
  - `LOW` — click without downstream signal: `"Click on 'Submit' did not trigger any observable effect"`
  - Injected at the top of GitHub issues, Jira tickets, PDF reports, and the Quick Bug modal
  - New exports: `generateRootCauseHint(report)`, `formatRootCauseLine(rc)`
  - New type: `RootCauseHint { hint, confidence }`
- **🧠 Smart Bug Summary** — one-sentence TL;DR derived from network + error + click + page signals. Rendered as a blockquote on GitHub, a `{panel}` on Jira, and an indigo banner on PDF.
  - Example: `"API POST /orders failed with 500 when clicking 'Place Order' button on /checkout"`
  - New export: `generateSmartSummary(report)`
- **🧩 Session Steps** — last ~10 user actions converted to plain-English strings (`"Clicked 'Edit' button"`, `"Navigated to /checkout"`). FIFO queue. Injected as a numbered list in all exports.
  - New export: `generateSessionSteps(events)`
- **🎯 Clicked Element snapshot** — structured `{ tag, text, selector, id, ariaLabel, testId, page }` for the last click before the bug. Surfaced as a `**User clicked:**` line in exports.
  - New export: `extractClickedElement(events)`
  - New type: `ClickedElementSummary`

### Added — Network Failure Capture

- **Response body snippets** — first 200 chars of every failed `fetch` or `XHR` response, captured asynchronously after the response returns (never blocks the request).
  - Rendered as a collapsible `<details>` block in GitHub, `h4. Response Snippets` on Jira, monospace blocks in PDF
  - Fetch path clones the response and reads text on a microtask tick — the caller gets the response unchanged
  - XHR path reads `responseText` on `loadend` only for `status >= 400 || status === 0`
- **Last-10 failures ring buffer** — in-memory FIFO, ~2KB steady state, cleared on `destroy()` and on "Clear All Data"
  - New export: `getNetworkFailures()` and `TraceBug.getNetworkFailures()`
  - New types: `NetworkFailure`, `NetworkErrorEntry` (with optional `response` field)

### Fixed — Session & Data Integrity

- **Clear All Sessions was silently undone by the pending flush** — after clicking "Clear All Data", the next event re-wrote the stale in-memory cache back to localStorage. Now `clearAllSessions()` cancels any pending flush and drops the cache before wiping storage.
- **Deleted sessions could resurrect themselves** — `deleteSession(id)` now invalidates the cache; pending flushes can't re-save the deleted row.
- **Race between flush queue and mutator writes** — `updateSessionError`, `addAnnotation`, `saveEnvironment` previously read from localStorage, ignoring newer events in the pending cache; their writes then overwrote the cache on flush. All three now read through the cache and call `scheduleFlush()`.
- **Network failure buffer leaked across cleared sessions** — `buildReport()` now filters buffer entries by `timestamp >= session.createdAt` so a fresh session cannot inherit failures from a cleared one.

### Changed

- **"Clear All Data" now actually clears everything** — sessions + screenshots + voice transcripts + element annotations + annotation badges + network failure buffer. Applied to both the dashboard panel's Clear button and the compact toolbar's settings card. Confirm dialog updated to list what's being wiped.
- **Every report starts with root cause + TL;DR** — GitHub issues, Jira tickets, PDF reports, and Quick Bug modal descriptions all lead with these two lines so a reader understands the bug without scrolling.

## [1.2.0] - 2026-04-09

### Added — API
- **`TraceBug.quickCapture()`** — one-shot bug capture flow: screenshot + auto-filled modal + 1-click copy to GitHub/Jira/Text. Keyboard shortcut: `Ctrl+Shift+B`. Cuts bug reporting from ~7 clicks to 2.
- **`TraceBug.setUser({ id, email, name })`** — identify users for session attribution, persisted in localStorage
- **`TraceBug.getUser()` / `TraceBug.clearUser()`** — query and clear identified user
- **`TraceBug.markAsBug()`** — flag current session as a bug (adds `isBug: true`)
- **`TraceBug.getCompactReport()`** — 2-sentence Slack-friendly summary of the session
- **`TraceBug.getErrorCount()` / `TraceBug.exportSessionJSON()`** — CI/CD integration helpers
- **`TraceBug.use(plugin)` / `TraceBug.removePlugin(name)`** — plugin registration API
- **`TraceBug.on(event, callback)`** — subscribe to lifecycle hooks (session:start, error:captured, screenshot:taken, report:generated, etc.)
- **`TraceBugUser` type** exported
- **`takeScreenshot({ includeAnnotations })`** option — capture page with annotation badges visible

### Added — Features
- **Theme system** — dark/light/auto themes with 45+ CSS custom property design tokens, follows `prefers-color-scheme` in auto mode
- **Configurable toolbar position** — `toolbarPosition: 'right' | 'left' | 'bottom-right' | 'bottom-left'`
- **Draggable toolbar** — drag to any position, persisted in `tracebug_toolbar_pos` localStorage key
- **Mobile FAB mode** — viewport < 768px collapses toolbar to a single floating action button; panel becomes full-width bottom sheet
- **First-run onboarding** — 4-step tooltip tour shown once, "?" help button on toolbar to replay
- **Console capture levels** — `captureConsole: 'errors' | 'warnings' | 'all' | 'none'` (new event types: `console_warn`, `console_log`)
- **Tab-based session detail** — Overview / Timeline / Errors / Export tabs with sticky header (bug title + severity badge)
- **Session search & filter** — search by error message, URL, or session ID; filter by all/errors/healthy
- **Session auto-naming** — sessions named by primary page (e.g., "Login Session")
- **Toast notifications** — visual feedback for actions with aria-live announcements for screen readers
- **Clickable annotation badges** — numbered badges on annotated elements open a popover with intent, severity, and comment
- **Screenshots in annotation list panel** — alongside element annotations and draw regions, with inline previews and per-item download
- **Screenshot auto-download** — screenshots and "Save Annotated" auto-download PNG files to the user's system
- **Extension screenshot via `chrome.tabs.captureVisibleTab`** — replaces html2canvas in the Chrome Extension for CORS-safe captures
- **CLI tool** — `npx tracebug init` auto-detects framework (React, Next.js, Vue, Angular, Svelte, Nuxt, vanilla) and prints setup snippet
- **Custom keyboard shortcuts** — `shortcuts: { screenshot, annotate, draw }` config option

### Added — Website & SEO
- **Chrome Web Store publication** — one-click install at `chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj`
- **Cross-browser support docs** — Chrome, Edge, Brave, Opera (Chrome Web Store); npm SDK for Firefox/Safari
- **4 programmatic SEO pages** — `/compare/sentry-alternative`, `/compare/logrocket-alternative`, `/compare/bugsnag-alternative`, `/compare/frontend-bug-reporting-tool`
- **Sitemap.xml + robots.txt** via Next.js metadata API
- **JSON-LD structured data** (SoftwareApplication schema) in root layout
- **Per-page metadata** — unique title/description/OG for docs page
- **OG image** — PNG via Next.js ImageResponse route (replaces SVG that social platforms couldn't render)
- **Security headers** — X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy in `next.config.js`
- **Scroll-reveal animations** — IntersectionObserver-based with `prefers-reduced-motion` respect
- **Mobile-responsive comparison table** — card layout on `< md` viewports

### Added — Infrastructure
- **Config validation** — runtime checks on `init()` (projectId required, maxEvents/maxSessions must be positive); invalid values warn and fall back to defaults
- **OSS infrastructure** — CONTRIBUTING.md, CHANGELOG.md, `.github/ISSUE_TEMPLATE/` (bug_report.md, feature_request.md), `.github/workflows/ci.yml`
- **README badges** — npm version, monthly downloads, GitHub stars, MIT license
- **`ui/` module directory** — extracted dashboard helpers (`helpers.ts`, `toast.ts`, `index.ts`) from the 2000-line `dashboard.ts`

### Fixed
- **Global error boundary** — entire `init()` body + all collectors + dashboard mount wrapped in try/catch; SDK never crashes host app
- **Resilient fetch/XHR wrappers** — original function ALWAYS called even if tracking throws; handles Request objects, URL objects, strings
- **Footer privacy link** — changed from `#` to `/privacy`
- **Docs page metadata** — unique title/description instead of falling back to root layout

### Changed
- All UI components migrated from hardcoded colors to CSS custom properties (`var(--tb-*)`)
- Collectors hardened with try/catch — never break host app event handling
- `html2canvas` pinned to exact version `1.4.1` (removed caret range)

## [1.1.1] - 2026-03-12

### Initial Public Release
- Session recording (clicks, inputs, navigation, API calls, errors)
- Screenshot capture with annotation editor (rectangles, arrows, text)
- Voice bug descriptions via Web Speech API
- Element annotation mode (click elements to attach feedback)
- Draw mode (rectangles/ellipses on live page)
- GitHub Issue and Jira Ticket export (one-click copy)
- PDF report generation
- Auto-generated reproduction steps
- Auto bug title and flow summary
- Environment detection (browser, OS, viewport, device, connection)
- Privacy: passwords, credit cards, SSNs, tokens auto-redacted
- Framework noise filtering (Next.js, Webpack, Vite, Turbopack)
- Chrome Extension (Manifest V3, CSP-safe injection)
- npm package with ESM + CJS + IIFE + TypeScript declarations
