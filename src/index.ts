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

import { TraceBugConfig, TraceBugEvent, EventType, StoredSession } from "./types";
import { getSessionId, appendEvent, updateSessionError, getAllSessions } from "./storage";
import { generateReproSteps } from "./repro-generator";
import { mountDashboard, setRecordingState, updateRecordingState } from "./dashboard";
import {
  collectClicks,
  collectInputs,
  collectSelectChanges,
  collectFormSubmits,
  collectRouteChanges,
  collectApiRequests,
  collectErrors,
} from "./collectors";

export { TraceBugConfig, TraceBugEvent, StoredSession } from "./types";
export { getAllSessions, clearAllSessions, deleteSession } from "./storage";
export { generateReproSteps } from "./repro-generator";

class TraceBugSDK {
  private config: TraceBugConfig | null = null;
  private cleanups: (() => void)[] = [];
  private initialized = false;
  private recording = true;

  /**
   * Initialize TraceBug. Call once on app startup.
   *
   *   TraceBug.init({ projectId: "my-app" });
   *
   * Options:
   *  - projectId:       Required. Identifies your app.
   *  - maxEvents:       Max events per session in storage (default 200).
   *  - maxSessions:     Max sessions kept in localStorage (default 50).
   *  - enableDashboard: Show the floating 🐛 button (default true).
   */
  init(config: TraceBugConfig): void {
    if (this.initialized) {
      console.warn("[TraceBug] Already initialized.");
      return;
    }

    // ── Check if SDK should be active in this environment ────────────
    if (!this.shouldEnable(config.enabled ?? "auto")) {
      console.info("[TraceBug] Disabled in this environment.");
      return;
    }

    this.config = {
      maxEvents: 200,
      maxSessions: 50,
      enableDashboard: true,
      ...config,
    };

    this.initialized = true;
    this.recording = true;
    const sessionId = getSessionId();

    // ── Emit function — collectors call this with raw event data ───────
    const emit = (type: EventType, data: Record<string, any>) => {
      if (!this.recording) return; // Skip when paused

      const event: TraceBugEvent = {
        id: Math.random().toString(36).slice(2, 10),
        sessionId,
        projectId: this.config!.projectId,
        type,
        page: window.location.pathname,
        timestamp: Date.now(),
        data,
      };

      // Persist to localStorage
      appendEvent(
        sessionId,
        event,
        this.config!.maxEvents!,
        this.config!.maxSessions!
      );

      // When an error occurs, auto-generate reproduction steps
      if (type === "error" || type === "unhandled_rejection") {
        this.processError(sessionId, data.error?.message, data.error?.stack);
      }
    };

    // ── Start all collectors ──────────────────────────────────────────
    this.cleanups.push(collectClicks(emit));
    this.cleanups.push(collectInputs(emit));
    this.cleanups.push(collectSelectChanges(emit));
    this.cleanups.push(collectFormSubmits(emit));
    this.cleanups.push(collectRouteChanges(emit));
    this.cleanups.push(collectApiRequests(emit));
    this.cleanups.push(collectErrors(emit));

    // ── Mount in-browser dashboard ────────────────────────────────────
    if (this.config.enableDashboard) {
      // Wire recording toggle so dashboard can pause/resume
      setRecordingState(this.recording, () => {
        if (this.recording) {
          this.pauseRecording();
        } else {
          this.resumeRecording();
        }
        updateRecordingState(this.recording);
      });
      this.cleanups.push(mountDashboard());
    }

    console.info(
      `[TraceBug] Initialized — project: ${config.projectId}, session: ${sessionId}`
    );
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
    // Enabled if: development, localhost, 127.0.0.1, staging hosts
    // Disabled if: production and not a staging host
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
        "[TraceBug] Bug report generated. Click 🐛 to view reproduction steps."
      );
    }, 100);
  }

  /**
   * Tear down the SDK — removes all listeners and the dashboard.
   */
  destroy(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.initialized = false;
    this.config = null;
    this.recording = false;
  }
}

const TraceBug = new TraceBugSDK();
export default TraceBug;
