// ── Action Chip builder ─────────────────────────────────────────────────────
// Converts session events into action cards for the Actions tab.
// Each chip has a verb ("Clicked" | "Typed" | etc.), a human-readable target
// ("Checkout" / "Email" / "Login form"), and an HTML-element preview for the
// devs who want the technical detail. Frustration heuristics (rage / dead /
// abandon) are also computed inline so the chip can prefix the row with an
// icon when something interesting happened.
//
// Text exports (GitHub/Jira/markdown) continue to use the plain-English
// `sessionSteps` strings — this module is parallel, not a replacement.

import { ActionChip, ActionChipAttr, TraceBugEvent } from "./types";
import { isNoiseRequest, isStaticResource } from "./url-hygiene";

const MAX_CHIPS = 60;
const MAX_INLINE_ATTRS = 4;
const MAX_VALUE_LEN = 60;
const MAX_DETAIL_LEN = 80;
const MAX_TARGET_LEN = 40;

// Frustration thresholds
const RAGE_WINDOW_MS = 1500;
const RAGE_MIN_CLICKS = 3;
const DEAD_RESPONSE_WINDOW_MS = 1500;

// Attribute priority — top of the list wins inline space. Anything outside
// this list collapses into `moreCount`.
const ATTR_PRIORITY: ReadonlyArray<{ key: string; label?: string }> = [
  { key: "id" },
  { key: "class", label: "class" },
  { key: "type" },
  { key: "name" },
  { key: "href" },
  { key: "ariaLabel", label: "aria-label" },
  { key: "role" },
  { key: "testId", label: "data-testid" },
  { key: "placeholder" },
  { key: "value" },
];

