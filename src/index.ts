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
  TraceBugUser,
  EventType,
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
import {
  getSessionId,
  appendEvent,
  updateSessionError,
  getAllSessions,
  addAnnotation,
  saveEnvironment,
  flushPendingEvents,
} from "./storage";
import { generateReproSteps } from "./repro-generator";
import { mountDashboard, setRecordingState, updateRecordingState } from "./dashboard";
import {
  collectClicks,
  collectInputs,
  collectSelectChanges,
  collectFormSubmits,
  collectRouteChanges,
  collectApiRequests,
  collectXhrRequests,
  collectErrors,
  collectConsoleWarnings,
  collectConsoleLogs,
} from "./collectors";
import { captureEnvironment } from "./environment";
import { captureScreenshot, getScreenshots, clearScreenshots, downloadAllScreenshots } from "./screenshot";
import { buildReport } from "./report-builder";
import { generateGitHubIssue } from "./github-issue";
import { generateJiraTicket } from "./jira-issue";
import { generatePdfReport, downloadPdfAsHtml } from "./pdf-generator";
import { generateBugTitle, generateFlowSummary } from "./title-generator";
import { buildTimeline, formatTimelineText } from "./timeline-builder";
import { startVoiceRecording, stopVoiceRecording, isVoiceSupported, isVoiceRecording, getVoiceTranscripts, clearVoiceTranscripts } from "./voice-recorder";
import { activateElementAnnotateMode, deactivateElementAnnotateMode, isElementAnnotateActive } from "./element-annotate";
import { activateDrawMode, deactivateDrawMode, isDrawModeActive } from "./draw-mode";
import {
  getAnnotationReport, getElementAnnotations, getDrawRegions,
  exportAsJSON as exportAnnotationsJSON, exportAsMarkdown as exportAnnotationsMD,
  copyToClipboard as copyAnnotationsToClipboard, clearAllAnnotations,
} from "./annotation-store";
import { injectTheme, removeTheme } from "./theme";
import {
  TraceBugPlugin,
  registerPlugin, unregisterPlugin, getPlugins,
  runEventPlugins, runReportPlugins,
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
export { getAllSessions, clearAllSessions, deleteSession } from "./storage";
export { generateReproSteps } from "./repro-generator";
export { captureEnvironment } from "./environment";
export { captureScreenshot, getScreenshots, downloadAllScreenshots } from "./screenshot";
export { buildReport } from "./report-builder";
export { generateGitHubIssue } from "./github-issue";
export { generateJiraTicket } from "./jira-issue";
export type { JiraTicket } from "./jira-issue";
export { generatePdfReport, downloadPdfAsHtml } from "./pdf-generator";
export { generateBugTitle, generateFlowSummary } from "./title-generator";
export { buildTimeline, formatTimelineText } from "./timeline-builder";
export { startVoiceRecording, stopVoiceRecording, isVoiceSupported, isVoiceRecording, getVoiceTranscripts, clearVoiceTranscripts } from "./voice-recorder";
export type { VoiceTranscript } from "./voice-recorder";
export type { TraceBugPlugin } from "./plugin-system";

class TraceBugSDK {
  private config: TraceBugConfig | null = null;
  private cleanups: (() => void)[] = [];
  private initialized = false;
  private recording = true;
  private sessionId: string | null = null;

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

    // ── Validate config ────────────────────────────────────────────
    if (!config || typeof config !== "object") {
      console.warn("[TraceBug] init() requires a config object.");
      return;
    }
    if (!config.projectId || typeof config.projectId !== "string") {
      console.warn("[TraceBug] init() requires a projectId string.");
      return;
    }
    if (config.maxEvents !== undefined && (typeof config.maxEvents !== "number" || config.maxEvents < 1)) {
      console.warn("[TraceBug] maxEvents must be a positive number. Using default (200).");
      config.maxEvents = 200;
    }
    if (config.maxSessions !== undefined && (typeof config.maxSessions !== "number" || config.maxSessions < 1)) {
      console.warn("[TraceBug] maxSessions must be a positive number. Using default (50).");
      config.maxSessions = 50;
    }

    // ── Check if SDK should be active in this environment ────────────
    if (!this.shouldEnable(config.enabled ?? "auto")) {
      console.info("[TraceBug] Disabled in this environment.");
      return;
    }

    try {
      this.config = {
        maxEvents: 200,
        maxSessions: 50,
        enableDashboard: true,
        theme: "dark",
        toolbarPosition: "right",
        minimized: false,
        captureConsole: "errors",
        ...config,
      };

      this.initialized = true;
      this.recording = true;
      this.sessionId = getSessionId();
      const sessionId = this.sessionId;

      // ── Inject theme CSS custom properties ────────────────────────
      try { injectTheme(this.config.theme!); } catch {}

      // ── Capture environment info automatically ─────────────────────
      try {
        const env = captureEnvironment();
        saveEnvironment(sessionId, env);
      } catch {}

      // ── Attach stored user to session ──────────────────────────────
      try {
        const storedUser = localStorage.getItem("tracebug_user");
        if (storedUser) {
          const user = JSON.parse(storedUser);
          const sessions = getAllSessions();
          const session = sessions.find(s => s.sessionId === sessionId);
          if (session) {
            session.user = user;
            localStorage.setItem("tracebug_sessions", JSON.stringify(sessions));
          }
        }
      } catch {}

      // ── Emit function — collectors call this with raw event data ───────
      const emit = (type: EventType, data: Record<string, any>) => {
        try {
          if (!this.recording) return;

          let event: TraceBugEvent | null = {
            id: Math.random().toString(36).slice(2, 10),
            sessionId,
            projectId: this.config!.projectId,
            type,
            page: window.location.pathname,
            timestamp: Date.now(),
            data,
          };

          event = runEventPlugins(event);
          if (!event) return;

          appendEvent(sessionId, event, this.config!.maxEvents!, this.config!.maxSessions!);

          if (type === "error" || type === "unhandled_rejection") {
            this.processError(sessionId, data.error?.message, data.error?.stack);
            emitHook("error:captured", event);
          }
        } catch (err) {
          if (typeof console !== 'undefined') console.warn('[TraceBug] Event emit error:', err);
        }
      };

      // ── Start all collectors ──────────────────────────────────────────
      this.cleanups.push(collectClicks(emit));
      this.cleanups.push(collectInputs(emit));
      this.cleanups.push(collectSelectChanges(emit));
      this.cleanups.push(collectFormSubmits(emit));
      this.cleanups.push(collectRouteChanges(emit));
      this.cleanups.push(collectApiRequests(emit));
      this.cleanups.push(collectXhrRequests(emit));

      // Console capture — configurable level
      const consoleLevel = this.config.captureConsole ?? "errors";
      if (consoleLevel !== "none") {
        this.cleanups.push(collectErrors(emit));
        if (consoleLevel === "warnings" || consoleLevel === "all") {
          this.cleanups.push(collectConsoleWarnings(emit));
        }
        if (consoleLevel === "all") {
          this.cleanups.push(collectConsoleLogs(emit));
        }
      } else {
        this.cleanups.push(collectErrors(emit));
      }

      // ── Mount in-browser dashboard ────────────────────────────────────
      if (this.config.enableDashboard) {
        try {
          setRecordingState(this.recording, () => {
            if (this.recording) { this.pauseRecording(); } else { this.resumeRecording(); }
            updateRecordingState(this.recording);
          });
          this.cleanups.push(mountDashboard(this.config.toolbarPosition));
        } catch (err) {
          console.warn('[TraceBug] Dashboard mount failed:', err);
        }
      }

      emitHook("session:start", sessionId);

      console.info(
        `[TraceBug] Initialized — project: ${config.projectId}, session: ${sessionId}`
      );
    } catch (err) {
      console.warn('[TraceBug] Failed to initialize:', err);
      this.initialized = false;
      return;
    }
  }

  /** Pause recording — events will not be captured until resumed */
  pauseRecording(): void {
    this.recording = false;
    console.info("[TraceBug] Recording paused.");
  }

  /** Resume recording after a pause */
  resumeRecording(): void {
    this.recording = true;
    console.info("[TraceBug] Recording resumed.");
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

  /** Capture a screenshot of the current page */
  async takeScreenshot(): Promise<ScreenshotData | null> {
    if (!this.sessionId) return null;

    // Get the last event for context-aware naming
    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    const lastEvent = session?.events[session.events.length - 1] || null;

    const screenshot = await captureScreenshot(lastEvent);
    console.info(`[TraceBug] Screenshot captured: ${screenshot.filename}`);
    return screenshot;
  }

  /** Get all screenshots from current session */
  getScreenshots(): ScreenshotData[] {
    return getScreenshots();
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

  // ── Report Generation ───────────────────────────────────────────────

  /** Generate a complete bug report for the current session */
  generateReport(): BugReport | null {
    if (!this.sessionId) return null;

    const sessions = getAllSessions();
    const session = sessions.find(s => s.sessionId === this.sessionId);
    if (!session) return null;

    return buildReport(session);
  }

  /** Generate GitHub issue markdown */
  getGitHubIssue(): string | null {
    const report = this.generateReport();
    if (!report) return null;
    return generateGitHubIssue(report);
  }

  /** Generate Jira ticket payload */
  getJiraTicket() {
    const report = this.generateReport();
    if (!report) return null;
    return generateJiraTicket(report);
  }

  /** Download a PDF bug report */
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
  on(event: string, callback: (...args: any[]) => void): () => void {
    return onHook(event as any, callback);
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
    // Always off
    if (mode === "off") return false;

    // Always on (use with caution in prod)
    if (mode === "all") return true;

    // Custom hostname list
    if (Array.isArray(mode)) {
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      return mode.some(h => host === h || host.endsWith("." + h));
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
      if (typeof (import.meta as any)?.env !== "undefined") {
        const meta = (import.meta as any).env;
        if (meta.PROD === true) return "production";
        if (meta.DEV === true) return "development";
        if (meta.MODE) return meta.MODE;
      }
    } catch {}

    // Node/Webpack: process.env.NODE_ENV
    try {
      const g = globalThis as any;
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
    flushPendingEvents(); // Write any buffered events before teardown
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.initialized = false;
    this.config = null;
    this.recording = false;
    this.sessionId = null;
    clearScreenshots();
    clearVoiceTranscripts();
    deactivateElementAnnotateMode();
    deactivateDrawMode();
    clearAllAnnotations();
    clearAllPlugins();
    removeTheme();
  }
}

const TraceBug = new TraceBugSDK();
export default TraceBug;
