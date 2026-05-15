// ── Frustration detectors ─────────────────────────────────────────────────
// Surface user-experienced bugs that don't throw exceptions but make users
// hate the product:
//   - Rage clicks: ≥3 clicks on the same selector within 1.5 s with no response
//   - Dead clicks: click with no DOM/route/network/input response within 1.5 s
//   - Form abandonment: input events on a form, then route_change before submit
//   - Error correlation: error fired ≤2.5 s after a click — pair them
//
// Pure analysis over the existing event log. No new tracking code, no extra
// listeners.

import { Issue, StoredSession, TraceBugEvent } from "../../types";
import { makeIssueId } from "../helpers";

const RAGE_WINDOW_MS = 1500;
const RAGE_MIN_CLICKS = 3;
const DEAD_RESPONSE_WINDOW_MS = 1500;
const ABANDON_WINDOW_MS = 60_000;
const ERROR_CORRELATION_WINDOW_MS = 2500;

export async function detectFrustration(session: StoredSession | null): Promise<Issue[]> {
  if (!session) return [];
  const events = session.events;
  if (events.length === 0) return [];

  const issues: Issue[] = [];
  const page = session.events[0]?.page || window.location.pathname;

  issues.push(...detectRageClicks(events, page));
  issues.push(...detectDeadClicks(events, page));
  issues.push(...detectFormAbandonment(events, page));
  issues.push(...detectErrorCorrelated(events, page));

  return issues;
}

// ── Rage clicks ───────────────────────────────────────────────────────
// Sliding window: ≥3 clicks on the same selector inside 1.5 s, with no
// response (api_request, route_change, or input on the same form) between.

function detectRageClicks(events: TraceBugEvent[], page: string): Issue[] {
  const out: Issue[] = [];
  const seenGroups = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== "click") continue;
    const sel = e.data?.element?.selector || e.data?.element?.testId || "";
    if (!sel) continue;

    // Look ahead for sibling clicks within RAGE_WINDOW_MS on the same selector.
    const cluster: TraceBugEvent[] = [e];
    let j = i + 1;
    while (j < events.length) {
      const next = events[j];
      if (next.timestamp - e.timestamp > RAGE_WINDOW_MS) break;
      // Stop if a "response" event happened — not rage if anything responded.
      if (isResponseEvent(next)) break;
      if (next.type === "click") {
        const nextSel = next.data?.element?.selector || next.data?.element?.testId || "";
        if (nextSel === sel) cluster.push(next);
      }
      j++;
    }

    if (cluster.length >= RAGE_MIN_CLICKS) {
      const key = `${sel}@${e.timestamp}`;
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);

      const label = clickLabel(cluster[0]);
      out.push({
        id: makeIssueId("frustration-rage"),
        detector: "frustration-rage",
        severity: "serious",
        title: `Rage clicks on ${label} (${cluster.length}× in ${Math.round((cluster[cluster.length - 1].timestamp - cluster[0].timestamp))}ms)`,
        description: `User clicked the same element ${cluster.length} times within ${RAGE_WINDOW_MS}ms with no observable response (no API call, navigation, or DOM update). The element either doesn't respond to clicks or feels broken.`,
        selector: sel,
        page,
        detectedAt: cluster[0].timestamp,
        firstSeenAt: cluster[0].timestamp,
        lastSeenAt: cluster[cluster.length - 1].timestamp,
        occurrences: cluster.length,
      });
      // Skip past the cluster to avoid double-flagging.
      i = j - 1;
    }
  }

  return out;
}

// ── Dead clicks ───────────────────────────────────────────────────────
// Click followed by no api_request, route_change, or input within 1.5 s.

function detectDeadClicks(events: TraceBugEvent[], page: string): Issue[] {
  const out: Issue[] = [];
  // Cap output: dead-click detection is noisy on long sessions.
  const MAX = 5;

  for (let i = 0; i < events.length && out.length < MAX; i++) {
    const e = events[i];
    if (e.type !== "click") continue;
    // Skip if the next event in the same window is another click on the same
    // selector (likely a rage cluster — already flagged separately).
    let responsive = false;
    for (let j = i + 1; j < events.length; j++) {
      const next = events[j];
      if (next.timestamp - e.timestamp > DEAD_RESPONSE_WINDOW_MS) break;
      if (isResponseEvent(next)) { responsive = true; break; }
    }
    if (responsive) continue;

    const sel = e.data?.element?.selector || "";
    const label = clickLabel(e);
    out.push({
      id: makeIssueId("frustration-dead"),
      detector: "frustration-dead",
      severity: "moderate",
      title: `Dead click on ${label}`,
      description: `Clicked but nothing happened within ${DEAD_RESPONSE_WINDOW_MS}ms (no API call, navigation, or DOM input). The element may have an unbound handler, a swallowed event, or be visually clickable but disabled.`,
      selector: sel,
      page: e.page || page,
      detectedAt: e.timestamp,
    });
  }

  return out;
}

