// ── Site Audit panel ───────────────────────────────────────────────────────
// Runs runAudit() and shows the result: one strip per category (ran / not run,
// with its honest limitation), then findings grouped by category, most severe
// first. "Re-run audit" compares the new run with the previous one on the same
// page and says what was fixed, what is new and what regressed — the verify
// half of audit → fix → verify (docs/audit-quality/implementation-plan.md §2).
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

const PANEL_ID = "tracebug-audit-panel";
const STYLE_ID = "tracebug-audit-panel-styles";

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  accessibility: "Accessibility",
  ui: "Layout",
  seo: "SEO",
  performance: "Performance",
  runtime: "Errors & requests",
};
const SEVERITY_LABEL: Record<Issue["severity"], string> = { critical: "Critical", serious: "Serious", moderate: "Moderate", minor: "Minor" };

let _open = false;
/** The scan the panel runs; "Re-run" keeps it. Chosen in the popup menu or the panel's scan bar. */
let _scan: AuditScan = "full";

export function isAuditPanelOpen(): boolean {
  return _open;
}

/** Run an audit (a menu scan, default: the last one chosen) and show it. If the panel is already open, re-runs in place. */
export async function showAuditPanel(root: HTMLElement, scan?: AuditScan | string): Promise<AuditRun | null> {
  if (isAuditScan(scan)) _scan = scan;
  injectStyles();
  if (!_open) mountShell(root);
  markScan();
  setBody(`<div class="tb-au-empty">Checking this page…</div>`);
  const busyExport = document.querySelector<HTMLButtonElement>(`#${PANEL_ID} [data-tb-au="export"]`);
  if (busyExport) busyExport.disabled = true;
  setSubtitle(_scan === "full" ? "Running accessibility, layout, performance, SEO and error checks…" : `Running ${AUDIT_SCANS[_scan].label}…`);

  const previous = getLastAuditRun();
  let run: AuditRun;
  try {
    run = await runAudit({ scan: _scan });
  } catch (err) {
    console.warn("[TraceBug] Audit failed:", err);
    setSubtitle("The audit could not run on this page.");
    setBody(`<div class="tb-au-empty">Something on this page stopped the audit. Reload and try again.</div>`);
    return null;
  }
  const exportBtn = document.querySelector<HTMLButtonElement>(`#${PANEL_ID} [data-tb-au="export"]`);
  if (exportBtn) exportBtn.disabled = false;
  // Only the same scan is a re-run; switching scans is a different question, not "what changed".
  const diff = previous && (previous.scan ?? "full") === (run.scan ?? "full") ? compareAudits(previous, run) : null;
  render(run, diff && diff.comparable ? diff : null);
  return run;
}

export function closeAuditPanel(): void {
  document.getElementById(`${PANEL_ID}-overlay`)?.remove();
  document.removeEventListener("keydown", onKey, true);
  _open = false;
}

/** Download the last run as a report file. The exporter is loaded on demand. */
async function exportCurrent(btn: HTMLButtonElement | null): Promise<void> {
  const run = getLastAuditRun();
  if (!run || !btn) return;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Exporting…";
  try {
    const { exportAuditReport } = await import("../audit/export");
    const out = await exportAuditReport(run);
    btn.textContent = "Exported ✓";
    btn.title = out.filename;
  } catch (err) {
    console.warn("[TraceBug] Audit export failed:", err);
    btn.textContent = "Export failed";
  }
  setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 1800);
}

function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && _open) {
    e.stopPropagation();
    closeAuditPanel();
  }
}

