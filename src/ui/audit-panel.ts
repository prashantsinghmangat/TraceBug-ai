// ── Site Audit panel ───────────────────────────────────────────────────────
// A docked side panel (right by default, switchable to the left) that stays
// open while the user works on the page: "Locate" scrolls to the element and
// highlights it without closing anything, so the list is always one glance
// away. It can be minimised to a small tab on the edge.
//
// Shows: an overall score and one per category (src/audit/score.ts — the
// formula is one click away), what each check can't tell you, then findings
// grouped by category, most severe first, each with what's wrong, the WCAG
// criterion, how to fix it and where it is. "Re-run audit" compares with the
// previous run of the same scan (fixed / still there / new / regressed).
//
// Every finding string comes from the page: always escapeHtml'd. Markup goes
// through setInnerHTML (Trusted Types) and styles through createStyleTag
// (CSP nonce), the same as the issues panel.

import type { AuditCategory, AuditRun, Issue } from "../types";
import { runAudit, getLastAuditRun } from "../audit";
import { compareAudits, type AuditComparison as AuditComparisonOf } from "../audit/compare";
type AuditComparison = AuditComparisonOf<Issue>;
import { escapeHtml, setInnerHTML, createStyleTag } from "./helpers";
import { AUDIT_SCANS, isAuditScan, type AuditScan } from "../audit/types";
import { SCORE_EXPLANATION, scoreBand, type ScoreBand } from "../audit/score";
import { wcagLabel } from "../audit/wcag";
import { isExtensionMode } from "../ext-transport";

const PANEL_ID = "tracebug-audit-panel";
const STYLE_ID = "tracebug-audit-panel-styles";
const HIGHLIGHT_ID = "tracebug-audit-highlight";
const DOCK_KEY = "tracebug_audit_dock";
const TOOLBAR_ID = "tracebug-compact-toolbar";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  accessibility: "Accessibility",
  ui: "Layout",
  seo: "SEO",
  performance: "Performance",
  runtime: "Errors & requests",
};
const SEVERITY_LABEL: Record<Issue["severity"], string> = { critical: "Critical", serious: "Serious", moderate: "Moderate", minor: "Minor" };
const SEVERITIES: Issue["severity"][] = ["critical", "serious", "moderate", "minor"];
const BAND_LABEL: Record<ScoreBand, string> = { good: "Good", fair: "Needs work", poor: "Poor" };

// Lucide-style 24×24 stroke icons, drawn at 16px.
const svg = (d: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const ICON = {
  audit: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  rerun: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
  export: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  minimize: svg('<path d="M5 12h14"/>'),
  dockLeft: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  dockRight: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>'),
  locate: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  external: svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 13),
  chevron: svg('<path d="m9 18 6-6-6-6"/>', 14),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', 14),
  wrench: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', 14),
  pin: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>', 14),
  eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>', 14),
};

let _open = false;
let _root: HTMLElement | null = null;
/** The scan the panel runs; "Re-run" keeps it. Chosen in the popup menu or the panel's scan bar. */
let _scan: AuditScan = "full";
let _filter: Issue["severity"] | "all" = "all";
let _minimized = false;
let _lastDiff: AuditComparison | null = null;
let _expanded = new Set<string>();
let _highlightTimer: ReturnType<typeof setTimeout> | null = null;
let _highlightRaf = 0;

export function isAuditPanelOpen(): boolean {
  return _open;
}

function getDock(): "left" | "right" {
  try { return localStorage.getItem(DOCK_KEY) === "left" ? "left" : "right"; } catch { return "right"; }
}
function setDock(d: "left" | "right"): void {
  try { localStorage.setItem(DOCK_KEY, d); } catch { /* storage blocked: session-only */ }
}

/** Open the panel, or close it when it is already open (the toolbar button). */
export async function toggleAuditPanel(root: HTMLElement): Promise<void> {
  if (_open) { closeAuditPanel(); return; }
  await showAuditPanel(root);
}

/** Run an audit (a menu scan, default: the last one chosen) and show it. If the panel is already open, re-runs in place. */
export async function showAuditPanel(root: HTMLElement, scan?: AuditScan | string): Promise<AuditRun | null> {
  if (isAuditScan(scan)) _scan = scan;
  _root = root;
  injectStyles();
  if (!_open) mountShell(root);
  setMinimized(false);
  markScan();
  setBody(`<div class="tb-au-empty" role="status"><span class="tb-au-spin" aria-hidden="true"></span>Checking this page…</div>`);
  setBusy(true);
  setSubtitle(_scan === "full" ? "Running accessibility, layout, performance, SEO and error checks…" : `Running ${AUDIT_SCANS[_scan].label}…`);

  const previous = getLastAuditRun();
  let run: AuditRun;
  try {
    if (AUDIT_SCANS[_scan].categories.includes("accessibility")) await ensureAxe();
    run = await runAudit({ scan: _scan });
  } catch (err) {
    console.warn("[TraceBug] Audit failed:", err);
    setBusy(false);
    setSubtitle("The audit could not run on this page.");
    setBody(`<div class="tb-au-empty">Something on this page stopped the audit. Reload and try again.</div>`);
    return null;
  }
  setBusy(false);
  // Only the same scan is a re-run; switching scans is a different question, not "what changed".
  const diff = previous && (previous.scan ?? "full") === (run.scan ?? "full") ? compareAudits(previous, run) : null;
  _lastDiff = diff && diff.comparable ? diff : null;
  _expanded = new Set();
  render(run);
  return run;
}

/** Extension mode: the injected SDK has no axe; ask the worker to inject its packaged copy.
 *  The popup path has already done so; the toolbar path has not. Never fatal: without axe the
 *  accessibility category says "not run". */
async function ensureAxe(): Promise<void> {
  const w = window as unknown as { axe?: { run?: unknown } };
  if (!isExtensionMode() || (w.axe && typeof w.axe.run === "function")) return;
  await new Promise<void>((resolve) => {
    const done = () => { window.removeEventListener("tracebug-ext-axe-ready", done); clearTimeout(t); resolve(); };
    const t = setTimeout(done, 8000);
    window.addEventListener("tracebug-ext-axe-ready", done);
    window.dispatchEvent(new CustomEvent("tracebug-request-axe"));
  });
}

