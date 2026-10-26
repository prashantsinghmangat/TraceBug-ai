// ── TraceBug SDK ──────────────────────────────────────────────────────────
// Created and coded by Prashant Singh Mangat
// GitHub: https://github.com/prashantsinghmangat
// Repo:   https://github.com/prashantsinghmangat/TraceBug-ai
//
// Install: npm install tracebug-sdk
//
// Usage:
//   import TraceBug from "tracebug-sdk";
//   TraceBug.init({ projectId: "my-app" });
//
// That's it. No backend, no API keys, no config.
// Events are stored in localStorage. A dashboard panel appears in-browser.

import {
  TraceBugConfig,
  TraceBugEvent,
  EventType,
  BugReport,
  Annotation,
  ScreenshotData,
  EnvironmentInfo,
  UIAnnotationReport,
  BugPriority,
} from "./types";
import {
  getActiveSessionId,
  setActiveSessionId,
  clearActiveSessionId,
  getActiveCaptureMode,
  setActiveCaptureMode,
  getEventsCaptureStartedAt,
  setEventsCaptureStartedAt,
  clearEventsCaptureStartedAt,
  generateSessionId,
  appendEvent,
  updateSessionError,
  getAllSessions,
  getCachedSessions,
  scheduleFlush,
  addAnnotation,
  saveEnvironment,
  setSessionPriority,
  flushPendingEvents,
  getStorageStats,
  type StorageStats,
} from "./storage";
import { generateReproSteps } from "./repro-generator";
import { mountDashboard, setRecordingState, updateRecordingState, setSessionLifecycleHandlers, setNewCaptureHandler } from "./dashboard";
import {
  collectClicks,
  collectInputs,
  collectSelectChanges,
  collectFormSubmits,
  collectRouteChanges,
  collectApiRequests,
  collectPerformanceNetwork,
  drainPerformanceNetwork,
  resetPerformanceSeen,
  collectXhrRequests,
  collectErrors,
  collectConsoleErrors,
  collectConsoleWarnings,
  collectConsoleInfo,
  collectConsoleLogs,
  getNetworkFailures,
  clearNetworkFailures,
} from "./collectors";
import { setRedactRules } from "./sanitize/custom-redaction";
import { setTransportMode } from "./ext-transport";
import {
  getCaptureStatus,
  announceCaptureStarted,
  announceCaptureStopped,
  captureEndedMessage,
  type CaptureStatus,
} from "./capture-ownership";
import { dedupeNetworkRows } from "./network-dedupe";
import { captureEnvironment } from "./environment";
import { captureScreenshot, getScreenshots, clearScreenshots } from "./screenshot";
import { captureRegionScreenshot } from "./region-screenshot";
import { hydratePlan, getPlan, isPremium, setPlan } from "./plan";
import type { Plan } from "./plan";
import { buildReport } from "./report-builder";
import { generateGitHubIssue } from "./github-issue";
import { generateJiraTicket } from "./jira-issue";
import { generatePdfReport } from "./pdf-generator";
import { shareSessionAsLink, ShareReportOptions, ShareLinkResult } from "./exporters/share-link";
import { getBridge } from "./auth/iframe-bridge";
import { resolveCloudEndpoint } from "./cloud-endpoint";
import { generateBugTitle } from "./title-generator";
import { startVoiceRecording, stopVoiceRecording, isVoiceSupported, isVoiceRecording, getVoiceTranscripts, clearVoiceTranscripts } from "./voice-recorder";
import {
  startVideoRecording as _startVideoRecording,
  stopVideoRecording as _stopVideoRecording,
  isVideoRecording as _isVideoRecording,
  isVideoSupported as _isVideoSupported,
  isRollingMode as _isRollingMode,
  captureRollingBuffer as _captureRollingBuffer,
  getCaptureCount as _getCaptureCount,
  getLastVideoRecording,
  clearVideoRecording,
  abortVideoRecording,
  restoreFromOffscreenIfActive as _restoreVideoState,
  restoreLastRecordingFromOffscreen as _restoreLastRecording,
  wireAutoStopListener as _wireAutoStop,
  setAutoStopHandler as _setAutoStopHandler,
  wireStartedListener as _wireStarted,
  setStartedHandler as _setStartedHandler,
  type VideoRecording,
} from "./video-recorder";
import { showRecordingHUD, hideRecordingHUD, flashRecordingHUD } from "./ui/recording-hud";
import { startDomRecording, stopDomRecording, stashDomReplay, clearStashedDomReplay } from "./rrweb-recorder";
import { showCaptureBlockedNotice, showActionToast } from "./ui/toast";
import { eventsCaptureFidelityWarning, framesCaptureWarning } from "./replay-fidelity";
import { isVideoOffered } from "./video-recorder";
import {
  mark as _mark,
  assertCondition as _assertCondition,
  context as _setContext,
  getCurrentContext as _getContext,
  clearDevApiState,
  setDevApiHooks,
} from "./dev-api";
import type { ContextData } from "./types";
import {
  scan as _scan,
  getIssues as _getIssues,
  dismissIssue as _dismissIssue,
  undismissIssue as _undismissIssue,
  clearIssues as _clearIssues,
  getIssueCountsBySeverity,
  getIssueById,
  type ScanResult,
} from "./scanner";
import { activateElementAnnotateMode, deactivateElementAnnotateMode, isElementAnnotateActive } from "./element-annotate";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "./draw-mode";
import { activateInspectMode, deactivateInspectMode, isInspectModeActive } from "./inspect-mode";
import { runRecordCountdown, startBlurThenRecord } from "./ui/pre-record";
import {
  getAnnotationReport,
  exportAsJSON as exportAnnotationsJSON, exportAsMarkdown as exportAnnotationsMD,
  copyToClipboard as copyAnnotationsToClipboard, clearAllAnnotations,
} from "./annotation-store";
import { injectTheme, removeTheme } from "./theme";
import {
  TraceBugPlugin,
  registerPlugin, unregisterPlugin,
  runEventPlugins,
  onHook, emitHook, clearAllPlugins,
} from "./plugin-system";

// ── Public exports ────────────────────────────────────────────────────────

export {
  TraceBugConfig,
  TraceBugEvent,
  TraceBugUser,
  StoredSession,
  BugReport,
  Annotation,
  ScreenshotData,
  EnvironmentInfo,
  ElementAnnotation,
  DrawRegion,
  UIAnnotationReport,
  AnnotationIntent,
} from "./types";
export { getAllSessions, clearAllSessions, deleteSession, getStorageStats } from "./storage";
export { generateReproSteps } from "./repro-generator";
export { captureEnvironment } from "./environment";
export { captureScreenshot, getScreenshots, downloadAllScreenshots } from "./screenshot";
export { captureRegionScreenshot } from "./region-screenshot";
export { getPlan, isPremium, setPlan, hydratePlan, FREE_LIMITS } from "./plan";
export type { Plan } from "./plan";
export {
  buildReport,
  generateSmartSummary,
  generateSessionSteps,
  extractClickedElement,
  generateRootCauseHint,
  formatRootCauseLine,
} from "./report-builder";
export { getNetworkFailures } from "./collectors";
export type { NetworkFailure } from "./collectors";
export type { NetworkErrorEntry, ClickedElementSummary, RootCauseHint, RedactRules } from "./types";
export { setRedactRules } from "./sanitize/custom-redaction";
// Extension-mode bridge: tracebug-init.js pushes the non-secret integration
// status snapshot in through setIntegrationStatus (booleans only).
export { setTransportMode, isExtensionMode, setIntegrationStatus, getIntegrationStatus, setHostAccess, getHostAccess, setBoundShortcut, getBoundShortcut } from "./ext-transport";
export type { TransportMode, IntegrationStatus } from "./ext-transport";
export { generateGitHubIssue, generateGitHubIssueUrl, openGitHubIssue } from "./github-issue";
export { generateJiraTicket } from "./jira-issue";
export { generateAIPrompt, generateMcpPrompt, openInClaude, openInChatGPT } from "./exporters/ai-prompt";
export { buildHar, exportSessionAsHar } from "./exporters/har-export";
export { exportSessionAsZip, buildZipBlob } from "./exporters/zip-export";
export { exportSessionAsHtml, buildReplayBlob } from "./exporters/html-replay";
export { generatePlaywrightTest, playwrightTestFilename } from "./exporters/playwright-test";
export { captureStyleEvidence, formatStyleSummary, contrastRatio, cssColorToHex } from "./style-evidence";
export type { StyleEvidence } from "./style-evidence";
export { runRecordCountdown, startBlurThenRecord } from "./ui/pre-record";
export { isBlurModeActive, removeAllBlurBoxes } from "./ui/blur-tool";
export type { HarLog, HarExportResult } from "./exporters/har-export";
export {
  runLLMAnalysis, buildAnalysisPrompt,
  getAIConfig, setAIConfig, clearAIConfig, hasAIKey,
  DEFAULT_MODELS, ANTHROPIC_MODEL_CHOICES, PROVIDER_LABELS,
} from "./ai/llm-client";
export type { AIProvider, AIConfig, AIAnalysisResult } from "./ai/llm-client";
export {
  createTrackerIssue, createGitHubIssue, createLinearIssue, sendSlackMessage,
  getIntegrationsConfig, setIntegrationsConfig, clearIntegrationsConfig, hasIntegration,
  TRACKER_LABELS,
} from "./integrations/tracker-client";
export type {
  TrackerProvider, IntegrationsConfig, GitHubConfig, LinearConfig, SlackConfig, CreateIssueResult,
} from "./integrations/tracker-client";
export type { AIPromptOptions } from "./exporters/ai-prompt";
export type { JiraTicket } from "./jira-issue";
export { generatePdfReport, downloadPdfAsHtml } from "./pdf-generator";
export { generateBugTitle, generateFlowSummary } from "./title-generator";
export { buildTimeline, formatTimelineText } from "./timeline-builder";
export { summarizeRedactions, formatRedactionSummary } from "./redaction-summary";
export type { RedactionSummary } from "./redaction-summary";
export { startVoiceRecording, stopVoiceRecording, isVoiceSupported, isVoiceRecording, getVoiceTranscripts, clearVoiceTranscripts } from "./voice-recorder";
export type { VoiceTranscript } from "./voice-recorder";
export {
  startVideoRecording,
  stopVideoRecording,
  isVideoRecording,
  isVideoSupported as isVideoSupportedFn,
  isRollingMode,
  captureRollingBuffer,
  getCaptureCount,
  getLastVideoRecording,
  clearVideoRecording,
  downloadVideoRecording,
} from "./video-recorder";
export type { VideoRecording, VideoComment } from "./video-recorder";
export {
  scan,
  getIssues,
  dismissIssue,
  undismissIssue,
  clearIssues,
  getIssueCountsBySeverity,
  getIssueCountsByDetector,
  getIssueById,
} from "./scanner";
export type { ScanResult } from "./scanner";
export type { Issue, IssueDetector, IssueSeverity } from "./types";
export type { TraceBugPlugin } from "./plugin-system";

