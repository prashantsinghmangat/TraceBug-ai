# Code map — jump here instead of grepping

Entry points in the files too big to read whole, by **symbol name + approximate line**. Search the
name, not the number. If an entry is >~50 lines off, or a symbol moved or was renamed, fix it here in
the same step.

## src/ui/quick-bug.ts (~4,000) — the ticket modal

- `showQuickBugCapture` ~L270 → `_openModal` ~L503 is the whole modal; everything to ~L2045 is inside it.
- Tabs, all pure string→HTML: `_buildInfoTab` ~L2254 · `_buildConsoleTab` ~L2412 · `_buildNetworkTab` ~L2480 · `_buildActionsTab` ~L2586 · `_buildAITab` ~L2648 · `_buildConsoleFeed` ~L2380 · `_syncConsoleFeedToTimestamp` ~L2345 (shared with the scrubber).
- Drafts `_loadDraft`/`_saveDraft`/`_clearDraft` ~L2151–2175 · `_estimateHtmlExportBytes` ~L415 (the size badge) · `_fileViaTracker` ~L2080 · `showAIConfigModal` ~L2808 · `showSettingsPointerModal` ~L2771.
- Export actions are listeners at ~L1294–1400 (`export-replay`, `export-spec`, `export-zip`).

## src/dashboard.ts (~2,450) — the in-page panel

- `mountDashboard` ~L77 · `renderPanel` ~L269 · `_createSessionCard` ~L396 · `showNoteDialog` ~L1121 · `showVoiceDialog` ~L1188 (the **voice** recorder, not video).
- `renderSessionDetail` ~L473 runs to ~L1120 — the single biggest block in the file.
- `buildTextReport` ~L1319 · `buildHtmlReport` ~L1371 · `renderAnnotationList` ~L1701 · `_showAnnotationEditorImpl` ~L1984 · `initAnnotationCanvas` ~L2125.

## src/index.ts (~2,270) — the SDK class, mostly a public API surface

