// ── Site Audit panel ───────────────────────────────────────────────────────
// A docked side panel (right by default, switchable to the left) that stays
// open while the user works on the page: "Locate" scrolls to the element and
// highlights it without closing anything. It can be minimised to a small tab.
//
// Layout (top to bottom):
//   - score header: the scan's score out of 100 in its band colour, a bar, a
//     WCAG line that only ever states failures (automated checks can't prove a
//     pass), counts by severity, rules passed, when it was scanned
//   - per-category scores (All checks) and what each check can't tell you
//   - actions: Re-run, Export report, Copy for AI (selected findings)
//   - findings grouped by rule: "Low contrast · 3 elements" is one row with
//     its elements underneath, each with Locate and Copy selector — the
//     grouping is display only; the run keeps one finding per element so
//     compareAudits can match them
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
import { buildAuditFixPrompt, SEVERITY_NAME } from "../audit/prompt";
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
  mobile: "Phone width",
  runtime: "Errors & requests",
};
const SEVERITIES: Issue["severity"][] = ["critical", "serious", "moderate", "minor"];
const SEV_RANK: Record<Issue["severity"], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const BAND_LABEL: Record<ScoreBand, string> = { good: "Good", fair: "Needs work", poor: "Poor" };
const PRINCIPLE: Record<string, string> = { "1": "Perceivable", "2": "Operable", "3": "Understandable", "4": "Robust" };

/** One row per rule when the per-element titles differ ("main.js is 1.3 MB", "app.css is 400 KB"). */
const GROUP_TITLE: Record<string, string> = {
  "perf/large-resource": "Large files slow the page down",
  "perf/render-blocking": "Files block the first paint",
  "perf/image-oversized": "Images bigger than the screen needs",
  "perf/image-format": "Images that could be WebP or AVIF",
  "kbd/focus-outline-removed": "Focus outline removed with no replacement",
  "kbd/positive-tabindex": "Positive tabindex changes the Tab order",
  "ui/off-screen": "Elements stick out past the right edge",
  "mobile/off-screen": "At phone width, elements stick out past the screen",
  "mobile/scroll-not-focusable": "Scrolling boxes keyboard users can't reach",
  "mobile/text-clipped": "At phone width, text is cut off",
  "ui/broken-image": "Images failed to load",
  "runtime/console-error": "Errors in the console",
  "runtime/failed-request": "Requests failed",
  "runtime/mixed-content": "Insecure (http) content on an https page",
  "runtime/frustration-dead": "Clicks that did nothing",
  "runtime/frustration-rage": "Repeated clicks on the same element",
};

// Lucide-style 24×24 stroke icons.
const svg = (d: string, size = 16) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
const ICON = {
  audit: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  rerun: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>', 15),
  export: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>', 15),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  minimize: svg('<path d="M5 12h14"/>'),
  dockLeft: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>'),
  dockRight: svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>'),
  locate: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>', 14),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 14),
  external: svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>', 13),
  chevron: svg('<path d="m9 18 6-6-6-6"/>', 16),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', 14),
  wrench: svg('<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>', 14),
  pin: svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>', 14),
  eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>', 14),
  sparkle: svg('<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>', 15),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', 14),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>', 14),
  check: svg('<path d="M20 6 9 17l-5-5"/>', 14),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', 12),
};

let _open = false;
let _root: HTMLElement | null = null;
/** The scan the panel runs; "Re-run" keeps it. Chosen in the popup menu or the panel's scan bar. */
let _scan: AuditScan = "full";
let _sev: Issue["severity"] | "all" = "all";
let _cat: AuditCategory | "all" = "all";
let _minimized = false;
let _lastDiff: AuditComparison | null = null;
let _expanded = new Set<string>();
/** Group keys NOT selected for Copy for AI (everything starts selected). */
let _unselected = new Set<string>();
let _highlightTimer: ReturnType<typeof setTimeout> | null = null;
let _highlightRaf = 0;
let _clock: ReturnType<typeof setInterval> | null = null;

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
  setBody(`<div class="tb-au-empty" role="status"><span class="tb-au-spin" aria-hidden="true"></span>${escapeHtml(_scan === "full" ? "Checking accessibility, layout, performance, SEO and errors…" : `Running ${AUDIT_SCANS[_scan].label}…`)}</div>`);
  setBusy(true);

  const previous = getLastAuditRun();
  let run: AuditRun;
  try {
    if (AUDIT_SCANS[_scan].categories.includes("accessibility")) await ensureAxe();
    run = await runAudit({ scan: _scan });
  } catch (err) {
    console.warn("[TraceBug] Audit failed:", err);
    setBusy(false);
    setBody(`<div class="tb-au-empty">Something on this page stopped the audit. Reload and try again.</div>`);
    return null;
  }
  // Only the same scan is a re-run; switching scans is a different question, not "what changed".
  const diff = previous && (previous.scan ?? "full") === (run.scan ?? "full") ? compareAudits(previous, run) : null;
  _lastDiff = diff && diff.comparable ? diff : null;
  _expanded = new Set();
  _unselected = new Set();
  _sev = "all";
  _cat = "all";
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
  if (_clock) clearInterval(_clock);
  _clock = null;
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
  const was = label?.textContent || "Export";
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
  setTimeout(() => { set(was); btn.disabled = false; }, 1800);
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    (_root || document.body).appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}

