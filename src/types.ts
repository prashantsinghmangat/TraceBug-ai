// ── Configuration ──────────────────────────────────────────────────────────

export interface TraceBugConfig {
  projectId: string;
  maxEvents?: number;       // Max events stored per session (default 200)
  maxSessions?: number;     // Max sessions kept in localStorage (default 50)
  enableDashboard?: boolean; // Show floating dashboard button (default true)

  /**
   * Controls when TraceBug is active. Default: "auto"
   *
   * - "auto"        → Enabled in dev/staging, disabled in production.
   *                    Detects via: import.meta.env, process.env.NODE_ENV,
   *                    or hostname (localhost/127.0.0.1/staging).
   * - "development" → Only enabled when NODE_ENV is "development"
   * - "staging"     → Enabled in dev + staging (hostname contains "staging", "stg", "uat", "qa")
   * - "all"         → Always enabled, including production (USE WITH CAUTION)
   * - "off"         → Completely disabled — SDK does nothing
   * - string[]      → Custom list of allowed hostnames, e.g. ["localhost", "staging.myapp.com"]
   */
  enabled?: "auto" | "development" | "staging" | "all" | "off" | string[];

  /**
   * Color theme. Default: "dark"
   * - "dark"  → Dark navy background (default)
   * - "light" → Light background
   * - "auto"  → Follows system prefers-color-scheme
   */
  theme?: "light" | "dark" | "auto";

  /**
   * Toolbar position. Default: "right"
   * - "right"        → Vertical rail on right edge (default)
   * - "left"         → Vertical rail on left edge
   * - "bottom-right" → Horizontal bar at bottom-right
   * - "bottom-left"  → Horizontal bar at bottom-left
   */
  toolbarPosition?: "right" | "left" | "bottom-right" | "bottom-left";

  /** Start toolbar in minimized (single FAB) mode. Default: false */
  minimized?: boolean;

  /**
   * Custom keyboard shortcuts.
   * Default: { screenshot: 'ctrl+shift+s', annotate: 'ctrl+shift+a', draw: 'ctrl+shift+d' }
   */
  shortcuts?: {
    screenshot?: string;
    annotate?: string;
    draw?: string;
  };

  /**
   * GitHub repo for one-click issue creation, format: "owner/repo".
   * When set, the Quick Bug modal shows an "Open in GitHub" button that
   * opens GitHub's new-issue page with title + body prefilled — no API key
   * needed.
   *
   * Example: TraceBug.init({ projectId: "my-app", githubRepo: "myorg/myapp" })
   */
  githubRepo?: string;

  /**
   * Console log capture level. Default: "errors"
   * - "errors"   → Only console.error (backward compatible)
   * - "warnings" → console.error + console.warn
   * - "all"      → console.error + console.warn + console.log (capped at last 50)
   * - "none"     → No console interception
   */
  captureConsole?: "errors" | "warnings" | "all" | "none";

  /**
   * Optional team/company name for custom branding in exported reports
   * (premium feature). When set and the user is on the premium plan, a
   * "Reported via TraceBug — {companyName}" header is prepended to GitHub
   * issues, Jira tickets, and plain-text exports. Ignored on the free plan.
   */
  companyName?: string;
}

// ── Event types ───────────────────────────────────────────────────────────

export type EventType =
  | "click"
  | "input"
  | "select_change"
  | "form_submit"
  | "route_change"
  | "api_request"
  | "error"
  | "console_error"
  | "console_warn"
  | "console_log"
  | "unhandled_rejection";

export interface TraceBugEvent {
  id: string;
  sessionId: string;
  projectId: string;
  type: EventType;
  page: string;
  timestamp: number;
  data: Record<string, any>;
}

// ── Stored session ────────────────────────────────────────────────────────

export interface TraceBugUser {
  id: string;
  email?: string;
  name?: string;
  [key: string]: string | undefined;
}

export interface StoredSession {
  sessionId: string;
  projectId: string;
  createdAt: number;
  updatedAt: number;
  errorMessage: string | null;
  errorStack: string | null;
  reproSteps: string | null;
  errorSummary: string | null;
  events: TraceBugEvent[];
  annotations: Annotation[];
  environment: EnvironmentInfo | null;
  isBug?: boolean;
  user?: TraceBugUser | null;
}

