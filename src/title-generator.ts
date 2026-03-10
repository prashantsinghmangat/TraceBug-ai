// ── Auto bug title generator ──────────────────────────────────────────────
// Generates intelligent, human-readable bug titles from session data.
// Uses heuristic rules — no AI API needed.

import { TraceBugEvent, StoredSession } from "./types";

export function generateBugTitle(session: StoredSession): string {
  const events = session.events;
  const errorEvents = events.filter(e => e.type === "error" || e.type === "unhandled_rejection");
  const userActions = events.filter(e =>
    ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
  );

  // No error — generate a flow summary title
  if (errorEvents.length === 0) {
    return generateFlowTitle(userActions, events);
  }

  const errorMsg = errorEvents[0].data.error?.message || session.errorMessage || "Unknown error";
  const errorType = classifyError(errorMsg);
  const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
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

function generateFlowTitle(userActions: TraceBugEvent[], allEvents: TraceBugEvent[]): string {
  const failedApis = allEvents.filter(e =>
    e.type === "api_request" && (e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0)
  );

  if (failedApis.length > 0) {
    const api = failedApis[0].data.request;
    const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
    const context = getActionContext(lastAction);
    return context
      ? `${context} — API ${api?.method} Returns ${api?.statusCode || "Network Error"}`
      : `API Failure: ${api?.method} ${shortenUrl(api?.url)} Returns ${api?.statusCode || "Network Error"}`;
  }

  if (userActions.length === 0) return "Empty Session — No User Interactions";

  const lastActions = userActions.slice(-3);
  const parts = lastActions.map(a => describeAction(a));
  return `Session: ${parts.join(" → ")}`;
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
      const text = ev.data.element?.text?.trim() || ev.data.element?.id || "element";
      return `Click "${truncate(text, 20)}"`;
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
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.slice(0, 40);
  }
}
