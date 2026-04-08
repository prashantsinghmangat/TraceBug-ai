// ── Timeline builder ──────────────────────────────────────────────────────
// Converts raw events into a developer-friendly debug timeline.
// Shows elapsed time from session start for each event.

import { TraceBugEvent, TimelineEntry } from "./types";

export function buildTimeline(events: TraceBugEvent[]): TimelineEntry[] {
  if (events.length === 0) return [];

  const startTs = events[0].timestamp;
  const timeline: TimelineEntry[] = [];
  let lastDescription = "";

  for (const ev of events) {
    const elapsed = formatElapsed(ev.timestamp - startTs);
    const isError = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
    const isApiError = ev.type === "api_request" &&
      (ev.data.request?.statusCode >= 400 || ev.data.request?.statusCode === 0);

    const description = describeTimelineEvent(ev);

    // Deduplicate consecutive identical entries (same type + description)
    const entryKey = `${ev.type}:${description}`;
    if (entryKey === lastDescription) continue;
    lastDescription = entryKey;

    timeline.push({
      timestamp: ev.timestamp,
      elapsed,
      type: ev.type,
      description,
      isError: isError || isApiError,
      page: ev.page,
    });
  }

  return timeline;
}

export function formatTimelineText(entries: TimelineEntry[]): string {
  if (entries.length === 0) return "(empty session)";

  const lines: string[] = [];
  for (const entry of entries) {
    const marker = entry.isError ? "!!" : "  ";
    lines.push(`${entry.elapsed} ${marker} ${entry.type.padEnd(18)} ${entry.description}`);
  }
  return lines.join("\n");
}

function describeTimelineEvent(ev: TraceBugEvent): string {
  switch (ev.type) {
    case "click": {
      const el = ev.data.element;
      let target = el?.text?.trim() || el?.ariaLabel || el?.id || el?.tag || "element";
      // Clean multi-line text (e.g. dropdown showing all options)
      if (target.includes("\n")) target = target.split("\n")[0].trim();
      return `click "${target.slice(0, 50)}"`;
    }
    case "input": {
      const name = ev.data.element?.name || ev.data.element?.id || "field";
      const val = ev.data.element?.value;
      if (val && val !== "[REDACTED]") return `input "${name}" = "${val.slice(0, 30)}"`;
      return `input "${name}"`;
    }
    case "select_change": {
      const name = ev.data.element?.name || "dropdown";
      return `select "${name}" → "${ev.data.element?.selectedText || ""}"`;
    }
    case "form_submit": {
      const id = ev.data.form?.id || "form";
      return `submit ${id} (${ev.data.form?.fieldCount || 0} fields)`;
    }
    case "route_change":
      return `${ev.data.from || "/"} → ${ev.data.to || "/"}`;
    case "api_request": {
      const r = ev.data.request;
      const status = r?.statusCode === 0 ? "NETWORK_ERR" : String(r?.statusCode);
      return `${r?.method} ${shortenUrl(r?.url)} → ${status} (${r?.durationMs}ms)`;
    }
    case "error":
    case "unhandled_rejection":
      return ev.data.error?.message || "Unknown error";
    case "console_error":
      return (ev.data.error?.message || "").slice(0, 80);
    default:
      return JSON.stringify(ev.data).slice(0, 60);
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
}

function shortenUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url, window.location.origin).pathname.slice(0, 40);
  } catch {
    return (url || "").slice(0, 40);
  }
}