// ── Annotation (tester notes) ─────────────────────────────────────────────

export interface Annotation {
  id: string;
  timestamp: number;
  text: string;
  expected?: string;
  actual?: string;
  severity: "critical" | "major" | "minor" | "info";
  screenshotId?: string;
}

// ── Element Annotation (onUI-style element feedback) ─────────────────────

export type AnnotationIntent = "fix" | "redesign" | "remove" | "question";

export interface ElementAnnotation {
  id: string;
  timestamp: number;
  selector: string;
  tagName: string;
  innerText: string;
  boundingRect: { x: number; y: number; width: number; height: number };
  intent: AnnotationIntent;
  severity: "critical" | "major" | "minor" | "info";
  comment: string;
  page: string;
  scrollX: number;
  scrollY: number;
}

// ── Draw Region (layout/spacing markup) ──────────────────────────────────

export interface DrawRegion {
  id: string;
  timestamp: number;
  shape: "rect" | "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
  comment: string;
  color: string;
  page: string;
  scrollX: number;
  scrollY: number;
}

// ── Annotation Report ────────────────────────────────────────────────────

export interface UIAnnotationReport {
  elementAnnotations: ElementAnnotation[];
  drawRegions: DrawRegion[];
  page: string;
  timestamp: number;
}

// ── Screenshot ────────────────────────────────────────────────────────────

export interface ScreenshotData {
  id: string;
  timestamp: number;
  dataUrl: string;
  filename: string;
  eventContext: string;
  page: string;
  width: number;
  height: number;
}

// ── Environment ───────────────────────────────────────────────────────────

export interface EnvironmentInfo {
  browser: string;
  browserVersion: string;
  os: string;
  viewport: string;
  screenResolution: string;
  language: string;
  timezone: string;
  userAgent: string;
  url: string;
  deviceType: "desktop" | "tablet" | "mobile";
  connectionType: string;
  timestamp: number;
}

// ── Bug Report ────────────────────────────────────────────────────────────

/** A failed network request with optional response body snippet. */
export interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  /** First ~200 chars of the response body (failures only). May be omitted. */
  response?: string;
}

/** Summary of the element the user interacted with right before the bug. */
export interface ClickedElementSummary {
  tag: string;
  text: string;
  selector?: string;
  id?: string;
  ariaLabel?: string;
  testId?: string;
  page: string;
}

/**
 * Deterministic root-cause hint generated from report signals.
 * Confidence reflects which signal drove the hint:
 *   high   → network failure available
 *   medium → runtime error message available
 *   low    → only a click / no strong signal
 */
export interface RootCauseHint {
  hint: string;
  confidence: "high" | "medium" | "low";
}

export interface BugReport {
  title: string;
  /** One-line smart summary of what went wrong — top of every report. */
  summary: string;
  steps: string;
  environment: EnvironmentInfo;
  consoleErrors: { message: string; stack?: string; timestamp: number }[];
  networkErrors: NetworkErrorEntry[];
  /** Last ~10 readable user actions ("Clicked 'Login' button", etc.). */
  sessionSteps: string[];
  /** The element the user clicked just before the bug surfaced. */
  clickedElement: ClickedElementSummary | null;
  /** Best-guess cause, derived deterministically from report signals. */
  rootCause: RootCauseHint;
  annotations: Annotation[];
  screenshots: ScreenshotData[];
  timeline: TimelineEntry[];
  voiceTranscripts: VoiceTranscriptData[];
  session: StoredSession;
  generatedAt: number;
}

// ── Voice Transcript ─────────────────────────────────────────────────────

export interface VoiceTranscriptData {
  id: string;
  timestamp: number;
  text: string;
  duration: number;
}

// ── Timeline ──────────────────────────────────────────────────────────────

export interface TimelineEntry {
  timestamp: number;
  elapsed: string;
  type: string;
  description: string;
  isError: boolean;
  page: string;
}
