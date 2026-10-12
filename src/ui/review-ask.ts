// ── Review ask ────────────────────────────────────────────────────────────
// Shown at most TWICE, ever: after the 3rd successful export, and — only if the
// first one was dismissed rather than acted on — after the 10th. Then never
// again.
//
// Values guardrails (do not weaken these):
//  - never blocks anything; no feature is gated on answering
//  - no incentives, no fake ratings, no counts, no "everyone loves it"
//  - "Not now", ✕ and Esc are all the same thing: no, and ask at most once more
//  - never in the user's FIRST session. Someone three exports into their first
//    ten minutes has not formed an opinion yet, and asking then is the thing
//    that makes a review prompt feel like nagware.
//
// Counting lives in localStorage, not chrome.storage, even though Phase 5 says
// "extension storage": this card renders in the page's main world, the npm SDK
// has no extension storage at all, and an export count is not a secret. Same
// choice as milestone-ask.ts, for the same reason.

import { reviewUrl } from "../links";

const COUNT_KEY = "tracebug_export_count";
const STATE_KEY = "tracebug_review_ask";
const FIRST_SESSION_KEY = "tracebug_review_first_session";
const CARD_ID = "tracebug-review-ask";

const FIRST_ASK_AT = 3;
const SECOND_ASK_AT = 10;

/** "asked1" = shown once and dismissed. "done" = acted on, or asked twice. */
type AskState = "" | "asked1" | "done";

function readState(): AskState {
  try { return (localStorage.getItem(STATE_KEY) as AskState) || ""; } catch { return "done"; }
}
function writeState(state: AskState): void {
  try { localStorage.setItem(STATE_KEY, state); } catch { /* private mode */ }
}

/**
 * Record one successful export and return whether this is the moment to ask.
 *
 * Called ONLY after an export actually produced a file — a failed or cancelled
 * export must not count, or the prompt arrives having been "earned" by nothing.
 *
 * @param sessionId the session the export came from, used to recognise the
 *        user's first session. Pass null when unknown: the ask is then
 *        suppressed rather than risked.
 */
export function recordExport(sessionId: string | null): boolean {
  const state = readState();
  if (state === "done") return false;

  let count = 0;
  try {
    count = Number(localStorage.getItem(COUNT_KEY) || "0") + 1;
    localStorage.setItem(COUNT_KEY, String(count));
  } catch {
    return false; // no storage, no counting, no prompt
  }

  // Remember which session the counting started in, so "not the first session"
  // is a fact rather than a guess.
  let firstSession = "";
  try {
    firstSession = localStorage.getItem(FIRST_SESSION_KEY) || "";
    if (!firstSession && sessionId) {
      localStorage.setItem(FIRST_SESSION_KEY, sessionId);
      firstSession = sessionId;
    }
  } catch { /* fall through — treated as "unknown", which suppresses below */ }

  if (!sessionId || sessionId === firstSession) return false;

  const threshold = state === "asked1" ? SECOND_ASK_AT : FIRST_ASK_AT;
  return count >= threshold;
}

/** The current export count, for tests and diagnostics. */
export function getExportCount(): number {
  try { return Number(localStorage.getItem(COUNT_KEY) || "0"); } catch { return 0; }
}

/**
 * Show the card. Separate from `recordExport` so the decision is testable
 * without a DOM, and so a caller can record an export without a root element.
 */