function mountShell(root: HTMLElement): void {
  document.getElementById(`${PANEL_ID}-overlay`)?.remove();
  const overlay = document.createElement("div");
  overlay.id = `${PANEL_ID}-overlay`;
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", `${PANEL_ID}-title`);
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  setInnerHTML(panel, `
    <div class="tb-au-head">
      <div class="tb-au-titles">
        <div class="tb-au-title" id="${PANEL_ID}-title">Site audit</div>
        <div class="tb-au-sub" data-tb-au="subtitle"></div>
      </div>
      <button type="button" class="tb-au-btn" data-tb-au="export" disabled title="Download this audit as a TraceBug report (.html) your coding agent can read">Export report</button>
      <button type="button" class="tb-au-btn" data-tb-au="rerun">Re-run audit</button>
      <button type="button" class="tb-au-close" data-tb-au="close" aria-label="Close">&times;</button>
    </div>
    <div class="tb-au-scans" role="group" aria-label="Which checks to run">${(Object.keys(AUDIT_SCANS) as AuditScan[]).map((k) =>
      `<button type="button" class="tb-au-scan" data-tb-au="scan" data-scan="${k}" aria-pressed="false">${escapeHtml(AUDIT_SCANS[k].label)}</button>`).join("")}</div>
    <div class="tb-au-body" data-tb-au="body"></div>`);
  overlay.appendChild(panel);
  root.appendChild(overlay);
  _open = true;

  overlay.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay) { closeAuditPanel(); return; }
    const action = t.closest<HTMLElement>("[data-tb-au]")?.dataset.tbAu;
    if (action === "close") closeAuditPanel();
    else if (action === "rerun") void showAuditPanel(root);
    else if (action === "export") void exportCurrent(t.closest<HTMLButtonElement>("button"));
    else if (action === "scan") void showAuditPanel(root, t.closest<HTMLElement>("[data-scan]")?.dataset.scan);
    else if (action === "locate") locate(t.closest<HTMLElement>("[data-selector]")?.dataset.selector || "");
  });
  document.addEventListener("keydown", onKey, true);
  panel.querySelector<HTMLElement>('[data-tb-au="close"]')?.focus();
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

function render(run: AuditRun, diff: AuditComparison | null): void {
  const total = run.findings.length + run.truncated;
  const when = new Date(run.scannedAt).toLocaleTimeString();
  setSubtitle(`${AUDIT_SCANS[run.scan ?? "full"].label} · ${total === 0 ? "No findings" : `${total} finding${total === 1 ? "" : "s"}`} · ${run.viewport.width}×${run.viewport.height} · ${when}`);

  const parts: string[] = [];
  if (diff) parts.push(diffHtml(diff));
  parts.push(`<div class="tb-au-cats">${run.categories.map(categoryChip).join("")}</div>`);

  for (const c of run.categories) {
    if (!c.ran) continue;
    const items = run.findings.filter((f) => f.category === c.name);
    if (items.length === 0) continue;
    parts.push(`<div class="tb-au-group"><div class="tb-au-group-h">${escapeHtml(CATEGORY_LABEL[c.name])} <span>${c.count}</span></div>${items.map(findingHtml).join("")}</div>`);
  }
  if (run.truncated > 0) {
    parts.push(`<div class="tb-au-note">${run.truncated} more finding${run.truncated === 1 ? "" : "s"} not shown (the list keeps the ${run.findings.length} most severe).</div>`);
  }
  if (run.findings.length === 0) {
    parts.push(`<div class="tb-au-empty">No problems found in the checks that ran. That is not proof the page is accessible or bug-free — see each check's limits above.</div>`);
  }
  setBody(parts.join(""));
}

function categoryChip(c: AuditRun["categories"][number]): string {
  const state = !c.ran ? "Not run" : c.count === 0 ? "No findings" : `${c.count} found`;
  return `<div class="tb-au-cat${c.ran ? "" : " tb-au-cat-off"}">
    <div class="tb-au-cat-h"><b>${escapeHtml(CATEGORY_LABEL[c.name])}</b><span>${state}</span></div>
    ${c.metrics ? `<div class="tb-au-cat-m">${escapeHtml(formatCategoryMetrics(c.metrics))}</div>` : ""}
    ${c.limitation ? `<div class="tb-au-cat-l">${escapeHtml(c.limitation)}</div>` : ""}
  </div>`;
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
  return `<div class="tb-au-diff">Since the last run: ${bits}${skipped}</div>`;
}