export function closeAuditPanel(): void {
  clearHighlight();
  document.getElementById(PANEL_ID)?.remove();
  document.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", placePanel);
  _open = false;
  _minimized = false;
  syncToolbarButton();
}

/** Keep the floating toolbar's Audit button in step however the panel was opened or closed. */
function syncToolbarButton(): void {
  const btn = document.getElementById("tracebug-toolbar-audit-btn");
  if (!btn) return;
  btn.classList.toggle("tb-active", _open);
  btn.setAttribute("aria-pressed", String(_open));
}

/** Download the last run as a report file. The exporter is loaded on demand. */
async function exportCurrent(btn: HTMLButtonElement | null): Promise<void> {
  const run = getLastAuditRun();
  if (!run || !btn) return;
  const label = btn.querySelector(".tb-au-btn-l");
  btn.disabled = true;
  const set = (t: string) => { if (label) label.textContent = t; };
  set("Exporting…");
  try {
    const { exportAuditReport } = await import("../audit/export");
    const out = await exportAuditReport(run);
    set("Exported");
    btn.title = out.filename;
  } catch (err) {
    console.warn("[TraceBug] Audit export failed:", err);
    set("Export failed");
  }
  setTimeout(() => { set("Export"); btn.disabled = false; }, 1800);
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== "Escape" || !_open) return;
  const panel = document.getElementById(PANEL_ID);
  // Non-modal: Escape belongs to the page unless focus is in the panel (or nowhere).
  const active = document.activeElement;
  if (panel && active && active !== document.body && !panel.contains(active)) return;
  e.stopPropagation();
  closeAuditPanel();
}

function mountShell(root: HTMLElement): void {
  document.getElementById(PANEL_ID)?.remove();
  const panel = document.createElement("aside");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "complementary");
  panel.setAttribute("aria-labelledby", `${PANEL_ID}-title`);
  panel.dataset.dock = getDock();
  setInnerHTML(panel, `
    <button type="button" class="tb-au-tab" data-tb-au="restore" aria-label="Show the site audit">
      <span class="tb-au-tab-score" data-tb-au="tab-score">${ICON.audit}</span><span class="tb-au-tab-l">Audit</span>
    </button>
    <div class="tb-au-shell">
      <div class="tb-au-head">
        <span class="tb-au-logo">${ICON.audit}</span>
        <div class="tb-au-titles">
          <h2 class="tb-au-title" id="${PANEL_ID}-title" tabindex="-1">Site audit</h2>
          <div class="tb-au-sub" data-tb-au="subtitle" aria-live="polite"></div>
        </div>
        <button type="button" class="tb-au-icon" data-tb-au="dock" aria-label="Move panel to the other side" title="Move panel to the other side">${ICON.dockLeft}</button>
        <button type="button" class="tb-au-icon" data-tb-au="minimize" aria-label="Minimise" title="Minimise">${ICON.minimize}</button>
        <button type="button" class="tb-au-icon" data-tb-au="close" aria-label="Close the audit" title="Close (Esc)">${ICON.close}</button>
      </div>
      <div class="tb-au-scans" role="group" aria-label="Which checks to run">${(Object.keys(AUDIT_SCANS) as AuditScan[]).map((k) =>
        `<button type="button" class="tb-au-scan" data-tb-au="scan" data-scan="${k}" aria-pressed="false">${escapeHtml(AUDIT_SCANS[k].label)}</button>`).join("")}</div>
      <div class="tb-au-actions">
        <button type="button" class="tb-au-btn tb-au-btn-primary" data-tb-au="rerun">${ICON.rerun}<span class="tb-au-btn-l">Re-run audit</span></button>
        <button type="button" class="tb-au-btn" data-tb-au="export" disabled title="Download this audit as a TraceBug report (.html) your coding agent can read">${ICON.export}<span class="tb-au-btn-l">Export</span></button>
      </div>
      <div class="tb-au-body" data-tb-au="body"></div>
    </div>`);
  root.appendChild(panel);
  _open = true;
  syncToolbarButton();
  syncDockButton();
  placePanel();
  window.addEventListener("resize", placePanel);

  panel.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const actionEl = t.closest<HTMLElement>("[data-tb-au]");
    const action = actionEl?.dataset.tbAu;
    if (!action) return;
    if (action === "close") closeAuditPanel();
    else if (action === "minimize") setMinimized(true);
    else if (action === "restore") setMinimized(false);
    else if (action === "dock") switchDock();
    else if (action === "rerun") void showAuditPanel(root);
    else if (action === "export") void exportCurrent(actionEl as HTMLButtonElement);
    else if (action === "scan") void showAuditPanel(root, actionEl?.dataset.scan);
    else if (action === "reveal") void revealAndRerun(root);
    else if (action === "filter") { _filter = (actionEl?.dataset.sev as typeof _filter) || "all"; const r = getLastAuditRun(); if (r) render(r); }
    else if (action === "toggle") toggleCard(actionEl!.closest<HTMLElement>(".tb-au-card"));
    else if (action === "locate") locate(actionEl!.closest<HTMLElement>(".tb-au-card"));
    else if (action === "copy") void copySelector(actionEl as HTMLButtonElement);
  });
  document.addEventListener("keydown", onKey, true);
  panel.querySelector<HTMLElement>(`#${PANEL_ID}-title`)?.focus({ preventScroll: true });
}

/** Sit beside the floating toolbar when it is on the same side, like an icon rail next to a sidebar. */
function placePanel(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const dock = panel.dataset.dock === "left" ? "left" : "right";
  let offset = 12;
  const tb = document.getElementById(TOOLBAR_ID);
  if (tb) {
    const r = tb.getBoundingClientRect();
    if (r.width > 0 && r.width < 120) {
      const onRight = r.left + r.width / 2 > window.innerWidth / 2;
      if (dock === "right" && onRight) offset = Math.max(12, window.innerWidth - r.left + 8);
      if (dock === "left" && !onRight) offset = Math.max(12, r.right + 8);
    }
  }
  panel.style.setProperty("--tb-au-offset", `${Math.round(offset)}px`);
}