class TraceBugSDK {
  private config: TraceBugConfig | null = null;
  private cleanups: (() => void)[] = [];
  private initialized = false;
  /**
   * True only while a record-driven session is armed — set to true by
   * _startActiveSession() (Record click) and false by _endActiveSession()
   * (Stop). Page reloads inherit the previous value via the persisted
   * active-session-ID flag.
   */
  private recording = false;
  private sessionId: string | null = null;
  private _lastErrorPromptAt = 0;
  // Session-scoped console.* hook cleanups. Empty when no session is active —
  // the console wrappers (which would pollute every stack trace) are not
  // installed until _startActiveSession() arms them, and removed on stop.
  private _consoleCleanups: (() => void)[] = [];
  // The emit fn is created in init(); cached here so the lazy console
  // collectors attached later can share it without re-wiring.
  private _emit: ((type: EventType, data: TraceBugEvent["data"]) => void) | null = null;
  private _consoleLevel: "errors" | "warnings" | "all" | "none" = "all";
  private _lastErrorMsgPrompted: string | null = null;
  // When the current events-only capture began, or null if none is running.
  // There is no MediaRecorder to ask for elapsed time on that path, so the HUD
  // timer and the stashed replay's duration both come from here. Reset to a
  // fresh timestamp when the capture resumes on a new page after a navigation.
  private _eventsCaptureStartedAt: number | null = null;
  /** The ONE capture-status answer this page load gets. Both consumers read
   *  it: the resume path (may I keep capturing?) and the notice path (did a
   *  capture end because the user left the last site?). Asking twice would
   *  race — the worker delivers an ended-notice exactly once. */
  private _captureStatusAtInit: Promise<CaptureStatus> | null = null;
  /** A capture-ended sentence is shown once per page load. */
  private _captureNoticeShown = false;
  /** Memo for the HUD tally, invalidated by the session's event count. */
  private _countsCache: { id: string; len: number; counts: { events: number; requests: number } } | null = null;

  /**
   * Initialize TraceBug. Call once on app startup.
   *
   *   TraceBug.init({ projectId: "my-app" });
   *
   * Options:
   *  - projectId:       Required. Identifies your app.
   *  - maxEvents:       Max events per session in storage (default 200).
   *  - maxSessions:     Max sessions kept in localStorage (default 50).
   *  - enableDashboard: Show the floating bug button (default true).
   *  - enabled:         Control when SDK is active (default "auto").
   */
  init(config: TraceBugConfig): void {
    if (this.initialized) {
      console.warn("[TraceBug] Already initialized.");
      return;
    }

    if (!this._validateConfig(config)) return;

    try {
      this.config = {
        maxEvents: 200,
        maxSessions: 50,
        enableDashboard: true,
        theme: "light",
        toolbarPosition: "right",
        minimized: false,
        captureConsole: "all",
        ...config,
      };

      // Declare the transport before anything reads config state: in extension
      // mode the secret getters must already be returning nothing by the time
      // any UI renders. See src/ext-transport.ts.
      setTransportMode(this.config.transport);

      // Install app-specific redaction rules before any collector attaches —
      // rules must be live for the first captured event.
      setRedactRules(this.config.redact);

      this.initialized = true;
      // Restore the active session ID if a recording survived a reload.
      // Otherwise we stay dormant — no session is created until the user
      // clicks Record. This prevents the dashboard's session list from
      // accruing one entry per page load.
      this.sessionId = getActiveSessionId();
      this.recording = !!this.sessionId;

      this._applyThemeFromConfig();

      // ── Hydrate freemium plan flag (non-blocking) ─────────────────
      // Defaults to "free" until storage read resolves. The first user
      // interaction is unlikely to land within that window, but if it
      // does, the free behavior applies — acceptable for a local flag.
      hydratePlan().catch(() => {});

      this._wireQuickBugConfig();

      const emit = this._buildEmit();

      // ── Wire dev-api so TraceBug.mark/assert/context route through emit ──
      setDevApiHooks({
        emit,
        processError: (msg, stack) => {
          if (this.sessionId) this.processError(this.sessionId, msg, stack);
        },
      });

      this._startCollectors(emit);

      // Save references for the lazy attach/detach during session lifecycle.
      this._emit = emit;
      this._consoleLevel = this.config.captureConsole ?? "all";

      this._mountDashboardIfEnabled();
      this._restoreVideoSessionOnInit();

      // Re-emit session:start only when restoring a VIDEO session that survived
      // a reload (hooks re-attach to it). Event-only sessions already emitted
      // session:start when armed and simply continue across navigations —
      // re-emitting on every page load would spam hooks with duplicate starts.
      // Fresh starts emit from _startActiveSession() instead.
      if (this.sessionId && getActiveCaptureMode() !== "events") {
        emitHook("session:start", this.sessionId);
      }

      console.info(
        `[TraceBug] Initialized — project: ${config.projectId}${this.sessionId ? `, restored session: ${this.sessionId}` : " (idle — click Record to start a session)"}`
      );
    } catch (err) {
      console.warn('[TraceBug] Failed to initialize:', err);
      this.initialized = false;
      return;
    }
  }

  // ── init() phases ─────────────────────────────────────────────────
  // Extracted from init() for testability and readability. Each is a pure
  // side-effecting phase; init() is the orchestrator. Behavior is unchanged.

  /** Validate the config object and environment gate. Returns false (and logs)
   *  when init should abort; may normalize invalid maxEvents/maxSessions. */
  private _validateConfig(config: TraceBugConfig): boolean {
    if (!config || typeof config !== "object") {
      console.warn("[TraceBug] init() requires a config object.");
      return false;
    }
    if (!config.projectId || typeof config.projectId !== "string") {
      console.warn("[TraceBug] init() requires a projectId string.");
      return false;
    }
    if (config.maxEvents !== undefined && (typeof config.maxEvents !== "number" || config.maxEvents < 1)) {
      console.warn("[TraceBug] maxEvents must be a positive number. Using default (200).");
      config.maxEvents = 200;
    }
    if (config.maxSessions !== undefined && (typeof config.maxSessions !== "number" || config.maxSessions < 1)) {
      console.warn("[TraceBug] maxSessions must be a positive number. Using default (50).");
      config.maxSessions = 50;
    }
    if (!this.shouldEnable(config.enabled ?? "auto")) {
      console.info("[TraceBug] Disabled in this environment.");
      return false;
    }
    return true;
  }

  /** Inject theme CSS custom properties, honoring a per-origin user preference
   *  saved by the modal's theme toggle; falls back to the config default. */
  private _applyThemeFromConfig(): void {
    let themeMode = this.config!.theme!;
    try {
      const saved = localStorage.getItem("tracebug_theme_pref");
      if (saved === "light" || saved === "dark" || saved === "auto") {
        themeMode = saved;
      }
    } catch {}
    try { injectTheme(themeMode); } catch {}
  }

  /** Wire githubRepo + cloudEndpoint into the (lazy-loaded) Quick Bug modal.
   *  cloudEndpoint always wires through so Share reads the override even with
   *  no githubRepo set. */
  private _wireQuickBugConfig(): void {
    import("./ui/quick-bug").then(m => {
      if (this.config?.githubRepo) m.setGithubRepo(this.config.githubRepo);
      m.setCloudEndpoint(this.config?.cloudEndpoint);
    }).catch(() => {});
  }

  /** The emit function collectors call with raw event data. Reads
   *  sessionId / recording dynamically from `this` so toggling record state
   *  mid-session takes effect without re-wiring collectors. */
  private _buildEmit(): (type: EventType, data: TraceBugEvent["data"]) => void {
    return (type, data) => {
      try {
        if (!this.recording) return;
        const sid = this.sessionId;
        if (!sid) return;

        let event: TraceBugEvent | null = {
          id: Math.random().toString(36).slice(2, 10),
          sessionId: sid,
          projectId: this.config!.projectId,
          type,
          page: window.location.pathname,
          timestamp: Date.now(),
          data,
        };

        event = runEventPlugins(event);
        if (!event) return;

        appendEvent(sid, event, this.config!.maxEvents!, this.config!.maxSessions!);

        if (type === "error" || type === "unhandled_rejection") {
          this.processError(sid, data.error?.message, data.error?.stack);
          emitHook("error:captured", event);
          // Auto-detect: surface the Live Bug Card (throttled inside)
          this.maybePromptErrorCapture(data.error?.message, data.error?.stack);
        }
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[TraceBug] Event emit error:', err);
      }
    };
  }

  /** Attach all event collectors, pushing their cleanups. */
  private _startCollectors(emit: (type: EventType, data: TraceBugEvent["data"]) => void): void {
    this.cleanups.push(collectClicks(emit));
    this.cleanups.push(collectInputs(emit));
    this.cleanups.push(collectSelectChanges(emit));
    this.cleanups.push(collectFormSubmits(emit));
    this.cleanups.push(collectRouteChanges(emit));
    this.cleanups.push(collectApiRequests(emit));
    this.cleanups.push(collectXhrRequests(emit));
    // Backfill: catches requests fired BEFORE our fetch/XHR wraps were
    // installed, plus anything that bypassed them (axios with cached XHR
    // reference, service workers, polyfills). Reads from the browser's
    // resource timing buffer so we never miss a network call again.
    this.cleanups.push(collectPerformanceNetwork(emit));
    // Eager error capture: window.onerror + unhandledrejection only.
    // These don't pollute call stacks of unrelated code, so they stay
    // attached for the full SDK lifetime. The console.* wrappers (which
    // DO add a frame to every console call's stack trace) attach lazily
    // when a recording session starts — see _attachConsoleCollectors().
    this.cleanups.push(collectErrors(emit));
  }