function findingHtml(f: Issue): string {
  const metrics = f.evidence?.metrics
    ? Object.entries(f.evidence.metrics).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`).join(" · ")
    : "";
  const more = f.occurrences && f.occurrences > 1 ? ` <span class="tb-au-muted">×${f.occurrences}</span>` : "";
  const help = f.helpUrl && /^https:\/\//.test(f.helpUrl)
    ? `<a class="tb-au-link" href="${escapeHtml(f.helpUrl)}" target="_blank" rel="noopener noreferrer">How to fix</a>` : "";
  const locate = f.selector
    ? `<button type="button" class="tb-au-btn tb-au-btn-sm" data-tb-au="locate">Locate</button>` : "";
  return `<div class="tb-au-row" data-selector="${escapeHtml(f.selector || "")}">
    <span class="tb-au-sev tb-au-sev-${f.severity}">${SEVERITY_LABEL[f.severity]}</span>
    <div class="tb-au-main">
      <div class="tb-au-row-t">${escapeHtml(f.title)}${more}</div>
      <div class="tb-au-row-d">${escapeHtml(f.description)}</div>
      ${metrics ? `<div class="tb-au-meta">${metrics}</div>` : ""}
      <div class="tb-au-meta"><code>${escapeHtml(f.ruleId || "")}</code>${f.selector ? ` · <code>${escapeHtml(f.selector)}</code>` : ""}</div>
    </div>
    <div class="tb-au-acts">${locate}${help}</div>
  </div>`;
}

function locate(selector: string): void {
  if (!selector) return;
  let el: Element | null = null;
  try { el = document.querySelector(selector); } catch { el = null; }
  if (!el) return;
  closeAuditPanel();
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const prev = (el as HTMLElement).style.outline;
  (el as HTMLElement).style.outline = "3px solid #FF5C6C";
  (el as HTMLElement).style.outlineOffset = "2px";
  setTimeout(() => { (el as HTMLElement).style.outline = prev; }, 2200);
}

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const s = createStyleTag(STYLE_ID);
  const P = `#${PANEL_ID}`;
  s.textContent = `
    ${P} .tb-au-cat-m { margin-top: 4px; font: 600 12px/1.4 ui-monospace, monospace; }
    ${P}-overlay { position: fixed !important; inset: 0 !important; z-index: 2147483647 !important; background: rgba(0,0,0,.6) !important;
      display: flex !important; align-items: center !important; justify-content: center !important; padding: 20px !important; box-sizing: border-box !important; }
    ${P} { background: var(--tb-bg-primary, #0B0D14) !important; color: var(--tb-text-primary, #EEF0F5) !important;
      border: 1px solid var(--tb-border, #252A38) !important; border-radius: var(--tb-radius-lg, 16px) !important;
      width: 100% !important; max-width: 760px !important; max-height: 88vh !important; display: flex !important; flex-direction: column !important;
      overflow: hidden !important; box-shadow: var(--tb-shadow-lg, 0 16px 48px rgba(0,0,0,.55)) !important;
      font: 13px/1.5 var(--tb-font-family, system-ui, sans-serif) !important; text-align: left !important; }
    ${P} *, ${P} *::before, ${P} *::after { box-sizing: border-box !important; }
    ${P} .tb-au-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-titles { flex: 1; min-width: 0; }
    ${P} .tb-au-title { font-size: 15px; font-weight: 700; }
    ${P} .tb-au-sub, ${P} .tb-au-muted { color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-btn { background: var(--tb-bg-secondary, #141823); color: var(--tb-text-primary, #EEF0F5); border: 1px solid var(--tb-border, #252A38);
      border-radius: var(--tb-radius-sm, 10px); padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer; }
    ${P} .tb-au-btn:hover { border-color: var(--tb-border-hover, #333A4D); }
    ${P} .tb-au-btn:disabled { opacity: .5; cursor: default; }
    ${P} .tb-au-scans { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 16px 0; }
    ${P} .tb-au-scan { background: transparent; color: var(--tb-text-secondary, #A6ADBF); border: 1px solid var(--tb-border, #252A38); border-radius: 999px; padding: 4px 11px; font: inherit; font-size: 12px; cursor: pointer; }
    ${P} .tb-au-scan:hover { color: var(--tb-text-primary, #EEF0F5); }
    ${P} .tb-au-scan[aria-pressed="true"] { background: var(--tb-accent, #FF5C6C); border-color: var(--tb-accent, #FF5C6C); color: var(--tb-on-accent, #fff); }
    ${P} .tb-au-scan:focus-visible { outline: 2px solid var(--tb-accent, #FF5C6C); outline-offset: 2px; }
    ${P} .tb-au-btn:focus-visible, ${P} .tb-au-close:focus-visible, ${P} .tb-au-link:focus-visible { outline: 2px solid var(--tb-accent, #FF5C6C); outline-offset: 2px; }
    ${P} .tb-au-btn-sm { padding: 3px 9px; font-size: 11px; }
    ${P} .tb-au-close { background: none; border: 0; color: var(--tb-text-muted, #8A91A5); font-size: 22px; line-height: 1; padding: 2px 8px; cursor: pointer; border-radius: 8px; }
    ${P} .tb-au-body { overflow-y: auto; padding: 12px 16px 18px; }
    ${P} .tb-au-empty { padding: 28px 8px; text-align: center; color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-note { margin-top: 10px; color: var(--tb-text-muted, #8A91A5); font-size: 12px; }
    ${P} .tb-au-diff { padding: 10px 12px; margin-bottom: 12px; border-radius: var(--tb-radius-sm, 10px); background: var(--tb-accent-subtle, rgba(255,92,108,.12)); }
    ${P} .tb-au-good { color: var(--tb-success, #4CC38A); } ${P} .tb-au-bad { color: var(--tb-error, #F05257); }
    ${P} .tb-au-cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-bottom: 14px; }
    ${P} .tb-au-cat { border: 1px solid var(--tb-border, #252A38); border-radius: var(--tb-radius-sm, 10px); padding: 8px 10px; background: var(--tb-bg-secondary, #141823); }
    ${P} .tb-au-cat-off { opacity: .7; border-style: dashed; }
    ${P} .tb-au-cat-h { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
    ${P} .tb-au-cat-h span { color: var(--tb-text-secondary, #A8AEBE); }
    ${P} .tb-au-cat-l { margin-top: 4px; font-size: 11px; color: var(--tb-text-muted, #8A91A5); }
    ${P} .tb-au-group { margin-top: 10px; }
    ${P} .tb-au-group-h { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--tb-text-secondary, #A8AEBE); margin: 6px 0; }
    ${P} .tb-au-group-h span { color: var(--tb-text-muted, #8A91A5); font-weight: 500; }
    ${P} .tb-au-row { display: flex; gap: 10px; align-items: flex-start; padding: 10px 0; border-top: 1px solid var(--tb-border, #252A38); }
    ${P} .tb-au-main { flex: 1; min-width: 0; }
    ${P} .tb-au-row-t { font-weight: 600; }
    ${P} .tb-au-row-d { color: var(--tb-text-secondary, #A8AEBE); margin-top: 2px; overflow-wrap: anywhere; }
    ${P} .tb-au-meta { color: var(--tb-text-muted, #8A91A5); font-size: 11px; margin-top: 3px; overflow-wrap: anywhere; }
    ${P} .tb-au-meta code { font-family: var(--tb-font-mono, ui-monospace, monospace); font-size: 11px; }
    ${P} .tb-au-acts { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; flex-shrink: 0; }
    ${P} .tb-au-link { color: var(--tb-accent, #FF5C6C); font-size: 11px; text-decoration: none; }
    ${P} .tb-au-link:hover { text-decoration: underline; }
    ${P} .tb-au-sev { flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 7px;
      border-radius: 999px; border: 1px solid currentColor; margin-top: 2px; }
    ${P} .tb-au-sev-critical { color: var(--tb-severity-critical, #EF4444); }
    ${P} .tb-au-sev-serious { color: var(--tb-severity-major, #F59E0B); }
    ${P} .tb-au-sev-moderate { color: var(--tb-severity-minor, #eab308); }
    ${P} .tb-au-sev-minor { color: var(--tb-severity-info, #3B82F6); }
  `;
  document.head.appendChild(s);
}
