// ── Developer Breadcrumbs API ─────────────────────────────────────────────
// Three tiny APIs devs sprinkle into their code to capture *intent*:
//   - mark(label, payload?)    — labeled diamond on the timeline scrubber
//   - assert(cond, message)    — captures a bug ticket on `false`
//   - context({ ... })         — key/value attached to every subsequent report
//
// The mark/assert path goes through the SDK's existing event emit pipeline so
// breadcrumbs are stored in the session like every other event (and survive
// a localStorage round-trip). Context lives in module-scope only — merged into
// reports at build time, never persisted.

import { ContextData, EventType, TraceBugEvent } from "./types";

// Module-scope state. Cleared by destroy() via clearDevApiState().
let _emit: ((type: EventType, data: TraceBugEvent["data"]) => void) | null = null;
let _processError: ((message: string, stack?: string) => void) | null = null;
let _context: ContextData = {};

/**
 * Wired by the SDK's init() so dev-api can route through the same emit
 * pipeline as the auto-collectors. Without this, mark/assert are no-ops.
 */
export function setDevApiHooks(hooks: {
  emit: (type: EventType, data: TraceBugEvent["data"]) => void;
  processError: (message: string, stack?: string) => void;
}): void {
  _emit = hooks.emit;
  _processError = hooks.processError;
}

/** Clear all dev-api state. Called from `TraceBug.destroy()`. */
export function clearDevApiState(): void {
  _emit = null;
  _processError = null;
  _context = {};
}

/**
 * Drop a labeled marker into the session timeline. Renders as a diamond
 * on the replay scrubber. Optional payload (must be JSON-serializable —
 * we don't deep-clone it here, just stash the reference).
 *
 *   TraceBug.mark("Started checkout flow", { cartTotal: 49.99 });
 */
export function mark(label: string, payload?: Record<string, unknown>): void {
  if (!_emit) {
    if (typeof console !== "undefined") console.warn("[TraceBug] mark() called before init() — ignored.");
    return;
  }
  if (typeof label !== "string" || !label.trim()) return;
  try {
    _emit("mark", { label: label.slice(0, 200), payload: sanitizePayload(payload) });
  } catch {}
}

/**
 * Assert a runtime invariant. On `false`, captures a synthetic Error and
 * routes it through the SDK's error pipeline — Live Bug Card appears,
 * report contains the assertion message + JS call stack.
 *
 *   TraceBug.assert(user != null, "User must be logged in here");
 */
export function assertCondition(condition: unknown, message: string): void {
  if (condition) return;
  const msg = `Assertion failed: ${typeof message === "string" ? message : "condition was falsy"}`;

  // Capture a stack — synthesizing one with `new Error()` here means the
  // top frame is THIS function, but the call site is one frame down.
  let stack = "";
  try { stack = new Error(msg).stack || ""; } catch {}

  // Route through both pipelines: emit a console_error event so it shows
  // up in the timeline / scrubber, AND call processError so the Live Bug
  // Card surfaces and the report's reproSteps get regenerated.
  try { _emit?.("console_error", { error: { message: msg, stack } }); } catch {}
  try { _processError?.(msg, stack); } catch {}
}

/**
 * Set or merge custom context that gets attached to every subsequent report.
 * Keys are merged shallow — call multiple times to add fields incrementally.
 *
 *   TraceBug.context({ buildId: "abc123" });
 *   TraceBug.context({ featureFlag: "new-checkout" });
 *   // → both keys present in report.context
 */
export function context(values: ContextData): void {
  if (!values || typeof values !== "object") return;
  for (const key of Object.keys(values)) {
    const v = values[key];
    if (v === undefined) {
      delete _context[key];
      continue;
    }
    // Only allow the four primitive types we promised in the type signature.
    if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      _context[key] = v;
    }
  }
}

/** Snapshot of current context — used by report-builder when assembling reports. */
export function getCurrentContext(): ContextData {
  return { ..._context };
}

/** Wipe context — used by tests or callers who want to reset between sessions. */
export function clearContext(): void {
  _context = {};
}

/**
 * Defensive sanitizer for `mark()` payloads. We don't try to be clever —
 * just stringify-safe values (primitives + plain object/array). Anything
 * that would throw on JSON.stringify is dropped.
 */
function sanitizePayload(payload: unknown): Record<string, unknown> | undefined {
  if (payload == null || typeof payload !== "object") return undefined;
  try {
    JSON.stringify(payload);
    return payload as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Filter helper used by report-builder to extract mark events. */
export function filterMarks(events: TraceBugEvent[]): Array<{ timestamp: number; label: string; payload?: Record<string, unknown> }> {
  return events
    .filter(e => e.type === "mark")
    .map(e => ({
      timestamp: e.timestamp,
      label: e.data?.label || "",
      payload: e.data?.payload,
    }));
}