function switchDock(): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const next = panel.dataset.dock === "left" ? "right" : "left";
  panel.dataset.dock = next;
  setDock(next);
  syncDockButton();
  placePanel();
}

function syncDockButton(): void {
  const panel = document.getElementById(PANEL_ID);
  const btn = panel?.querySelector<HTMLElement>('[data-tb-au="dock"]');
  if (!panel || !btn) return;
  const toLeft = panel.dataset.dock !== "left";
  setInnerHTML(btn, toLeft ? ICON.dockLeft : ICON.dockRight);
  const label = toLeft ? "Move panel to the left" : "Move panel to the right";
  btn.setAttribute("aria-label", label);
  btn.title = label;
}

function setMinimized(min: boolean): void {
  _minimized = min;
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.classList.toggle("tb-au-min", min);
  if (min) panel.querySelector<HTMLElement>('[data-tb-au="restore"]')?.focus({ preventScroll: true });
}

function setBusy(busy: boolean): void {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.querySelectorAll<HTMLButtonElement>('[data-tb-au="export"], [data-tb-au="rerun"], [data-tb-au="scan"]').forEach((b) => {
    b.disabled = busy || (b.dataset.tbAu === "export" && !getLastAuditRun());
  });
  panel.setAttribute("aria-busy", String(busy));
}

function markScan(): void {
  document.querySelectorAll<HTMLElement>(`#${PANEL_ID} [data-tb-au="scan"]`).forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.scan === _scan));
  });
}

function setSubtitle(text: string): void {
  const el = document.querySelector(`#${PANEL_ID} [data-tb-au="subtitle"]`);
  if (el) el.textContent = text;
}

function setBody(html: string): void {
  const el = document.querySelector<HTMLElement>(`#${PANEL_ID} [data-tb-au="body"]`);
  if (el) setInnerHTML(el, html);
}

// ── Rendering ──────────────────────────────────────────────────────────────

function render(run: AuditRun): void {
  const total = run.findings.length + run.truncated;
  const when = new Date(run.scannedAt).toLocaleTimeString();
  setSubtitle(`${AUDIT_SCANS[run.scan ?? "full"].label} · ${total === 0 ? "No findings" : `${total} finding${total === 1 ? "" : "s"}`} · ${run.viewport.width}×${run.viewport.height} · ${when}`);
  updateTabScore(run);

  const parts: string[] = [];
  parts.push(scoreCard(run));
  if (_lastDiff) parts.push(diffHtml(_lastDiff));

  const a11y = run.categories.find((c) => c.name === "accessibility");
  const hidden = a11y?.metrics?.transparentText ?? 0;
  if (hidden > 0) {
    parts.push(`<div class="tb-au-notice">${ICON.eye}<div><b>${hidden} piece${hidden === 1 ? "" : "s"} of text ${hidden === 1 ? "was" : "were"} invisible when checked</b>
      <div class="tb-au-muted">Usually content that fades in when you scroll. It wasn't checked.</div>
      <button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="reveal">Scroll the page and re-run</button></div></div>`);
  }

  if (run.findings.length) parts.push(filterBar(run));

  let shown = 0;
  for (const c of run.categories) {
    if (!c.ran) continue;
    const items = run.findings.filter((f) => f.category === c.name && (_filter === "all" || f.severity === _filter));
    if (items.length === 0) continue;
    shown += items.length;
    parts.push(`<section class="tb-au-group" aria-label="${escapeHtml(CATEGORY_LABEL[c.name])}">
      <h3 class="tb-au-group-h">${escapeHtml(CATEGORY_LABEL[c.name])} <span>${items.length}</span></h3>
      ${items.map((f) => findingHtml(f, run)).join("")}</section>`);
  }
  if (run.findings.length && shown === 0) {
    parts.push(`<div class="tb-au-empty">No ${escapeHtml(SEVERITY_LABEL[_filter as Issue["severity"]] || "").toLowerCase()} findings.</div>`);
  }
  if (run.truncated > 0) {
    parts.push(`<div class="tb-au-note">${run.truncated} more finding${run.truncated === 1 ? "" : "s"} not listed (the list keeps the ${run.findings.length} most severe). The score counts all of them.</div>`);
  }
  if (run.findings.length === 0) {
    parts.push(`<div class="tb-au-empty">No problems found in the checks that ran. That is not proof the page is accessible or bug-free — see what each check can't tell you above.</div>`);
  }
  setBody(parts.join(""));
  setBusy(false);
}

function ring(score: number | null, size: number, stroke: number): string {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const band = score == null ? "none" : scoreBand(score);
  const dash = score == null ? 0 : (c * score) / 100;
  return `<svg class="tb-au-ring tb-au-band-${band}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="tb-au-ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}" class="tb-au-ring-fg"
      stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round"/>
  </svg>`;
}