/** Copy the selected findings as a fix prompt for a coding agent. */
async function copyForAi(btn: HTMLButtonElement | null): Promise<void> {
  const run = getLastAuditRun();
  if (!run || !btn) return;
  const ids = groups(run).filter((g) => !_unselected.has(g.key)).flatMap((g) => g.items.map((f) => f.id));
  if (!ids.length) return;
  const ok = await copyText(buildAuditFixPrompt(run, ids));
  const label = btn.querySelector(".tb-au-btn-l");
  const was = label?.textContent || "";
  if (label) label.textContent = ok ? "Copied — paste into your agent" : "Copy failed";
  setTimeout(() => { if (label) label.textContent = was; }, 2200);
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
        <h2 class="tb-au-title" id="${PANEL_ID}-title" tabindex="-1">Site audit</h2>
        <button type="button" class="tb-au-icon" data-tb-au="dock" aria-label="Move panel to the other side" title="Move panel to the other side">${ICON.dockLeft}</button>
        <button type="button" class="tb-au-icon" data-tb-au="minimize" aria-label="Minimise" title="Minimise">${ICON.minimize}</button>
        <button type="button" class="tb-au-icon" data-tb-au="close" aria-label="Close the audit" title="Close (Esc)">${ICON.close}</button>
      </div>
      <div class="tb-au-scans" role="group" aria-label="Which checks to run">${(Object.keys(AUDIT_SCANS) as AuditScan[]).map((k) =>
        `<button type="button" class="tb-au-scan" data-tb-au="scan" data-scan="${k}" aria-pressed="false">${escapeHtml(AUDIT_SCANS[k].label)}</button>`).join("")}</div>
      <div class="tb-au-body" data-tb-au="body"></div>
      <div class="tb-au-foot-bar">
        <button type="button" class="tb-au-btn" data-tb-au="export" disabled title="Download this audit as a TraceBug report (.html) your coding agent can read with the MCP tools">${ICON.export}<span class="tb-au-btn-l">Export report</span></button>
        <button type="button" class="tb-au-btn tb-au-btn-primary" data-tb-au="copy-ai" disabled title="Copy the selected findings as a fix prompt for Claude Code, Cursor or any coding agent">${ICON.sparkle}<span class="tb-au-btn-l">Copy for AI</span></button>
      </div>
    </div>`);
  root.appendChild(panel);
  _open = true;
  syncToolbarButton();
  syncDockButton();
  placePanel();
  window.addEventListener("resize", placePanel);
  if (_clock) clearInterval(_clock);
  _clock = setInterval(updateAgo, 30000);

  panel.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const actionEl = t.closest<HTMLElement>("[data-tb-au]");
    const action = actionEl?.dataset.tbAu;
    if (!action) return;
    const run = getLastAuditRun();
    if (action === "close") closeAuditPanel();
    else if (action === "minimize") setMinimized(true);
    else if (action === "restore") setMinimized(false);
    else if (action === "dock") switchDock();
    else if (action === "rerun") void showAuditPanel(root);
    else if (action === "export") void exportCurrent(actionEl as HTMLButtonElement);
    else if (action === "copy-ai") void copyForAi(actionEl as HTMLButtonElement);
    else if (action === "scan") void showAuditPanel(root, actionEl?.dataset.scan);
    else if (action === "reveal") void revealAndRerun(root);
    else if (action === "sev" && run) { _sev = (actionEl?.dataset.sev as typeof _sev) || "all"; render(run); }
    else if (action === "cat" && run) { const c = actionEl?.dataset.cat as typeof _cat; _cat = _cat === c ? "all" : c; render(run); }
    else if (action === "toggle" || action === "chev") toggleGroup(actionEl!.closest<HTMLElement>(".tb-au-card"));
    else if (action === "expand-all" && run) { const all = visibleGroups(run); const allOpen = all.every((g) => _expanded.has(g.key)); _expanded = allOpen ? new Set() : new Set(all.map((g) => g.key)); render(run); }
    else if (action === "locate") locate(actionEl!.closest<HTMLElement>("[data-selector]"), actionEl!.closest<HTMLElement>(".tb-au-card"));
    else if (action === "copy-sel") void copySelector(actionEl as HTMLButtonElement);
  });
  panel.addEventListener("change", (e) => {
    const box = e.target as HTMLInputElement;
    const run = getLastAuditRun();
    if (!run || box.type !== "checkbox") return;
    if (box.dataset.tbAu === "select-all") {
      _unselected = box.checked ? new Set() : new Set(visibleGroups(run).map((g) => g.key));
      render(run);
    } else if (box.dataset.group) {
      if (box.checked) _unselected.delete(box.dataset.group); else _unselected.add(box.dataset.group);
      syncSelection(run);
    }
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
  const hasRun = !!getLastAuditRun();
  panel.querySelectorAll<HTMLButtonElement>('[data-tb-au="export"], [data-tb-au="rerun"], [data-tb-au="scan"], [data-tb-au="copy-ai"]').forEach((b) => {
    b.disabled = busy || ((b.dataset.tbAu === "export" || b.dataset.tbAu === "copy-ai") && !hasRun);
  });
  panel.setAttribute("aria-busy", String(busy));
}

function markScan(): void {
  document.querySelectorAll<HTMLElement>(`#${PANEL_ID} [data-tb-au="scan"]`).forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.scan === _scan));
  });
}

function setBody(html: string): void {
  const el = document.querySelector<HTMLElement>(`#${PANEL_ID} [data-tb-au="body"]`);
  if (el) setInnerHTML(el, html);
}

// ── Grouping ───────────────────────────────────────────────────────────────

interface Group { key: string; ruleId: string; category: AuditCategory; severity: Issue["severity"]; items: Issue[]; elements: number }

/** Findings of one rule in one category become one row; elements are listed inside it. */
export function groupFindings(findings: Issue[]): Group[] {
  const map = new Map<string, Group>();
  for (const f of findings) {
    const category = (f.category || "ui") as AuditCategory;
    const key = `${category}|${f.ruleId || f.title}`;
    let g = map.get(key);
    if (!g) { g = { key, ruleId: f.ruleId || "", category, severity: f.severity, items: [], elements: 0 }; map.set(key, g); }
    g.items.push(f);
    g.elements += Math.max(1, f.occurrences ?? 1);
    if (SEV_RANK[f.severity] < SEV_RANK[g.severity]) g.severity = f.severity;
  }
  return [...map.values()].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.elements - a.elements);
}

function groups(run: AuditRun): Group[] {
  return groupFindings(run.findings);
}

function visibleGroups(run: AuditRun): Group[] {
  return groups(run).filter((g) => (_sev === "all" || g.severity === _sev) && (_cat === "all" || g.category === _cat));
}

function groupTitle(g: Group): string {
  const first = g.items[0].title;
  if (g.items.every((f) => f.title === first)) return first;
  return GROUP_TITLE[g.ruleId] || first;
}

// ── Rendering ──────────────────────────────────────────────────────────────

function agoText(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : new Date(ts).toLocaleString();
}

function updateAgo(): void {
  const run = getLastAuditRun();
  const el = document.querySelector(`#${PANEL_ID} [data-tb-au="ago"]`);
  if (run && el) el.textContent = `Scanned ${agoText(run.scannedAt)}`;
}

function render(run: AuditRun): void {
  updateTabScore(run);
  const all = groups(run);
  const shown = visibleGroups(run);
  const parts: string[] = [];
  parts.push(scoreHeader(run, all));
  if (_lastDiff) parts.push(diffHtml(_lastDiff));

  const a11y = run.categories.find((c) => c.name === "accessibility");
  const hidden = a11y?.metrics?.transparentText ?? 0;
  if (hidden > 0) {
    parts.push(`<div class="tb-au-notice">${ICON.eye}<div><b>${hidden} piece${hidden === 1 ? "" : "s"} of text ${hidden === 1 ? "was" : "were"} still hidden when checked</b>
      <div class="tb-au-muted">Usually content that fades in as you scroll. It wasn't checked yet.</div>
      <button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="reveal">Scroll the page and re-run</button></div></div>`);
  }

  if (all.length) {
    const selected = all.filter((g) => !_unselected.has(g.key)).length;
    const allOpen = shown.length > 0 && shown.every((g) => _expanded.has(g.key));
    parts.push(`<div class="tb-au-listbar">
      <label class="tb-au-check"><input type="checkbox" data-tb-au="select-all" ${selected === all.length ? "checked" : ""}><span data-tb-au="sel-label">${selected === all.length ? "Deselect all" : "Select all"}</span></label>
      <span class="tb-au-muted" data-tb-au="sel-count">${selected} selected</span>
      <span class="tb-au-spacer"></span>
      <span class="tb-au-muted">${shown.length} of ${all.length}</span>
      <button type="button" class="tb-au-linkbtn" data-tb-au="expand-all">${allOpen ? "Collapse all" : "Expand all"}</button>
    </div>`);
    parts.push(`<div class="tb-au-list">${shown.map((g) => groupHtml(g)).join("")}</div>`);
    if (!shown.length) parts.push(`<div class="tb-au-empty">Nothing matches this filter.</div>`);
  }
  if (run.review?.length) parts.push(reviewHtml(run.review));
  if (run.truncated > 0) {
    parts.push(`<div class="tb-au-note">${run.truncated} more finding${run.truncated === 1 ? "" : "s"} not listed (the list keeps the ${run.findings.length} most severe). The score counts all of them.</div>`);
  }
  if (run.findings.length === 0) {
    parts.push(`<div class="tb-au-allclear">${ICON.check}<div><b>No problems found by the checks that ran.</b><div class="tb-au-muted">That isn't proof the page is accessible or bug-free — see what the checks can't tell you above.</div></div></div>`);
  }
  setBody(parts.join(""));
  setBusy(false);
  syncSelection(run);
}