- `init` ~L303 + helpers ~L394–560 (`_validateConfig`, `_buildEmit`, `_startCollectors`, `_mountDashboardIfEnabled`, `_restoreVideoSessionOnInit`) · `_startActiveSession` ~L614 / `_endActiveSession` ~L751.
- **Captures:** `startEventsCapture` ~L1219 / `stopEventsCapture` ~L1276 (the popup's default path) · `startVideoRecording` ~L1318 / `stopVideoRecording` ~L1388 · `prepareRecording` ~L1052 · `_reportCaptureBlocked` ~L1309.
- Everything from ~L1450 down is thin public getters (plan, report, modes). Rarely the right place to edit.

## src/exporters/html-template.ts (~1,840) — the exported .html

- `BundlePayload` ~L12 is the contract between `html-replay.ts` and the viewer — read it first.
- `buildReplayHtml` ~L148 — the document, incl. the Replay heading ~L193 and `pagePath` ~L312.
- `REPLAY_CSS` ~L336 and `REPLAY_RUNTIME` ~L720 are two template-string constants and **~1,500 of the
  file's 1,840 lines**. The viewer's own scrubber/console/network code lives inside `REPLAY_RUNTIME` —
  grep within it, don't read it.

## tracebug-extension/background.js (~2,120) — the service worker

- `seedRecordOptsDefault` ~L83 and the `onInstalled` listener ~L107 (record-options default; see STATE.md).
- MV3 durability: `persistState` ~L250 · `maybeApplyUpdate` ~L281 · `SESSION_STATE_KEY` ~L246.
- Injection: `injectBridge` ~L367 · `injectPageWorld` ~L404 · `injectSDK` ~L485 · `handleComboAction` ~L551.
- Health `pingTab` ~L429 / `ensureAlive` ~L455 · `tabs.onUpdated` ~L639 · offscreen lifecycle `ensureOffscreenDocument` ~L1274+.
- Shortcut: `boundQuickCaptureShortcut` ~L790 · `flashActionError` ~L819 · `commands.onCommand` ~L882.
- `runtime.onMessage` ~L918 is one long dispatcher — see the verb table.

## The rest over 800 lines

- **compact-toolbar.ts (~1,290)** — `mountCompactToolbar` ~L86 · `_toggleSessionTracking` ~L478 · `_toggleRecording` ~L556 · `_showRecordPreflight` ~L651 · `_openOrRefreshTicket` ~L780 · `_initDrag` ~L1132 · `_convertToFab` ~L1239. **Only** consumer of the capture `onStatus` callback.
- **video-recorder.ts (~1,030)** — `isExtensionContext` ~L163 picks the transport · wire formats ~L59 · sync getters ~L169–264 · `scheduleDurationCap` ~L117 · mic functions (`hasMicrophoneTrack`/`isMicrophoneMuted`/`setMicrophoneMuted`, forward to offscreen via `tb:rec:mic-mute` in extension mode) ~L284–311.
- **draw-mode.ts (~885)** — `activateDrawMode` ~L56 · `_drawShape` ~L644 · `_redrawAllRegions` ~L705 · `_showCommentInput` ~L774.

## Message verbs — where each one is handled

| Verb family | Sent by | Handled in |
|---|---|---|
| `TB_CAPTURE_NOW`, `TB_START_RECORDING`, `TB_VIEW_TICKETS`, `TB_INSPECT` | popup, `commands` | `background.js` ~L1036 → `handleComboAction` ~L551 → `content-script.js` ~L656–700 |
| `TB_PING` | worker health check | `content-script.js` ~L721 |
| `TB_HOST_ACCESS` / `TB_HOST_ACCESS_CHANGED` | content script / worker | `background.js` ~L1006 · `content-script.js` ~L220 |
| `TB_DISABLE_TAB` | in-page toolbar ✕ | `background.js` ~L1016 |
| `TB_OPEN_OPTIONS` | popup, in-page pointers | `background.js` ~L1075 |
| `tb:rec:*` | page SDK ↔ offscreen | `background.js` ~L1222 relay; `started` ~L1131, `persist` ~L1149, `handleRecordingMessage` (start/stop side effects) ~L1380 |
| `tb:provider:send`, `tb:llm:analyze` | page SDK | `background.js` ~L1192 → `provider-bridge.js` → `tracebug-provider-api.js` |
| `tb:confirm:get`, `tb:confirm:decide` | `confirm-send.html` | `background.js` ~L1200, ~L1213 |

## Storage keys — which store, and who owns them

- **Page `localStorage`** (`tracebug_*`, readable by the host site — never secrets). `src/storage.ts`
  ~L6–155 owns `tracebug_sessions`, `_active_session`, `_active_capture_mode`,
  `_events_capture_started`, `_storage_stats`. Also `_last_bug_draft`, `_toolbar_pos`, `_theme_pref`,
  `_replay_theme`, `_plan`, `_user`, `_onboarding_complete`, `_milestone_ask_done`, `_dev`.
- **`chrome.storage.local`** (`tb_*`, extension-owned): `tb_record_opts` (Record options + `videoSetBy`) ·
  `tb_integrations_v1`, `tb_ai_config_v1` (**the secrets**) · `tb_llm_sites_v1`, `tb_llm_rates_v1` ·
  `tb_pending_sends_v1`, `tb_send*` (confirm-send) · `tb_rec_meta_v2`, `tb_rec_data_v2` ·
  `tb_migration_notices` · `tracebug_cloud_endpoint`.
  (`tb_host_perm_declined` removed in 1.11.2, T-13 — the popup's cross-site opt-in row is gone.)
- **`chrome.storage.session`**: `tb_sw_state_v1` only — worker state, awaited via `_hydrated`.
- **`chrome.storage.sync`**: `tracebug_redact` only — redaction rules.
- **Legacy, migrated and deleted on sight** (`secret-migration.js`): page `tracebug_integrations`,
  `tracebug_ai_config`, `tracebug_ai_key`.