function scoreCard(run: AuditRun): string {
  const s = run.score;
  const overall = s?.overall ?? null;
  const band = overall == null ? null : scoreBand(overall);
  const head = overall == null
    ? `<div class="tb-au-score-n">–</div>`
    : `<div class="tb-au-score-n">${overall}</div>`;
  const cats = run.categories.map((c) => {
    const v = s?.categories?.[c.name];
    const pill = !c.ran
      ? `<span class="tb-au-pill tb-au-pill-off">Not run</span>`
      : typeof v === "number"
        ? `<span class="tb-au-pill tb-au-band-${scoreBand(v)}" title="${BAND_LABEL[scoreBand(v)]}">${v}</span>`
        : `<span class="tb-au-pill tb-au-pill-off">–</span>`;
    const state = !c.ran ? "" : c.count === 0 ? "No findings" : `${c.count} found`;
    const metrics = c.metrics ? formatCategoryMetrics(c.metrics) : "";
    return `<li class="tb-au-cat${c.ran ? "" : " tb-au-cat-off"}">
      <div class="tb-au-cat-h">${pill}<b>${escapeHtml(CATEGORY_LABEL[c.name])}</b><span class="tb-au-cat-n">${escapeHtml(state)}</span></div>
      ${metrics ? `<div class="tb-au-cat-m">${escapeHtml(metrics)}</div>` : ""}
      ${!c.ran && c.limitation ? `<div class="tb-au-cat-l">${escapeHtml(c.limitation)}</div>` : ""}
    </li>`;
  }).join("");
  // What each check can't tell you: one tap away, so the findings stay near the top.
  const limits = run.categories.filter((c) => c.ran && c.limitation).map((c) =>
    `<li><b>${escapeHtml(CATEGORY_LABEL[c.name])}:</b> ${escapeHtml(c.limitation!)}</li>`).join("");
  const label = overall == null ? "No score: no check ran" : `Score ${overall} out of 100, ${BAND_LABEL[band!]}`;
  return `<div class="tb-au-score" role="group" aria-label="${escapeHtml(label)}">
    <div class="tb-au-score-top">
      <div class="tb-au-score-ring">${ring(overall, 76, 7)}${head}</div>
      <div class="tb-au-score-t">
        <div class="tb-au-score-band ${band ? `tb-au-band-${band}` : ""}">${band ? BAND_LABEL[band] : "No score"}</div>
        <div class="tb-au-muted">${overall == null ? "Checks that didn't run are never scored." : "Out of 100, from the checks that ran."}</div>
        <details class="tb-au-how"><summary>${ICON.info}How is this calculated?</summary><p>${escapeHtml(SCORE_EXPLANATION)}</p></details>
      </div>
    </div>
    <ul class="tb-au-cats">${cats}</ul>
    ${limits ? `<details class="tb-au-how tb-au-limits"><summary>${ICON.info}What these checks can't tell you</summary><ul>${limits}</ul></details>` : ""}
  </div>`;
}

function updateTabScore(run: AuditRun): void {
  const el = document.querySelector<HTMLElement>(`#${PANEL_ID} [data-tb-au="tab-score"]`);
  const o = run.score?.overall;
  if (!el) return;
  if (typeof o === "number") setInnerHTML(el, `<span class="tb-au-tab-n tb-au-band-${scoreBand(o)}">${o}</span>`);
  else setInnerHTML(el, ICON.audit);
}

