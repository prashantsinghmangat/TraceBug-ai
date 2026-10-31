// ── Plugin & Hook System ──────────────────────────────────────────────────
// Extensible plugin API + event hooks for community integrations.

import { TraceBugEvent, BugReport } from "./types";

export interface TraceBugPlugin {
  name: string;
  onEvent?: (event: TraceBugEvent) => TraceBugEvent | null;
  onReport?: (report: BugReport) => BugReport;
  onExport?: (format: string, data: string) => string;
  onInit?: () => void;
  onDestroy?: () => void;
}

type HookEvent =
  | "session:start"
  | "session:end"
  | "error:captured"
  | "screenshot:taken"
  | "report:generated"
  | "recording:paused"
  | "recording:resumed"
  | "annotate:saved"
  | "draw:saved";

type HookCallback = (...args: unknown[]) => void;

const _plugins: TraceBugPlugin[] = [];
const _hooks: Map<HookEvent, Set<HookCallback>> = new Map();

// ── Plugin API ───────────────────────────────────────────────────────────

export function registerPlugin(plugin: TraceBugPlugin): void {
  if (_plugins.some(p => p.name === plugin.name)) {
    console.warn(`[TraceBug] Plugin "${plugin.name}" already registered.`);
    return;
  }
  _plugins.push(plugin);
  if (plugin.onInit) plugin.onInit();
}

export function unregisterPlugin(name: string): void {
  const idx = _plugins.findIndex(p => p.name === name);
  if (idx >= 0) {
    const plugin = _plugins[idx];
    if (plugin.onDestroy) plugin.onDestroy();
    _plugins.splice(idx, 1);
  }
}

/** Run all plugin onEvent hooks. Returns null if any plugin filters the event. */
export function runEventPlugins(event: TraceBugEvent): TraceBugEvent | null {
  let result: TraceBugEvent | null = event;
  for (const plugin of _plugins) {
    if (plugin.onEvent && result) {
      result = plugin.onEvent(result);
    }
  }
  return result;
}

/**
 * Run all plugin onReport hooks. A hook that throws, or returns something that
 * isn't a report, is skipped with a warning — one broken plugin must not stop
 * every report from being built.
 */
export function runReportPlugins(report: BugReport): BugReport {
  let result = report;
  for (const plugin of _plugins) {
    if (!plugin.onReport) continue;
    try {
      const next = plugin.onReport(result);
      if (next && typeof next === "object") result = next;
      else console.warn(`[TraceBug] Plugin "${plugin.name}" onReport returned no report — ignored.`);
    } catch (err) {
      console.warn(`[TraceBug] Plugin "${plugin.name}" onReport threw — skipped:`, err);
    }
  }
  return result;
}

/**
 * Run all plugin onExport hooks over an export's text. `format` is one of
 * "html", "markdown", "ai-html", "har", "playwright", "pdf", "json", "text",
 * "html-report". Same isolation as runReportPlugins: a hook that throws or
 * returns a non-string is skipped, and the export goes out unchanged by it.
 */
export function runExportPlugins(format: string, data: string): string {
  let result = data;
  for (const plugin of _plugins) {
    if (!plugin.onExport) continue;
    try {
      const next = plugin.onExport(format, result);
      if (typeof next === "string") result = next;
      else console.warn(`[TraceBug] Plugin "${plugin.name}" onExport returned a non-string — ignored.`);
    } catch (err) {
      console.warn(`[TraceBug] Plugin "${plugin.name}" onExport threw — skipped:`, err);
    }
  }
  return result;
}

// ── Hook API ─────────────────────────────────────────────────────────────

export function onHook(event: HookEvent, callback: HookCallback): () => void {
  if (!_hooks.has(event)) _hooks.set(event, new Set());
  _hooks.get(event)!.add(callback);

  // Return unsubscribe function
  return () => {
    const set = _hooks.get(event);
    if (set) set.delete(callback);
  };
}

export function emitHook(event: HookEvent, ...args: unknown[]): void {
  const callbacks = _hooks.get(event);
  if (!callbacks) return;
  for (const cb of callbacks) {
    try {
      cb(...args);
    } catch (err) {
      console.warn(`[TraceBug] Hook "${event}" error:`, err);
    }
  }
}

export function clearAllPlugins(): void {
  for (const plugin of _plugins) {
    if (plugin.onDestroy) plugin.onDestroy();
  }
  _plugins.length = 0;
  _hooks.clear();
}
