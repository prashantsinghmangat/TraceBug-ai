// ── Auto bug title generator ──────────────────────────────────────────────
// Generates intelligent, human-readable bug titles from session data.
// Uses heuristic rules — no AI API needed.

import { TraceBugEvent, StoredSession, ScreenshotData } from "./types";
import { isNoiseRequest, shortDisplayPath } from "./url-hygiene";
import { collapseTyping } from "./repro-generator";

const USER_ACTION_TYPES = ["click", "input", "select_change", "form_submit", "route_change"];

/** The last user action at or before `index` (events are in capture order),
 *  falling back to the session's last action when `index` is -1. */
export function lastUserActionBefore(events: TraceBugEvent[], index: number): TraceBugEvent | null {
  const end = index >= 0 ? index : events.length - 1;
  for (let i = end; i >= 0; i--) {
    if (USER_ACTION_TYPES.includes(events[i].type)) return events[i];
  }
  return null;
}

/** Index of the first event that IS the bug — an uncaught error or rejection,
 *  a logged console error, or a failed (non-noise) request — or -1. */
export function firstFailureIndex(events: TraceBugEvent[]): number {
  return events.findIndex((e) =>
    e.type === "error" || e.type === "unhandled_rejection" || e.type === "console_error" ||
    (e.type === "api_request" &&
      (e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0) &&
      !isNoiseRequest(e.data.request?.url))
  );
}

export function generateBugTitle(session: StoredSession): string {
  const events = session.events;
  const uncaught = events.filter(e => e.type === "error" || e.type === "unhandled_rejection");
  // An app that catches and logs (`catch (err) { console.error(err) }`) never
  // throws uncaught — fall back to its logged errors so the title names the bug.
  const errorEvents = uncaught.length > 0 ? uncaught : events.filter(e => e.type === "console_error");
  const userActions = events.filter(e =>
    ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
  );

  // No error — generate a flow summary title
  if (errorEvents.length === 0) {
    return generateFlowTitle(userActions, events, session.screenshots);
  }

  const errorMsg = errorEvents[0].data.error?.message || session.errorMessage || "Unknown error";
  const errorType = classifyError(errorMsg);
  // The action that led to the error, not the session's last one: clicking
  // "Place order" after a coupon crash titled the bug after Place order.
  const lastAction = lastUserActionBefore(events, events.indexOf(errorEvents[0]));
  const page = errorEvents[0].page || "";

  // Build title from context
  const context = getActionContext(lastAction);
  const pageName = friendlyPage(page);

  if (context && pageName) {
    return `${pageName}: ${context} Fails — ${errorType}`;
  }
  if (context) {
    return `${context} Fails Due to ${errorType}`;
  }
  if (pageName) {
    return `${errorType} on ${pageName}`;
  }
  return `${errorType}: ${truncate(errorMsg, 60)}`;
}

export function generateFlowSummary(events: TraceBugEvent[]): string {
  const userActions = events.filter(e =>
    ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
  );

  if (userActions.length === 0) return "No user interactions recorded";

  const parts: string[] = [];
  for (const ev of userActions.slice(-5)) {
    parts.push(describeAction(ev));
  }
  return parts.join(" → ");
}

function generateFlowTitle(userActions: TraceBugEvent[], allEvents: TraceBugEvent[], screenshots?: ScreenshotData[]): string {
  // Failed badge/image/analytics requests are page noise — a session where
  // ONLY those failed gets a flow title, never "API Failure: <500-char hash>".
  const failedApis = allEvents.filter(e =>
    e.type === "api_request" &&
    (e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0) &&
    !isNoiseRequest(e.data.request?.url)
  );

  if (failedApis.length > 0) {
    const api = failedApis[0].data.request;
    const lastAction = lastUserActionBefore(allEvents, allEvents.indexOf(failedApis[0]));
    const context = getActionContext(lastAction);
    return context
      ? `${context} — API ${api?.method} Returns ${api?.statusCode || "Network Error"}`
      : `API Failure: ${api?.method} ${shortenUrl(api?.url)} Returns ${api?.statusCode || "Network Error"}`;
  }

  if (userActions.length === 0) {
    return screenshots && screenshots.length > 0 ? "Screenshot Capture — No User Interactions" : "Empty Session — No User Interactions";
  }

  // Nothing failed (no error, no real failed request): the title says so up
  // front, so a clean capture reads as clean. Typing pauses and repeated
  // clicks on the same thing collapse, so the three actions shown are distinct.
  const parts: string[] = [];
  for (const a of collapseTyping(userActions)) {
    const d = describeAction(a);
    if (parts[parts.length - 1] !== d) parts.push(d);
  }
  return `No errors captured: ${parts.slice(-3).join(" → ")}`;
}