  /** Mount the in-browser dashboard toolbar and wire its session handlers. */
  private _mountDashboardIfEnabled(): void {
    if (!this.config!.enableDashboard) return;
    try {
      setRecordingState(this.recording, () => {
        if (this.recording) { this.pauseRecording(); } else { this.resumeRecording(); }
        updateRecordingState(this.recording);
      });
      // Tie the toolbar's video-record button to the SDK session lifecycle so
      // a single Record click arms event capture + video, and a single Stop
      // ends both. Without this, the video could be running while no session
      // was active — events would be dropped and reloads looked like new
      // sessions because there was never a persisted active-session id.
      setSessionLifecycleHandlers(
        () => this._startActiveSession(),
        () => this._endActiveSession(),
      );
      // Each screenshot/region capture starts a fresh session so every toolbar
      // click produces an independent ticket, not an accumulation.
      setNewCaptureHandler(() => { try { this._startActiveSession(); } catch {} });
      this.cleanups.push(mountDashboard(this.config!.toolbarPosition, this.config!.shortcuts));
    } catch (err) {
      console.warn('[TraceBug] Dashboard mount failed:', err);
    }
  }

  /** Reconnect to a live screen recording that survived a page reload.
   *  Extension transport keeps the recording in an offscreen document, so a
   *  reload doesn't kill it: ping for status, re-mount the HUD if still armed,
   *  otherwise clear a stale active-session id so the next Record starts fresh. */
  private _restoreVideoSessionOnInit(): void {
    // Ask the worker once, for both questions below. A page that just landed
    // from another site has NO state of its own — different origin, empty
    // localStorage — so the worker's notice is the only way it can know a
    // capture ended, and why.
    this._captureStatusAtInit = getCaptureStatus();
    void this._captureStatusAtInit.then((status) => {
      if (status.ended) this._showCaptureEndedNotice(captureEndedMessage(status.ended));
    }).catch(() => {});
    _wireAutoStop();
    _setAutoStopHandler((recording) => this._handleAutoStop(recording));
    // Mount the HUD the instant the offscreen doc signals capture began —
    // independent of the start RPC's return value (which can spuriously
    // report "cancelled" while recording is actually live).
    _wireStarted();
    _setStartedHandler(() => this._handleRecordingStarted());
    if (!this.config!.enableDashboard) return;

    // Snapshot the session id RESTORED at init. By the time the async offscreen
    // status ping resolves, a popup action (capture-now → startRecording) may
    // have armed a brand-new session — clearing THAT killed the live session and
    // blanked the ticket the user just asked for.
    const restoredSessionId = this.sessionId;
    _restoreVideoState().then((wasActive) => {
      if (wasActive) {
        // Real recording is in progress in the offscreen — re-mount the HUD and
        // attach the console.* wrappers so all the data flowing for the rest of
        // this session lands in the ticket.
        this._remountRecordingHud();
        this._attachConsoleCollectors();
      } else if (restoredSessionId && this.sessionId === restoredSessionId) {
        // No live offscreen recording — but WHY depends on the mode. Anything
        // that isn't explicitly "events" (i.e. "video", or a null mode from a
        // session armed before this feature shipped) is treated as a video
        // session whose tab-share died. Only an explicit "events" session resumes.
        if (getActiveCaptureMode() !== "events") {
          // A video session whose tab-share Chrome ended on navigation. Recover
          // whatever the offscreen finalized and open the ticket so the user
          // doesn't lose the recording.
          clearActiveSessionId();
          this.sessionId = null;
          this.recording = false;
          updateRecordingState(false);
          _restoreLastRecording().then((rec) => {
            if (rec) this._handleAutoStop(rec);
          }).catch(() => {});
        } else {
          // Event-only tracking (no video to die). The session ID + events
          // survived the navigation and `recording` is already true from init,
          // so the collectors keep capturing on this new page. Keep the console
          // wrappers attached, backfill the network resources this new page
          // loaded before the SDK re-injected, and refresh the toolbar's
          // "tracking" state — DON'T tear the session down.
          this._attachConsoleCollectors();
          if (this._emit) drainPerformanceNetwork(this._emit);
          updateRecordingState(true);
          // A HUD-driven events capture (the popup's Capture Bug) must get its
          // Stop control back on the new page — the HUD is the only one it has.
          // A toolbar-tracked session has no start timestamp persisted and is
          // deliberately skipped here: its ■ button is its stop control, and
          // compact-toolbar restores that itself.
          const eventsStartedAt = getEventsCaptureStartedAt();
          if (eventsStartedAt !== null) {
            // ASK FIRST. This flag lives in the page's own localStorage, which
            // is per-origin: after a cross-site move it is still sitting here,
            // on the origin the capture started on, long after the capture
            // died. Resuming on it is what produced a HUD counting up for a
            // capture that had been over for minutes, with a Stop button that
            // finalized a ticket the user had abandoned.
            //
            // The worker spans origins, so it is the authority. Anything other
            // than a confirmed "yes" clears the flag and ends the session.
            void this._resumeEventsCaptureIfLive(eventsStartedAt);
          }
        }
      }
    }).catch(() => {});
  }

