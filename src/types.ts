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
  | "unhandled_rejection"
  /** Developer breadcrumb (`TraceBug.mark()`) — manually-placed semantic checkpoint. */
  | "mark";

/**
 * Custom context attached to every report this session via `TraceBug.context()`.
 * Merged shallow into `BugReport.context`. Stays in memory; not persisted.
 */
export type ContextData = Record<string, string | number | boolean | null>;

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
  /** "redact" draws a solid filled block that hides the underlying content —
   *  use to obscure PII/tokens/etc. before sharing a screenshot. */
  shape: "rect" | "ellipse" | "redact";
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
  /** Un-highlighted version, present only when smart-screenshot drew a click ring. */
  originalDataUrl?: string;
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

/** A captured network request (any status). Used by the Network tab to render
 *  every request in chronological order, not just failures. URL is already
 *  sanitized (sensitive query params replaced with [REDACTED]). */
export interface NetworkRequestEntry {
  method: string;
  url: string;
  status: number;
  duration: number;
  timestamp: number;
  /** First ~200 chars of the response body — captured only on failures. */
  response?: string;
}

/** One attribute on an ActionChip's element preview (rendered as name="value"). */
export interface ActionChipAttr {
  name: string;
  value: string;
}

/**
 * A single action card for the Actions tab. Each event in the
 * session produces one chip with a verb ("Clicked", "Typed", etc.) plus an
 * HTML-element preview showing the tag and a curated set of attributes.
 *
 * Picked attribute priority (most-informative first): id, class, type, name,
 * href, aria-label, role, data-testid, placeholder, value. Top 4 are shown
 * inline; the rest count toward `moreCount` and render as "+N more".
 */