function scoreHeader(run: AuditRun, all: Group[]): string {
  const s = run.score;
  // The headline is the scan's own score: the accessibility score for Accessibility Audit, the overall otherwise.
  const single = run.categories.length === 1 ? run.categories[0].name : null;
  const value = single ? s?.categories?.[single] ?? null : s?.overall ?? null;
  const band = typeof value === "number" ? scoreBand(value) : null;
  const counts: Record<string, number> = {};
  for (const g of all) counts[g.severity] = (counts[g.severity] || 0) + g.elements;

  const a11y = run.categories.find((c) => c.name === "accessibility" && c.ran);
  const am = a11y?.metrics || {};
  const wcagFails = am.wcagCriteriaFailed ?? 0;
  const wcag = a11y
    ? wcagFails > 0
      ? `<span class="tb-au-badge tb-au-badge-bad" title="An automated failure is a real WCAG failure. Passing these checks would not prove conformance.">WCAG A/AA: ${wcagFails} criteri${wcagFails === 1 ? "on" : "a"} fail</span>`
      : `<span class="tb-au-badge tb-au-badge-ok" title="No automated failures. That does not prove WCAG conformance: many criteria need a person.">No automated WCAG failures</span>`
    : "";
  const rules = a11y && am.rulesChecked ? `${am.rulesPassed} of ${am.rulesChecked} accessibility rules passed` : "";

  const sevLine = SEVERITIES.filter((k) => counts[k]).map((k) =>
    `<button type="button" class="tb-au-sevcount" data-tb-au="sev" data-sev="${_sev === k ? "all" : k}" aria-pressed="${_sev === k}"><span class="tb-au-dot tb-au-sev-${k}"></span>${counts[k]} ${SEVERITY_NAME[k].toLowerCase()}</button>`).join("");

  const cats = run.categories.length > 1 ? `<ul class="tb-au-cats">${run.categories.map((c) => {
    const v = s?.categories?.[c.name];
    const pill = !c.ran ? `<span class="tb-au-pill tb-au-pill-off">Not run</span>`
      : typeof v === "number" ? `<span class="tb-au-pill tb-au-band-${scoreBand(v)}">${v}</span>` : `<span class="tb-au-pill tb-au-pill-off">–</span>`;
    const n = !c.ran ? "" : c.count === 0 ? "No findings" : `${c.count} found`;
    const metrics = c.metrics ? formatCategoryMetrics(c.metrics) : "";
    return `<li><button type="button" class="tb-au-cat${c.ran ? "" : " tb-au-cat-off"}" data-tb-au="cat" data-cat="${c.name}" aria-pressed="${_cat === c.name}" ${c.ran && c.count ? "" : "disabled"}>
      ${pill}<b>${escapeHtml(CATEGORY_LABEL[c.name])}</b><span class="tb-au-cat-n">${escapeHtml(n)}</span></button>
      ${metrics ? `<div class="tb-au-cat-m">${escapeHtml(metrics)}</div>` : ""}</li>`;
  }).join("")}</ul>` : `<ul class="tb-au-cats tb-au-cats-hidden"></ul>`;

  const limits = run.categories.filter((c) => c.limitation).map((c) =>
    `<li><b>${escapeHtml(CATEGORY_LABEL[c.name])}${c.ran ? "" : " (not run)"}:</b> ${escapeHtml(c.limitation!)}</li>`).join("");

  return `<section class="tb-au-score" aria-label="${escapeHtml(value == null ? "No score" : `Score ${value} out of 100, ${BAND_LABEL[band!]}`)}">
    <div class="tb-au-score-row">
      <div class="tb-au-score-big ${band ? `tb-au-text-${band}` : ""}">${value == null ? "–" : value}<span>/100</span></div>
      <span class="tb-au-badge ${band ? `tb-au-badge-${band}` : ""}">${band ? BAND_LABEL[band] : "No score"}</span>
      <span class="tb-au-spacer"></span>
      <button type="button" class="tb-au-btn tb-au-btn-solid" data-tb-au="rerun">${ICON.rerun}<span class="tb-au-btn-l">Re-scan</span></button>
    </div>
    <div class="tb-au-bar"><span class="${band ? `tb-au-fill-${band}` : ""}" style="width:${value ?? 0}%"></span></div>
    ${wcag ? `<div class="tb-au-wcagline">${wcag}</div>` : ""}
    ${sevLine ? `<div class="tb-au-sevline"><span class="tb-au-muted">Elements:</span>${sevLine}</div>` : ""}
    <div class="tb-au-meta-line">${rules ? `<span>${escapeHtml(rules)}</span><span aria-hidden="true">·</span>` : ""}<span data-tb-au="ago">Scanned ${agoText(run.scannedAt)}</span><span aria-hidden="true">·</span><span>${run.viewport.width}×${run.viewport.height}</span></div>
    ${cats}
    <div class="tb-au-details">
      <details class="tb-au-how"><summary>${ICON.info}How is the score calculated?</summary><p>${escapeHtml(SCORE_EXPLANATION)}</p></details>
      ${limits ? `<details class="tb-au-how tb-au-limits"><summary>${ICON.info}What these checks can't tell you</summary><ul>${limits}</ul></details>` : ""}
    </div>
  </section>`;
}

function updateTabScore(run: AuditRun): void {
  const el = document.querySelector<HTMLElement>(`#${PANEL_ID} [data-tb-au="tab-score"]`);
  const single = run.categories.length === 1 ? run.categories[0].name : null;
  const o = single ? run.score?.categories?.[single] : run.score?.overall;
  if (!el) return;
  if (typeof o === "number") setInnerHTML(el, `<span class="tb-au-tab-n tb-au-band-${scoreBand(o)}">${o}</span>`);
  else setInnerHTML(el, ICON.audit);
}

