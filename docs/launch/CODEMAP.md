# Code map — jump here instead of grepping

Entry points in the files too big to read whole, by **symbol name + approximate line**. Search the
name, not the number. If an entry is >~50 lines off, or a symbol moved or was renamed, fix it here in
the same step.

## src/ui/quick-bug.ts (~3,700) — the ticket modal

- `showQuickBugCapture` ~L205 → `_openModal` ~L400 is the whole modal; everything to ~L1850 is inside it.
- Tabs, all pure string→HTML: `_buildInfoTab` ~L2063 · `_buildConsoleTab` ~L2256 · `_buildNetworkTab` ~L2338 · `_buildActionsTab` ~L2427 · `_buildAITab` ~L2473 · `_buildConsoleFeed` ~L2182 · `_syncConsoleFeedToTimestamp` ~L2154 (shared with the scrubber).
- Drafts `_loadDraft`/`_saveDraft`/`_clearDraft` ~L1960–1980 · `_estimateHtmlExportBytes` ~L312 (the size badge) · `_fileViaTracker` ~L1890 · `showAIConfigModal` ~L2634 · `showSettingsPointerModal` ~L2596.
- Export actions are listeners at ~L1100–1260 (`export-replay`, `export-zip`, `export-spec`).

## src/dashboard.ts (~2,430) — the in-page panel

- `mountDashboard` ~L65 · `renderPanel` ~L248 · `_createSessionCard` ~L375 · `showNoteDialog` ~L1101 · `showVoiceDialog` ~L1168 (the **voice** recorder, not video).
- `renderSessionDetail` ~L453 runs to ~L1099 — the single biggest block in the file.
- `buildTextReport` ~L1299 · `buildHtmlReport` ~L1351 · `renderAnnotationList` ~L1681 · `_showAnnotationEditorImpl` ~L1965 · `initAnnotationCanvas` ~L2106.

## src/index.ts (~2,020) — the SDK class, mostly a public API surface

- `init` ~L283 + helpers ~L374–510 (`_validateConfig`, `_buildEmit`, `_startCollectors`, `_mountDashboardIfEnabled`, `_restoreVideoSessionOnInit`) · `_startActiveSession` ~L590 / `_endActiveSession` ~L716.
- **Captures:** `startEventsCapture` ~L1040 / `stopEventsCapture` ~L1075 (the popup's default path) · `startVideoRecording` ~L1116 / `stopVideoRecording` ~L1177 · `prepareRecording` ~L1000 · `_reportCaptureBlocked` ~L1107.
- Everything from ~L1260 down is thin public getters (plan, report, modes). Rarely the right place to edit.

## src/exporters/html-template.ts (~1,855) — the exported .html

- `BundlePayload` ~L10 is the contract between `html-replay.ts` and the viewer — read it first.
- `buildReplayHtml` ~L143 — the document, incl. the Replay heading ~L215 and `pagePath` ~L299.
- `REPLAY_CSS` ~L323 and `REPLAY_RUNTIME` ~L702 are two template-string constants and **~1,500 of the
  file's 1,855 lines**. The viewer's own scrubber/console/network code lives inside `REPLAY_RUNTIME` —
  grep within it, don't read it.

## tracebug-extension/background.js (~1,650) — the service worker

- `seedRecordOptsDefault` ~L66 and the `onInstalled` listener ~L89 (record-options default; see STATE.md).
- MV3 durability: `persistState` ~L155 · `maybeApplyUpdate` ~L181 · `SESSION_STATE_KEY` ~L151.
- Injection: `injectBridge` ~L258 · `injectPageWorld` ~L266 · `injectSDK` ~L346 · `handleComboAction` ~L383.
- Health `pingTab` ~L291 / `ensureAlive` ~L317 · `tabs.onUpdated` ~L430 · offscreen lifecycle ~L830+.
- Shortcut: `boundQuickCaptureShortcut` ~L512 · `commands.onCommand` ~L559 · `flashActionError` ~L541.
- `runtime.onMessage` ~L589 is one long dispatcher — see the verb table.

## The rest over 800 lines

- **compact-toolbar.ts (~1,230)** — `mountCompactToolbar` ~L82 · `_toggleSessionTracking` ~L464 · `_toggleRecording` ~L536 · `_showRecordPreflight` ~L631 · `_openOrRefreshTicket` ~L744 · `_initDrag` ~L1067 · `_convertToFab` ~L1183. **Only** consumer of the capture `onStatus` callback.
- **video-recorder.ts (~940)** — `isExtensionContext` ~L158 picks the transport · wire formats ~L54 · sync getters ~L164–256 · `scheduleDurationCap` ~L115.
- **draw-mode.ts (~885)** — `activateDrawMode` ~L55 · `_drawShape` ~L644 · `_redrawAllRegions` ~L705 · `_showCommentInput` ~L774.

## Message verbs — where each one is handled

| Verb family | Sent by | Handled in |
|---|---|---|
| `TB_CAPTURE_NOW`, `TB_START_RECORDING`, `TB_VIEW_TICKETS`, `TB_INSPECT` | popup, `commands` | `background.js` ~L638 → `handleComboAction` ~L383 → `content-script.js` ~L633–670 |
| `TB_PING` | worker health check | `content-script.js` ~L671 |
| `TB_HOST_ACCESS` / `TB_HOST_ACCESS_CHANGED` | content script / worker | `background.js` ~L608 · `content-script.js` ~L220 |
| `TB_DISABLE_TAB` | in-page toolbar ✕ | `background.js` ~L618 |
| `TB_OPEN_OPTIONS` | popup, in-page pointers | `background.js` ~L677 |
| `tb:rec:*` | page SDK ↔ offscreen | `background.js` ~L820 relay; `started` ~L722, `persist` ~L740, start/stop side effects ~L1055–1072 |
| `tb:provider:send`, `tb:llm:analyze` | page SDK | `background.js` ~L783 → `provider-bridge.js` → `tracebug-provider-api.js` |
| `tb:confirm:get`, `tb:confirm:decide` | `confirm-send.html` | `background.js` ~L791, ~L804 |

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