// ── Form abandonment ──────────────────────────────────────────────────
// Inputs on a form, then route_change before form_submit.

function detectFormAbandonment(events: TraceBugEvent[], page: string): Issue[] {
  const out: Issue[] = [];
  // Track per-form: has the user typed in it but not submitted?
  const formActivity: Record<string, { firstInputAt: number; fieldsSeen: Set<string>; lastInputAt: number; page: string }> = {};

  for (const e of events) {
    if (e.type === "input") {
      const formId = e.data?.element?.formId || e.data?.element?.formAction || "_default";
      if (!formActivity[formId]) {
        formActivity[formId] = { firstInputAt: e.timestamp, fieldsSeen: new Set(), lastInputAt: e.timestamp, page: e.page };
      }
      const name = e.data?.element?.name || e.data?.element?.id || "field";
      formActivity[formId].fieldsSeen.add(name);
      formActivity[formId].lastInputAt = e.timestamp;
    } else if (e.type === "form_submit") {
      const formId = e.data?.form?.id || "_default";
      delete formActivity[formId];
    } else if (e.type === "route_change") {
      // Any route change with active forms = abandonment if within window.
      for (const formId of Object.keys(formActivity)) {
        const a = formActivity[formId];
        if (e.timestamp - a.lastInputAt > ABANDON_WINDOW_MS) continue;
        if (a.fieldsSeen.size === 0) continue;
        out.push({
          id: makeIssueId("frustration-abandon"),
          detector: "frustration-abandon",
          severity: "moderate",
          title: `Form abandoned on ${a.page} (${a.fieldsSeen.size} field${a.fieldsSeen.size === 1 ? "" : "s"} filled)`,
          description: `User typed into ${a.fieldsSeen.size} field${a.fieldsSeen.size === 1 ? "" : "s"} (${Array.from(a.fieldsSeen).slice(0, 5).join(", ")}) and then navigated away without submitting. Likely a UX problem: the submit button is unclear, the form requires too much info, or it's failing silently.`,
          page: a.page,
          detectedAt: a.lastInputAt,
          firstSeenAt: a.firstInputAt,
          lastSeenAt: a.lastInputAt,
        });
        delete formActivity[formId];
      }
    }
  }

  return out;
}

// ── Error correlation ─────────────────────────────────────────────────
// For each error, look back ≤2.5 s for the nearest click — likely the
// triggering interaction. Tag both events together.

function detectErrorCorrelated(events: TraceBugEvent[], page: string): Issue[] {
  const out: Issue[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const isError = e.type === "error" || e.type === "unhandled_rejection" || e.type === "console_error";
    if (!isError) continue;

    // Look back for the nearest click.
    let click: TraceBugEvent | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const prev = events[j];
      if (e.timestamp - prev.timestamp > ERROR_CORRELATION_WINDOW_MS) break;
      if (prev.type === "click") { click = prev; break; }
    }
    if (!click) continue;

    const errMsg = e.data?.error?.message || "";
    if (!errMsg) continue;
    const key = `${errMsg}::${click.data?.element?.selector || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = clickLabel(click);
    const truncMsg = errMsg.length > 60 ? errMsg.slice(0, 57) + "…" : errMsg;
    const delta = Math.round((e.timestamp - click.timestamp));
    out.push({
      id: makeIssueId("frustration-error-correlated"),
      detector: "frustration-error-correlated",
      severity: "critical",
      title: `Click on ${label} triggered: ${truncMsg}`,
      description: `An error fired ${delta}ms after the user clicked ${label}. This is almost certainly the offending interaction — the click handler threw, or its async path failed.`,
      selector: click.data?.element?.selector,
      page: e.page || page,
      detectedAt: e.timestamp,
    });
  }

  return out;
}

// ── Helpers ────────────────────────────────────────────────────────────

function isResponseEvent(e: TraceBugEvent): boolean {
  return (
    e.type === "api_request" ||
    e.type === "route_change" ||
    e.type === "input" ||
    e.type === "form_submit" ||
    e.type === "select_change"
  );
}

function clickLabel(e: TraceBugEvent): string {
  const el = e.data?.element;
  const raw = el?.text || el?.ariaLabel || el?.testId || el?.id || el?.tag || "element";
  const trimmed = String(raw).replace(/\s+/g, " ").trim();
  return trimmed.length > 40 ? `"${trimmed.slice(0, 37)}…"` : `"${trimmed}"`;
}