function syncSelection(run: AuditRun): void {
  const all = groups(run);
  const selected = all.filter((g) => !_unselected.has(g.key));
  const n = selected.reduce((a, g) => a + g.items.length, 0);
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  const btn = panel.querySelector<HTMLButtonElement>('[data-tb-au="copy-ai"]');
  if (btn) {
    btn.disabled = n === 0;
    const l = btn.querySelector(".tb-au-btn-l");
    if (l && !/Copied|failed/.test(l.textContent || "")) l.textContent = n ? `Copy for AI (${n})` : "Copy for AI";
  }
  const count = panel.querySelector('[data-tb-au="sel-count"]');
  if (count) count.textContent = `${selected.length} selected`;
  const box = panel.querySelector<HTMLInputElement>('[data-tb-au="select-all"]');
  if (box) {
    box.checked = selected.length === all.length && all.length > 0;
    box.indeterminate = selected.length > 0 && selected.length < all.length;
    const label = panel.querySelector('[data-tb-au="sel-label"]');
    if (label) label.textContent = box.checked ? "Deselect all" : "Select all";
  }
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

const hex = /^#[0-9a-f]{3,8}$/i;

/** Found / Required rows: what was measured, what's needed, and (contrast) the suggested value. */
function foundRequired(f: Issue): string {
  const m = f.evidence?.metrics;
  if (!m) return "";
  const isContrast = f.ruleId === "color-contrast" || f.ruleId === "color-contrast-enhanced";
  if (isContrast && hex.test(String(m.fgColor)) && hex.test(String(m.bgColor))) {
    const fg = String(m.fgColor), bg = String(m.bgColor), sug = String(m.suggestedFgColor ?? "");
    const sw = (c: string) => `<span class="tb-au-sw" style="background:${c}"></span>`;
    const sample = (c: string) => `<span class="tb-au-sample" style="color:${c};background:${bg}">Aa</span>`;
    return `<table class="tb-au-fr"><thead><tr><th></th><th>Found</th><th>Required</th></tr></thead><tbody>
      <tr><th>Contrast</th><td class="tb-au-bad">${ICON.x}${escapeHtml(String(m.contrastRatio))}:1</td><td>${escapeHtml(String(m.expectedContrastRatio ?? ""))}</td></tr>
      <tr><th>Text colour</th><td>${sw(fg)}<code>${escapeHtml(fg)}</code></td><td>${hex.test(sug) ? `${sw(sug)}<code>${escapeHtml(sug)}</code> <span class="tb-au-muted">suggested</span>` : "—"}</td></tr>
      <tr><th>Background</th><td>${sw(bg)}<code>${escapeHtml(bg)}</code></td><td></td></tr>
      ${m.fontSize ? `<tr><th>Font</th><td colspan="2">${escapeHtml(String(m.fontSize))}${m.fontWeight ? ` · ${escapeHtml(String(m.fontWeight))}` : ""}</td></tr>` : ""}
    </tbody></table>
    <div class="tb-au-samples">${sample(fg)}<span class="tb-au-arrow">→</span>${hex.test(sug) ? sample(sug) : ""}</div>`;
  }
  const rows = Object.entries(m).map(([k, v]) => `<tr><th>${escapeHtml(LABEL[k] || k)}</th><td colspan="2">${escapeHtml(String(v))}</td></tr>`).join("");
  return rows ? `<table class="tb-au-fr"><tbody>${rows}</tbody></table>` : "";
}

const LABEL: Record<string, string> = {
  needed: "Space needed (px)", available: "Space available (px)", overlapWidth: "Overlap width (px)", overlapHeight: "Overlap height (px)",
  renderedWidth: "Drawn width (px)", renderedHeight: "Drawn height (px)", right: "Right edge (px)", viewportWidth: "Window width (px)",
  pageWidth: "Page width (px)", heightPx: "Height (px)", "scroll-padding-top": "scroll-padding-top (px)", "scroll-padding-bottom": "scroll-padding-bottom (px)",
  position: "Position", elements: "Elements", contrastRatio: "Contrast",
};

function elementRow(f: Issue, showDetails: boolean): string {
  const text = f.evidence?.text?.trim();
  const name = text ? `“${text.length > 60 ? text.slice(0, 59) + "…" : text}”` : f.url ? f.url : f.selector ? `<${(f.evidence?.html || "").match(/^<([a-z0-9-]+)/i)?.[1] || "element"}>` : f.title;
  const acts = f.selector
    ? `<div class="tb-au-el-acts">
        <button type="button" class="tb-au-btn tb-au-btn-sm tb-au-btn-primary" data-tb-au="locate">${ICON.locate}<span class="tb-au-btn-l">Locate on page</span></button>
        <button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="copy-sel" aria-label="Copy selector">${ICON.copy}<span class="tb-au-btn-l">Copy selector</span></button>
      </div>` : "";
  return `<li class="tb-au-el" data-selector="${escapeHtml(f.selector || "")}">
    <div class="tb-au-el-name">${escapeHtml(name)}${f.occurrences && f.occurrences > 1 ? ` <span class="tb-au-muted">×${f.occurrences}</span>` : ""}</div>
    ${f.selector ? `<code class="tb-au-el-sel" title="${escapeHtml(f.selector)}">${escapeHtml(f.selector)}</code>` : ""}
    ${showDetails ? foundRequired(f) : ""}
    ${showDetails && f.fix ? `<p class="tb-au-el-fix"><b>Fix:</b> ${escapeHtml(f.fix)}</p>` : ""}
    ${acts}
    <div class="tb-au-locmsg" data-tb-au-msg role="status"></div>
  </li>`;
}

function groupHtml(g: Group): string {
  const open = _expanded.has(g.key);
  const first = g.items[0];
  const selected = !_unselected.has(g.key);
  const wcag = [...new Set(g.items.flatMap((f) => f.wcag || []))];
  const tag = g.category === "accessibility" && wcag.length ? PRINCIPLE[wcag[0][0]] || "Accessibility" : CATEGORY_LABEL[g.category];
  // Per element when the measured values or fixes differ (contrast colours); once for the group otherwise.
  const sameFix = g.items.every((f) => f.fix === first.fix);
  const perElement = !sameFix || g.items.some((f) => f.evidence?.metrics && (f.ruleId === "color-contrast" || g.items.length === 1));
  const sub = first.selector || first.url || "";
  const id = `tb-au-g-${escapeHtml(first.id)}`;
  return `<article class="tb-au-card tb-au-card-${g.severity}${open ? " tb-au-open" : ""}" data-key="${escapeHtml(g.key)}" data-selector="${escapeHtml(first.selector || "")}">
    <div class="tb-au-card-h">
      <input type="checkbox" class="tb-au-cb" data-group="${escapeHtml(g.key)}" ${selected ? "checked" : ""} aria-label="Include in Copy for AI">
      <button type="button" class="tb-au-card-t" data-tb-au="toggle" aria-expanded="${open}" aria-controls="${id}">
        <span class="tb-au-card-title">${escapeHtml(groupTitle(g))}</span>
        <span class="tb-au-card-sub">${sub ? `<code>${escapeHtml(sub)}</code>` : ""}${g.elements > 1 ? `<span class="tb-au-count">${g.elements} elements</span>` : ""}<span class="tb-au-tag">${escapeHtml(tag)}</span></span>
      </button>
      <span class="tb-au-dot tb-au-sev-${g.severity}" title="${SEVERITY_NAME[g.severity]}" aria-label="${SEVERITY_NAME[g.severity]} severity" role="img"></span>
      <button type="button" class="tb-au-chev" data-tb-au="chev" aria-hidden="true" tabindex="-1">${ICON.chevron}</button>
    </div>
    <div class="tb-au-card-b" id="${id}"${open ? "" : " hidden"}>
      <div class="tb-au-sect"><div class="tb-au-sect-h">${ICON.file}What's wrong</div><p>${escapeHtml(first.description)}</p></div>
      <dl class="tb-au-dl">
        <dt>Severity</dt><dd><span class="tb-au-dot tb-au-sev-${g.severity}"></span>${SEVERITY_NAME[g.severity]}</dd>
        <dt>Category</dt><dd>${escapeHtml(CATEGORY_LABEL[g.category])}</dd>
        ${wcag.length ? `<dt>Criterion</dt><dd>${wcag.map((c) => `WCAG ${escapeHtml(wcagLabel(c))}`).join("<br>")}</dd>` : ""}
        <dt>Source</dt><dd>${first.detector === "axe-a11y" ? "axe-core" : "TraceBug"} <code>${escapeHtml(g.ruleId)}</code></dd>
      </dl>
      ${!perElement && first.fix ? `<div class="tb-au-sect tb-au-fixbox"><div class="tb-au-sect-h">${ICON.wrench}How to fix</div><p>${escapeHtml(first.fix)}</p></div>` : ""}
      <div class="tb-au-sect"><div class="tb-au-sect-h">${ICON.pin}Where it is${g.items.length > 1 ? ` · ${g.items.length}` : ""}</div>
        <ul class="tb-au-els">${g.items.map((f) => elementRow(f, perElement)).join("")}</ul></div>
      ${first.helpUrl && /^https:\/\//.test(first.helpUrl) ? `<a class="tb-au-link" href="${escapeHtml(first.helpUrl)}" target="_blank" rel="noopener noreferrer">Learn more about this rule${ICON.external}<span class="tb-au-sr"> (opens in a new tab)</span></a>` : ""}
    </div>
  </article>`;
}

/** Rules axe couldn't decide: collapsed, never scored, never in Copy for AI. */
function reviewHtml(items: NonNullable<AuditRun["review"]>): string {
  const elements = items.reduce((a, r) => a + r.count, 0);
  const rows = items.map((r) => {
    const wcag = (r.wcag || []).map((sc) => `<span class="tb-au-tag">WCAG ${escapeHtml(wcagLabel(sc))}</span>`).join("");
    const els = r.elements.map((e) => `<li class="tb-au-el" data-selector="${escapeHtml(e.selector || "")}">
        ${e.selector ? `<code class="tb-au-el-sel" title="${escapeHtml(e.selector)}">${escapeHtml(e.selector)}</code>` : ""}
        ${e.selector ? `<div class="tb-au-el-acts">
          <button type="button" class="tb-au-btn tb-au-btn-sm tb-au-btn-primary" data-tb-au="locate">${ICON.locate}<span class="tb-au-btn-l">Locate on page</span></button>
          <button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="copy-sel" aria-label="Copy selector">${ICON.copy}<span class="tb-au-btn-l">Copy selector</span></button>
        </div>` : ""}
        <div class="tb-au-locmsg" data-tb-au-msg role="status"></div>
      </li>`).join("");
    const more = r.count > r.elements.length ? `<div class="tb-au-muted">${r.count - r.elements.length} more not listed.</div>` : "";
    return `<details class="tb-au-rv-item">
      <summary><span class="tb-au-rv-t">${escapeHtml(r.title)}</span><span class="tb-au-count">${r.count} element${r.count === 1 ? "" : "s"}</span>${ICON.chevron}</summary>
      <div class="tb-au-rv-b">
        ${r.reason ? `<p><b>Why it needs a person:</b> ${escapeHtml(r.reason)}</p>` : ""}
        ${wcag ? `<div class="tb-au-wcags">${wcag}</div>` : ""}
        <ul class="tb-au-els">${els}</ul>${more}
        <div class="tb-au-foot"><code class="tb-au-rule">${escapeHtml(r.ruleId)}</code>${r.helpUrl && /^https:\/\//.test(r.helpUrl) ? `<a class="tb-au-link" href="${escapeHtml(r.helpUrl)}" target="_blank" rel="noopener noreferrer">How to check${ICON.external}<span class="tb-au-sr"> (opens in a new tab)</span></a>` : ""}</div>
      </div>
    </details>`;
  }).join("");
  return `<details class="tb-au-review">
    <summary>${ICON.eye}<span><b>Needs a person to check</b> · ${items.length} rule${items.length === 1 ? "" : "s"}, ${elements} element${elements === 1 ? "" : "s"}</span>${ICON.chevron}</summary>
    <p class="tb-au-muted tb-au-rv-intro">The automated checks couldn't decide these — for example a text colour over an image or gradient. They are <b>not failures</b> and don't affect the score. Look at each one and decide.</p>
    ${rows}
  </details>`;
}

function toggleGroup(card: HTMLElement | null): void {
  if (!card) return;
  const key = card.dataset.key || "";
  const open = !card.classList.contains("tb-au-open");
  card.classList.toggle("tb-au-open", open);
  card.querySelectorAll('[data-tb-au="toggle"]').forEach((b) => b.setAttribute("aria-expanded", String(open)));
  const body = card.querySelector<HTMLElement>(".tb-au-card-b");
  if (body) body.hidden = !open;
  if (open) _expanded.add(key); else _expanded.delete(key);
}

async function copySelector(btn: HTMLButtonElement | null): Promise<void> {
  const sel = btn?.closest<HTMLElement>("[data-selector]")?.dataset.selector || "";
  const label = btn?.querySelector(".tb-au-btn-l");
  if (!sel || !label) return;
  label.textContent = (await copyText(sel)) ? "Copied" : "Copy failed";
  setTimeout(() => { label.textContent = "Copy selector"; }, 1500);
}

// ── Locate: scroll to the element and outline it; the panel stays open ─────

function clearHighlight(): void {
  if (_highlightTimer) clearTimeout(_highlightTimer);
  _highlightTimer = null;
  cancelAnimationFrame(_highlightRaf);
  document.getElementById(HIGHLIGHT_ID)?.remove();
  document.querySelectorAll(`#${PANEL_ID} .tb-au-active`).forEach((c) => c.classList.remove("tb-au-active"));
}

function locate(row: HTMLElement | null, card: HTMLElement | null): void {
  if (!row) return;
  const selector = row.dataset.selector || "";
  const msg = row.querySelector<HTMLElement>("[data-tb-au-msg]");
  const say = (t: string) => { if (msg) msg.textContent = t; };
  say("");
  let el: Element | null = null;
  try { el = selector ? document.querySelector(selector) : null; } catch { el = null; }
  if (!el) { say("Not on the page any more — it may have been removed or re-rendered. Re-scan."); return; }
  const rect0 = el.getBoundingClientRect();
  const vis = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  if ((rect0.width === 0 && rect0.height === 0) || (typeof vis === "function" && !vis.call(el))) {
    say("It's on the page but not visible right now (hidden, or inside a closed menu or tab).");
  }
  clearHighlight();
  row.classList.add("tb-au-active");
  card?.classList.add("tb-au-active");
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
    setTimeout(() => { box.remove(); row.classList.remove("tb-au-active"); card?.classList.remove("tb-au-active"); }, 400);
  }, 4000);
}

