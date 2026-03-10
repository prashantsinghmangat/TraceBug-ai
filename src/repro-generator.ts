// ── Reproduction step generator ───────────────────────────────────────────
// Runs entirely in the browser — no AI API needed.
// Analyzes the event timeline and produces human-readable steps.

import { TraceBugEvent } from "./types";

export interface ReproResult {
  reproSteps: string;
  errorSummary: string;
}

/**
 * Takes a list of session events and the error info, and produces numbered
 * reproduction steps + a short error summary.
 */
export function generateReproSteps(
  events: TraceBugEvent[],
  errorMessage: string,
  errorStack?: string
): ReproResult {
  const steps: string[] = [];
  let stepNum = 1;

  // Track state for smarter descriptions
  let currentPage = "";

  for (const event of events) {
    switch (event.type) {
      case "route_change": {
        const to = event.data.to || event.page;
        const pageName = friendlyPageName(to);
        steps.push(`${stepNum++}. Navigate to ${pageName} (${to})`);
        currentPage = to;
        break;
      }

      case "click": {
        const el = event.data.element;
        const label = describeElement(el);
        steps.push(`${stepNum++}. Click ${label}`);
        break;
      }

      case "input": {
        const inp = event.data.element;
        const fieldName = inp?.name || inp?.id || "field";
        const inputType = inp?.type || "text";

        if (inputType === "checkbox" || inputType === "radio") {
          steps.push(`${stepNum++}. ${inp?.checked ? "Check" : "Uncheck"} "${fieldName}"`);
        } else {
          const val = inp?.value;
          if (val && val !== "[REDACTED]" && val.length <= 60) {
            steps.push(`${stepNum++}. Type "${val}" in "${fieldName}" field`);
          } else {
            steps.push(
              `${stepNum++}. Type in "${fieldName}" field (${inp?.valueLength || 0} characters)`
            );
          }
        }
        break;
      }

      case "select_change": {
        const sel = event.data.element;
        const fieldName = sel?.name || sel?.id || "dropdown";
        const selectedText = sel?.selectedText || sel?.value || "unknown";
        steps.push(`${stepNum++}. Select "${selectedText}" from "${fieldName}" dropdown`);
        break;
      }

      case "form_submit": {
        const f = event.data.form;
        const formName = f?.id || f?.action || "form";
        const fieldCount = f?.fieldCount || 0;
        steps.push(`${stepNum++}. Submit ${formName} form (${fieldCount} fields)`);
        break;
      }

      case "api_request": {
        const req = event.data.request;
        if (req?.statusCode >= 400 || req?.statusCode === 0) {
          steps.push(
            `${stepNum++}. API call fails: ${req.method} ${shortenUrl(req.url)} → ${
              req.statusCode === 0 ? "Network Error" : `HTTP ${req.statusCode}`
            }`
          );
        }
        // Skip successful API calls — they clutter the steps
        break;
      }

      case "error":
      case "unhandled_rejection": {
        const errMsg = event.data.error?.message || errorMessage;
        steps.push(`${stepNum++}. ❌ Error occurs: "${errMsg}"`);
        break;
      }

      case "console_error": {
        const msg = event.data.error?.message || "";
        // Only include if it looks like a real error, skip React dev warnings etc.
        if (msg.length > 0 && !msg.includes("Warning:") && !msg.includes("DevTools")) {
          steps.push(`${stepNum++}. Console error: "${msg.slice(0, 120)}"`);
        }
        break;
      }
    }
  }

  // If no steps were generated, add a generic one
  if (steps.length === 0) {
    steps.push("1. (No user interactions recorded before the error)");
  }

  // Build error summary
  const summary = buildErrorSummary(errorMessage, errorStack, events);

  return {
    reproSteps: steps.join("\n"),
    errorSummary: summary,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function describeElement(el: any): string {
  if (!el) return "an element";

  const tag = el.tag || "";
  const text = (el.text || "").trim();
  const id = el.id || "";
  const ariaLabel = el.ariaLabel || "";

  // Prefer aria-label, then text, then id
  if (ariaLabel && ariaLabel.length < 50) {
    return `"${ariaLabel}" ${tag}`;
  }
  if (text && text.length < 50) {
    return `"${text}" ${tag}`;
  }
  if (id) {
    return `#${id} ${tag}`;
  }
  return `a ${tag} element`;
}

function friendlyPageName(path: string): string {
  if (path === "/") return "Home page";
  // "/vendor/edit" → "Vendor Edit page"
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  return parts.join(" ") + " page";
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + (u.search ? "..." : "");
  } catch {
    return url.slice(0, 60);
  }
}

function buildErrorSummary(
  errorMessage: string,
  errorStack: string | undefined,
  events: TraceBugEvent[]
): string {
  const parts: string[] = [];

  parts.push(`Error: ${errorMessage}`);

  // Try to extract the source location from the stack
  if (errorStack) {
    const match = errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
    if (match) {
      parts.push(`Thrown in: ${match[1]} at ${match[2]}`);
    }
  }

  // What page it happened on
  const errorEvents = events.filter(
    (e) => e.type === "error" || e.type === "unhandled_rejection"
  );
  if (errorEvents.length > 0) {
    parts.push(`Page: ${errorEvents[0].page}`);
  }

  // What was the last user action before the error
  const userActions = events.filter((e) =>
    ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
  );
  if (userActions.length > 0) {
    const last = userActions[userActions.length - 1];
    if (last.type === "click") {
      parts.push(
        `Last action: clicked "${last.data.element?.text || last.data.element?.id || "element"}"`
      );
    } else if (last.type === "input") {
      const val = last.data.element?.value;
      if (val && val !== "[REDACTED]") {
        parts.push(`Last action: typed "${val}" in "${last.data.element?.name || "field"}"`);
      } else {
        parts.push(`Last action: typed in "${last.data.element?.name || "field"}"`);
      }
    } else if (last.type === "select_change") {
      parts.push(`Last action: selected "${last.data.element?.selectedText}" from "${last.data.element?.name || "dropdown"}"`);
    } else if (last.type === "form_submit") {
      parts.push(`Last action: submitted form "${last.data.form?.id || ""}"`);
    }
  }

  return parts.join("\n");
}