export function showReviewAsk(root: HTMLElement): void {
  if (document.getElementById(CARD_ID)) return;

  // Advance the state AT SHOW TIME, not on answer. Ignoring the card has to
  // count as an answer, or someone who closes the tab sees it forever.
  writeState(readState() === "asked1" ? "done" : "asked1");

  const card = document.createElement("div");
  card.id = CARD_ID;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", "Review TraceBug — optional");
  card.style.cssText = [
    "position:fixed", "right:16px", "bottom:16px", "width:320px",
    "background:var(--tb-bg-secondary,#1a1a2e)",
    "border:1px solid var(--tb-border-hover,#3a3a5e)",
    "border-radius:12px", "padding:14px 16px",
    // Same ceiling as the ticket modal and milestone-ask: appended last, so it
    // paints and clicks above the modal overlay. See milestone-ask.ts.
    "z-index:2147483647",
    "font-family:var(--tb-font-family,system-ui,sans-serif)",
    "color:var(--tb-text-primary,#e0e0e0)",
    "box-shadow:0 12px 40px rgba(0,0,0,0.5)",
  ].join(";");

  // Built as nodes rather than innerHTML: this file is bundled into the page's
  // main world, and web-ext flags innerHTML assignment besides.
  const head = document.createElement("div");
  head.style.cssText = "display:flex;justify-content:space-between;align-items:flex-start;gap:8px";
  const title = document.createElement("div");
  title.style.cssText = "font-size:15px;font-weight:600;line-height:1.3";
  title.textContent = "Did TraceBug save you time?";
  const close = document.createElement("button");
  close.setAttribute("data-act", "close");
  close.setAttribute("aria-label", "Dismiss");
  close.style.cssText = "background:none;border:none;color:var(--tb-text-muted,#888);cursor:pointer;font-size:15px;line-height:1;padding:0;font-family:inherit";
  close.textContent = "✕";
  head.append(title, close);

  const line = document.createElement("p");
  line.style.cssText = "margin:6px 0 12px;font-size:13px;line-height:1.5;color:var(--tb-text-secondary,#aaa)";
  line.textContent = "A short review helps other testers find it.";

  const row = document.createElement("div");
  row.style.cssText = "display:flex;align-items:center;gap:12px";
  const rate = document.createElement("a");
  rate.href = reviewUrl("review");
  rate.target = "_blank";
  rate.rel = "noopener noreferrer";
  rate.setAttribute("data-act", "rate");
  rate.style.cssText = "display:inline-flex;align-items:center;gap:6px;background:var(--tb-accent,#6366F1);color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;text-decoration:none";
  const star = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  star.setAttribute("width", "13");
  star.setAttribute("height", "13");
  star.setAttribute("viewBox", "0 0 24 24");
  star.setAttribute("fill", "none");
  star.setAttribute("stroke", "currentColor");
  star.setAttribute("stroke-width", "2");
  star.setAttribute("stroke-linecap", "round");
  star.setAttribute("stroke-linejoin", "round");
  star.setAttribute("aria-hidden", "true");
  const starPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  // A line-icon outline, never a filled or partial star — a star glyph in a
  // review prompt reads as a rating that someone already gave.
  starPath.setAttribute("d", "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z");
  star.appendChild(starPath);
  const rateText = document.createElement("span");
  rateText.textContent = "Rate TraceBug";
  rate.append(star, rateText);

  const notNow = document.createElement("button");
  notNow.setAttribute("data-act", "not-now");
  notNow.style.cssText = "background:none;border:none;color:var(--tb-text-muted,#888);font-size:12.5px;cursor:pointer;padding:0;font-family:inherit";
  notNow.textContent = "Not now";
  row.append(rate, notNow);

  card.append(head, line, row);

  const dismiss = () => {
    document.removeEventListener("keydown", onKey, true);
    card.remove();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") { e.stopPropagation(); dismiss(); }
  };
  document.addEventListener("keydown", onKey, true);
  close.addEventListener("click", dismiss);
  notNow.addEventListener("click", dismiss);
  // Clicking through to the store is the end of it, whatever they do there.
  rate.addEventListener("click", () => { writeState("done"); dismiss(); });

  root.appendChild(card);
}

/** Test seam: forget everything this module remembers. */
export function _resetReviewAsk(): void {
  for (const k of [COUNT_KEY, STATE_KEY, FIRST_SESSION_KEY]) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}