export interface ActionChip {
  /** Headline verb shown to the left — "Clicked" | "Typed" | "Selected" | ... */
  verb: string;
  /** Category — drives the verb color. */
  kind: "click" | "input" | "select" | "submit" | "navigate" | "api" | "error" | "mark";
  /** Human-readable target — the button text, field name, form purpose, etc.
   *  Renders as `"Checkout" button` between the verb and the technical
   *  element preview. Missing when no nice label exists. */
  target?: string;
  /** Friendly noun for the target ("button" / "link" / "field" / "form").
   *  Renders after `target` for grammar — "Clicked 'Checkout' button". */
  nounLabel?: string;
  /** Optional element preview (present for click / input / select / submit). */
  element?: {
    tag: string;
    attrs: ActionChipAttr[];
    moreCount: number;
  };
  /** Trailing detail — e.g. typed value, route path, error message. */
  detail?: string;
  /** Frustration heuristic that fired for this action ("rage" = 3+ rapid
   *  clicks on same selector, "dead" = click had no visible effect,
   *  "abandon" = form filled but never submitted). UI prefixes the chip
   *  with an icon when set. */
  frustration?: "rage" | "dead" | "abandon";
  /** Originating event timestamp — used to sync with the scrubber. */
  timestamp: number;
  /** True for error/failure rows so the UI can style them red. */
  isError?: boolean;
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

/** Top-level severity classification — feeds the colored emoji prefix on titles. */
export type BugSeverity = "critical" | "high" | "medium" | "low";

export interface BugReport {
  title: string;
  /** One-line smart summary of what went wrong — top of every report. */
  summary: string;
  steps: string;
  environment: EnvironmentInfo;
  consoleErrors: { message: string; stack?: string; timestamp: number }[];
  /** Full console capture across all levels (error / warn / log / info).
   *  Populated when `captureConsole` is "all" — gives the Console tab
   *  parity with DevTools. `consoleErrors` stays errors-only for the
   *  legacy GitHub/Jira/markdown exports that don't have a level concept. */
  consoleLogs?: { level: "error" | "warn" | "log" | "info"; message: string; stack?: string; timestamp: number }[];
  networkErrors: NetworkErrorEntry[];
  /** Every captured request (success + failure), newest last. The Network tab
   *  in the bug viewer renders this. Existing exports (GitHub/Jira/markdown)
   *  continue to use `networkErrors` so failure-only summaries stay compact. */
  networkRequests: NetworkRequestEntry[];
  /** Last ~10 readable user actions ("Clicked 'Login' button", etc.). */
  sessionSteps: string[];
  /** Rich action cards for the Actions tab. Same source events
   *  as `sessionSteps`, but structured for HTML-element rendering. The text
   *  exports (GitHub/Jira/markdown) continue to use `sessionSteps`. */
  actionChips: ActionChip[];
  /** The element the user clicked just before the bug surfaced. */
  clickedElement: ClickedElementSummary | null;
  /** Best-guess cause, derived deterministically from report signals. */
  rootCause: RootCauseHint;
  /** Auto-classified severity from rule ladder in report-builder. */
  severity: BugSeverity;
  annotations: Annotation[];
  screenshots: ScreenshotData[];
  timeline: TimelineEntry[];
  voiceTranscripts: VoiceTranscriptData[];
  /** Optional screen recording — present only when QA hit Record before exporting. */
  video?: VideoRecordingData;
  /** Custom context set via `TraceBug.context({...})` — empty object if none. */
  context: ContextData;
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

// ── Scanner / Issues ─────────────────────────────────────────────────────

/**
 * Detector identifiers. Stable strings — used in the UI for grouping and in
 * the report builder when filing an issue as a bug ticket.
 */
export type IssueDetector =
  | "axe-a11y"
  | "broken-image"
  | "mixed-content"
  | "console-error"
  | "slow-api"
  | "failed-request"
  /** Frustration: ≥3 clicks on the same selector inside 1.5 s with no response. */
  | "frustration-rage"
  /** Frustration: click with no DOM/route/network response within 1.5 s. */
  | "frustration-dead"
  /** Frustration: form filled, then route_change before form_submit. */
  | "frustration-abandon"
  /** Frustration: error fired ≤2.5 s after a click — likely the trigger. */
  | "frustration-error-correlated";

/** Severity buckets, lifted from axe-core's impact ladder for consistency. */
export type IssueSeverity = "critical" | "serious" | "moderate" | "minor";

/**
 * One finding from the scanner. Detectors emit Issue[] which the orchestrator
 * collates into an in-memory store. Issues are not persisted to localStorage —
 * each scan is a fresh run, results clear on reload.
 */
export interface Issue {
  id: string;
  detector: IssueDetector;
  severity: IssueSeverity;
  /** Short human-readable headline (< 80 chars). */
  title: string;
  /** Longer plain-English explanation, including the value/cause. */
  description: string;
  /** CSS selector if the issue is anchored to a DOM element. */
  selector?: string;
  /** URL if the issue is anchored to a request/resource. */
  url?: string;
  /** Link to detector docs (e.g. axe-core deque-page). */
  helpUrl?: string;
  /** Page path where the issue was detected. */
  page: string;
  detectedAt: number;
  /** Set true when the user dismisses — kept in memory only this session. */
  dismissed?: boolean;
  /** Fingerprint (SHA-1 over errorType+stackTop+page) for grouping identical issues. */
  fingerprint?: string;
  /** When fingerprint dedup grouped multiple events into one issue, this is the count (≥1). */
  occurrences?: number;
  /** First and last timestamps when the underlying signal was seen — populated when occurrences > 1. */
  firstSeenAt?: number;
  lastSeenAt?: number;
  /** Compact ms timestamps of each occurrence's preceding click (max 10) — UI uses this to expand the row. */
  contextSamples?: Array<{ timestamp: number; precedingAction?: string }>;
}

// ── Video Recording ──────────────────────────────────────────────────────

/** A single comment timestamped against video playback time. */
export interface VideoCommentData {
  offsetMs: number;
  text: string;
}

/**
 * Metadata for a screen recording attached to a bug report. The blob lives
 * in memory only — `url` is a Blob URL valid until clearVideoRecording() or
 * page reload.
 */
export interface VideoRecordingData {
  url: string;
  /** Optional raw base64 data URL. Set when the SDK has it directly — the
   *  HTML exporter prefers this over `fetch(url)` because blob URLs go stale
   *  on page reload while the data URL keeps working. */
  dataUrl?: string;
  durationMs: number;
  mimeType: string;
  sizeBytes: number;
  comments: VideoCommentData[];
  startedAt: number;
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
