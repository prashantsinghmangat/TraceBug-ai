// ── Report builder ────────────────────────────────────────────────────────
// Assembles a complete BugReport from session data, screenshots, and env info.
// One-click report generation — collects everything into a structured object.

import { BugReport, StoredSession, ScreenshotData, EnvironmentInfo, Annotation } from "./types";
import { captureEnvironment } from "./environment";
import { getScreenshots } from "./screenshot";
import { generateBugTitle } from "./title-generator";
import { buildTimeline } from "./timeline-builder";
import { generateReproSteps } from "./repro-generator";

export function buildReport(
  session: StoredSession,
  extraScreenshots?: ScreenshotData[]
): BugReport {
  const environment = session.environment || captureEnvironment();

  // Generate repro steps if not already present
  let steps = session.reproSteps || "";
  if (!steps && session.events.length > 0) {
    const errorMsg = session.errorMessage || "Issue reported by tester";
    const result = generateReproSteps(session.events, errorMsg, session.errorStack || undefined);
    steps = result.reproSteps;
  }

  // Collect console errors (deduplicated by message)
  const seenErrors = new Set<string>();
  const consoleErrors = session.events
    .filter(e => ["error", "unhandled_rejection", "console_error"].includes(e.type))
    .map(e => ({
      message: e.data.error?.message || "",
      stack: e.data.error?.stack,
      timestamp: e.timestamp,
    }))
    .filter(e => {
      if (seenErrors.has(e.message)) return false;
      seenErrors.add(e.message);
      return true;
    });

  // Collect network errors
  const networkErrors = session.events
    .filter(e => e.type === "api_request" && (e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0))
    .map(e => ({
      method: e.data.request?.method || "GET",
      url: e.data.request?.url || "",
      status: e.data.request?.statusCode || 0,
      duration: e.data.request?.durationMs || 0,
      timestamp: e.timestamp,
    }));

  // Screenshots from memory + any extras
  const screenshots = [...getScreenshots(), ...(extraScreenshots || [])];

  // Timeline
  const timeline = buildTimeline(session.events);

  // Auto-generate title
  const title = generateBugTitle(session);

  return {
    title,
    steps,
    environment,
    consoleErrors,
    networkErrors,
    annotations: session.annotations || [],
    screenshots,
    timeline,
    session,
    generatedAt: Date.now(),
  };
}