function pickAttrs(el: Record<string, unknown>): { attrs: ActionChipAttr[]; moreCount: number } {
  if (!el || typeof el !== "object") return { attrs: [], moreCount: 0 };
  const picked: ActionChipAttr[] = [];
  let total = 0;
  for (const spec of ATTR_PRIORITY) {
    const raw = el[spec.key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "boolean") {
      if (!raw) continue;
      total += 1;
      if (picked.length < MAX_INLINE_ATTRS) picked.push({ name: spec.label || spec.key, value: "" });
      continue;
    }
    const str = String(raw);
    if (!str) continue;
    total += 1;
    if (picked.length < MAX_INLINE_ATTRS) {
      const value = str.length > MAX_VALUE_LEN ? str.slice(0, MAX_VALUE_LEN) + "…" : str;
      picked.push({ name: spec.label || spec.key, value });
    }
  }
  return { attrs: picked, moreCount: Math.max(0, total - picked.length) };
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function friendlyPagePath(url: string): string {
  try {
    if (!url) return "";
    if (url.startsWith("/")) return url;
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

// ── Smart label extraction ────────────────────────────────────────────────
// Turns developer identifiers ("emailAddress" / "user_name" / "first-name")
// into human-readable phrases ("Email Address" / "User Name" / "First Name").

function humanizeIdentifier(s: string): string {
  if (!s) return "";
  // Strip common prefixes that obscure intent.
  const stripped = s.replace(/^(input|field|form|btn|button|ipt)[-_]?/i, "");
  // camelCase → Camel Case, snake_case / kebab-case → Snake Case.
  return stripped
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.length === 0 ? w : w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function nounForTag(tag: string): string {
  switch ((tag || "").toLowerCase()) {
    case "a": return "link";
    case "button": return "button";
    case "input": return "field";
    case "select": return "dropdown";
    case "textarea": return "text area";
    case "img":
    case "picture":
    case "svg": return "image";
    case "li": return "list item";
    case "nav": return "menu";
    case "label": return "label";
    case "form": return "form";
    default: return "element";
  }
}

function cleanText(s: unknown, max = MAX_TARGET_LEN): string {
  return truncate(String(s || "").trim().replace(/\s+/g, " "), max);
}

// Best human label for a clickable element. Reads, in order: explicit text,
// aria-label, value (for buttons), title, then humanized id/name/testId.
function extractClickTarget(el: Record<string, unknown>): string {
  if (el.text && String(el.text).trim()) return cleanText(el.text);
  if (el.ariaLabel) return cleanText(el.ariaLabel);
  if (typeof el.value === "string" && el.value && el.value !== "[REDACTED]") return cleanText(el.value);
  if (el.title) return cleanText(el.title);
  if (el.testId) return cleanText(humanizeIdentifier(String(el.testId)));
  if (el.id) return cleanText(humanizeIdentifier(String(el.id)));
  if (el.name) return cleanText(humanizeIdentifier(String(el.name)));
  return "";
}

// Best human label for an input/select field. Reads aria-label, placeholder,
// then humanizes name/id. The result is the field name the user would
// recognize — "Email", "Phone Number", "Coupon Code".
function extractFieldTarget(el: Record<string, unknown>): string {
  if (el.ariaLabel) return cleanText(el.ariaLabel);
  if (el.placeholder) return cleanText(el.placeholder);
  if (el.name) return cleanText(humanizeIdentifier(String(el.name)));
  if (el.id) return cleanText(humanizeIdentifier(String(el.id)));
  return "";
}

// Guess a form's purpose from its id/action URL. Falls back to humanized id.
function extractFormTarget(f: Record<string, unknown>): string {
  const action = String(f.action || "");
  const id = String(f.id || "");
  const hay = `${id} ${action}`.toLowerCase();
  if (/login|signin|sign-in/.test(hay)) return "Login";
  if (/signup|register|sign-up/.test(hay)) return "Signup";
  if (/checkout|payment|purchase/.test(hay)) return "Checkout";
  if (/search/.test(hay)) return "Search";
  if (/contact/.test(hay)) return "Contact";
  if (/subscribe|newsletter/.test(hay)) return "Subscribe";
  if (/password|reset/.test(hay)) return "Password";
  if (id) return cleanText(humanizeIdentifier(id));
  return "";
}

// Count how many form fields ended up with a value.
function countFilledFields(f: Record<string, unknown>): { filled: number; total: number } {
  const fields: Record<string, unknown> =
    f.fields && typeof f.fields === "object" ? (f.fields as Record<string, unknown>) : {};
  const total = typeof f.fieldCount === "number" ? f.fieldCount : Object.keys(fields).length;
  let filled = 0;
  for (const v of Object.values(fields)) {
    if (v && String(v).trim() && v !== "[REDACTED]") filled += 1;
    else if (v === "[REDACTED]") filled += 1; // redacted = filled
  }
  return { filled, total };
}

// Cheap "looks invalid" heuristic for known field types. Used to flag
// "Typed invalid email" without an actual validator.
function looksInvalid(type: string, name: string, value: string): boolean {
  if (!value || value === "[REDACTED]") return false;
  const isEmail = type === "email" || /email/i.test(name);
  if (isEmail) {
    // Very forgiving — accepts "a@b.c" and similar; flags only obviously broken.
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
  const isUrl = type === "url" || /url|website|homepage/i.test(name);
  if (isUrl) {
    return !/^https?:\/\/.+\..+/.test(value);
  }
  const isPhone = type === "tel" || /phone|mobile|tel/i.test(name);
  if (isPhone) {
    // Allow + and digits / spaces / dashes / parens; need at least 7 digits.
    const digits = value.replace(/\D/g, "");
    return digits.length < 7;
  }
  return false;
}

// ── Frustration detection (lightweight, runs on the event stream) ─────────
// Builds an annotation map keyed by event index → frustration kind. The
// caller applies these to the corresponding chips. Same heuristics as the
// scanner's frustration detectors but inlined here so we don't have a hard
// dependency on the scanner from the Actions tab.

type FrustrationMap = Map<number, "rage" | "dead" | "abandon">;

function detectFrustration(events: TraceBugEvent[]): FrustrationMap {
  const map: FrustrationMap = new Map();

  // Rage clicks: 3+ clicks on the same selector within RAGE_WINDOW_MS.
  // Mark the 3rd and subsequent clicks in the cluster.
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type !== "click") continue;
    const sel = e.data?.element?.selector || "";
    if (!sel) continue;
    let count = 1;
    for (let j = i - 1; j >= 0 && events[i].timestamp - events[j].timestamp <= RAGE_WINDOW_MS; j--) {
      if (events[j].type === "click" && (events[j].data?.element?.selector || "") === sel) count += 1;
    }
    if (count >= RAGE_MIN_CLICKS) map.set(i, "rage");
  }

  // Dead clicks: a click followed by no DOM-changing event within
  // DEAD_RESPONSE_WINDOW_MS. Lightweight version — counts as "dead" if the
  // next event is more than the threshold away or doesn't exist, except
  // for the last event in the session (we can't know if it was responsive
  // since the session ended).
  for (let i = 0; i < events.length; i++) {
    if (events[i].type !== "click") continue;
    if (map.get(i) === "rage") continue; // rage already captured
    if (i === events.length - 1) continue; // can't judge the last event
    const next = events[i + 1];
    if (next.timestamp - events[i].timestamp > DEAD_RESPONSE_WINDOW_MS) {
      map.set(i, "dead");
    }
  }

  // Form abandonment: input event(s) on a form followed by route_change
  // without a form_submit in between. Mark the last input as "abandon".
  let lastInputIdx = -1;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === "input") lastInputIdx = i;
    else if (e.type === "form_submit") lastInputIdx = -1;
    else if (e.type === "route_change" && lastInputIdx !== -1) {
      if (!map.has(lastInputIdx)) map.set(lastInputIdx, "abandon");
      lastInputIdx = -1;
    }
  }

  return map;
}

// ── Main builder ──────────────────────────────────────────────────────────

/**
 * Turn a list of session events into action chips. Caps the result at the
 * last MAX_CHIPS events so the UI stays scrollable but useful.
 */
export function buildActionChips(events: TraceBugEvent[]): ActionChip[] {
  if (!events || events.length === 0) return [];

  // Compute frustration map over the FULL list (so cross-window detection is
  // accurate) then slice to the last MAX_CHIPS. Indexes for the slice are
  // mapped back to the original list when looking up frustration.
  const frustration = detectFrustration(events);
  const offset = events.length > MAX_CHIPS ? events.length - MAX_CHIPS : 0;
  const sliced = events.slice(offset);
  const chips: ActionChip[] = [];

  for (let i = 0; i < sliced.length; i++) {
    const e = sliced[i];
    const origIdx = offset + i;
    const frust = frustration.get(origIdx);

    switch (e.type) {
      case "click": {
        const el = e.data?.element || {};
        const picked = pickAttrs(el);
        chips.push({
          verb: "Clicked",
          kind: "click",
          target: extractClickTarget(el) || undefined,
          nounLabel: nounForTag(String(el.tag || "")),
          element: { tag: String(el.tag || "element"), attrs: picked.attrs, moreCount: picked.moreCount },
          frustration: frust,
          timestamp: e.timestamp,
        });
        break;
      }
      case "input": {
        const el = e.data?.element || {};
        const inputType = String(el.type || "text");
        const fieldName = extractFieldTarget(el);
        const picked = pickAttrs(el);

        // Checkboxes / radios: verb tells you what happened, no value chip.
        if (inputType === "checkbox" || inputType === "radio") {
          chips.push({
            verb: el.checked ? "Checked" : "Unchecked",
            kind: "input",
            target: fieldName || undefined,
            element: { tag: "input", attrs: picked.attrs, moreCount: picked.moreCount },
            frustration: frust,
            timestamp: e.timestamp,
          });
          break;
        }

        // Text-like: show the typed value (already redacted if sensitive).
        const val = typeof el.value === "string" ? el.value : "";
        const invalid = looksInvalid(inputType, String(el.name || el.id || ""), val);
        const detail = val
          ? (invalid ? `invalid: "${truncate(val, MAX_DETAIL_LEN - 12)}"` : `"${truncate(val, MAX_DETAIL_LEN - 2)}"`)
          : undefined;
        chips.push({
          verb: invalid ? "Typed (invalid)" : "Typed",
          kind: "input",
          target: fieldName || undefined,
          element: { tag: "input", attrs: picked.attrs, moreCount: picked.moreCount },
          detail,
          frustration: frust,
          isError: invalid || undefined,
          timestamp: e.timestamp,
        });
        break;
      }
      case "select_change": {
        const el = e.data?.element || {};
        const picked = pickAttrs(el);
        chips.push({
          verb: "Selected",
          kind: "select",
          target: extractFieldTarget(el) || undefined,
          element: { tag: "select", attrs: picked.attrs, moreCount: picked.moreCount },
          detail: el.selectedText ? `"${truncate(String(el.selectedText), MAX_DETAIL_LEN - 2)}"` : undefined,
          frustration: frust,
          timestamp: e.timestamp,
        });
        break;
      }
      case "form_submit": {
        const f = e.data?.form || {};
        const target = extractFormTarget(f);
        const { filled, total } = countFilledFields(f);
        const attrs: ActionChipAttr[] = [];
        if (f.id) attrs.push({ name: "id", value: String(f.id) });
        if (f.method) attrs.push({ name: "method", value: String(f.method).toUpperCase() });
        if (f.action) attrs.push({ name: "action", value: truncate(String(f.action), MAX_VALUE_LEN) });
        chips.push({
          verb: "Submitted",
          kind: "submit",
          target: target || undefined,
          nounLabel: "form",
          element: { tag: "form", attrs, moreCount: 0 },
          detail: total > 0 ? `${filled} of ${total} field${total === 1 ? "" : "s"} filled` : undefined,
          timestamp: e.timestamp,
        });
        break;
      }
      case "route_change": {
        const from = friendlyPagePath(String(e.data?.from || ""));
        const to = friendlyPagePath(String(e.data?.to || ""));
        chips.push({
          verb: "Navigated",
          kind: "navigate",
          detail: from ? `${from} → ${to}` : to,
          timestamp: e.timestamp,
        });
        break;
      }
      case "api_request": {
        const r = e.data?.request || {};
        const status = Number(r.statusCode || 0);
        const isError = status === 0 || status >= 400;
        const url = String(r.url || "");
        // The Actions tab is the USER'S story — page mechanics don't belong.
        // Beacons/analytics/badges are skipped outright (their failures are
        // usually just an ad-blocker), and successful script/style/image
        // loads are skipped too. A FAILED first-party chunk stays: that's a
        // real signal. The Network tab still lists every request.
        if (isNoiseRequest(url)) break;
        if (!isError && isStaticResource(url)) break;
        chips.push({
          verb: isError ? "Request failed" : "Request",
          kind: "api",
          detail: `${String(r.method || "GET").toUpperCase()} ${truncate(url, MAX_DETAIL_LEN)} → ${status === 0 ? "ERR" : status}`,
          timestamp: e.timestamp,
          isError,
        });
        break;
      }
      case "error":
      case "console_error":
      case "unhandled_rejection": {
        const msg = String(e.data?.message || e.data?.error || "Runtime error");
        chips.push({
          verb: "Error",
          kind: "error",
          detail: truncate(msg, MAX_DETAIL_LEN),
          timestamp: e.timestamp,
          isError: true,
        });
        break;
      }
      case "console_warn": {
        const msg = String(e.data?.message || "Warning");
        chips.push({
          verb: "Warning",
          kind: "error",
          detail: truncate(msg, MAX_DETAIL_LEN),
          timestamp: e.timestamp,
        });
        break;
      }
      case "mark": {
        const label = String(e.data?.label || "Mark");
        chips.push({
          verb: "Mark",
          kind: "mark",
          detail: truncate(label, MAX_DETAIL_LEN),
          timestamp: e.timestamp,
        });
        break;
      }
      // console_info / console_log intentionally skipped — breadcrumb noise
      // for the Actions story; they stay visible in the timeline + Console tab.
      default:
        break;
    }
  }

  return chips;
}