function filterBar(run: AuditRun): string {
  const counts: Record<string, number> = { all: run.findings.length };
  for (const f of run.findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  const btn = (key: string, label: string) =>
    `<button type="button" class="tb-au-chip" data-tb-au="filter" data-sev="${key}" aria-pressed="${_filter === key}">${key !== "all" ? `<span class="tb-au-dot tb-au-sev-${key}"></span>` : ""}${label} <span>${counts[key] || 0}</span></button>`;
  return `<div class="tb-au-filter" role="group" aria-label="Show findings by severity">${btn("all", "All")}${SEVERITIES.filter((s) => counts[s]).map((s) => btn(s, SEVERITY_LABEL[s])).join("")}</div>`;
}

/** "LCP 1.20 s · CLS 0.02 · 340 KB" — page-level numbers a category measured. */
export function formatCategoryMetrics(m: Record<string, number>): string {
  const out: string[] = [];
  const sec = (v: number) => `${(v / 1000).toFixed(2)} s`;
  if (m.lcpMs !== undefined) out.push(`LCP ${sec(m.lcpMs)}`);
  if (m.fcpMs !== undefined) out.push(`FCP ${sec(m.fcpMs)}`);
  if (m.ttfbMs !== undefined) out.push(`TTFB ${sec(m.ttfbMs)}`);
  if (m.cls !== undefined) out.push(`CLS ${m.cls}`);
  if (m.transferKb !== undefined) out.push(m.transferKb >= 1024 ? `${(m.transferKb / 1024).toFixed(1)} MB` : `${m.transferKb} KB`);
  if (m.requests !== undefined) out.push(`${m.requests} requests`);
  return out.join(" · ");
}

function diffHtml(d: AuditComparison): string {
  const bits = [
    `<b class="tb-au-good">${d.fixed.length} fixed</b>`,
    `${d.stillPresent.length} still present`,
    d.regressed.length ? `<b class="tb-au-bad">${d.regressed.length} regressed</b>` : "",
    d.new.length ? `${d.new.length} new` : "",
  ].filter(Boolean).join(" · ");
  const skipped = d.skippedCategories.length
    ? ` <span class="tb-au-muted">(${escapeHtml(d.skippedCategories.map((c) => CATEGORY_LABEL[c]).join(", "))} not compared: not run both times)</span>`
    : "";
  return `<div class="tb-au-diff" role="status">Since the last run: ${bits}${skipped}</div>`;
}

const METRIC_LABEL: Record<string, string> = {
  contrastRatio: "Contrast", expectedContrastRatio: "Needs", fgColor: "Text colour", bgColor: "Background",
  fontSize: "Font size", fontWeight: "Weight", suggestedFgColor: "Suggested text colour",
};

/** Where the element is, in words a person can find: its visible text, else the selector. */
function whereLabel(f: Issue): string {
  const t = f.evidence?.text?.trim();
  return t ? `“${t.length > 48 ? t.slice(0, 47) + "…" : t}”` : f.selector || f.url || "";
}

function contrastHtml(m: Record<string, number | string>): string {
  const fg = String(m.fgColor ?? ""), bg = String(m.bgColor ?? ""), sug = String(m.suggestedFgColor ?? "");
  const hex = /^#[0-9a-f]{3,8}$/i;
  if (!hex.test(fg) || !hex.test(bg)) return "";
  const sample = (color: string) => `<span class="tb-au-swatch" style="color:${color};background:${bg}">Aa</span>`;
  return `<div class="tb-au-contrast">
    <div class="tb-au-cx">${sample(fg)}<div><b>${escapeHtml(String(m.contrastRatio ?? "?"))}:1</b><span class="tb-au-muted">now · needs ${escapeHtml(String(m.expectedContrastRatio ?? ""))}</span><code>${escapeHtml(fg)} on ${escapeHtml(bg)}</code></div></div>
    ${hex.test(sug) ? `<div class="tb-au-cx tb-au-cx-fix">${sample(sug)}<div><b>Suggested</b><span class="tb-au-muted">passes</span><code>${escapeHtml(sug)} on ${escapeHtml(bg)}</code></div></div>` : ""}
  </div>`;
}

function findingHtml(f: Issue, run: AuditRun): string {
  const open = _expanded.has(f.id);
  const m = f.evidence?.metrics;
  const isContrast = !!m && (f.ruleId === "color-contrast" || f.ruleId === "color-contrast-enhanced");
  const contrast = isContrast ? contrastHtml(m!) : "";
  const metricRows = m && !contrast
    ? `<dl class="tb-au-kv">${Object.entries(m).map(([k, v]) => `<dt>${escapeHtml(METRIC_LABEL[k] || k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join("")}</dl>` : "";
  const more = f.occurrences && f.occurrences > 1 ? ` <span class="tb-au-muted">×${f.occurrences}</span>` : "";
  const wcag = (f.wcag || []).map((sc) => `<span class="tb-au-wcag">WCAG ${escapeHtml(wcagLabel(sc))}</span>`).join("");
  const help = f.helpUrl && /^https:\/\//.test(f.helpUrl)
    ? `<a class="tb-au-link" href="${escapeHtml(f.helpUrl)}" target="_blank" rel="noopener noreferrer">Learn more about this rule${ICON.external}<span class="tb-au-sr"> (opens in a new tab)</span></a>` : "";
  const fix = f.fix || "";
  const where = f.selector
    ? `<div class="tb-au-where"><code title="${escapeHtml(f.selector)}">${escapeHtml(f.selector)}</code>
        <div class="tb-au-where-b">
          <button type="button" class="tb-au-btn tb-au-btn-sm tb-au-btn-primary" data-tb-au="locate">${ICON.locate}<span class="tb-au-btn-l">Locate on page</span></button>
          <button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="copy" aria-label="Copy selector">${ICON.copy}<span class="tb-au-btn-l">Copy</span></button>
        </div>
        <div class="tb-au-locmsg" data-tb-au-msg role="status"></div></div>`
    : f.url ? `<div class="tb-au-where"><code>${escapeHtml(f.url)}</code></div>` : `<div class="tb-au-muted">This one is about the whole page, not one element.</div>`;
  void run;
  const id = `tb-au-f-${escapeHtml(f.id)}`;
  return `<article class="tb-au-card tb-au-card-${f.severity}${open ? " tb-au-open" : ""}" data-id="${escapeHtml(f.id)}" data-selector="${escapeHtml(f.selector || "")}">
    <button type="button" class="tb-au-card-h" data-tb-au="toggle" aria-expanded="${open}" aria-controls="${id}">
      <span class="tb-au-sev"><span class="tb-au-dot tb-au-sev-${f.severity}"></span>${SEVERITY_LABEL[f.severity]}</span>
      <span class="tb-au-card-t">${escapeHtml(f.title)}${more}</span>
      <span class="tb-au-card-w">${escapeHtml(whereLabel(f))}</span>
      <span class="tb-au-chev">${ICON.chevron}</span>
    </button>
    <div class="tb-au-card-b" id="${id}"${open ? "" : " hidden"}>
      <p class="tb-au-desc">${escapeHtml(f.description)}</p>
      ${contrast}${metricRows}
      ${wcag ? `<div class="tb-au-wcags">${wcag}</div>` : ""}
      ${fix ? `<div class="tb-au-sect"><div class="tb-au-sect-h">${ICON.wrench}How to fix</div><p>${escapeHtml(fix)}</p></div>` : ""}
      <div class="tb-au-sect"><div class="tb-au-sect-h">${ICON.pin}Where it is</div>${where}</div>
      <div class="tb-au-foot"><code class="tb-au-rule">${escapeHtml(f.ruleId || "")}</code>${help}</div>
    </div>
  </article>`;
}

function toggleCard(card: HTMLElement | null): void {
  if (!card) return;
  const id = card.dataset.id || "";
  const open = !card.classList.contains("tb-au-open");
  card.classList.toggle("tb-au-open", open);
  card.querySelector(".tb-au-card-h")?.setAttribute("aria-expanded", String(open));
  const body = card.querySelector<HTMLElement>(".tb-au-card-b");
  if (body) body.hidden = !open;
  if (open) _expanded.add(id); else _expanded.delete(id);
}

async function copySelector(btn: HTMLButtonElement | null): Promise<void> {
  const sel = btn?.closest<HTMLElement>(".tb-au-card")?.dataset.selector || "";
  const label = btn?.querySelector(".tb-au-btn-l");
  if (!sel || !label) return;
  try { await navigator.clipboard.writeText(sel); label.textContent = "Copied"; }
  catch { label.textContent = "Copy failed"; }
  setTimeout(() => { label.textContent = "Copy"; }, 1500);
}

// ── Locate: scroll to the element and outline it; the panel stays open ─────

function clearHighlight(): void {
  if (_highlightTimer) clearTimeout(_highlightTimer);
  _highlightTimer = null;
  cancelAnimationFrame(_highlightRaf);
  document.getElementById(HIGHLIGHT_ID)?.remove();
  document.querySelectorAll(`#${PANEL_ID} .tb-au-card.tb-au-active`).forEach((c) => c.classList.remove("tb-au-active"));
}

function locate(card: HTMLElement | null): void {
  if (!card) return;
  const selector = card.dataset.selector || "";
  const msg = card.querySelector<HTMLElement>("[data-tb-au-msg]");
  const say = (t: string) => { if (msg) msg.textContent = t; };
  say("");
  let el: Element | null = null;
  try { el = selector ? document.querySelector(selector) : null; } catch { el = null; }
  if (!el) { say("Not on the page any more — it may have been removed or re-rendered. Re-run the audit."); return; }
  const rect0 = el.getBoundingClientRect();
  const vis = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if ((rect0.width === 0 && rect0.height === 0) || (typeof vis === "function" && !vis.call(el))) {
    say("It's on the page but not visible right now (hidden, or inside a closed menu or tab).");
  }
  clearHighlight();
  card.classList.add("tb-au-active");
  el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });

  const box = document.createElement("div");
  box.id = HIGHLIGHT_ID;
  box.setAttribute("aria-hidden", "true");
  const tag = document.createElement("span");
  tag.className = "tb-au-hl-tag";
  box.appendChild(tag);
  (_root || document.body).appendChild(box);
  const panel = document.getElementById(PANEL_ID);
  let warned = false;
  const follow = () => {
    const r = el!.getBoundingClientRect();
    box.style.transform = `translate(${Math.round(r.left - 4)}px, ${Math.round(r.top - 4)}px)`;
    box.style.width = `${Math.round(r.width + 8)}px`;
    box.style.height = `${Math.round(r.height + 8)}px`;
    tag.textContent = `${el!.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    tag.classList.toggle("tb-au-hl-tag-below", r.top < 28);
    if (!warned && panel && !_minimized) {
      const p = panel.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      if (cx >= p.left && cx <= p.right && r.bottom > p.top && r.top < p.bottom) {
        warned = true;
        say("It's behind this panel — move the panel to the other side or minimise it to see it.");
      }
    }
    _highlightRaf = requestAnimationFrame(follow);
  };
  follow();
  _highlightTimer = setTimeout(() => {
    cancelAnimationFrame(_highlightRaf);
    box.classList.add("tb-au-hl-out");
    setTimeout(() => { box.remove(); card.classList.remove("tb-au-active"); }, 400);
  }, 4000);
}

/** Scroll through the page so scroll-triggered content appears, return to where the user was, then re-run. */
async function revealAndRerun(root: HTMLElement): Promise<void> {
  const startY = window.scrollY, startX = window.scrollX;
  setSubtitle("Scrolling through the page so hidden content appears…");
  const step = Math.max(200, Math.round(window.innerHeight * 0.8));
  const max = Math.min(document.documentElement.scrollHeight, 60000);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < max; y += step) { window.scrollTo(0, y); await wait(140); }
  window.scrollTo(0, max);
  await wait(500);
  window.scrollTo(startX, startY);
  await wait(200);
  await showAuditPanel(root);
}

// ── Styles ─────────────────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = createStyleTag(STYLE_ID);
  const P = `#${PANEL_ID}`;
  const H = `#${HIGHLIGHT_ID}`;
  s.textContent = `
    ${P} { position: fixed !important; top: 12px !important; bottom: 12px !important; z-index: 2147483646 !important;
      width: min(400px, calc(100vw - 24px)) !important; display: flex !important; flex-direction: column !important;
      background: var(--tb-bg-primary, #0B0D14) !important; color: var(--tb-text-primary, #EEF0F5) !important;
      border: 1px solid var(--tb-border, #252A38) !important; border-radius: var(--tb-radius-lg, 16px) !important;
      box-shadow: var(--tb-shadow-lg, 0 16px 48px rgba(0,0,0,.45)) !important; overflow: hidden !important;
      font: 13px/1.5 var(--tb-font-family, system-ui, -apple-system, "Segoe UI", sans-serif) !important; text-align: left !important;
      animation: tb-au-in .18s ease-out; }
    ${P}[data-dock="right"] { right: var(--tb-au-offset, 12px) !important; left: auto !important; }
    ${P}[data-dock="left"] { left: var(--tb-au-offset, 12px) !important; right: auto !important; }
    @keyframes tb-au-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { ${P}, ${H} { animation: none !important; transition: none !important; } }
    ${P} *, ${P} *::before, ${P} *::after { box-sizing: border-box !important; }
    ${P} h2, ${P} h3, ${P} p, ${P} ul, ${P} dl, ${P} dd { margin: 0; padding: 0; }
    ${P} .tb-au-shell { display: flex; flex-direction: column; min-height: 0; flex: 1; }
    ${P}.tb-au-min { top: auto !important; bottom: 88px !important; width: auto !important; border-radius: 12px !important; }
    ${P}.tb-au-min .tb-au-shell { display: none; }
    ${P} .tb-au-tab { display: none; }
    ${P}.tb-au-min .tb-au-tab { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: none; border: 0; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    ${P} .tb-au-tab-n { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 999px; font-weight: 700; font-size: 12px; border: 3px solid currentColor; color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-head { display: flex; align-items: center; gap: 6px; padding: 12px 10px 10px 14px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-logo { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--tb-accent-subtle, rgba(255,92,108,.14)); color: var(--tb-accent, #FF5C6C); flex-shrink: 0; }
    ${P} .tb-au-titles { flex: 1; min-width: 0; }
    ${P} .tb-au-title { font-size: 15px; font-weight: 700; line-height: 1.2; outline: none; }
    ${P} .tb-au-sub, ${P} .tb-au-muted { color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    ${P} .tb-au-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: none; border: 0; color: var(--tb-text-secondary, #A8AEBE); cursor: pointer; flex-shrink: 0; }
    ${P} .tb-au-icon:hover { background: var(--tb-bg-secondary, #141823); color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-scans { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 14px 0; }
    ${P} .tb-au-scan { background: transparent; color: var(--tb-text-secondary, #A8AEBE); border: 1px solid var(--tb-border, #252A38); border-radius: 999px; padding: 4px 11px; font: inherit; font-size: 12px; cursor: pointer; min-height: 28px; }
    ${P} .tb-au-scan:hover:not(:disabled) { color: var(--tb-text-primary, #EEF0F5); border-color: var(--tb-border-hover, #333A4D); }
    ${P} .tb-au-scan[aria-pressed="true"] { background: var(--tb-accent, #FF5C6C); border-color: var(--tb-accent, #FF5C6C); color: var(--tb-on-accent, #0B0D14); font-weight: 600; }
    ${P} .tb-au-actions { display: flex; gap: 8px; padding: 10px 14px 12px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--tb-bg-secondary, #141823); color: var(--tb-text-primary, #EEF0F5);
      border: 1px solid var(--tb-border, #252A38); border-radius: var(--tb-radius-sm, 10px); padding: 6px 12px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 32px; }
    ${P} .tb-au-btn:hover:not(:disabled) { border-color: var(--tb-border-hover, #333A4D); }
    ${P} .tb-au-btn-primary { background: var(--tb-accent-subtle, rgba(255,92,108,.14)); border-color: transparent; color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-btn:disabled, ${P} .tb-au-scan:disabled { opacity: .5; cursor: default; }
    ${P} .tb-au-btn-sm { padding: 4px 9px; font-size: 11.5px; min-height: 28px; }
    ${P} button:focus-visible, ${P} a:focus-visible, ${P} summary:focus-visible { outline: 2px solid var(--tb-accent, #FF5C6C) !important; outline-offset: 2px; }
    ${P} .tb-au-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px 18px; overscroll-behavior: contain; }
    ${P} .tb-au-empty { padding: 28px 8px; text-align: center; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-spin { display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px; border: 2px solid var(--tb-border, #252A38); border-top-color: var(--tb-accent, #FF5C6C); border-radius: 50%; animation: tb-au-spin .8s linear infinite; }
    @keyframes tb-au-spin { to { transform: rotate(360deg); } }
    ${P} .tb-au-note { margin-top: 10px; color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-good { color: var(--tb-success, #4CC38A); } ${P} .tb-au-bad { color: var(--tb-error, #F05257); }
    ${P} .tb-au-diff { padding: 9px 12px; margin: 12px 0 0; border-radius: var(--tb-radius-sm, 10px); background: var(--tb-bg-secondary, #141823); border: 1px solid var(--tb-border, #252A38); font-size: 12px; }
    ${P} .tb-au-notice { display: flex; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: var(--tb-radius-sm, 10px); border: 1px solid var(--tb-severity-major, #F59E0B); background: rgba(245,158,11,.08); font-size: 12px; }
    ${P} .tb-au-notice svg { flex-shrink: 0; margin-top: 2px; color: var(--tb-severity-major, #F59E0B); }
    ${P} .tb-au-notice .tb-au-btn { margin-top: 8px; }
    /* Score */
    ${P} .tb-au-score { border: 1px solid var(--tb-border, #252A38); border-radius: var(--tb-radius-md, 12px); background: var(--tb-bg-secondary, #141823); padding: 12px; }
    ${P} .tb-au-score-top { display: flex; gap: 14px; align-items: center; }
    ${P} .tb-au-score-ring { position: relative; width: 76px; height: 76px; flex-shrink: 0; }
    ${P} .tb-au-score-n { position: absolute; inset: 0; display: grid; place-items: center; font-size: 24px; font-weight: 800; letter-spacing: -.02em; }
    ${P} .tb-au-ring-bg { stroke: var(--tb-border, #252A38); }
    ${P} .tb-au-ring-fg { transition: stroke-dasharray .5s ease; }
    ${P} .tb-au-band-good .tb-au-ring-fg { stroke: var(--tb-success, #22C55E); }
    ${P} .tb-au-band-fair .tb-au-ring-fg { stroke: #F59E0B; }
    ${P} .tb-au-band-poor .tb-au-ring-fg { stroke: var(--tb-error, #EF4444); }
    ${P} .tb-au-score-t { min-width: 0; }
    ${P} .tb-au-score-band { font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; }
    ${P} .tb-au-score-band::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-score-band.tb-au-band-good::before { background: var(--tb-success, #22C55E); }
    ${P} .tb-au-score-band.tb-au-band-fair::before { background: #F59E0B; }
    ${P} .tb-au-score-band.tb-au-band-poor::before { background: var(--tb-error, #EF4444); }
    ${P} .tb-au-how { margin-top: 4px; font-size: 12px; }
    ${P} .tb-au-how summary { cursor: pointer; color: var(--tb-text-secondary, #A8AEBE); display: inline-flex; align-items: center; gap: 5px; list-style: none; }
    ${P} .tb-au-how summary::-webkit-details-marker { display: none; }
    ${P} .tb-au-how p { margin-top: 6px; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-limits { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-limits ul { list-style: none; margin-top: 6px; display: grid; gap: 6px; font-size: 11.5px; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-cats { list-style: none; margin-top: 12px; display: grid; gap: 6px; }
    ${P} .tb-au-cat { border-top: 1px solid var(--tb-border, #252A38); padding-top: 8px; }
    ${P} .tb-au-cat-h { display: flex; align-items: center; gap: 8px; font-size: 12.5px; }
    ${P} .tb-au-cat-h b { flex: 1; }
    ${P} .tb-au-cat-n { color: var(--tb-text-secondary, #A8AEBE); font-size: 12px; }
    ${P} .tb-au-cat-off { opacity: .75; }
    ${P} .tb-au-cat-m { margin: 3px 0 0 44px; font: 600 11.5px/1.4 var(--tb-font-mono, ui-monospace, monospace); color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-cat-l { margin: 3px 0 0 44px; font-size: 11px; color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-pill { display: inline-grid; place-items: center; min-width: 36px; height: 22px; padding: 0 6px; border-radius: 999px; font-size: 11.5px; font-weight: 700;
      border: 2px solid var(--tb-border, #252A38); color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-pill.tb-au-band-good { border-color: var(--tb-success, #22C55E); }
    ${P} .tb-au-pill.tb-au-band-fair { border-color: #F59E0B; }
    ${P} .tb-au-pill.tb-au-band-poor { border-color: var(--tb-error, #EF4444); }
    ${P} .tb-au-pill-off { font-size: 10px; font-weight: 600; color: var(--tb-text-muted, #8A91A5); border-style: dashed; }
    ${P} .tb-au-tab-n.tb-au-band-good { border-color: var(--tb-success, #22C55E); }
    ${P} .tb-au-tab-n.tb-au-band-fair { border-color: #F59E0B; }
    ${P} .tb-au-tab-n.tb-au-band-poor { border-color: var(--tb-error, #EF4444); }
    /* Filter + findings */
    ${P} .tb-au-filter { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
    ${P} .tb-au-chip { display: inline-flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--tb-border, #252A38); border-radius: 999px; padding: 3px 10px; font: inherit; font-size: 12px; color: var(--tb-text-secondary, #A8AEBE); cursor: pointer; min-height: 26px; }
    ${P} .tb-au-chip span:last-child { color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-chip[aria-pressed="true"] { border-color: var(--tb-text-primary, #EEF0F5); color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    ${P} .tb-au-sev-critical { background: var(--tb-severity-critical, #EF4444); }
    ${P} .tb-au-sev-serious { background: var(--tb-severity-major, #F59E0B); }
    ${P} .tb-au-sev-moderate { background: var(--tb-severity-minor, #EAB308); }
    ${P} .tb-au-sev-minor { background: var(--tb-severity-info, #3B82F6); }
    ${P} .tb-au-group { margin-top: 14px; }
    ${P} .tb-au-group-h { font-weight: 700; font-size: 11.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--tb-text-secondary, #A8AEBE); margin: 0 0 6px; }
    ${P} .tb-au-group-h span { color: var(--tb-text-muted, #8A91A5); font-weight: 500; }
    ${P} .tb-au-card { border: 1px solid var(--tb-border, #252A38); border-left-width: 3px; border-radius: var(--tb-radius-sm, 10px); margin-bottom: 8px; background: var(--tb-bg-primary, #0B0D14); }
    ${P} .tb-au-card-critical { border-left-color: var(--tb-severity-critical, #EF4444); }
    ${P} .tb-au-card-serious { border-left-color: var(--tb-severity-major, #F59E0B); }
    ${P} .tb-au-card-moderate { border-left-color: var(--tb-severity-minor, #EAB308); }
    ${P} .tb-au-card-minor { border-left-color: var(--tb-severity-info, #3B82F6); }
    ${P} .tb-au-card.tb-au-active { box-shadow: 0 0 0 2px var(--tb-accent, #FF5C6C); }
    ${P} .tb-au-card-h { display: grid; grid-template-columns: 1fr auto; grid-template-areas: "sev chev" "title chev" "where chev"; gap: 2px 8px; width: 100%;
      background: none; border: 0; color: inherit; font: inherit; text-align: left; padding: 10px 10px 10px 12px; cursor: pointer; border-radius: var(--tb-radius-sm, 10px); }
    ${P} .tb-au-card-h:hover { background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-sev { grid-area: sev; display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-card-t { grid-area: title; font-weight: 600; overflow-wrap: anywhere; }
    ${P} .tb-au-card-w { grid-area: where; font-size: 12px; color: var(--tb-text-muted, #8A91A5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    ${P} .tb-au-chev { grid-area: chev; align-self: center; color: var(--tb-text-muted, #8A91A5); transition: transform .15s; }
    ${P} .tb-au-open .tb-au-chev { transform: rotate(90deg); }
    ${P} .tb-au-card-b { padding: 0 12px 12px; display: grid; gap: 10px; }
    ${P} .tb-au-card-b[hidden] { display: none; }
    ${P} .tb-au-desc { color: var(--tb-text-secondary, #A8AEBE); overflow-wrap: anywhere; }
    ${P} .tb-au-contrast { display: grid; gap: 6px; }
    ${P} .tb-au-cx { display: flex; gap: 10px; align-items: center; padding: 8px; border-radius: 8px; background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-cx > div { display: flex; flex-direction: column; min-width: 0; font-size: 12px; }
    ${P} .tb-au-cx code { font: 11px var(--tb-font-mono, ui-monospace, monospace); color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-cx-fix { outline: 1px dashed var(--tb-success, #22C55E); outline-offset: -1px; }
    ${P} .tb-au-swatch { display: grid; place-items: center; width: 44px; height: 36px; border-radius: 6px; font-weight: 700; font-size: 15px; border: 1px solid rgba(127,127,127,.35); flex-shrink: 0; }
    ${P} .tb-au-kv { display: grid; grid-template-columns: auto 1fr; gap: 3px 12px; font-size: 12px; }
    ${P} .tb-au-kv dt { color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-kv dd { font-family: var(--tb-font-mono, ui-monospace, monospace); font-size: 11.5px; overflow-wrap: anywhere; }
    ${P} .tb-au-wcags { display: flex; flex-wrap: wrap; gap: 6px; }
    ${P} .tb-au-wcag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: var(--tb-bg-secondary, #141823); border: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-sect-h { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--tb-text-secondary, #A8AEBE); margin-bottom: 4px; }
    ${P} .tb-au-sect p { overflow-wrap: anywhere; }
    ${P} .tb-au-where code { display: block; font: 11.5px/1.45 var(--tb-font-mono, ui-monospace, monospace); padding: 6px 8px; border-radius: 6px; background: var(--tb-bg-secondary, #141823); overflow-wrap: anywhere; }
    ${P} .tb-au-where-b { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
    ${P} .tb-au-locmsg { font-size: 12px; color: var(--tb-severity-major, #F59E0B); margin-top: 4px; }
    ${P} .tb-au-locmsg:empty { display: none; }
    ${P} .tb-au-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    ${P} .tb-au-rule { font: 11px var(--tb-font-mono, ui-monospace, monospace); color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-link { display: inline-flex; align-items: center; gap: 4px; color: var(--tb-accent, #FF5C6C); font-size: 12px; text-decoration: none; }
    ${P} .tb-au-link:hover { text-decoration: underline; }
    ${P} .tb-au-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    /* Locate highlight */
    ${H} { position: fixed !important; left: 0 !important; top: 0 !important; z-index: 2147483645 !important; pointer-events: none !important;
      border: 2px solid var(--tb-accent, #FF5C6C) !important; border-radius: 6px !important; background: rgba(255,92,108,.10) !important;
      box-shadow: 0 0 0 4px rgba(255,92,108,.25), 0 0 0 9999px rgba(0,0,0,.18) !important; transition: opacity .35s !important; box-sizing: border-box !important; }
    ${H}.tb-au-hl-out { opacity: 0 !important; }
    ${H} .tb-au-hl-tag { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; padding: 2px 7px; border-radius: 5px; white-space: nowrap;
      background: var(--tb-accent, #FF5C6C); color: var(--tb-on-accent, #0B0D14); font: 600 11px/1.5 ui-monospace, monospace; }
    ${H} .tb-au-hl-tag.tb-au-hl-tag-below { bottom: auto; top: 100%; margin: 4px 0 0; }
    @media (max-width: 520px) { ${P}[data-dock] { top: auto !important; height: 70vh !important; left: 8px !important; right: 8px !important; width: auto !important; } }
  `;
  document.head.appendChild(s);
}