/** Scroll through the page so scroll-triggered content appears, return to where the user was, then re-run. */
async function revealAndRerun(root: HTMLElement): Promise<void> {
  const startY = window.scrollY, startX = window.scrollX;
  setBody(`<div class="tb-au-empty" role="status"><span class="tb-au-spin" aria-hidden="true"></span>Scrolling through the page so hidden content appears…</div>`);
  const step = Math.max(200, Math.round(window.innerHeight * 0.8));
  const max = Math.min(document.documentElement.scrollHeight, 60000);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let y = 0; y < max; y += step) { window.scrollTo(0, y); await wait(140); }
  window.scrollTo(0, max);
  await wait(900);
  window.scrollTo(startX, startY);
  await wait(200);
  await showAuditPanel(root);
}

// ── Styles ─────────────────────────────────────────────────────────────────

function injectStyles(): void {
  document.getElementById(STYLE_ID)?.remove(); // a newer panel version replaces older styles
  const s = createStyleTag(STYLE_ID);
  const P = `#${PANEL_ID}`;
  const H = `#${HIGHLIGHT_ID}`;
  const good = "var(--tb-success, #16A34A)", fair = "#D97706", poor = "var(--tb-error, #DC2626)";
  s.textContent = `
    ${P} { position: fixed !important; top: 12px !important; bottom: 12px !important; z-index: 2147483646 !important;
      width: min(420px, calc(100vw - 24px)) !important; display: flex !important; flex-direction: column !important;
      background: var(--tb-bg-primary, #0B0D14) !important; color: var(--tb-text-primary, #EEF0F5) !important;
      border: 1px solid var(--tb-border, #252A38) !important; border-radius: var(--tb-radius-lg, 16px) !important;
      box-shadow: var(--tb-shadow-lg, 0 16px 48px rgba(0,0,0,.45)) !important; overflow: hidden !important;
      font: 13px/1.5 var(--tb-font-family, system-ui, -apple-system, "Segoe UI", sans-serif) !important; text-align: left !important;
      animation: tb-au-in .18s ease-out; }
    ${P}[data-dock="right"] { right: var(--tb-au-offset, 12px) !important; left: auto !important; }
    ${P}[data-dock="left"] { left: var(--tb-au-offset, 12px) !important; right: auto !important; }
    @keyframes tb-au-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { ${P}, ${H}, ${P} * { animation: none !important; transition: none !important; } }
    ${P} *, ${P} *::before, ${P} *::after { box-sizing: border-box !important; }
    ${P} h2, ${P} h3, ${P} p, ${P} ul, ${P} dl, ${P} dd, ${P} table { margin: 0; padding: 0; }
    ${P} ul { list-style: none; }
    ${P} .tb-au-shell { display: flex; flex-direction: column; min-height: 0; flex: 1; }
    ${P}.tb-au-min { top: auto !important; bottom: 88px !important; width: auto !important; border-radius: 12px !important; }
    ${P}.tb-au-min .tb-au-shell { display: none; }
    ${P} .tb-au-tab { display: none; }
    ${P}.tb-au-min .tb-au-tab { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: none; border: 0; color: inherit; font: inherit; font-weight: 600; cursor: pointer; }
    ${P} .tb-au-tab-n { display: inline-grid; place-items: center; min-width: 30px; height: 30px; border-radius: 999px; font-weight: 700; font-size: 12px; border: 3px solid currentColor; color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-tab-n.tb-au-band-good { border-color: ${good}; } ${P} .tb-au-tab-n.tb-au-band-fair { border-color: ${fair}; } ${P} .tb-au-tab-n.tb-au-band-poor { border-color: ${poor}; }
    ${P} .tb-au-head { display: flex; align-items: center; gap: 4px; padding: 10px 8px 10px 14px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-logo { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--tb-accent-subtle, rgba(255,92,108,.14)); color: var(--tb-accent, #FF5C6C); flex-shrink: 0; margin-right: 6px; }
    ${P} .tb-au-title { flex: 1; font-size: 15px; font-weight: 700; line-height: 1.2; }
    ${P} .tb-au-title:focus { outline: none !important; box-shadow: none !important; border: 0 !important; }
    ${P} .tb-au-muted { color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-spacer { flex: 1; }
    ${P} .tb-au-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; background: none; border: 0; color: var(--tb-text-secondary, #A8AEBE); cursor: pointer; flex-shrink: 0; }
    ${P} .tb-au-icon:hover { background: var(--tb-bg-secondary, #141823); color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-scans { display: grid; grid-template-columns: repeat(4, auto); justify-content: space-between; gap: 2px; padding: 8px 8px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-scan { background: transparent; color: var(--tb-text-secondary, #A8AEBE); border: 0; border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; min-height: 30px; white-space: nowrap; }
    ${P} .tb-au-scan:hover:not(:disabled) { background: var(--tb-bg-secondary, #141823); color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-scan[aria-pressed="true"] { background: var(--tb-accent-subtle, rgba(255,92,108,.14)); color: var(--tb-text-primary, #EEF0F5); box-shadow: inset 0 -2px 0 var(--tb-accent, #FF5C6C); }
    ${P} .tb-au-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: var(--tb-bg-primary, #0B0D14); color: var(--tb-text-primary, #EEF0F5);
      border: 1px solid var(--tb-border, #252A38); border-radius: 9px; padding: 7px 12px; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; min-height: 34px; white-space: nowrap; }
    ${P} .tb-au-btn:hover:not(:disabled) { border-color: var(--tb-border-hover, #333A4D); background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-btn-primary { background: var(--tb-accent, #FF5C6C); border-color: var(--tb-accent, #FF5C6C); color: var(--tb-on-accent, #0B0D14); }
    ${P} .tb-au-btn-primary:hover:not(:disabled) { background: var(--tb-accent, #FF5C6C); filter: brightness(1.06); border-color: var(--tb-accent, #FF5C6C); }
    ${P} .tb-au-btn-solid { background: var(--tb-text-primary, #EEF0F5); color: var(--tb-bg-primary, #0B0D14); border-color: var(--tb-text-primary, #EEF0F5); min-height: 32px; }
    ${P} .tb-au-btn-solid:hover:not(:disabled) { background: var(--tb-text-primary, #EEF0F5); opacity: .9; }
    ${P} .tb-au-btn:disabled, ${P} .tb-au-scan:disabled { opacity: .5; cursor: default; }
    ${P} .tb-au-btn-sm { padding: 4px 9px; font-size: 12px; min-height: 28px; }
    ${P} .tb-au-linkbtn { background: none; border: 0; color: var(--tb-accent, #FF5C6C); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 4px 2px; text-decoration: underline; text-underline-offset: 2px; }
    ${P} button:focus-visible, ${P} a:focus-visible, ${P} summary:focus-visible, ${P} input:focus-visible { outline: 2px solid var(--tb-accent, #FF5C6C) !important; outline-offset: 2px; }
    ${P} .tb-au-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
    ${P} .tb-au-foot-bar { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--tb-border, #252A38); background: var(--tb-bg-primary, #0B0D14); }
    ${P} .tb-au-foot-bar .tb-au-btn { flex: 1; }
    ${P} .tb-au-empty { padding: 36px 16px; text-align: center; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-spin { display: inline-block; width: 14px; height: 14px; margin-right: 8px; vertical-align: -2px; border: 2px solid var(--tb-border, #252A38); border-top-color: var(--tb-accent, #FF5C6C); border-radius: 50%; animation: tb-au-spin .8s linear infinite; }
    @keyframes tb-au-spin { to { transform: rotate(360deg); } }
    ${P} .tb-au-note { margin: 10px 14px; color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-good { color: ${good}; } ${P} .tb-au-bad { color: ${poor}; }
    ${P} .tb-au-diff { margin: 12px 14px 0; padding: 9px 12px; border-radius: 10px; background: var(--tb-bg-secondary, #141823); border: 1px solid var(--tb-border, #252A38); font-size: 12.5px; }
    ${P} .tb-au-notice { display: flex; gap: 10px; margin: 12px 14px 0; padding: 10px 12px; border-radius: 10px; border: 1px solid ${fair}; background: rgba(217,119,6,.08); font-size: 12.5px; }
    ${P} .tb-au-notice svg { flex-shrink: 0; margin-top: 2px; color: ${fair}; }
    ${P} .tb-au-notice .tb-au-btn { margin-top: 8px; }
    ${P} .tb-au-allclear { display: flex; gap: 10px; margin: 14px; padding: 12px; border-radius: 10px; border: 1px solid ${good}; background: rgba(22,163,74,.07); }
    ${P} .tb-au-allclear svg { color: ${good}; flex-shrink: 0; margin-top: 2px; }
    /* Score header */
    ${P} .tb-au-score { padding: 14px 14px 12px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-score-row { display: flex; align-items: center; gap: 10px; }
    ${P} .tb-au-score-big { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -.03em; }
    ${P} .tb-au-score-big span { font-size: 15px; font-weight: 500; color: var(--tb-text-muted, #8A91A5); margin-left: 4px; letter-spacing: 0; }
    ${P} .tb-au-text-good { color: ${good}; } ${P} .tb-au-text-fair { color: ${fair}; } ${P} .tb-au-text-poor { color: ${poor}; }
    ${P} .tb-au-badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 7px; font-size: 12px; font-weight: 700; border: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-badge-good, ${P} .tb-au-badge-ok { color: ${good}; background: rgba(22,163,74,.10); border-color: rgba(22,163,74,.35); }
    ${P} .tb-au-badge-fair { color: ${fair}; background: rgba(217,119,6,.10); border-color: rgba(217,119,6,.35); }
    ${P} .tb-au-badge-poor, ${P} .tb-au-badge-bad { color: ${poor}; background: rgba(220,38,38,.09); border-color: rgba(220,38,38,.35); }
    ${P} .tb-au-bar { height: 6px; border-radius: 999px; background: var(--tb-border, #252A38); margin: 12px 0 10px; overflow: hidden; }
    ${P} .tb-au-bar span { display: block; height: 100%; border-radius: 999px; transition: width .5s ease; }
    ${P} .tb-au-fill-good { background: ${good}; } ${P} .tb-au-fill-fair { background: ${fair}; } ${P} .tb-au-fill-poor { background: ${poor}; }
    ${P} .tb-au-wcagline { margin-bottom: 8px; }
    ${P} .tb-au-sevline { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; font-size: 13px; }
    ${P} .tb-au-sevcount { display: inline-flex; align-items: center; gap: 5px; background: none; border: 0; padding: 2px 4px; margin: 0 -4px; border-radius: 6px; color: var(--tb-text-primary, #EEF0F5); font: inherit; cursor: pointer; }
    ${P} .tb-au-sevcount:hover { background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-sevcount[aria-pressed="true"] { background: var(--tb-bg-secondary, #141823); box-shadow: inset 0 0 0 1px var(--tb-border-hover, #333A4D); }
    ${P} .tb-au-meta-line { display: flex; flex-wrap: wrap; gap: 4px 6px; margin-top: 6px; font-size: 12px; color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-cats { margin-top: 12px; display: grid; gap: 4px; }
    ${P} .tb-au-cats-hidden { display: none; }
    ${P} .tb-au-cat { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; border-radius: 8px; padding: 5px 6px; margin: 0 -6px; font: inherit; font-size: 12.5px; color: inherit; cursor: pointer; text-align: left; }
    ${P} .tb-au-cat:hover:not(:disabled) { background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-cat[aria-pressed="true"] { background: var(--tb-bg-secondary, #141823); box-shadow: inset 0 0 0 1px var(--tb-border-hover, #333A4D); }
    ${P} .tb-au-cat:disabled { cursor: default; }
    ${P} .tb-au-cat b { flex: 1; }
    ${P} .tb-au-cat-n { color: var(--tb-text-secondary, #A8AEBE); font-size: 12px; }
    ${P} .tb-au-cat-off { opacity: .7; }
    ${P} .tb-au-cat-m { margin: 0 0 4px 44px; font: 600 11.5px/1.4 var(--tb-font-mono, ui-monospace, monospace); color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-pill { display: inline-grid; place-items: center; min-width: 36px; height: 22px; padding: 0 6px; border-radius: 999px; font-size: 11.5px; font-weight: 700; border: 2px solid var(--tb-border, #252A38); }
    ${P} .tb-au-pill.tb-au-band-good { border-color: ${good}; } ${P} .tb-au-pill.tb-au-band-fair { border-color: ${fair}; } ${P} .tb-au-pill.tb-au-band-poor { border-color: ${poor}; }
    ${P} .tb-au-pill-off { font-size: 10px; font-weight: 600; color: var(--tb-text-muted, #8A91A5); border-style: dashed; }
    ${P} .tb-au-details { display: grid; gap: 4px; margin-top: 10px; }
    ${P} .tb-au-how { font-size: 12px; }
    ${P} .tb-au-how summary { cursor: pointer; color: var(--tb-text-secondary, #A8AEBE); display: inline-flex; align-items: center; gap: 5px; list-style: none; }
    ${P} .tb-au-how summary::-webkit-details-marker { display: none; }
    ${P} .tb-au-how p, ${P} .tb-au-how ul { margin-top: 6px; color: var(--tb-text-secondary, #A8AEBE); display: grid; gap: 6px; font-size: 11.5px; }
    /* List */
    ${P} .tb-au-listbar { display: flex; align-items: center; gap: 10px; padding: 8px 14px; background: var(--tb-bg-secondary, #141823); border-bottom: 1px solid var(--tb-border, #252A38); position: sticky; top: 0; z-index: 1; }
    ${P} .tb-au-check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
    ${P} input[type="checkbox"] { width: 15px; height: 15px; margin: 0; accent-color: var(--tb-accent, #FF5C6C); cursor: pointer; flex-shrink: 0; }
    ${P} .tb-au-card { border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-card.tb-au-active { box-shadow: inset 3px 0 0 var(--tb-accent, #FF5C6C); }
    ${P} .tb-au-card-h { display: flex; align-items: flex-start; gap: 10px; padding: 11px 10px 11px 14px; }
    ${P} .tb-au-card-h:hover { background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-cb { margin-top: 3px !important; }
    ${P} .tb-au-card-t { flex: 1; min-width: 0; display: grid; gap: 3px; background: none; border: 0; padding: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
    ${P} .tb-au-card-title { font-weight: 650; font-size: 13.5px; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
    ${P} .tb-au-card-sub { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-card-sub code { font: 11.5px var(--tb-font-mono, ui-monospace, monospace); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    ${P} .tb-au-count { flex-shrink: 0; font-weight: 600; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-tag { flex-shrink: 0; font-size: 11px; padding: 0 6px; border-radius: 5px; background: var(--tb-bg-secondary, #141823); border: 1px solid var(--tb-border, #252A38); color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-card-h > .tb-au-dot { margin-top: 6px; }
    ${P} .tb-au-chev { display: grid; place-items: center; width: 24px; height: 24px; background: none; border: 0; color: var(--tb-text-muted, #8A91A5); cursor: pointer; transition: transform .15s; flex-shrink: 0; }
    ${P} .tb-au-open .tb-au-chev { transform: rotate(90deg); }
    ${P} .tb-au-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
    ${P} .tb-au-sev-critical { background: #991B1B; }
    ${P} .tb-au-sev-serious { background: #EA580C; }
    ${P} .tb-au-sev-moderate { background: #EAB308; }
    ${P} .tb-au-sev-minor { background: #94A3B8; }
    ${P} .tb-au-card-b { padding: 0 14px 14px 39px; display: grid; gap: 12px; }
    ${P} .tb-au-card-b[hidden] { display: none; }
    ${P} .tb-au-sect-h { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--tb-text-muted, #8A91A5); margin-bottom: 4px; }
    ${P} .tb-au-sect p { color: var(--tb-text-secondary, #A8AEBE); overflow-wrap: anywhere; }
    ${P} .tb-au-fixbox { padding: 10px 12px; border-radius: 10px; background: var(--tb-bg-secondary, #141823); border-left: 3px solid ${good}; }
    ${P} .tb-au-fixbox p { color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 14px; font-size: 12.5px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-dl dt { color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-dl dd { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    ${P} .tb-au-dl code { font: 11.5px var(--tb-font-mono, ui-monospace, monospace); color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-els { display: grid; gap: 8px; }
    ${P} .tb-au-el { padding: 10px; border-radius: 10px; border: 1px solid var(--tb-border, #252A38); display: grid; gap: 6px; }
    ${P} .tb-au-el.tb-au-active { border-color: var(--tb-accent, #FF5C6C); }
    ${P} .tb-au-el-name { font-weight: 600; font-size: 12.5px; overflow-wrap: anywhere; }
    ${P} .tb-au-el-sel { display: block; font: 11.5px/1.45 var(--tb-font-mono, ui-monospace, monospace); padding: 5px 8px; border-radius: 6px; background: var(--tb-bg-secondary, #141823); overflow-wrap: anywhere; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-el-fix { font-size: 12.5px; padding: 8px 10px; border-radius: 8px; background: var(--tb-bg-secondary, #141823); border-left: 3px solid ${good}; overflow-wrap: anywhere; }
    ${P} .tb-au-el-acts { display: flex; gap: 6px; flex-wrap: wrap; }
    ${P} .tb-au-locmsg { font-size: 12px; color: ${fair}; }
    ${P} .tb-au-locmsg:empty { display: none; }
    ${P} .tb-au-fr { width: 100%; border-collapse: collapse; font-size: 12px; }
    ${P} .tb-au-fr th, ${P} .tb-au-fr td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--tb-border, #252A38); vertical-align: middle; font-weight: 400; }
    ${P} .tb-au-fr thead th { font-size: 10.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--tb-text-muted, #8A91A5); font-weight: 700; }
    ${P} .tb-au-fr tbody th { color: var(--tb-text-muted, #8A91A5); white-space: nowrap; }
    ${P} .tb-au-fr td { font-family: var(--tb-font-mono, ui-monospace, monospace); font-size: 11.5px; }
    ${P} .tb-au-fr td.tb-au-bad { font-weight: 700; display: flex; align-items: center; gap: 3px; }
    ${P} .tb-au-sw { display: inline-block; width: 12px; height: 12px; border-radius: 3px; border: 1px solid rgba(127,127,127,.45); vertical-align: -2px; margin-right: 5px; }
    ${P} .tb-au-samples { display: flex; align-items: center; gap: 8px; }
    ${P} .tb-au-sample { display: inline-grid; place-items: center; width: 48px; height: 32px; border-radius: 6px; font-weight: 700; font-size: 15px; border: 1px solid rgba(127,127,127,.35); }
    ${P} .tb-au-arrow { color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-link { display: inline-flex; align-items: center; gap: 4px; color: var(--tb-accent, #FF5C6C); font-size: 12.5px; text-decoration: none; font-weight: 600; }
    ${P} .tb-au-link:hover { text-decoration: underline; }
    ${P} .tb-au-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    /* Needs review */
    ${P} .tb-au-review { margin: 14px; border: 1px dashed var(--tb-border-hover, #333A4D); border-radius: 10px; }
    ${P} .tb-au-review > summary { display: flex; align-items: center; gap: 8px; padding: 10px 12px; cursor: pointer; list-style: none; font-size: 12.5px; }
    ${P} .tb-au-review > summary::-webkit-details-marker, ${P} .tb-au-rv-item > summary::-webkit-details-marker { display: none; }
    ${P} .tb-au-review > summary > span { flex: 1; }
    ${P} .tb-au-review > summary > svg:last-child, ${P} .tb-au-rv-item > summary > svg:last-child { transition: transform .15s; color: var(--tb-text-muted, #8A91A5); flex-shrink: 0; }
    ${P} .tb-au-review[open] > summary > svg:last-child, ${P} .tb-au-rv-item[open] > summary > svg:last-child { transform: rotate(90deg); }
    ${P} .tb-au-rv-intro { padding: 0 12px 8px; }
    ${P} .tb-au-rv-item { border-top: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-rv-item > summary { display: flex; align-items: center; gap: 8px; padding: 9px 12px; cursor: pointer; list-style: none; font-size: 12.5px; }
    ${P} .tb-au-rv-t { flex: 1; font-weight: 600; }
    ${P} .tb-au-rv-b { padding: 0 12px 12px; display: grid; gap: 8px; font-size: 12.5px; color: var(--tb-text-secondary, #A8AEBE); }
    /* Locate highlight */
    ${H} { position: fixed !important; left: 0 !important; top: 0 !important; z-index: 2147483645 !important; pointer-events: none !important;
      border: 2px solid var(--tb-accent, #FF5C6C) !important; border-radius: 6px !important; background: rgba(255,92,108,.10) !important;
      box-shadow: 0 0 0 4px rgba(255,92,108,.25), 0 0 0 9999px rgba(0,0,0,.18) !important; transition: opacity .35s !important; box-sizing: border-box !important; }
    ${H}.tb-au-hl-out { opacity: 0 !important; }
    ${H} .tb-au-hl-tag { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; padding: 2px 7px; border-radius: 5px; white-space: nowrap;
      background: var(--tb-accent, #FF5C6C); color: var(--tb-on-accent, #0B0D14); font: 600 11px/1.5 ui-monospace, monospace; }
    ${H} .tb-au-hl-tag.tb-au-hl-tag-below { bottom: auto; top: 100%; margin: 4px 0 0; }
    @media (max-width: 520px) { ${P}[data-dock] { top: auto !important; height: 75vh !important; left: 8px !important; right: 8px !important; width: auto !important; } }
  `;
  document.head.appendChild(s);
}
