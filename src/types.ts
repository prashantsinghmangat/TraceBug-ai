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

export interface BugReport {
  title: string;
  steps: string;
  environment: EnvironmentInfo;
  consoleErrors: { message: string; stack?: string; timestamp: number }[];
  networkErrors: { method: string; url: string; status: number; duration: number; timestamp: number }[];
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
