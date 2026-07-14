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
  // Track last step text to avoid duplicates
  let lastStepText = "";

  for (const event of events) {
    switch (event.type) {
      case "route_change": {
        const to = event.data.to || event.page;
        const pageName = friendlyPageName(to);
        steps.push(`${stepNum++}. Navigate to ${pageName} (${to})`);
        break;
      }

      case "click": {
        const el = event.data.element;
        const label = describeElement(el);
        const stepText = `Click ${label}`;
        if (stepText !== lastStepText) {
          steps.push(`${stepNum++}. ${stepText}`);
          lastStepText = stepText;
        }
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
        const stepText = `❌ Error: "${errMsg}"`;
        if (stepText !== lastStepText) {
          steps.push(`${stepNum++}. ${stepText}`);
          lastStepText = stepText;
        }
        break;
      }

      case "console_error": {
        const msg = event.data.error?.message || "";
        // Only include if it looks like a real error, skip React dev warnings etc.
        if (msg.length > 0 && !msg.includes("Warning:") && !msg.includes("DevTools")) {
          const stepText = `Console error: "${msg.slice(0, 120)}"`;
          if (stepText !== lastStepText) {
            steps.push(`${stepNum++}. ${stepText}`);
            lastStepText = stepText;
          }
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

/** The element-summary fields captured by the click collector that this
 *  helper reads. Payloads come off `event.data`, so everything is optional. */
interface ClickedElementInfo {
  tag?: string;
  text?: string;
  id?: string;
  ariaLabel?: string;
  buttonType?: string;
}

function describeElement(el: ClickedElementInfo | null | undefined): string {
  if (!el) return "an element";

  const tag = (el.tag || "").toLowerCase();
  const rawText = (el.text || "").trim();
  // Clean multi-line text (e.g. dropdown showing "Active\nInactive") — take first line only
  const text = rawText.includes("\n") ? rawText.split("\n")[0].trim() : rawText;
  const id = el.id || "";
  const ariaLabel = el.ariaLabel || "";

  // Map raw tag to a reader-friendly noun. Falls back to "element" so we never
  // emit a stray HTML tag name in user-facing repro steps.
  const kind =
    tag === "button" || el.buttonType ? "button"
    : tag === "a" ? "link"
    : tag === "input" ? "input"
    : tag === "select" ? "dropdown"
    : tag === "textarea" ? "text area"
    : tag === "img" || tag === "svg" || tag === "picture" ? "image"
    : tag === "li" ? "list item"
    : tag === "nav" ? "navigation"
    : "element";

  // Prefer aria-label, then text, then id. Truncate (don't discard) long
  // labels — a partial label is far more useful than "a span element".
  const label = ariaLabel || text || (id ? `#${id}` : "");
  if (label) {
    const trimmed = label.length > 60 ? label.slice(0, 60).trimEnd() + "…" : label;
    return `the "${trimmed}" ${kind}`;
  }
  // For unlabeled images we want "an image" not "a image" (article fix).
  const article = /^[aeiou]/i.test(kind) ? "an" : "a";
  return `${article} ${kind}`;
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