  /**
   * Begin a fresh record-driven session: mints a session ID, persists it so
   * it survives page reloads, and writes the initial environment + user
   * snapshot. Idempotent — a no-op if a session is already active.
   */
  private _startActiveSession(opts?: { keepScreenshots?: boolean }): void {
    if (this.sessionId) {
      try {
        // _endActiveSession stashes the in-memory screenshots onto the
        // outgoing session so "View saved tickets" keeps its thumbnails.
        this._endActiveSession();
        // Close any open quick-bug modal so the new session can show its own
        try {
          const _tbModal = document.getElementById("tracebug-quick-bug-modal");
          if (_tbModal) {
            const _tbClose = _tbModal.querySelector('[data-action="close"]') as HTMLButtonElement | null;
            if (_tbClose) _tbClose.click();
          }
        } catch {}
      } catch {}
      // Fall through to create a fresh session below
    }
    const id = generateSessionId();
    this.sessionId = id;
    this.recording = true;
    setActiveSessionId(id);
    // Default arming is event-only capture. If a screen recording starts for
    // this session, the video path upgrades this to "video". The mode is what
    // lets a page navigation resume event capture instead of tearing it down.
    setActiveCaptureMode("events");

    // Persist the session record immediately into the shared cache so
    // getAllSessions() returns it even before the first event fires.
    // Using getCachedSessions() keeps us on the same array the pending-flush
    // will write — avoids stale-cache overwrite when _endActiveSession() was
    // just called above (which flushes but does NOT null the cache).
    {
      const sess = getCachedSessions();
      if (!sess.find(s => s.sessionId === id)) {
        sess.push({
          sessionId: id,
          projectId: this.config!.projectId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          errorMessage: null,
          errorStack: null,
          reproSteps: null,
          errorSummary: null,
          events: [],
          annotations: [],
          environment: null,
        });
        scheduleFlush();
      }
    }

    // Trim old sessions, but NEVER drop ones the user explicitly saved.
    // Keep: every saved ticket (bounded to 20 so localStorage can't balloon)
    // + the 2 most recent unsaved working sessions (current + previous).
    // Without the saved-guard, saving a ticket then capturing twice more would
    // silently purge the saved ticket — breaking the Saved Tickets list.
    // Note: _lastRecording is NOT cleared — the session time check in _openModal
    // prevents video bleed without triggering the slow restoreLastRecordingFromOffscreen RPC.
    {
      const all = getCachedSessions();
      const savedKept = all
        .filter(s => s.saved)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 20);
      const unsavedKept = all
        .filter(s => !s.saved)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 2);
      const kept = [...savedKept, ...unsavedKept];
      if (kept.length < all.length) {
        all.splice(0, all.length, ...kept);
        scheduleFlush();
      }
    }

    // Drop the previous session's in-memory screenshots so they don't bleed
    // into this ticket. Clearing at session START (not end) is intentional —
    // stopRecording() opens the ticket-review modal, which still needs the
    // screenshots until the user explicitly starts a new session.
    // keepScreenshots: quickCapture arms a session AFTER the extension popup
    // already captured a shot for this very ticket — wiping it here was the
    // "blank ticket" bug.
    if (!opts?.keepScreenshots) clearScreenshots();

    // Install console.* wrappers now that the user has explicitly armed a
    // session. These add a frame to every console call's stack trace, so we
    // keep them lazy — gone the moment the session ends.
    this._attachConsoleCollectors();

    // Backfill: pull every resource the browser has recorded so far into
    // the fresh session. Catches API calls, fonts, images, scripts that
    // happened before the user clicked Capture Bug — including ones our
    // fetch/XHR wraps missed because libs cached references to the
    // originals. Without this, lazy-injected SDKs miss the entire page
    // load.
    //
    // resetPerformanceSeen() first: the drain that ran when collectors
    // attached marked every page-load entry as seen while `recording` was
    // still false, so its emits were dropped AND this drain then skipped
    // them — the page load vanished from every extension capture, which
    // always injects late. Passing captureStartedAt keeps the rule honest in
    // the other direction: only pre-capture requests that FAILED or were slow
    // come through, marked `phase: "page-load"`.
    if (this._emit) {
      resetPerformanceSeen();
      drainPerformanceNetwork(this._emit, { captureStartedAt: Date.now() });
    }

    // Capture environment + user once at session start so the report has
    // them even if the user reloads several times before stopping.
    try {
      const env = captureEnvironment();
      saveEnvironment(id, env);
    } catch {}
    try {
      const storedUser = localStorage.getItem("tracebug_user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        const sessions = getAllSessions();
        const session = sessions.find(s => s.sessionId === id);
        if (session) {
          session.user = user;
          localStorage.setItem("tracebug_sessions", JSON.stringify(sessions));
        }
      }
    } catch {}

    updateRecordingState(true);
    emitHook("session:start", id);
    console.info(`[TraceBug] Session started: ${id}`);
  }

  /**
   * Finalize the active session: flush pending events, drop the persisted
   * active-session flag, and stop capture. Returns the ID that was active
   * (or null if nothing was running) so callers can reference it.
   */
  private _endActiveSession(): string | null {
    if (!this.sessionId) {
      this.recording = false;
      this._detachConsoleCollectors();
      return null;
    }
    const id = this.sessionId;
    // Persist the in-memory screenshots onto the session record before it
    // ends — they're what Saved Tickets thumbnails and "View ticket" render.
    // Stashing only when the NEXT session started (the old behavior) lost
    // them whenever the SDK was torn down in between (extension ✕ → destroy),
    // and let orphaned shots get attributed to a later, unrelated session.
    try {
      const shots = getScreenshots();
      if (shots.length > 0) {
        const sess = getCachedSessions().find(s => s.sessionId === id);
        if (sess) sess.screenshots = shots.slice(0, 5);
      }
    } catch {}
    flushPendingEvents();
    clearActiveSessionId();
    this.sessionId = null;
    this.recording = false;
    updateRecordingState(false);
    // Restore console.* to its original — eliminates stack-trace pollution
    // for any app code that calls console.error/warn/log after this point.
    this._detachConsoleCollectors();
    emitHook("session:end", id);
    console.info(`[TraceBug] Session ended: ${id}`);
    return id;
  }

  /** Install the console.* wrappers for the active session. Idempotent. */
  private _attachConsoleCollectors(): void {
    if (this._consoleCleanups.length > 0) return; // already attached
    if (!this._emit) return;
    if (this._consoleLevel === "none") return;
    this._consoleCleanups.push(collectConsoleErrors(this._emit));
    if (this._consoleLevel === "warnings" || this._consoleLevel === "all") {
      this._consoleCleanups.push(collectConsoleWarnings(this._emit));
      this._consoleCleanups.push(collectConsoleInfo(this._emit));
    }
    if (this._consoleLevel === "all") {
      this._consoleCleanups.push(collectConsoleLogs(this._emit));
    }
  }

  /** Remove console.* wrappers, restoring the originals. */
  private _detachConsoleCollectors(): void {
    while (this._consoleCleanups.length > 0) {
      const fn = this._consoleCleanups.pop();
      try { if (fn) fn(); } catch {}
    }
  }

  /** Pause recording — events will not be captured until resumed */
  pauseRecording(): void {
    this.recording = false;
    updateRecordingState(false);
    console.info("[TraceBug] Recording paused.");
  }

  /** Resume recording — always starts a fresh session (saves the previous one first). */
  resumeRecording(): void {
    this._startActiveSession();
  }

  /** Alias for resumeRecording — matches the start/stop mental model */
  startRecording(): void {
    this.resumeRecording();
  }

  /**
   * Stop the active session and open the ticket-review modal so the user
   * can review captured steps + screenshots and then export.
   */
  stopRecording(): void {
    this._endActiveSession();
    if (!this.config?.enableDashboard) return;
    const root = document.getElementById("tracebug-root");
    if (!root) return;
    import("./ui/quick-bug")
      .then((m) => m.showQuickBugCapture(root))
      .catch((err) => console.warn("[TraceBug] Failed to open ticket review:", err));
  }

  /** Check if currently recording */
  isRecording(): boolean {
    return this.recording;
  }

  /** Get current session ID */
  getSessionId(): string | null {
    return this.sessionId;
  }

  // ── Screenshot ──────────────────────────────────────────────────────

  /**
   * Free-plan check: returns true if another screenshot can be added. When
   * the limit is reached, fires the upgrade modal and returns false. Premium
   * always returns true.
   */
  private _checkScreenshotLimit(): boolean {
    // Screenshots are local capture — never plan-gated (pricing boundary:
    // local free forever, cloud collaboration paid). The in-memory ring
    // buffer cap in screenshot.ts is the only limit.
    return true;
  }

  /** Capture a screenshot of the current page */
  async takeScreenshot(): Promise<ScreenshotData | null> {
    if (!this._checkScreenshotLimit()) return null;

    // Screenshots live in a global store and must work even when no recording
    // session is active yet (e.g. the extension "Screenshot only" flow, where
    // this.sessionId was set at init before any session existed). Resolve the
    // session only for context-aware filenames — never block capture on it.
    const sid = this.sessionId || getActiveSessionId();
    const session = sid ? getAllSessions().find(s => s.sessionId === sid) : null;
    const lastEvent = session?.events[session.events.length - 1] || null;

    const screenshot = await captureScreenshot(lastEvent);
    console.info(`[TraceBug] Screenshot captured: ${screenshot.filename}`);
    return screenshot;
  }

  /**
   * Snipping-tool style screenshot: shows a fullscreen overlay, user drags
   * to select a region, returns the cropped image. Resolves to null if the
   * user presses Esc or selects a region smaller than 5x5 pixels.
   */
  async takeRegionScreenshot(): Promise<ScreenshotData | null> {
    if (!this.sessionId) return null;
    if (!this._checkScreenshotLimit()) return null;
    const screenshot = await captureRegionScreenshot();
    if (screenshot) {
      console.info(`[TraceBug] Region screenshot captured: ${screenshot.filename}`);
    }
    return screenshot;
  }

  /** Get all screenshots from current session */
  getScreenshots(): ScreenshotData[] {
    return getScreenshots();
  }

  /** Local storage-pressure counters (near-full warnings, refused writes,
   *  evictions, screenshot-dropping saves). Local-only diagnostics, never
   *  transmitted — paste the output into a GitHub issue when reporting
   *  storage problems. */
  getStorageStats(): StorageStats {
    return getStorageStats();
  }

  // ── Quick Bug Capture ───────────────────────────────────────────────

  /**
   * One-shot bug capture: takes screenshot with annotations, opens a modal
   * with auto-filled title + description + screenshot, and 1-click copy
   * actions (GitHub / Jira / Plain Text). Keyboard: Ctrl+Shift+B.
   *
   *   TraceBug.quickCapture();
   */
  async quickCapture(): Promise<void> {
    const root = document.getElementById("tracebug-root");
    if (!root) {
      console.warn("[TraceBug] quickCapture requires the dashboard to be mounted.");
      return;
    }
    // Open the modal for the CURRENT session. Do NOT start a fresh session here —
    // the capture actions (startRecording / takeScreenshot / toolbar buttons)
    // already arm a new session before this runs. If somehow none exists
    // (quickCapture called alone, or the init-restore path cleared the armed
    // session between capture and here), arm one but KEEP the in-memory
    // screenshots — they belong to this very ticket, and wiping them was the
    // "blank ticket" bug in the extension popup flow.
    if (!this.sessionId) this._startActiveSession({ keepScreenshots: true });
    const { showQuickBugCapture } = await import("./ui/quick-bug");
    return showQuickBugCapture(root);
  }

  /**
   * Open the cloud dashboard in a new tab — where a signed-in user sees all
   * the bug tickets shared from their account. If they aren't signed in, the
   * dashboard prompts for login. Uses the configured cloudEndpoint.
   */
  openCloudDashboard(): void {
    if (typeof window === "undefined") return;
    const base = resolveCloudEndpoint(this.config?.cloudEndpoint);
    window.open(`${base}/dashboard`, "_blank", "noopener");
  }

  // ── Annotations ─────────────────────────────────────────────────────

  /** Add a tester note/annotation to the current session */
  addNote(options: {
    text: string;
    expected?: string;
    actual?: string;
    severity?: Annotation["severity"];
    screenshotId?: string;
  }): void {
    if (!this.sessionId) return;

    const annotation: Annotation = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      text: options.text,
      expected: options.expected,
      actual: options.actual,
      severity: options.severity || "info",
      screenshotId: options.screenshotId,
    };

    addAnnotation(this.sessionId, annotation);
    console.info(`[TraceBug] Note added: "${options.text}"`);
  }

  // ── Voice Recording ─────────────────────────────────────────────────

  /** Check if voice recording is supported */
  isVoiceSupported(): boolean {
    return isVoiceSupported();
  }

  /** Start voice recording for bug description */
  startVoiceRecording(options?: {
    onUpdate?: (text: string, interim: string) => void;
    onStatus?: (status: "recording" | "stopped" | "error", message?: string) => void;
  }): boolean {
    return startVoiceRecording(options);
  }

  /** Stop voice recording and return transcript */
  stopVoiceRecording() {
    return stopVoiceRecording();
  }

  /** Check if voice is currently recording */
  isVoiceRecording(): boolean {
    return isVoiceRecording();
  }

  /** Get all voice transcripts */
  getVoiceTranscripts() {
    return getVoiceTranscripts();
  }

  // ── Video Recording ────────────────────────────────────────────────

  /** Check if screen recording is supported (getDisplayMedia + MediaRecorder). */
  isVideoSupported(): boolean {
    return _isVideoSupported();
  }

  /** True while a screen recording is in progress. */
  isVideoRecording(): boolean {
    return _isVideoRecording();
  }

  /**
   * Start a screen recording. Opens the browser's screen-picker dialog so the
   * user can choose a screen, window, or tab. Resolves to true if recording
   * started; false if the user cancelled or the browser refused.
   *
   * Default mode is "rolling" (Sentry mode): the same arm session can be
   * snapshotted into multiple bug tickets via captureRollingBuffer() — the
   * recorder keeps running between captures.
   *
   * While recording, a floating HUD lets the QA tester add timestamped
   * comments without breaking flow. Comments are synced to video time and
   * attached to the bug report.
   */
  /**
   * Pre-capture flow: optionally let the user BLUR sensitive areas first
   * (the blur is real backdrop blur — the redacted pixels are what the
   * recording captures, and the element's text is masked in the DOM replay),
   * then an optional 3-2-1 countdown, then capture.
   *
   * `video` decides which capture runs. It defaults to FALSE (Phase 4): the
   * popup's Capture Bug no longer opens a screen-share picker unless the user
   * has turned video on, so a first capture needs no OS dialog at all.
   */
  prepareRecording(opts: {
    blurFirst?: boolean;
    delaySec?: number;
    withMicrophone?: boolean;
    surfaceMode?: "tab" | "desktop";
    video?: boolean;
  } = {}): void {
    const begin = () => {
      const go = () => {
        // A stored `video: true` must not start a recording in 1.11 - an
        // updater was seeded exactly that. The preference is left alone in
        // storage so 1.11.2 can honour it again; it is simply not acted on.
        if (!opts.video || !isVideoOffered()) {
          void this.startEventsCapture();
          return;
        }
        void this.startVideoRecording({
          withMicrophone: !!opts.withMicrophone,
          surfaceMode: opts.surfaceMode,
        });
      };
      const d = Number(opts.delaySec) || 0;
      // Esc during the countdown cancels the whole flow — no recording starts.
      if (d > 0) void runRecordCountdown(d).then((completed) => { if (completed) go(); });
      else go();
    };
    if (opts.blurFirst) startBlurThenRecord({ onStart: begin });
    else begin();
  }

  /** What this capture has recorded so far, for the HUD's live tally. Read
   *  from the cached session array, not localStorage — this is polled twice a
   *  second and must never touch the disk-backed blob.
   *
   *  "Requests" are network rows; "events" is everything else the user can
   *  recognise — their own clicks and typing, route changes, console errors. */
  private _captureCounts(): { events: number; requests: number } {
    const id = this.sessionId;
    if (!id) return { events: 0, requests: 0 };
    try {
      const session = getCachedSessions().find(s => s.sessionId === id);
      const all = session?.events || [];
      // Polled twice a second, so recompute only when something arrived.
      if (this._countsCache && this._countsCache.id === id && this._countsCache.len === all.length) {
        return this._countsCache.counts;
      }
      let events = 0;
      const rows: { url: string; duration: number; timestamp: number; source?: string; initiatorType?: string; startedAt?: number }[] = [];
      for (const e of all) {
        if (e.type !== "api_request") { events++; continue; }
        const r = e.data.request;
        rows.push({
          url: r?.url || "",
          duration: r?.durationMs || 0,
          timestamp: e.timestamp,
          source: r?.source as string | undefined,
          initiatorType: r?.initiatorType as string | undefined,
          startedAt: r?.startedAt as number | undefined,
        });
      }
      // The SAME dedupe the ticket will apply. Counting raw rows here showed
      // "2 requests" for one fetch — the wrapper's row and Resource Timing's
      // twin — and then the ticket showed one. A live tally that disagrees
      // with the report it is previewing is worse than no tally.
      const base = typeof location !== "undefined" ? location.href : undefined;
      const counts = { events, requests: dedupeNetworkRows(rows, { baseUrl: base }).length };
      this._countsCache = { id, len: all.length, counts };
      return counts;
    } catch { /* a tally is never worth throwing over */ }
    return { events: 0, requests: 0 };
  }

  /**
   * Resume a HUD-driven events capture only if the worker says it is still
   * running. Called with the start timestamp this origin has persisted.
   *
   * The three outcomes:
   *   • running      — re-arm rrweb and re-mount the HUD (the old behaviour).
   *   • not running  — a stale flag. Clear it, end the session, no HUD. The
   *                    events already captured stay in storage: the user can
   *                    still open the ticket, they just are not accumulating.
   *   • ended notice — the same, plus a sentence naming the site they left.
   */
  private async _resumeEventsCaptureIfLive(eventsStartedAt: number): Promise<void> {
    const status = await (this._captureStatusAtInit ?? getCaptureStatus());
    if (!status.running) {
      this._discardStaleCapture(status.ended ? captureEndedMessage(status.ended) : null);
      return;
    }
    this._eventsCaptureStartedAt = eventsStartedAt;
    // rrweb observers died with the previous document, so restart them.
    // The replay therefore covers the page the capture ENDS on, not
    // every page crossed — the console/network/action timeline spans
    // them all, the DOM replay does not.
    void startDomRecording();
    const hudRoot = document.getElementById("tracebug-root");
    if (hudRoot) {
      showRecordingHUD(hudRoot, {
        mode: "events",
        startedAt: eventsStartedAt,
        onStop: () => { this.stopEventsCapture().catch(() => {}); },
        getCounts: () => this._captureCounts(),
      });
    }
  }

  /** Drop a capture the worker no longer recognises: clear the per-origin
   *  flags so it cannot be resurrected again, end the session, and say why if
   *  we were told. */
  private _discardStaleCapture(message: string | null): void {
    try { clearEventsCaptureStartedAt(); } catch {}
    this._eventsCaptureStartedAt = null;
    try { this._endActiveSession(); } catch {}
    updateRecordingState(false);
    hideRecordingHUD();
    if (message) this._showCaptureEndedNotice(message);
  }

  /** Surface a capture-ended sentence, with the toolbar as the fallback when
   *  the toast surface is not mounted. Never throws: a notice is not worth
   *  failing an init over. */
  private _showCaptureEndedNotice(message: string): void {
    if (this._captureNoticeShown) return;
    this._captureNoticeShown = true;
    try {
      const root = document.getElementById("tracebug-root");
      if (root) showActionToast(message, "", () => {}, root, { autoDismissMs: 10_000 });
      else console.info("[TraceBug] " + message);
    } catch { /* a notice must never break the page */ }
  }

  /**
   * Start an events-only capture: console, network, clicks and keystrokes, plus
   * an interactive DOM replay — and no screen share, so no picker and no OS
   * permission. This is the popup's default capture since Phase 4.
   *
   * The session is armed in "events" mode, which is what lets it SURVIVE a
   * navigation: `_restoreVideoSessionOnInit` resumes an "events" session on the
   * next page instead of finalizing it (whereas a video session whose tab-share
   * the browser killed has to be finalized).
   *
   * Returns false only when there is no dashboard root to mount the HUD into —
   * without a Stop control the user would have no way to end the capture.
   */
  async startEventsCapture(): Promise<boolean> {
    const root = document.getElementById("tracebug-root");
    if (!root) {
      console.warn("[TraceBug] Events capture needs the dashboard mounted (no #tracebug-root)");
      return false;
    }
    // Same ordering as the video path: end any stale session first so events
    // don't get appended to hours-old data, then arm a fresh one.
    try { this._endActiveSession(); } catch {}
    // Clear a previous capture's replay so a stop that produces nothing can't
    // hand the last capture's DOM stream to this ticket.
    try { clearStashedDomReplay(); } catch {}
    try { this._startActiveSession(); } catch {}
    this._eventsCaptureStartedAt = Date.now();
    // Persisted so a navigation mid-capture re-mounts the HUD (and only for a
    // HUD-driven capture — the toolbar's track button owns its own stop).
    try { setEventsCaptureStartedAt(this._eventsCaptureStartedAt); } catch {}
    // Tell the worker this tab is capturing, and on which origin. From here
    // the WORKER decides whether a capture is running — page storage is
    // per-origin and cannot answer that after a cross-site move.
    void announceCaptureStarted(this._eventsCaptureStartedAt);
    // Best-effort: rrweb may be unavailable (import failure). The capture is
    // still worth having without the replay — console, network and actions are
    // the bulk of a bug report.
    void startDomRecording();
    this._attachConsoleCollectors();
    showRecordingHUD(root, {
      mode: "events",
      startedAt: this._eventsCaptureStartedAt,
      onStop: () => { this.stopEventsCapture().catch(() => {}); },
      getCounts: () => this._captureCounts(),
    });
    // Say what this capture cannot show, NOW, while the user can still do
    // something about it — see src/replay-fidelity.ts. Two gaps qualify:
    // canvas content (not recorded, by choice) and anything inside an embedded
    // frame (not captured at all in 1.11.x, by choice — see §2.2 of the
    // capture audit). Canvas wins when both are true: it is the one the user
    // can fix with video once that returns.
    //
    // The capture is already running, so this never blocks it, and a failure
    // here must not take the capture down with it.
    try {
      const warning = eventsCaptureFidelityWarning() || framesCaptureWarning();
      if (warning) {
        showActionToast(warning.message, "Stop", () => {
          this.stopEventsCapture().catch(() => {});
        }, root, { autoDismissMs: 12_000 });
      }
    } catch { /* a warning is never worth failing a capture over */ }
    return true;
  }

  /**
   * Stop an events-only capture, stash its DOM replay for the report, and open
   * the ticket modal. Mirrors `stopVideoRecording`: the user clicked Stop, so
   * the ticket opens even if the replay came back empty.
   */
  async stopEventsCapture(): Promise<void> {
    // Prefer the persisted start: a capture that crossed a navigation has a
    // real start time there and only a per-page one in memory.
    const startedAt = getEventsCaptureStartedAt() ?? this._eventsCaptureStartedAt;
    this._eventsCaptureStartedAt = null;
    // Clear before _endActiveSession so an exception in the stash below can't
    // leave the flag behind and re-mount a HUD for a session that has ended.
    try { clearEventsCaptureStartedAt(); } catch {}
    void announceCaptureStopped();
    try {
      const events = stopDomRecording();
      if (startedAt !== null) stashDomReplay(events, startedAt, Date.now() - startedAt);
    } catch (err) {
      console.warn("[TraceBug] Failed to collect the DOM replay:", err);
    }
    hideRecordingHUD();
    try { this._endActiveSession(); } catch {}
    if (!this.config?.enableDashboard) return;
    const root = document.getElementById("tracebug-root");
    if (!root) return;
    try {
      const m = await import("./ui/quick-bug");
      if (!m.isQuickBugOpen()) await m.showQuickBugCapture(root);
    } catch (err) {
      console.warn("[TraceBug] Failed to open the ticket after an events capture:", err);
    }
  }

  /**
   * The OS refused screen capture. Show the instruction, and offer the capture
   * the user was actually after — events only. Needs the dashboard root; with
   * no root there is nowhere to render, so the console is the last resort.
   */
  private _reportCaptureBlocked(message: string): void {
    const root = document.getElementById("tracebug-root");
    if (!root) {
      console.warn("[TraceBug] " + message);
      return;
    }
    showCaptureBlockedNotice(message, root, () => { void this.startEventsCapture(); });
  }

  async startVideoRecording(options?: {
    mode?: "rolling" | "standard";
    surfaceMode?: "tab" | "desktop";
    withMicrophone?: boolean;
    onStatus?: (status: "recording" | "stopped" | "error" | "warning" | "blocked", message?: string) => void;
  }): Promise<boolean> {
    // End any stale active session before starting a fresh one. Without this
    // a session id from a previous (abandoned) recording would be restored
    // by init() and new events would be appended to hours-old data —
    // exactly the "old session, no console, no network" bug we saw.
    try { this._endActiveSession(); } catch {}

    // Arm the session BEFORE awaiting the screen picker so session.createdAt
    // is <= recording.startedAt. The time-guard in _openModal uses this
    // ordering to verify the video belongs to this session (prevents an old
    // recording from bleeding into a new screenshot-only ticket).
    try { this._startActiveSession(); } catch {}

    let blockedMessage: string | null = null;
    const ok = await _startVideoRecording({
      mode: options?.mode ?? "rolling",
      surfaceMode: options?.surfaceMode,
      withMicrophone: options?.withMicrophone,
      // The popup's Capture Bug reaches here through prepareRecording(), which
      // passes NO onStatus — so until Phase 4 a recording the operating system
      // refused failed completely silently on that path: no picker, no toast,
      // no capture, nothing in the UI at all. Capture the message here and
      // surface it below once the session has been cleaned up, while still
      // letting an explicit caller (the toolbar) handle its own reporting.
      onStatus: (status, message) => {
        if (status === "blocked" && message) blockedMessage = message;
        options?.onStatus?.(status, message);
      },
    });
    if (!ok) {
      // User cancelled the screen picker — discard the empty session
      try { this._endActiveSession(); } catch {}
      // The extension already marked this tab as capturing the moment the
      // popup's click dispatched TB_START_RECORDING (background.js's
      // handleComboAction, optimistic — it has to set the REC badge before
      // knowing whether the picker will succeed). Nothing on this failure
      // path told it the picker was cancelled, so without this the REC badge
      // stayed on and the popup kept reporting "already capturing" forever,
      // pointing at an on-page HUD that was never mounted — there was nothing
      // left to stop it with short of reloading the tab.
      void announceCaptureStopped();
      // Only report it ourselves if the caller isn't already doing so.
      if (blockedMessage && !options?.onStatus) this._reportCaptureBlocked(blockedMessage);
      return false;
    }

    const root = document.getElementById("tracebug-root");
    if (root) {
      showRecordingHUD(root, {
        onStop: () => { this.stopVideoRecording().catch(() => {}); },
      });
    }
    return true;
  }

  /**
   * Stop the screen recording, hide the HUD, and open the Quick Bug ticket
   * modal so the user can review + export immediately. Resolves to the
   * recording metadata, or null if no recording was active.
   *
   * The ticket modal opens on every stop — even when rolling captures were
   * already filed during the session, and even when `_stopVideoRecording`
   * returns null (RPC hiccup, bfcache, offscreen torn down early). The user
   * always sees their capture context.
   */
  async stopVideoRecording(): Promise<VideoRecording | null> {
    let recording: VideoRecording | null = null;
    try { recording = await _stopVideoRecording(); } catch (err) {
      console.warn("[TraceBug] stop RPC failed, opening ticket modal anyway:", err);
    }
    // Tell the worker this tab is no longer capturing — see the matching
    // comment in _handleRecordingStarted(). Without this a video capture's
    // REC badge stayed stuck forever: only an events capture ever announced
    // its own stop.
    void announceCaptureStopped();
    hideRecordingHUD();
    // End the event session if one is active so events stop flowing.
    try { this._endActiveSession(); } catch {}
    // Always open the ticket modal — user clicked Stop, user expects to see
    // a ticket. Even if the recording payload is null, the modal still shows
    // screenshots, console errors, network requests, and action chips from
    // the session.
    if (this.config?.enableDashboard) {
      const root = document.getElementById("tracebug-root");
      if (root) {
        try {
          const m = await import("./ui/quick-bug");
          if (!m.isQuickBugOpen()) await m.showQuickBugCapture(root);
        } catch (err) {
          console.warn("[TraceBug] Failed to open ticket review after recording:", err);
        }
      }
    }
    return recording;
  }

  /**
   * Snapshot the in-flight rolling recording into a finished VideoRecording
   * and open the ticket modal — the screen share keeps running so the same
   * armed session can produce more tickets. Resolves to null if no rolling
   * recording is active.
   */
  async captureRollingBuffer(): Promise<VideoRecording | null> {
    const recording = await _captureRollingBuffer();
    if (!recording) return null;
    flashRecordingHUD();
    if (this.config?.enableDashboard) {
      const root = document.getElementById("tracebug-root");
      if (root) {
        try {
          const m = await import("./ui/quick-bug");
          await m.showQuickBugCapture(root);
        } catch (err) {
          console.warn("[TraceBug] Failed to open ticket modal after capture:", err);
        }
      }
    }
    return recording;
  }

  /** True if the active recording is in rolling/Sentry mode. */
  isRollingMode(): boolean {
    return _isRollingMode();
  }

  /** Number of captures taken from the current rolling session. */
  getCaptureCount(): number {
    return _getCaptureCount();
  }

  /** Get the most recently captured screen recording (or null). */
  getLastVideoRecording(): VideoRecording | null {
    return getLastVideoRecording();
  }

  // ── Report Generation ───────────────────────────────────────────────

  // PRICING BOUNDARY (committed publicly on the pricing page and GitHub):
  // local capture and export are free forever — console/network data, PDF,
  // Jira formatting, and screenshots are NEVER plan-gated. The only paid
  // line is cloud collaboration (share links, team workspaces). The old
  // _redactForFreePlan (which stripped console/network errors from free
  // exports) is gone: it would have violated that promise the day plans
  // went live.

  /**
   * Branding prefix for export markdown. Premium + companyName configured →
   * a one-line attribution header. Free or no companyName → empty string.
   */
  private _brandingPrefix(): string {
    if (!isPremium()) return "";
    const name = this.config?.companyName?.trim();
    if (!name) return "";
    return `> _Reported via TraceBug — ${name}_\n\n`;
  }

  // ── Plan (Freemium) ─────────────────────────────────────────────────

  /** Get the current plan: "free" or "premium". */
  getPlan(): Plan {
    return getPlan();
  }

  /** Convenience: returns true if the user is on the premium plan. */
  isPremium(): boolean {
    return isPremium();
  }

  /**
   * Set the plan. Used by the in-modal dev toggle and (future) upgrade
   * flow. Persists to chrome.storage.local + localStorage.
   */
  setPlan(plan: Plan): Promise<void> {
    return setPlan(plan);
  }

  /** Generate a complete bug report for the current session */
  generateReport(): BugReport | null {
    if (!this.sessionId) return null;

    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return null;

    const report = buildReport(session);
    // Honor opt-out: drop the Web Storage snapshot when disabled.
    if (this.config?.captureStorage === false) delete report.storage;
    return report;
  }

  /**
   * Set the tester-assigned priority for the current session's report.
   * Persists across reloads. No-op if there's no active session.
   */
  setPriority(priority: BugPriority): void {
    if (!this.sessionId) return;
    setSessionPriority(this.sessionId, priority);
  }

  /** Generate GitHub issue markdown (free + premium). */
  getGitHubIssue(): string | null {
    const report = this.generateReport();
    if (!report) return null;
    return this._brandingPrefix() + generateGitHubIssue(report);
  }

  /**
   * Generate Jira ticket payload. Free — Jira formatting is local capture
   * output, which is never plan-gated (see the pricing-boundary note above).
   */
  getJiraTicket() {
    const report = this.generateReport();
    if (!report) return null;
    const ticket = generateJiraTicket(report);
    const prefix = this._brandingPrefix();
    if (prefix) ticket.description = prefix + ticket.description;
    return ticket;
  }

  /**
   * Open the magic-link sign-in flow for cloud sharing. Returns the user
   * object once authenticated, or throws on timeout/cancel.
   * Free, no plan gate.
   */
  async signIn() {
    const ep = resolveCloudEndpoint(this.config?.cloudEndpoint);
    return getBridge(ep).signIn();
  }

  /** Sign out of the cloud account (does not affect local capture). */
  async signOut(): Promise<void> {
    const ep = resolveCloudEndpoint(this.config?.cloudEndpoint);
    await getBridge(ep).signOut();
  }

  /** Current cloud user, or null if not signed in. */
  async getCurrentUser() {
    const ep = resolveCloudEndpoint(this.config?.cloudEndpoint);
    const r = await getBridge(ep).checkAuth();
    return r.user;
  }

  /** Current cloud quotas (video + screenshot share counts). */
  async getCloudQuotas() {
    const ep = resolveCloudEndpoint(this.config?.cloudEndpoint);
    return getBridge(ep).getQuotas();
  }

  /**
   * Upload the current session as a shareable link. Prompts sign-in if the
   * user isn't authenticated. Returns the public URL.
   *
   * Local capture, .html download, GitHub/Linear/Slack export are unaffected
   * by this call — sharing to cloud is purely additive.
   */
  async shareReport(options?: ShareReportOptions): Promise<ShareLinkResult> {
    const ep = resolveCloudEndpoint(options?.cloudEndpoint || this.config?.cloudEndpoint);
    const bridge = getBridge(ep);
    const auth = await bridge.checkAuth();
    if (!auth.authed) await bridge.signIn();

    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId) || sessions[0];
    if (!session) throw new Error("no_session_to_share");
    const report = buildReport(session);
    return shareSessionAsLink(session, report, { ...options, cloudEndpoint: ep });
  }

  /**
   * Download a PDF bug report. Free — local export is never plan-gated
   * (see the pricing-boundary note above).
   */
  downloadPdf(): void {
    const report = this.generateReport();
    if (!report) {
      console.warn("[TraceBug] No session data to generate PDF.");
      return;
    }
    generatePdfReport(report);
  }

  /** Get auto-generated bug title */
  getBugTitle(): string | null {
    if (!this.sessionId) return null;
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return null;
    return generateBugTitle(session);
  }

  /** Get environment info */
  getEnvironment(): EnvironmentInfo {
    return captureEnvironment();
  }

  // ── Element Annotate Mode ────────────────────────────────────────────

  /** Activate element annotate mode — click elements to attach feedback */
  activateAnnotateMode(): void {
    const root = document.getElementById("tracebug-root");
    if (root) activateElementAnnotateMode(root);
  }

  /** Deactivate element annotate mode */
  deactivateAnnotateMode(): void {
    deactivateElementAnnotateMode();
  }

  /** Check if element annotate mode is active */
  isAnnotateModeActive(): boolean {
    return isElementAnnotateActive();
  }

  // ── Draw Mode ──────────────────────────────────────────────────────

  /** Activate draw mode — draw rectangles/ellipses on the live page */
  activateDrawMode(): void {
    const root = document.getElementById("tracebug-root");
    if (root) activateDrawMode(root);
  }

  /** Deactivate draw mode */
  deactivateDrawMode(): void {
    deactivateDrawMode();
  }

  /** Check if draw mode is active */
  isDrawModeActive(): boolean {
    return isDrawModeActive();
  }

  // ── Inspect mode ───────────────────────────────────────────────────

  /** Activate inspect mode — hover shows the box model + computed-style
   *  summary; click attaches the element's style evidence to the report. */
  activateInspectMode(): void {
    // Modes are mutually exclusive — same rule as annotate vs draw.
    deactivateElementAnnotateMode();
    deactivateDrawMode();
    activateInspectMode();
  }

  /** Deactivate inspect mode */
  deactivateInspectMode(): void {
    deactivateInspectMode();
  }

  /** Check if inspect mode is active */
  isInspectModeActive(): boolean {
    return isInspectModeActive();
  }

  // ── UI Annotations ─────────────────────────────────────────────────

  /** Get complete annotation report (element annotations + draw regions) */
  getAnnotationReport(): UIAnnotationReport {
    return getAnnotationReport();
  }

  /** Export annotations as JSON string */
  exportAnnotationsJSON(): string {
    return exportAnnotationsJSON();
  }

  /** Export annotations as Markdown string */
  exportAnnotationsMarkdown(): string {
    return exportAnnotationsMD();
  }

  /** Copy annotations to clipboard */
  async copyAnnotationsToClipboard(format: "json" | "markdown"): Promise<boolean> {
    return copyAnnotationsToClipboard(format);
  }

  /** Clear all UI annotations */
  clearAnnotations(): void {
    clearAllAnnotations();
  }

  // ── Plugin System ──────────────────────────────────────────────────

  /** Register a plugin */
  use(plugin: TraceBugPlugin): void {
    registerPlugin(plugin);
  }

  /** Unregister a plugin by name */
  removePlugin(name: string): void {
    unregisterPlugin(name);
  }

  /** Subscribe to a hook event. Returns unsubscribe function. */
  on(event: string, callback: Parameters<typeof onHook>[1]): () => void {
    return onHook(event as Parameters<typeof onHook>[0], callback);
  }

  // ── CI/CD Helpers ─────────────────────────────────────────────────

  /** Get error count for the current session (useful for CI assertions) */
  getErrorCount(): number {
    if (!this.sessionId) return 0;
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return 0;
    return session.events.filter(e =>
      e.type === "error" || e.type === "unhandled_rejection"
    ).length;
  }

  /** Export current session as JSON (for CI artifact upload) */
  exportSessionJSON(): string | null {
    if (!this.sessionId) return null;
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return null;
    return JSON.stringify(session, null, 2);
  }

  /** Flag the current session as a bug */
  markAsBug(): void {
    if (!this.sessionId) return;
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (session) {
      session.isBug = true;
      // Persist by re-saving
      try {
        const key = "tracebug_sessions";
        localStorage.setItem(key, JSON.stringify(sessions));
      } catch {}
    }
  }

  /**
   * Get a compact 2-3 sentence summary for Slack/Teams.
   * Example: "Bug on /vendor — TypeError: Cannot read 'status' after clicking Edit → selecting Inactive → clicking Update. Chrome 121, Windows 11."
   */
  getCompactReport(): string | null {
    if (!this.sessionId) return null;
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return null;

    const page = session.events[0]?.page || "/";
    const error = session.errorMessage || "no errors";
    const env = session.environment;
    const browser = env ? `${env.browser} ${env.browserVersion}` : "Unknown browser";
    const os = env ? env.os : "Unknown OS";

    // Build short flow from last ~5 user actions
    const actions = session.events
      .filter(e => ["click", "input", "select_change", "form_submit"].includes(e.type))
      .slice(-5)
      .map(e => {
        if (e.type === "click") return `clicking ${e.data.element?.text?.slice(0, 30) || e.data.element?.tag || "element"}`;
        if (e.type === "input") return `typing in ${e.data.element?.name || "field"}`;
        if (e.type === "select_change") return `selecting "${e.data.element?.selectedText?.slice(0, 20) || "option"}"`;
        if (e.type === "form_submit") return `submitting form`;
        return e.type;
      });

    const flow = actions.length > 0 ? ` after ${actions.join(" \u2192 ")}` : "";
    const failedApis = session.events
      .filter(e => e.type === "api_request" && (e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0))
      .slice(0, 1)
      .map(e => `${e.data.request?.method} ${e.data.request?.url?.split("?")[0]?.slice(-40)} returned ${e.data.request?.statusCode}`);

    const apiNote = failedApis.length > 0 ? ` ${failedApis[0]}.` : "";

    return `Bug on ${page} \u2014 ${error}${flow}.${apiNote} ${browser}, ${os}.`;
  }

  // ── Developer Breadcrumbs API ───────────────────────────────────────

  /**
   * Drop a labeled marker into the session timeline. Renders as a diamond
   * on the replay scrubber. Optional payload (must be JSON-serializable).
   *
   *   TraceBug.mark("Started checkout flow", { cartTotal: 49.99 });
   */
  mark(label: string, payload?: Record<string, unknown>): void {
    _mark(label, payload);
  }

  /**
   * Assert a runtime invariant. On `false`, captures a synthetic Error and
   * surfaces the Live Bug Card with the assertion message + call stack.
   *
   *   TraceBug.assert(user != null, "User must be logged in here");
   */
  assert(condition: unknown, message: string): void {
    _assertCondition(condition, message);
  }

  /**
   * Set or merge custom context attached to every subsequent report.
   * Keys are merged shallow — call multiple times to accumulate fields.
   *
   *   TraceBug.context({ buildId: "abc123", featureFlag: "new-checkout" });
   */
  context(values: ContextData): void {
    _setContext(values);
  }

  /** Snapshot of current context. */
  getContext(): ContextData {
    return _getContext();
  }

  // ── User Identification ────────────────────────────────────────────

  /**
   * Identify the current user. Attached to the session for attribution.
   * Stored in localStorage so it persists across page loads.
   *
   * TraceBug.setUser({ id: "user_123", email: "dev@example.com", name: "Jane" });
   */
  setUser(user: { id: string; email?: string; name?: string; [key: string]: string | undefined }): void {
    if (!user.id) {
      console.warn("[TraceBug] setUser() requires an id field.");
      return;
    }
    try {
      localStorage.setItem("tracebug_user", JSON.stringify(user));
    } catch {}
    // Also attach to current session in storage
    if (this.sessionId) {
      try {
        const sessions = getAllSessions();
        const session = sessions.find(s => s.sessionId === this.sessionId);
        if (session) {
          session.user = user;
          localStorage.setItem("tracebug_sessions", JSON.stringify(sessions));
        }
      } catch {}
    }
  }

  /** Get the identified user (or null) */
  getUser(): { id: string; email?: string; name?: string } | null {
    try {
      const raw = localStorage.getItem("tracebug_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Clear the identified user */
  clearUser(): void {
    try { localStorage.removeItem("tracebug_user"); } catch {}
  }

  // ── Private methods ─────────────────────────────────────────────────

  /**
   * Determine if TraceBug should be active based on the `enabled` config.
   */
  private shouldEnable(mode: TraceBugConfig["enabled"]): boolean {
    // Booleans are the values people reach for first — honor them as the
    // obvious aliases instead of silently falling through to "auto" (which
    // once shipped a sandbox that disabled itself on its own production URL).
    if (mode === true) return true;
    if (mode === false) return false;

    // Always off
    if (mode === "off") return false;

    // Always on (use with caution in prod)
    if (mode === "all") return true;

    // Custom hostname list
    if (Array.isArray(mode)) {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      return mode.some(h => host === h || host.endsWith("." + h));
    }

    // Anything else that isn't a recognized mode: warn loudly and fall back
    // to "auto" — an unnoticed typo here can silently disable the SDK.
    if (mode !== undefined && mode !== "auto" && mode !== "development" && mode !== "staging") {
      console.warn(
        `[TraceBug] Unknown \`enabled\` value ${JSON.stringify(mode)} — treating as "auto". ` +
          `Valid: "auto" | "development" | "staging" | "all" | "off" | string[] | true | false.`
      );
    }

    // Detect current environment
    const env = this.detectEnvironment();
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const isStaging = /staging|\.stg\.|\.uat\.|\.qa\.|\.dev\./i.test(host);

    if (mode === "development") {
      return env === "development";
    }

    if (mode === "staging") {
      return env === "development" || isStaging;
    }

    // "auto" — default behavior
    if (env === "production" && !isStaging) {
      return false;
    }
    return true;
  }

  /**
   * Detect the current environment from various sources.
   */
  private detectEnvironment(): string {
    // Vite: import.meta.env.MODE / import.meta.env.PROD
    try {
      const meta = (import.meta as unknown as { env?: { PROD?: boolean; DEV?: boolean; MODE?: string } }).env;
      if (typeof meta !== "undefined") {
        if (meta.PROD === true) return "production";
        if (meta.DEV === true) return "development";
        if (meta.MODE) return meta.MODE;
      }
    } catch {}

    // Node/Webpack: process.env.NODE_ENV
    try {
      const g = globalThis as unknown as { process?: { env?: Record<string, string | undefined> } };
      if (typeof g.process !== "undefined" && g.process.env?.NODE_ENV) {
        return g.process.env.NODE_ENV;
      }
    } catch {}

    // Fallback: check hostname
    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
        return "development";
      }
    }

    // Can't determine — assume production (safer default)
    return "production";
  }

  /**
   * When an error event is captured, pull the session timeline from
   * localStorage and generate reproduction steps.
   */
  /**
   * Show an interactive toast prompting the user to capture a bug when an
   * error is detected. Throttled: same error message won't re-prompt within
   * 30 seconds; any error won't re-prompt within 5 seconds.
   */
  /**
   * Re-mount the floating recording HUD after a page reload when an
   * offscreen recording is still active. Safe to call repeatedly — the HUD
   * itself guards against double mounts.
   */
  /**
   * Fired when the offscreen document broadcasts that capture actually began.
   * Mounts the recording HUD + attaches console collectors so the user always
   * sees the controls (Stop / Pause / Pen / Blur …) while recording — even if
   * the start RPC reported a (false) cancellation. Idempotent: the HUD guards
   * against double mounts.
   */
  private _handleRecordingStarted(): void {
    // The single choke point for "a video recording genuinely began" —
    // fires for every trigger (popup, toolbar, keyboard) and every transport.
    // Without this, a recording started from the on-page toolbar's own
    // Record button (which calls startVideoRecording() directly, bypassing
    // the popup's TB_START_RECORDING combo action entirely) never told the
    // worker it owns a capture: no REC badge, and none of the cross-site
    // protection Phase 1.11.1 added. No-ops outside the extension.
    void announceCaptureStarted(Date.now());
    if (!this.config?.enableDashboard) return;
    this._remountRecordingHud();
    this._attachConsoleCollectors();
  }

  private _remountRecordingHud(): void {
    const root = document.getElementById("tracebug-root");
    if (!root) return;
    showRecordingHUD(root, {
      onStop: () => { this.stopVideoRecording().catch(() => {}); },
    });
    // Also flip the toolbar Record button to its active state so the user
    // sees that recording is on.
    const recordBtn = document.getElementById("tracebug-toolbar-record-btn");
    if (recordBtn) {
      recordBtn.classList.add("tb-active");
      recordBtn.style.color = "var(--tb-error, #ef4444)";
    }
  }

  /**
   * Called when the offscreen document auto-finalizes the recording because
   * the user clicked the browser's native "Stop sharing" button. We hide
   * the HUD and open the ticket modal with the captured video.
   */
  private async _handleAutoStop(recording: VideoRecording | null): Promise<void> {
    // The browser's native "Stop sharing" button ends the capture just as
    // much as the HUD's own Stop — see the comment in stopVideoRecording().
    void announceCaptureStopped();
    hideRecordingHUD();
    const recordBtn = document.getElementById("tracebug-toolbar-record-btn");
    if (recordBtn) {
      recordBtn.classList.remove("tb-active");
      recordBtn.style.color = "var(--tb-btn-text, #aaa)";
    }
    // Native "Stop sharing" is a stop too — finalize the session so the
    // active-session flag clears and the next Record starts fresh.
    this._endActiveSession();
    if (!this.config?.enableDashboard) return;
    // Always surface the ticket modal on any stop path — manual, auto, or
    // tab-close. Even when the broadcast didn't deliver a recording payload
    // (the offscreen failed to finalize, or the tab was in bfcache), we
    // still open the modal so the user sees the screenshots, console errors,
    // network calls, and action chips that WERE captured.
    void recording; // not used directly — getLastVideoRecording() pulls it
    const root = document.getElementById("tracebug-root");
    if (!root) return;
    try {
      const m = await import("./ui/quick-bug");
      if (!m.isQuickBugOpen()) await m.showQuickBugCapture(root);
    } catch (err) {
      console.warn("[TraceBug] Failed to open ticket modal after auto-stop:", err);
    }
  }

  private maybePromptErrorCapture(errorMessage?: string, errorStack?: string): void {
    if (!this.config?.enableDashboard) return;
    if (!errorMessage) return;

    const now = Date.now();
    // Throttle: 5s minimum between any error prompts
    if (now - this._lastErrorPromptAt < 5000) return;
    // 30s cooldown for the same error message
    if (this._lastErrorMsgPrompted === errorMessage && now - this._lastErrorPromptAt < 30000) return;

    this._lastErrorPromptAt = now;
    this._lastErrorMsgPrompted = errorMessage;

    // Defer to next tick so the error has time to settle in localStorage
    setTimeout(() => {
      try {
        const root = document.getElementById("tracebug-root");
        if (!root) return;
        // Compute "last user action" from the latest session events so the
        // card can show what the user just did before the error.
        const lastAction = (() => {
          try {
            const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
            const events = sessions[0]?.events || [];
            for (let i = events.length - 1; i >= 0; i--) {
              const e = events[i];
              if (e.type === "click") {
                const t = e.data?.element?.text || e.data?.element?.ariaLabel || e.data?.element?.tag || "element";
                return `clicked "${String(t).slice(0, 40)}"`;
              }
              if (e.type === "input") {
                const n = e.data?.element?.name || e.data?.element?.id || "field";
                return `typed in ${n}`;
              }
              if (e.type === "select_change") return `selected an option`;
              if (e.type === "form_submit") return `submitted a form`;
              if (e.type === "route_change") return `navigated to ${e.data?.to || "page"}`;
            }
          } catch {}
          return undefined;
        })();

        // Lazy-load the card module + the bug-capture modal so the hot path
        // stays cheap on pages that never throw.
        Promise.all([
          import("./ui/live-bug-card"),
          import("./ui/quick-bug"),
        ]).then(([cardMod, qbMod]) => {
          // If a rolling/Sentry recording is armed, the Capture button
          // snapshots the in-progress video into a ticket \u2014 no extra clicks,
          // no second picker. Otherwise it opens the standard capture modal.
          const armed = _isRollingMode();
          // A capture already running already covers this error — the card
          // still shows what happened, but offering its own Capture Bug
          // would either duplicate the running capture or confusingly start
          // a second one (T-06, docs/audit/product-review.md). Outside a
          // capture, the button stays exactly as it was.
          const onCapture = this.isRecording()
            ? undefined
            : armed
              ? () => { this.captureRollingBuffer().catch(() => {}); }
              : () => { qbMod.showQuickBugCapture(root).catch(() => {}); };

          cardMod.showLiveBugCard(root, {
            message: errorMessage,
            stack: errorStack,
            lastAction,
            onCapture,
          });
        }).catch(() => {});
      } catch {}
    }, 200);
  }

  private processError(
    sessionId: string,
    errorMessage?: string,
    errorStack?: string
  ): void {
    if (!errorMessage) return;

    // Small delay so the error event itself is stored first
    setTimeout(() => {
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === sessionId);
      if (!session) return;

      const result = generateReproSteps(
        session.events,
        errorMessage,
        errorStack
      );

      updateSessionError(
        sessionId,
        errorMessage,
        errorStack,
        result.reproSteps,
        result.errorSummary
      );

      console.info(
        "[TraceBug] Bug report generated. Click the bug button to view reproduction steps."
      );
    }, 100);
  }

  /**
   * Tear down the SDK — removes all listeners and the dashboard.
   */
  destroy(): void {
    // Finalize any armed session first: stashes its screenshots onto the
    // session record, flushes, and clears the persisted active-session flag.
    // Leaving the flag set made the next init() restore a stale session id,
    // whose recovery path then fought with fresh popup actions.
    try { this._endActiveSession(); } catch {}
    flushPendingEvents(); // Write any buffered events before teardown
    this._detachConsoleCollectors();
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.initialized = false;
    this.config = null;
    this.recording = false;
    this.sessionId = null;
    clearScreenshots();
    clearVoiceTranscripts();
    abortVideoRecording(); // also stops the rrweb observers
    void announceCaptureStopped(); // same reason as stopVideoRecording()'s call
    clearVideoRecording();
    this._eventsCaptureStartedAt = null;
    clearStashedDomReplay();
    hideRecordingHUD();
    clearNetworkFailures();
    setRedactRules(undefined);
    deactivateElementAnnotateMode();
    deactivateDrawMode();
    deactivateInspectMode();
    clearAllAnnotations();
    clearAllPlugins();
    _clearIssues();
    clearDevApiState();
    removeTheme();
  }

  // ── Network Failures ────────────────────────────────────────────────

  /**
   * Get the last 10 failed network requests with response body snippets.
   * Returned from an in-memory ring buffer — snapshot at call time.
   */
  getNetworkFailures() {
    return getNetworkFailures();
  }

  // ── Auto-Scanner ────────────────────────────────────────────────────

  /**
   * Run all detectors (a11y via axe-core, broken images, mixed content,
   * failed/slow APIs, JS errors) and return the findings. Detectors run in
   * parallel; one failure doesn't break the others. Concurrent calls are
   * coalesced — a second scan() while one is in-flight returns the same
   * promise.
   */
  async scanPage(): Promise<ScanResult> {
    return _scan();
  }

  /**
   * Snapshot of the most recent scan's issues. Pass `{ includeDismissed: true }`
   * to also return issues the user dismissed during this session.
   */
  getIssues(options?: { includeDismissed?: boolean }) {
    return _getIssues(options);
  }

  /** Open the issues panel — runs a fresh scan first by default. */
  async showIssuesPanel(options?: { rescan?: boolean }): Promise<void> {
    if (!this.config?.enableDashboard) return;
    const root = document.getElementById("tracebug-root");
    if (!root) return;
    const m = await import("./ui/issues-panel");
    return m.showIssuesPanel(root, options);
  }

  /** Mark an issue dismissed for this session. Returns true if found. */
  dismissIssue(id: string): boolean {
    return _dismissIssue(id);
  }

  /** Restore a previously dismissed issue. */
  undismissIssue(id: string): boolean {
    return _undismissIssue(id);
  }

  /** Clear all scan results from memory. */
  clearIssues(): void {
    _clearIssues();
  }

  /** Look up a single issue by id (e.g. for plugin integrations). */
  getIssue(id: string) {
    return getIssueById(id);
  }

  /** Severity-bucketed counts of non-dismissed issues — useful for badges. */
  getIssueCounts() {
    return getIssueCountsBySeverity();
  }
}

const TraceBug = new TraceBugSDK();
export default TraceBug;