function getActionContext(event: TraceBugEvent | null): string {
  if (!event) return "";

  switch (event.type) {
    case "click": {
      const el = event.data.element;
      const text = el?.text?.trim() || el?.ariaLabel || "";
      if (text && text.length < 40) return `"${text}" Action`;
      if (el?.id) return `${capitalize(el.id.replace(/[-_]/g, " "))} Action`;
      return "Button Click";
    }
    case "input": {
      const name = event.data.element?.name || event.data.element?.id || "";
      return name ? `${capitalize(name.replace(/[-_]/g, " "))} Input` : "Form Input";
    }
    case "select_change": {
      const name = event.data.element?.name || "";
      const value = event.data.element?.selectedText || "";
      if (name && value) return `Setting ${capitalize(name)} to "${value}"`;
      return "Dropdown Selection";
    }
    case "form_submit": {
      const formId = event.data.form?.id || "";
      return formId ? `${capitalize(formId.replace(/[-_]/g, " "))} Submission` : "Form Submission";
    }
    case "route_change":
      return `Navigation to ${friendlyPage(event.data.to || "")}`;
    default:
      return "";
  }
}

function describeAction(ev: TraceBugEvent): string {
  switch (ev.type) {
    case "click": {
      const rawText = ev.data.element?.text?.trim() || ev.data.element?.ariaLabel || ev.data.element?.id || "element";
      const text = rawText.includes("\n") ? rawText.split("\n")[0].trim() : rawText;
      return `Click "${truncate(text, 40)}"`;
    }
    case "input":
      return `Type in "${ev.data.element?.name || "field"}"`;
    case "select_change":
      return `Select "${ev.data.element?.selectedText || "option"}"`;
    case "form_submit":
      return "Submit Form";
    case "route_change":
      return `Go to ${ev.data.to || "/"}`;
    default:
      return ev.type;
  }
}

function classifyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("typeerror") || m.includes("cannot read prop") || m.includes("is not a function"))
    return "TypeError";
  if (m.includes("referenceerror") || m.includes("is not defined"))
    return "ReferenceError";
  if (m.includes("syntaxerror"))
    return "SyntaxError";
  if (m.includes("rangeerror"))
    return "RangeError";
  if (m.includes("networkerror") || m.includes("failed to fetch") || m.includes("network"))
    return "Network Error";
  if (m.includes("timeout") || m.includes("timed out"))
    return "Timeout Error";
  if (m.includes("aborted"))
    return "Aborted Request";
  if (m.includes("permission") || m.includes("cors"))
    return "Permission Error";

  // Extract error type from message like "TypeError: ..."
  const typeMatch = msg.match(/^(\w+Error):/);
  if (typeMatch) return typeMatch[1];

  return "Runtime Error";
}

function friendlyPage(path: string): string {
  if (!path || path === "/") return "Home Page";
  const parts = path.split("/").filter(Boolean);
  return parts.map(p => capitalize(p)).join(" ") + " Page";
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "..." : str;
}

function shortenUrl(url: string | undefined): string {
  // Shared hygiene: middle-ellipsizes hash-like segments and caps the length,
  // so no URL shape can flood a bug title.
  return shortDisplayPath(url);
}
