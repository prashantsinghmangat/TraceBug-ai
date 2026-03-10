// ── In-browser dashboard panel ────────────────────────────────────────────
// Injects a floating button + slide-out panel into the page.
// Zero dependencies — all vanilla DOM + inline styles.
// Reads session data directly from localStorage.

import { getAllSessions, deleteSession, clearAllSessions, addAnnotation } from "./storage";
import { StoredSession, Annotation } from "./types";
import { captureScreenshot, getScreenshots } from "./screenshot";
import { buildReport } from "./report-builder";
import { generateGitHubIssue } from "./github-issue";
import { generateJiraTicket } from "./jira-issue";
import { generatePdfReport } from "./pdf-generator";
import { generateBugTitle } from "./title-generator";
import { captureEnvironment } from "./environment";

const PANEL_ID = "tracebug-dashboard-panel";
const BTN_ID = "tracebug-dashboard-btn";

// Recording state — controlled by TraceBugSDK via the global
let _isRecording = true;
let _onToggleRecording: (() => void) | null = null;

/** Called by the SDK to wire up recording toggle */
export function setRecordingState(isRecording: boolean, onToggle: () => void): void {
  _isRecording = isRecording;
  _onToggleRecording = onToggle;
}

export function updateRecordingState(isRecording: boolean): void {
  _isRecording = isRecording;
  // Update the recording indicator if panel is open
  const indicator = document.getElementById("bt-rec-indicator");
  if (indicator) {
    indicator.style.background = isRecording ? "#22c55e" : "#ef4444";
    indicator.title = isRecording ? "Recording" : "Paused";
  }
  const recBtn = document.getElementById("bt-rec-toggle");
  if (recBtn) {
    recBtn.textContent = isRecording ? "⏸ Pause" : "▶ Record";
    recBtn.style.color = isRecording ? "#fbbf24" : "#22c55e";
    recBtn.style.borderColor = isRecording ? "#fbbf2444" : "#22c55e44";
    recBtn.style.background = isRecording ? "#fbbf2422" : "#22c55e22";
  }
}

export function mountDashboard(): () => void {
  // Don't mount twice
  if (document.getElementById(BTN_ID)) return () => {};

  // ── Inject !important CSS to guarantee we stay on top ───────────────
  const style = document.createElement("style");
  style.id = "tracebug-styles";
  style.textContent = `
    #tracebug-root {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 0 !important;
      height: 0 !important;
      overflow: visible !important;
      z-index: 2147483647 !important;
      pointer-events: none !important;
      isolation: isolate !important;
    }
    #tracebug-root * {
      pointer-events: auto;
    }
    #${BTN_ID} {
      position: fixed !important;
      bottom: 20px !important;
      right: 20px !important;
      z-index: 2147483647 !important;
      width: 48px !important;
      height: 48px !important;
      border-radius: 50% !important;
      border: 2px solid #ef4444 !important;
      background: #1a1a2e !important;
      color: #ef4444 !important;
      font-size: 22px !important;
      cursor: pointer !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: right 0.3s ease, transform 0.2s !important;
      font-family: system-ui, sans-serif !important;
      padding: 0 !important;
      margin: 0 !important;
      outline: none !important;
    }
    #${BTN_ID}:hover {
      transform: scale(1.1) !important;
    }
    #${BTN_ID}.bt-panel-open {
      right: 484px !important;
    }
    #${PANEL_ID} {
      position: fixed !important;
      top: 0 !important;
      width: 470px !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: #0f0f1a !important;
      border-left: 1px solid #2a2a3e !important;
      color: #e0e0e0 !important;
      font-family: 'SF Mono', Consolas, monospace, system-ui, sans-serif !important;
      font-size: 13px !important;
      overflow: hidden !important;
      transition: right 0.3s ease !important;
      display: flex !important;
      flex-direction: column !important;
      box-shadow: -4px 0 30px rgba(0,0,0,0.6) !important;
    }
  `;
  document.head.appendChild(style);

  // ── Root container — appended to <html> to escape body stacking contexts
  const root = document.createElement("div");
  root.id = "tracebug-root";

  // ── Floating button ─────────────────────────────────────────────────
  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.innerHTML = "🐛";
  btn.title = "TraceBug AI Dashboard";

  // ── Panel container ─────────────────────────────────────────────────
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.style.right = "-480px";

  let isOpen = false;

  btn.onclick = () => {
    isOpen = !isOpen;
    panel.style.right = isOpen ? "0" : "-480px";
    btn.innerHTML = isOpen ? "✕" : "🐛";
    if (isOpen) {
      btn.classList.add("bt-panel-open");
      renderPanel(panel);
    } else {
      btn.classList.remove("bt-panel-open");
    }
  };

  root.appendChild(btn);
  root.appendChild(panel);
  document.documentElement.appendChild(root);

  return () => {
    root.remove();
    style.remove();
  };
}

// ── Render panel contents ─────────────────────────────────────────────────

function renderPanel(panel: HTMLElement): void {
  const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
  const errorSessions = sessions.filter((s) => s.errorMessage);
  const allSessions = sessions;

  panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #2a2a3e;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:16px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">🐛 TraceBug AI</div>
          <div id="bt-rec-indicator" style="width:8px;height:8px;border-radius:50%;background:${_isRecording ? "#22c55e" : "#ef4444"};animation:${_isRecording ? "bt-pulse 2s infinite" : "none"}" title="${_isRecording ? "Recording" : "Paused"}"></div>
        </div>
        <div style="font-size:11px;color:#666;margin-top:2px">${errorSessions.length} error${errorSessions.length !== 1 ? "s" : ""} · ${allSessions.length} session${allSessions.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button id="bt-rec-toggle" style="${smallBtnStyle(_isRecording ? "#fbbf24" : "#22c55e")}font-size:10px">${_isRecording ? "⏸ Pause" : "▶ Record"}</button>
        <button id="bt-refresh" style="${smallBtnStyle("#3b82f6")}font-size:10px">↻</button>
        <button id="bt-clear" style="${smallBtnStyle("#ef4444")}font-size:10px">Clear</button>
      </div>
    </div>
    <style>@keyframes bt-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }</style>
    <div id="bt-content" style="flex:1;overflow-y:auto;padding:12px 16px"></div>
  `;

  const content = panel.querySelector("#bt-content") as HTMLElement;
  panel.querySelector("#bt-refresh")!.addEventListener("click", () => renderPanel(panel));
  panel.querySelector("#bt-clear")!.addEventListener("click", () => {
    if (confirm("Delete all TraceBug sessions?")) {
      clearAllSessions();
      renderPanel(panel);
    }
  });
  panel.querySelector("#bt-rec-toggle")!.addEventListener("click", () => {
    if (_onToggleRecording) _onToggleRecording();
  });

  if (allSessions.length === 0) {
    content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#555">
        <div style="font-size:36px;margin-bottom:12px">🔍</div>
        <div style="font-family:system-ui,sans-serif">No sessions recorded yet.</div>
        <div style="font-size:11px;margin-top:8px;color:#444">Interact with the app to start capturing events.</div>
      </div>
    `;
    return;
  }

  // Render session list
  content.innerHTML = "";
  for (const session of allSessions) {
    const card = document.createElement("div");
    card.style.cssText =
      "border:1px solid #2a2a3e;border-radius:8px;padding:12px;margin-bottom:10px;cursor:pointer;transition:border-color 0.2s";
    card.onmouseenter = () => (card.style.borderColor = "#4a4a6e");
    card.onmouseleave = () => (card.style.borderColor = "#2a2a3e");

    const hasError = !!session.errorMessage;
    const dot = hasError
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px"></span>'
      : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px"></span>';

    const badge = session.reproSteps
      ? '<span style="font-size:10px;background:#14532d;color:#4ade80;padding:2px 6px;border-radius:4px;margin-left:6px">Repro Ready</span>'
      : "";

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center">
          ${dot}
          <span style="color:#888;font-size:11px">${session.sessionId.slice(0, 12)}…</span>
          ${badge}
        </div>
        <span style="color:#555;font-size:10px">${timeAgo(session.updatedAt)}</span>
      </div>
      ${hasError ? `<div style="color:#f87171;font-size:12px;margin-top:6px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(session.errorMessage!)}</div>` : ""}
      <div style="color:#555;font-size:11px;margin-top:4px">${session.events.length} events</div>
    `;

    card.onclick = () => renderSessionDetail(panel, session);
    content.appendChild(card);
  }
}

// ── Session detail view ───────────────────────────────────────────────────

function renderSessionDetail(panel: HTMLElement, session: StoredSession): void {
  const content = panel.querySelector("#bt-content") as HTMLElement;
  const s = session;

  // ── Analyze session for problems ──
  const problems: {severity:"critical"|"warning"|"info";icon:string;title:string;detail:string;color:string}[] = [];
  const apiEvents = s.events.filter(e => e.type === "api_request");
  const errorEvents = s.events.filter(e => ["error","unhandled_rejection"].includes(e.type));
  const consoleErrors = s.events.filter(e => e.type === "console_error");
  const failedApis = apiEvents.filter(e => e.data.request?.statusCode >= 400 || e.data.request?.statusCode === 0);
  const slowApis = apiEvents.filter(e => e.data.request?.durationMs > 3000);

  for (const ev of errorEvents) {
    const errType = getErrorType(ev.data.error?.message || "");
    problems.push({severity:"critical",icon:"💥",title:`${errType.type}: Runtime Exception`,detail:ev.data.error?.message || "Unknown error",color:"#ef4444"});
  }
  for (const ev of failedApis) {
    const r = ev.data.request;
    const code = r?.statusCode || 0;
    const severity = code >= 500 || code === 0 ? "critical" as const : "warning" as const;
    problems.push({severity,icon:code===0?"🔌":"🚫",title:`HTTP ${code} — ${getStatusLabel(code)}`,detail:`${r?.method} ${r?.url?.slice(0,80)}`,color:getStatusColor(code)});
  }
  for (const ev of slowApis) {
    const r = ev.data.request;
    if (!failedApis.includes(ev)) {
      problems.push({severity:"warning",icon:"🐌",title:`Slow Response — ${formatDuration(r?.durationMs)}`,detail:`${r?.method} ${r?.url?.slice(0,80)}`,color:"#f97316"});
    }
  }
  for (const ev of consoleErrors) {
    const msg = ev.data.error?.message || "";
    if (!msg.includes("Warning:") && !msg.includes("ReactDOM")) {
      problems.push({severity:"info",icon:"⚠️",title:"Console Error",detail:msg.slice(0,120),color:"#fb923c"});
    }
  }

  // ── Session duration ──
  const firstTs = s.events.length > 0 ? s.events[0].timestamp : s.createdAt;
  const lastTs = s.events.length > 0 ? s.events[s.events.length - 1].timestamp : s.createdAt;
  const sessionDur = lastTs - firstTs;

  // ── Performance stats ──
  const avgApiTime = apiEvents.length > 0 ? Math.round(apiEvents.reduce((sum,e) => sum + (e.data.request?.durationMs || 0), 0) / apiEvents.length) : 0;
  const maxApiTime = apiEvents.length > 0 ? Math.max(...apiEvents.map(e => e.data.request?.durationMs || 0)) : 0;
  const pagesVisited = new Set(s.events.map(e => e.page)).size;

  let html = "";

  // ── Header with back button ──
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <button id="bt-back" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;padding:0;font-family:inherit">← Back to sessions</button>
    <div style="display:flex;gap:6px">
      <button id="bt-download-json" style="${smallBtnStyle("#22d3ee")}font-size:10px" title="Download as JSON">⬇ JSON</button>
      <button id="bt-download-txt" style="${smallBtnStyle("#a78bfa")}font-size:10px" title="Download as text report">⬇ Report</button>
      <button id="bt-download-html" style="${smallBtnStyle("#f472b6")}font-size:10px" title="Download visual HTML report">⬇ HTML</button>
    </div>
  </div>`;

  // ── QA Toolbar ──
  html += `<div style="background:#0c1222;border:1px solid #1e3a5f;border-radius:10px;padding:10px;margin-bottom:14px">
    <div style="font-size:10px;color:#60a5fa;font-weight:700;margin-bottom:8px;font-family:system-ui,sans-serif">QA TOOLS</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="bt-screenshot" style="${smallBtnStyle("#22d3ee")}font-size:10px">📸 Screenshot</button>
      <button id="bt-add-note" style="${smallBtnStyle("#a78bfa")}font-size:10px">📝 Add Note</button>
      <button id="bt-github-issue" style="${smallBtnStyle("#e0e0e0")}font-size:10px">🐙 GitHub Issue</button>
      <button id="bt-jira-ticket" style="${smallBtnStyle("#2684FF")}font-size:10px">🎫 Jira Ticket</button>
      <button id="bt-download-pdf" style="${smallBtnStyle("#f472b6")}font-size:10px">📄 PDF Report</button>
    </div>
  </div>`;

  // ── Session overview card ──
  html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">Session Overview</div>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${problems.some(p=>p.severity==="critical") ? "#7f1d1d" : problems.length > 0 ? "#78350f" : "#14532d"};color:${problems.some(p=>p.severity==="critical") ? "#fca5a5" : problems.length > 0 ? "#fbbf24" : "#4ade80"};font-family:system-ui,sans-serif">${problems.some(p=>p.severity==="critical") ? "Has Errors" : problems.length > 0 ? "Has Warnings" : "Healthy"}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div style="background:#0f0f1a;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;font-family:system-ui,sans-serif">Duration</div>
        <div style="font-size:14px;color:#e0e0e0;margin-top:2px">${formatDuration(sessionDur)}</div>
      </div>
      <div style="background:#0f0f1a;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;font-family:system-ui,sans-serif">Events</div>
        <div style="font-size:14px;color:#e0e0e0;margin-top:2px">${s.events.length}</div>
      </div>
      <div style="background:#0f0f1a;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;font-family:system-ui,sans-serif">Pages Visited</div>
        <div style="font-size:14px;color:#e0e0e0;margin-top:2px">${pagesVisited}</div>
      </div>
      <div style="background:#0f0f1a;border-radius:6px;padding:8px 10px">
        <div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:0.5px;font-family:system-ui,sans-serif">API Calls</div>
        <div style="font-size:14px;color:#e0e0e0;margin-top:2px">${apiEvents.length} <span style="font-size:10px;color:${failedApis.length > 0 ? "#ef4444" : "#22c55e"}">(${failedApis.length} failed)</span></div>
      </div>
    </div>
    <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
      <span style="font-size:10px;color:#555">ID: ${s.sessionId.slice(0,8)}…</span>
      <span style="font-size:10px;color:#444">·</span>
      <span style="font-size:10px;color:#555">${new Date(s.createdAt).toLocaleString()}</span>
    </div>
  </div>`;

  // ── Problems Detected section ──
  if (problems.length > 0) {
    const criticalCount = problems.filter(p => p.severity === "critical").length;
    const warningCount = problems.filter(p => p.severity === "warning").length;
    const infoCount = problems.filter(p => p.severity === "info").length;

    html += `<div style="border:1px solid ${criticalCount > 0 ? "#7f1d1d" : "#78350f"};background:${criticalCount > 0 ? "#1a0505" : "#1a1005"};border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:${criticalCount > 0 ? "#fca5a5" : "#fbbf24"};font-family:system-ui,sans-serif">🔍 Problems Detected (${problems.length})</div>
        <div style="display:flex;gap:6px">
          ${criticalCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#7f1d1d;color:#fca5a5">${criticalCount} Critical</span>` : ""}
          ${warningCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#78350f;color:#fbbf24">${warningCount} Warning</span>` : ""}
          ${infoCount > 0 ? `<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#1e1533;color:#c084fc">${infoCount} Info</span>` : ""}
        </div>
      </div>`;

    for (const p of problems) {
      const sevBorder = p.severity === "critical" ? "#7f1d1d" : p.severity === "warning" ? "#78350f" : "#2a2a3e";
      const sevBg = p.severity === "critical" ? "#0f0205" : p.severity === "warning" ? "#0f0a02" : "#12121f";
      html += `<div style="border:1px solid ${sevBorder};background:${sevBg};border-radius:6px;padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:13px">${p.icon}</span>
          <span style="font-size:11px;font-weight:600;color:${p.color};font-family:system-ui,sans-serif">${escapeHtml(p.title)}</span>
        </div>
        <div style="color:#888;font-size:11px;line-height:1.4;padding-left:22px;word-break:break-word">${escapeHtml(p.detail)}</div>
      </div>`;
    }
    html += `</div>`;
  }

  // ── Error details (expanded) ──
  if (s.errorMessage) {
    const errType = getErrorType(s.errorMessage);
    html += `<div style="border:1px solid #7f1d1d;background:#1a0505;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:13px;font-weight:700;color:#fca5a5;font-family:system-ui,sans-serif">Error Details</span>
        <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}44">${errType.type}</span>
      </div>
      <div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
        <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Message</div>
        <div style="color:#fca5a5;font-size:12px;line-height:1.5;word-break:break-word">${escapeHtml(s.errorMessage)}</div>
      </div>`;
    if (s.errorStack) {
      const locationMatch = s.errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
      if (locationMatch) {
        html += `<div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
          <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Location</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:#60a5fa">${escapeHtml(locationMatch[1])}</span>
            <span style="font-size:10px;color:#555">at</span>
            <span style="font-size:10px;color:#888;word-break:break-all">${escapeHtml(locationMatch[2])}</span>
          </div>
        </div>`;
      }
      html += `<details style="margin-top:4px">
        <summary style="font-size:10px;color:#555;cursor:pointer;user-select:none;font-family:system-ui,sans-serif">View Full Stack Trace</summary>
        <pre style="color:#dc262690;font-size:10px;margin-top:6px;white-space:pre-wrap;line-height:1.4;max-height:150px;overflow:auto;background:#0a0a0a;padding:8px;border-radius:4px">${escapeHtml(s.errorStack)}</pre>
      </details>`;
    }
    html += `</div>`;
  }

  // ── Performance insights (if API calls exist) ──
  if (apiEvents.length > 0) {
    html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;font-family:system-ui,sans-serif">⚡ Performance</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px">
        <div style="background:#0f0f1a;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:9px;color:#555;text-transform:uppercase;font-family:system-ui,sans-serif">Avg</div>
          <div style="font-size:13px;color:${getSpeedLabel(avgApiTime).color};margin-top:2px">${formatDuration(avgApiTime)}</div>
        </div>
        <div style="background:#0f0f1a;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:9px;color:#555;text-transform:uppercase;font-family:system-ui,sans-serif">Slowest</div>
          <div style="font-size:13px;color:${getSpeedLabel(maxApiTime).color};margin-top:2px">${formatDuration(maxApiTime)}</div>
        </div>
        <div style="background:#0f0f1a;border-radius:6px;padding:8px;text-align:center">
          <div style="font-size:9px;color:#555;text-transform:uppercase;font-family:system-ui,sans-serif">Success</div>
          <div style="font-size:13px;color:${failedApis.length === 0 ? "#22c55e" : "#fbbf24"};margin-top:2px">${apiEvents.length > 0 ? Math.round(((apiEvents.length - failedApis.length) / apiEvents.length) * 100) : 0}%</div>
        </div>
      </div>`;

    // API calls breakdown
    for (const ev of apiEvents) {
      const r = ev.data.request;
      const code = r?.statusCode || 0;
      const dur = r?.durationMs || 0;
      const speed = getSpeedLabel(dur);
      const statusClr = getStatusColor(code);
      const isFail = code >= 400 || code === 0;
      const urlPath = (r?.url || "").replace(/https?:\/\/[^/]+/, "").slice(0, 50);

      html += `<div style="background:${isFail ? "#0f0205" : "#0f0f1a"};border:1px solid ${isFail ? "#7f1d1d44" : "#1e1e32"};border-radius:6px;padding:8px 10px;margin-bottom:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:600;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${r?.method || "GET"}</span>
            <span style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${escapeHtml(urlPath)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:700;color:${statusClr}">${code}</span>
            <span style="font-size:9px;color:${statusClr}66">${getStatusLabel(code)}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:3px;background:#1e1e32;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100, (dur / Math.max(maxApiTime, 1)) * 100)}%;background:${speed.color};border-radius:2px"></div>
          </div>
          <span style="font-size:10px;color:${speed.color};white-space:nowrap">${formatDuration(dur)}</span>
          ${dur > 3000 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color}">${speed.label}</span>` : ""}
        </div>
      </div>`;
    }
    html += `</div>`;
  }

  // ── Reproduction steps ──
  if (s.reproSteps) {
    html += `<div style="border:1px solid #14532d;background:#031a09;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:#4ade80;font-family:system-ui,sans-serif">📋 Reproduction Steps</div>
        <button id="bt-copy" style="${smallBtnStyle("#3b82f6")}font-size:10px">Copy</button>
      </div>
      <pre style="color:#bbf7d0;font-size:12px;white-space:pre-wrap;line-height:1.7;margin:0">${escapeHtml(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:10px;padding-top:8px"><div style="font-size:10px;font-weight:600;color:#4ade80;margin-bottom:4px;font-family:system-ui,sans-serif">Summary</div><pre style="color:#86efac;font-size:11px;white-space:pre-wrap;line-height:1.4;margin:0">${escapeHtml(s.errorSummary)}</pre></div>` : ""}
    </div>`;
  }

  // ── Tester Annotations ──
  const annotations = s.annotations || [];
  if (annotations.length > 0) {
    html += `<div style="border:1px solid #1e3a5f;background:#0c1222;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:10px;font-family:system-ui,sans-serif">📝 Tester Notes (${annotations.length})</div>`;
    for (const note of annotations) {
      const sevColor = note.severity === "critical" ? "#ef4444" : note.severity === "major" ? "#f97316" : note.severity === "minor" ? "#3b82f6" : "#888";
      html += `<div style="border:1px solid #2a2a3e;background:#12121f;border-radius:6px;padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}44;font-weight:600;text-transform:uppercase">${note.severity}</span>
          <span style="font-size:10px;color:#555">${new Date(note.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="color:#e0e0e0;font-size:12px;line-height:1.4">${escapeHtml(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px;font-size:11px"><span style="color:#22c55e;font-weight:600">Expected:</span> <span style="color:#aaa">${escapeHtml(note.expected)}</span></div>` : ""}
        ${note.actual ? `<div style="margin-top:2px;font-size:11px"><span style="color:#ef4444;font-weight:600">Actual:</span> <span style="color:#aaa">${escapeHtml(note.actual)}</span></div>` : ""}
      </div>`;
    }
    html += `</div>`;
  }

  // ── Screenshots ──
  const screenshots = getScreenshots();
  if (screenshots.length > 0) {
    html += `<div style="border:1px solid #2a2a3e;background:#12121f;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#22d3ee;margin-bottom:10px;font-family:system-ui,sans-serif">📸 Screenshots (${screenshots.length})</div>`;
    for (const ss of screenshots) {
      html += `<div style="margin-bottom:10px">
        <div style="font-size:10px;color:#888;margin-bottom:4px">${escapeHtml(ss.filename)} — ${escapeHtml(ss.page)}</div>
        <img src="${ss.dataUrl}" style="max-width:100%;border:1px solid #2a2a3e;border-radius:6px" />
      </div>`;
    }
    html += `</div>`;
  }

  // ── Environment Info ──
  const envInfo = s.environment;
  if (envInfo) {
    html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;font-family:system-ui,sans-serif">🖥 Environment</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Browser</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml(envInfo.browser)} ${escapeHtml(envInfo.browserVersion)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">OS</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml(envInfo.os)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Viewport</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml(envInfo.viewport)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Device</span><div style="font-size:12px;color:#e0e0e0">${envInfo.deviceType}</div></div>
      </div>
    </div>`;
  }

  // ── Event Timeline (detailed) ──
  html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">Event Timeline (${s.events.length})</div>
    <span style="font-size:10px;color:#555">${new Date(firstTs).toLocaleTimeString()} — ${new Date(lastTs).toLocaleTimeString()}</span>
  </div>
  <div style="position:relative;padding-left:24px">
    <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;

  for (let i = 0; i < s.events.length; i++) {
    const ev = s.events[i];
    const c = eventConfig[ev.type] || {label:ev.type,icon:"📌",color:"#666",bg:"#1a1a2e"};
    const isErr = ["error","unhandled_rejection","console_error"].includes(ev.type);
    const isApiErr = ev.type === "api_request" && (ev.data.request?.statusCode >= 400 || ev.data.request?.statusCode === 0);
    const isSlowApi = ev.type === "api_request" && ev.data.request?.durationMs > 3000;
    const hasProblem = isErr || isApiErr;
    const dotColor = hasProblem ? "#ef4444" : isSlowApi ? "#f97316" : c.color;
    const timeSincePrev = i > 0 ? ev.timestamp - s.events[i-1].timestamp : 0;

    // Time gap indicator
    if (timeSincePrev > 2000 && i > 0) {
      html += `<div style="position:relative;margin-bottom:4px;margin-top:4px">
        <div style="position:absolute;left:-21px;top:4px;width:6px;height:6px;border-radius:50%;background:#2a2a3e;border:1px solid #333"></div>
        <div style="font-size:9px;color:#444;font-style:italic;padding:2px 0">⏱ ${formatDuration(timeSincePrev)} later</div>
      </div>`;
    }

    html += `<div style="position:relative;margin-bottom:6px">
      <div style="position:absolute;left:-21px;top:6px;width:10px;height:10px;border-radius:50%;background:${dotColor};border:2px solid ${dotColor}44;box-shadow:0 0 ${hasProblem ? "6" : "0"}px ${dotColor}44"></div>
      <div style="border:1px solid ${hasProblem ? "#7f1d1d" : isSlowApi ? "#78350f44" : "#1e1e32"};background:${hasProblem ? "#1a0505" : isSlowApi ? "#1a0f05" : "#12121f"};border-radius:8px;padding:10px 12px;transition:border-color 0.2s">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span style="font-size:12px">${c.icon}</span>
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${c.bg};color:${c.color};font-weight:600">${c.label}</span>
          <span style="font-size:10px;color:#555">${new Date(ev.timestamp).toLocaleTimeString()}</span>
          <span style="font-size:9px;color:#333;margin-left:auto">${ev.page}</span>
        </div>`;

    // ── Rich event-specific content ──
    if (ev.type === "api_request") {
      const r = ev.data.request;
      const code = r?.statusCode || 0;
      const dur = r?.durationMs || 0;
      const speed = getSpeedLabel(dur);
      const urlPath = (r?.url || "").replace(/https?:\/\/[^/]+/, "");
      html += `<div style="margin-top:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;font-weight:700;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${r?.method || "GET"}</span>
            <span style="font-size:11px;color:#aaa;word-break:break-all">${escapeHtml(urlPath?.slice(0, 80) || "")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:700;color:${getStatusColor(code)}">${code}</span>
              <span style="font-size:10px;color:${getStatusColor(code)}88">${getStatusLabel(code)}</span>
            </div>
            <span style="color:#333">·</span>
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:10px;color:${speed.color}">${formatDuration(dur)}</span>
              ${dur > 3000 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color};border:1px solid ${speed.color}33">${speed.label}</span>` : ""}
            </div>
          </div>
          <div style="height:3px;background:#1e1e32;border-radius:2px;overflow:hidden;margin-top:6px">
            <div style="height:100%;width:${Math.min(100, (dur / Math.max(maxApiTime, 1)) * 100)}%;background:${speed.color};border-radius:2px;transition:width 0.3s"></div>
          </div>
        </div>`;
    } else if (ev.type === "click") {
      const el = ev.data.element;
      const target = el?.ariaLabel || el?.text?.trim() || el?.id || el?.tag || "element";
      html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Clicked "<span style="color:#60a5fa">${escapeHtml(target.slice(0,60))}</span>"</div>`;
      const details: string[] = [];
      if (el?.tag) details.push(`&lt;${el.tag}&gt;`);
      if (el?.id) details.push(`#${el.id}`);
      if (el?.className) details.push(`.${escapeHtml(el.className.split(" ")[0])}`);
      if (el?.href) details.push(`→ ${escapeHtml(el.href.slice(0,60))}`);
      if (el?.role) details.push(`role="${el.role}"`);
      if (el?.testId) details.push(`data-testid="${el.testId}"`);
      if (details.length > 0) {
        html += `<div style="font-size:9px;color:#444;margin-top:3px">${details.join(" ")}</div>`;
      }
    } else if (ev.type === "input") {
      const inp = ev.data.element;
      const fieldName = inp?.name || inp?.id || "field";
      const inputType = inp?.type || "text";
      if (inputType === "checkbox" || inputType === "radio") {
        html += `<div style="color:#aaa;font-size:11px;line-height:1.4">${inp?.checked ? "Checked" : "Unchecked"} "<span style="color:#c084fc">${escapeHtml(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>`;
      } else {
        const val = inp?.value;
        if (val && val !== "[REDACTED]") {
          html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>`;
          html += `<div style="font-size:10px;color:#a78bfa;margin-top:3px;background:#1e153344;padding:3px 8px;border-radius:4px;border:1px solid #1e1533;word-break:break-word">"${escapeHtml(val.slice(0,150))}"</div>`;
        } else {
          html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>
            <div style="font-size:9px;color:#444;margin-top:2px">${inp?.valueLength || 0} characters ${val === "[REDACTED]" ? '<span style="color:#f87171">🔒 redacted</span>' : ""}</div>`;
        }
      }
      if (inp?.placeholder) {
        html += `<div style="font-size:9px;color:#333;margin-top:2px">placeholder: "${escapeHtml(inp.placeholder)}"</div>`;
      }
    } else if (ev.type === "select_change") {
      const sel = ev.data.element;
      const fieldName = sel?.name || sel?.id || "dropdown";
      html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Changed "<span style="color:#34d399">${escapeHtml(fieldName)}</span>" dropdown</div>`;
      html += `<div style="font-size:11px;color:#34d399;margin-top:3px;background:#05201544;padding:4px 8px;border-radius:4px;border:1px solid #14532d">Selected: "<strong>${escapeHtml(sel?.selectedText || sel?.value || "")}</strong>"</div>`;
      if (sel?.allOptions && sel.allOptions.length > 0) {
        html += `<div style="font-size:9px;color:#444;margin-top:3px">Options: ${sel.allOptions.map((o: string) => escapeHtml(o)).join(", ")}</div>`;
      }
    } else if (ev.type === "form_submit") {
      const f = ev.data.form;
      html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Submitted form ${f?.id ? `"<span style="color:#fb923c">${escapeHtml(f.id)}</span>"` : ""}</div>`;
      if (f?.fields && Object.keys(f.fields).length > 0) {
        html += `<div style="margin-top:4px;background:#1a150544;padding:6px 8px;border-radius:4px;border:1px solid #2a2a3e">`;
        for (const [key, val] of Object.entries(f.fields)) {
          html += `<div style="font-size:10px;margin-bottom:2px"><span style="color:#888">${escapeHtml(key)}:</span> <span style="color:#fbbf24">${escapeHtml(String(val).slice(0,80))}</span></div>`;
        }
        html += `</div>`;
      }
      if (f?.method) {
        html += `<div style="font-size:9px;color:#444;margin-top:2px">${f.method.toUpperCase()} ${f.action ? `→ ${escapeHtml(f.action.slice(0,60))}` : ""}</div>`;
      }
    } else if (ev.type === "route_change") {
      html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:2px">
          <span style="color:#888;background:#0f0f1a;padding:2px 6px;border-radius:3px">${escapeHtml(ev.data.from || "/")}</span>
          <span style="color:#22d3ee">→</span>
          <span style="color:#22d3ee;background:#0c2e3344;padding:2px 6px;border-radius:3px;font-weight:600">${escapeHtml(ev.data.to || "/")}</span>
        </div>`;
    } else if (ev.type === "error" || ev.type === "unhandled_rejection") {
      const errType = getErrorType(ev.data.error?.message || "");
      html += `<div style="margin-top:2px">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
            <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}33">${errType.type}</span>
          </div>
          <div style="color:#fca5a5;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml(ev.data.error?.message || "Unknown error")}</div>
          ${ev.data.error?.source ? `<div style="font-size:9px;color:#555;margin-top:3px">at ${escapeHtml(ev.data.error.source)}${ev.data.error.line ? `:${ev.data.error.line}` : ""}${ev.data.error.column ? `:${ev.data.error.column}` : ""}</div>` : ""}
        </div>`;
    } else if (ev.type === "console_error") {
      html += `<div style="color:#fb923c;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml((ev.data.error?.message || "").slice(0,200))}</div>`;
    } else {
      html += `<div style="color:#aaa;font-size:11px;line-height:1.3">${escapeHtml(describeEvent(ev))}</div>`;
    }

    html += `</div></div>`;
  }

  html += `</div>`;

  // ── Footer actions ──
  html += `<div style="margin-top:16px;padding:12px 0;border-top:1px solid #1e1e32;display:flex;gap:8px">
    <button id="bt-copy-report" style="${smallBtnStyle("#3b82f6")}font-size:11px;flex:1">📋 Copy Full Report</button>
    <button id="bt-delete" style="${smallBtnStyle("#ef4444")}font-size:11px">🗑 Delete</button>
  </div>`;

  content.innerHTML = html;

  // ── Wire up buttons ──
  content.querySelector("#bt-back")!.addEventListener("click", () => renderPanel(panel));

  const copyBtn = content.querySelector("#bt-copy");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const text = `Reproduction Steps:\n${s.reproSteps}\n\nError: ${s.errorMessage}\n\n${s.errorSummary || ""}`;
      navigator.clipboard.writeText(text).then(() => {
        (copyBtn as HTMLElement).textContent = "✓ Copied!";
        setTimeout(() => ((copyBtn as HTMLElement).textContent = "Copy"), 2000);
      });
    });
  }

  // ── Download JSON ──
  content.querySelector("#bt-download-json")!.addEventListener("click", () => {
    downloadFile(
      `tracebug-${s.sessionId.slice(0,8)}.json`,
      JSON.stringify(s, null, 2),
      "application/json"
    );
  });

  // ── Download Text Report ──
  content.querySelector("#bt-download-txt")!.addEventListener("click", () => {
    const report = buildTextReport(s, problems, apiEvents, sessionDur);
    downloadFile(
      `tracebug-report-${s.sessionId.slice(0,8)}.txt`,
      report,
      "text/plain"
    );
  });

  // ── Download HTML Report ──
  content.querySelector("#bt-download-html")!.addEventListener("click", () => {
    const htmlReport = buildHtmlReport(s, problems, apiEvents, sessionDur);
    downloadFile(
      `tracebug-report-${s.sessionId.slice(0,8)}.html`,
      htmlReport,
      "text/html"
    );
  });

  // ── Copy Full Report ──
  const copyReportBtn = content.querySelector("#bt-copy-report");
  if (copyReportBtn) {
    copyReportBtn.addEventListener("click", () => {
      const report = buildTextReport(s, problems, apiEvents, sessionDur);
      navigator.clipboard.writeText(report).then(() => {
        (copyReportBtn as HTMLElement).textContent = "✓ Copied!";
        setTimeout(() => ((copyReportBtn as HTMLElement).textContent = "📋 Copy Full Report"), 2000);
      });
    });
  }

  content.querySelector("#bt-delete")!.addEventListener("click", () => {
    if (confirm("Delete this session?")) {
      deleteSession(session.sessionId);
      renderPanel(panel);
    }
  });

  // ── QA Toolbar handlers ──

  // Screenshot
  const ssBtn = content.querySelector("#bt-screenshot");
  if (ssBtn) {
    ssBtn.addEventListener("click", async () => {
      (ssBtn as HTMLElement).textContent = "📸 Capturing...";
      try {
        const lastEvent = s.events[s.events.length - 1] || null;
        const ss = await captureScreenshot(lastEvent);
        (ssBtn as HTMLElement).textContent = `✓ ${ss.filename}`;
        setTimeout(() => { (ssBtn as HTMLElement).textContent = "📸 Screenshot"; }, 3000);
      } catch {
        (ssBtn as HTMLElement).textContent = "✗ Failed";
        setTimeout(() => { (ssBtn as HTMLElement).textContent = "📸 Screenshot"; }, 2000);
      }
    });
  }

  // Add Note
  const noteBtn = content.querySelector("#bt-add-note");
  if (noteBtn) {
    noteBtn.addEventListener("click", () => {
      showNoteDialog(s.sessionId, panel, session);
    });
  }

  // GitHub Issue
  const ghBtn = content.querySelector("#bt-github-issue");
  if (ghBtn) {
    ghBtn.addEventListener("click", () => {
      const report = buildReport(session);
      const md = generateGitHubIssue(report);
      navigator.clipboard.writeText(md).then(() => {
        (ghBtn as HTMLElement).textContent = "✓ Copied!";
        setTimeout(() => { (ghBtn as HTMLElement).textContent = "🐙 GitHub Issue"; }, 2000);
      });
    });
  }

  // Jira Ticket
  const jiraBtn = content.querySelector("#bt-jira-ticket");
  if (jiraBtn) {
    jiraBtn.addEventListener("click", () => {
      const report = buildReport(session);
      const ticket = generateJiraTicket(report);
      const text = `Summary: ${ticket.summary}\nPriority: ${ticket.priority}\nLabels: ${ticket.labels.join(", ")}\n\n${ticket.description}`;
      navigator.clipboard.writeText(text).then(() => {
        (jiraBtn as HTMLElement).textContent = "✓ Copied!";
        setTimeout(() => { (jiraBtn as HTMLElement).textContent = "🎫 Jira Ticket"; }, 2000);
      });
    });
  }

  // PDF Report
  const pdfBtn = content.querySelector("#bt-download-pdf");
  if (pdfBtn) {
    pdfBtn.addEventListener("click", () => {
      const report = buildReport(session);
      generatePdfReport(report);
    });
  }
}

// ── Note dialog ───────────────────────────────────────────────────────────

function showNoteDialog(sessionId: string, panel: HTMLElement, session: StoredSession): void {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10;display:flex;align-items:center;justify-content:center;padding:20px";

  overlay.innerHTML = `
    <div style="background:#12121f;border:1px solid #2a2a3e;border-radius:12px;padding:20px;width:100%;max-width:420px">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px;font-family:system-ui,sans-serif">📝 Add Tester Note</div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:#888;display:block;margin-bottom:4px;font-family:system-ui,sans-serif">What did you observe?</label>
        <textarea id="bt-note-text" style="width:100%;height:60px;background:#0f0f1a;border:1px solid #2a2a3e;border-radius:6px;color:#e0e0e0;padding:8px;font-size:12px;font-family:inherit;resize:vertical" placeholder="Describe the issue..."></textarea>
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:#888;display:block;margin-bottom:4px;font-family:system-ui,sans-serif">Expected behavior</label>
        <input id="bt-note-expected" style="width:100%;background:#0f0f1a;border:1px solid #2a2a3e;border-radius:6px;color:#e0e0e0;padding:8px;font-size:12px;font-family:inherit" placeholder="What should happen?" />
      </div>
      <div style="margin-bottom:10px">
        <label style="font-size:10px;color:#888;display:block;margin-bottom:4px;font-family:system-ui,sans-serif">Actual behavior</label>
        <input id="bt-note-actual" style="width:100%;background:#0f0f1a;border:1px solid #2a2a3e;border-radius:6px;color:#e0e0e0;padding:8px;font-size:12px;font-family:inherit" placeholder="What actually happened?" />
      </div>
      <div style="margin-bottom:14px">
        <label style="font-size:10px;color:#888;display:block;margin-bottom:4px;font-family:system-ui,sans-serif">Severity</label>
        <select id="bt-note-severity" style="width:100%;background:#0f0f1a;border:1px solid #2a2a3e;border-radius:6px;color:#e0e0e0;padding:8px;font-size:12px;font-family:inherit">
          <option value="critical">Critical — App broken/unusable</option>
          <option value="major">Major — Feature not working</option>
          <option value="minor" selected>Minor — Cosmetic/UX issue</option>
          <option value="info">Info — Observation/Note</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button id="bt-note-cancel" style="${smallBtnStyle("#666")}font-size:11px">Cancel</button>
        <button id="bt-note-save" style="background:#3b82f6;color:white;border:none;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:12px;font-family:inherit">Save Note</button>
      </div>
    </div>
  `;

  const panelEl = panel.querySelector("#bt-content") || panel;
  panelEl.appendChild(overlay);

  overlay.querySelector("#bt-note-cancel")!.addEventListener("click", () => overlay.remove());

  overlay.querySelector("#bt-note-save")!.addEventListener("click", () => {
    const text = (overlay.querySelector("#bt-note-text") as HTMLTextAreaElement).value.trim();
    if (!text) return;

    const annotation: Annotation = {
      id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      text,
      expected: (overlay.querySelector("#bt-note-expected") as HTMLInputElement).value.trim() || undefined,
      actual: (overlay.querySelector("#bt-note-actual") as HTMLInputElement).value.trim() || undefined,
      severity: (overlay.querySelector("#bt-note-severity") as HTMLSelectElement).value as Annotation["severity"],
    };

    addAnnotation(sessionId, annotation);
    overlay.remove();

    // Refresh the session view
    const updatedSessions = getAllSessions();
    const updatedSession = updatedSessions.find(s => s.sessionId === sessionId);
    if (updatedSession) {
      renderSessionDetail(panel, updatedSession);
    }
  });
}

// ── Report generators ────────────────────────────────────────────────────

function buildTextReport(
  s: StoredSession,
  problems: {severity:string;title:string;detail:string}[],
  apiEvents: any[],
  sessionDur: number
): string {
  let report = `TraceBug Session Report\n${"=".repeat(50)}\n\n`;
  report += `Session ID: ${s.sessionId}\n`;
  report += `Date: ${new Date(s.createdAt).toLocaleString()}\n`;
  report += `Duration: ${formatDuration(sessionDur)}\n`;
  report += `Events: ${s.events.length}\n\n`;

  if (problems.length > 0) {
    report += `Problems Detected (${problems.length})\n${"-".repeat(40)}\n`;
    for (const p of problems) {
      report += `[${p.severity.toUpperCase()}] ${p.title}\n  ${p.detail}\n\n`;
    }
  }

  if (s.errorMessage) {
    report += `Error Details\n${"-".repeat(40)}\n`;
    report += `Message: ${s.errorMessage}\n`;
    if (s.errorStack) report += `Stack:\n${s.errorStack}\n`;
    report += `\n`;
  }

  if (s.reproSteps) {
    report += `Reproduction Steps\n${"-".repeat(40)}\n${s.reproSteps}\n\n`;
  }

  if (s.errorSummary) {
    report += `Summary\n${"-".repeat(40)}\n${s.errorSummary}\n\n`;
  }

  report += `Event Timeline\n${"-".repeat(40)}\n`;
  for (const ev of s.events) {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    report += `[${time}] ${ev.type.toUpperCase()} on ${ev.page}\n`;
    report += `  ${describeEventForReport(ev)}\n`;
  }

  if (apiEvents.length > 0) {
    report += `\nAPI Calls\n${"-".repeat(40)}\n`;
    for (const ev of apiEvents) {
      const r = ev.data.request;
      report += `${r?.method} ${r?.url} → ${r?.statusCode} (${r?.durationMs}ms)\n`;
    }
  }

  return report;
}

function buildHtmlReport(
  s: StoredSession,
  problems: {severity:string;icon:string;title:string;detail:string;color:string}[],
  apiEvents: any[],
  sessionDur: number
): string {
  const hasError = !!s.errorMessage;
  let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TraceBug Report — ${s.sessionId.slice(0,8)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'SF Mono',Consolas,monospace,system-ui,sans-serif;background:#0f0f1a;color:#e0e0e0;padding:32px;max-width:800px;margin:0 auto}
  h1{font-size:20px;color:#fff;margin-bottom:4px;font-family:system-ui,sans-serif}
  h2{font-size:15px;color:#fff;margin:24px 0 12px;font-family:system-ui,sans-serif}
  .meta{font-size:12px;color:#666;margin-bottom:24px}
  .card{background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:16px;margin-bottom:16px}
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-top:12px}
  .stat{background:#0f0f1a;border-radius:6px;padding:10px;text-align:center}
  .stat-label{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.5px;font-family:system-ui,sans-serif}
  .stat-value{font-size:16px;margin-top:4px}
  .problem{border:1px solid #7f1d1d;background:#1a0505;border-radius:6px;padding:10px;margin-bottom:8px}
  .problem.warning{border-color:#78350f;background:#1a1005}
  .problem.info{border-color:#2a2a3e;background:#12121f}
  .timeline-event{border:1px solid #1e1e32;background:#12121f;border-radius:8px;padding:12px;margin-bottom:8px;position:relative;margin-left:20px}
  .timeline-event.error{border-color:#7f1d1d;background:#1a0505}
  .timeline-dot{position:absolute;left:-26px;top:14px;width:10px;height:10px;border-radius:50%;border:2px solid}
  .badge{font-size:10px;padding:2px 8px;border-radius:4px;font-weight:600}
  .tag{font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600}
  pre{white-space:pre-wrap;font-size:12px;line-height:1.5}
  .value-box{background:#1e153344;padding:4px 8px;border-radius:4px;border:1px solid #1e1533;margin-top:4px;font-size:11px;color:#a78bfa;word-break:break-word}
  .select-box{background:#05201544;padding:4px 8px;border-radius:4px;border:1px solid #14532d;margin-top:4px;font-size:11px;color:#34d399}
</style></head><body>
<h1>🐛 TraceBug Session Report</h1>
<div class="meta">Session: ${s.sessionId} · ${new Date(s.createdAt).toLocaleString()} · Duration: ${formatDuration(sessionDur)}</div>`;

  // Status badge
  html += `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:14px;font-weight:700;font-family:system-ui,sans-serif">Session Overview</span>
      <span class="badge" style="background:${hasError ? "#7f1d1d" : "#14532d"};color:${hasError ? "#fca5a5" : "#4ade80"}">${hasError ? "Has Errors" : "Healthy"}</span>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(sessionDur)}</div></div>
      <div class="stat"><div class="stat-label">Events</div><div class="stat-value">${s.events.length}</div></div>
      <div class="stat"><div class="stat-label">Pages</div><div class="stat-value">${new Set(s.events.map(e => e.page)).size}</div></div>
      <div class="stat"><div class="stat-label">API Calls</div><div class="stat-value">${apiEvents.length}</div></div>
    </div>
  </div>`;

  // Problems
  if (problems.length > 0) {
    html += `<h2>🔍 Problems Detected (${problems.length})</h2>`;
    for (const p of problems) {
      const cls = p.severity === "critical" ? "" : p.severity === "warning" ? " warning" : " info";
      html += `<div class="problem${cls}">
        <div style="margin-bottom:4px"><span style="font-size:14px">${p.icon}</span> <strong style="color:${p.color}">${escapeHtml(p.title)}</strong></div>
        <div style="color:#888;font-size:12px;padding-left:24px">${escapeHtml(p.detail)}</div>
      </div>`;
    }
  }

  // Error
  if (s.errorMessage) {
    html += `<h2>💥 Error Details</h2><div class="card" style="border-color:#7f1d1d;background:#1a0505">
      <div style="color:#fca5a5;font-size:13px;line-height:1.5;margin-bottom:8px">${escapeHtml(s.errorMessage)}</div>
      ${s.errorStack ? `<pre style="color:#dc262690;font-size:11px;background:#0a0a0a;padding:10px;border-radius:6px;max-height:200px;overflow:auto">${escapeHtml(s.errorStack)}</pre>` : ""}
    </div>`;
  }

  // Repro steps
  if (s.reproSteps) {
    html += `<h2>📋 Reproduction Steps</h2><div class="card" style="border-color:#14532d;background:#031a09">
      <pre style="color:#bbf7d0;line-height:1.8">${escapeHtml(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:12px;padding-top:10px"><pre style="color:#86efac;font-size:11px">${escapeHtml(s.errorSummary)}</pre></div>` : ""}
    </div>`;
  }

  // Event timeline
  html += `<h2>📊 Event Timeline (${s.events.length})</h2>
    <div style="position:relative;padding-left:28px">
    <div style="position:absolute;left:9px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;

  for (let i = 0; i < s.events.length; i++) {
    const ev = s.events[i];
    const c = eventConfig[ev.type] || {label:ev.type,icon:"📌",color:"#666",bg:"#1a1a2e"};
    const isErr = ["error","unhandled_rejection","console_error"].includes(ev.type);
    const errCls = isErr ? " error" : "";
    const dotColor = isErr ? "#ef4444" : c.color;

    html += `<div class="timeline-event${errCls}">
      <div class="timeline-dot" style="background:${dotColor};border-color:${dotColor}44"></div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:13px">${c.icon}</span>
        <span class="tag" style="background:${c.bg};color:${c.color}">${c.label}</span>
        <span style="font-size:10px;color:#555">${new Date(ev.timestamp).toLocaleTimeString()}</span>
        <span style="font-size:10px;color:#333;margin-left:auto">${ev.page}</span>
      </div>
      <div style="font-size:12px;color:#aaa">${describeEventHtml(ev)}</div>
    </div>`;
  }

  html += `</div>
<div style="text-align:center;color:#333;font-size:11px;margin-top:32px;padding:16px;border-top:1px solid #1e1e32">Generated by TraceBug AI · ${new Date().toLocaleString()}</div>
</body></html>`;

  return html;
}

function describeEventHtml(ev: any): string {
  switch (ev.type) {
    case "click": {
      const el = ev.data.element;
      const target = el?.ariaLabel || el?.text?.trim() || el?.id || el?.tag || "element";
      let s = `Clicked "<span style="color:#60a5fa">${escapeHtml(target.slice(0,60))}</span>"`;
      if (el?.href) s += ` <span style="font-size:10px;color:#444">→ ${escapeHtml(el.href.slice(0,60))}</span>`;
      return s;
    }
    case "input": {
      const inp = ev.data.element;
      const val = inp?.value;
      let s = `Typed in "<span style="color:#c084fc">${escapeHtml(inp?.name || "field")}</span>"`;
      if (val && val !== "[REDACTED]") s += `<div class="value-box">"${escapeHtml(val.slice(0,150))}"</div>`;
      else if (val === "[REDACTED]") s += ` <span style="color:#f87171;font-size:10px">🔒 redacted</span>`;
      return s;
    }
    case "select_change": {
      const sel = ev.data.element;
      let s = `Changed "<span style="color:#34d399">${escapeHtml(sel?.name || "dropdown")}</span>"`;
      s += `<div class="select-box">Selected: "<strong>${escapeHtml(sel?.selectedText || sel?.value || "")}</strong>"</div>`;
      return s;
    }
    case "form_submit": {
      const f = ev.data.form;
      let s = `Submitted form ${f?.id ? `"${escapeHtml(f.id)}"` : ""}`;
      if (f?.fields) {
        s += `<div style="margin-top:4px">`;
        for (const [key, val] of Object.entries(f.fields)) {
          s += `<div style="font-size:10px"><span style="color:#888">${escapeHtml(key)}:</span> ${escapeHtml(String(val).slice(0,80))}</div>`;
        }
        s += `</div>`;
      }
      return s;
    }
    case "route_change":
      return `<span style="color:#888">${escapeHtml(ev.data.from || "/")}</span> <span style="color:#22d3ee">→</span> <span style="color:#22d3ee;font-weight:600">${escapeHtml(ev.data.to || "/")}</span>`;
    case "api_request": {
      const r = ev.data.request;
      return `<span style="font-weight:600">${r?.method}</span> ${escapeHtml((r?.url || "").slice(0,80))} → <span style="color:${getStatusColor(r?.statusCode || 0)};font-weight:700">${r?.statusCode}</span> <span style="color:#555">(${r?.durationMs}ms)</span>`;
    }
    case "error":
    case "unhandled_rejection":
      return `<span style="color:#fca5a5">${escapeHtml(ev.data.error?.message || "Unknown error")}</span>`;
    case "console_error":
      return `<span style="color:#fb923c">${escapeHtml((ev.data.error?.message || "").slice(0,200))}</span>`;
    default:
      return escapeHtml(JSON.stringify(ev.data).slice(0, 100));
  }
}

function describeEventForReport(ev: any): string {
  switch (ev.type) {
    case "click": {
      const el = ev.data.element;
      const target = el?.ariaLabel || el?.text?.trim() || el?.id || el?.tag || "element";
      let s = `Clicked "${target}"`;
      if (el?.href) s += ` → ${el.href}`;
      return s;
    }
    case "input": {
      const inp = ev.data.element;
      const val = inp?.value;
      if (val && val !== "[REDACTED]") return `Typed "${val}" in "${inp?.name || "field"}" (${inp?.type || "text"})`;
      return `Typed in "${inp?.name || "field"}" (${inp?.valueLength || 0} chars, ${inp?.type || "text"})`;
    }
    case "select_change": {
      const sel = ev.data.element;
      return `Selected "${sel?.selectedText || sel?.value}" from "${sel?.name || "dropdown"}" dropdown`;
    }
    case "form_submit": {
      const f = ev.data.form;
      let s = `Submitted form "${f?.id || ""}" (${f?.fieldCount} fields)`;
      if (f?.fields) {
        const entries = Object.entries(f.fields);
        if (entries.length > 0) s += ` — ` + entries.map(([k,v]) => `${k}="${String(v).slice(0,40)}"`).join(", ");
      }
      return s;
    }
    case "route_change":
      return `${ev.data.from || "/"} → ${ev.data.to || "/"}`;
    case "api_request": {
      const r = ev.data.request;
      return `${r?.method} ${r?.url?.slice(0,80)} → ${r?.statusCode} (${r?.durationMs}ms)`;
    }
    case "error":
    case "unhandled_rejection":
      return ev.data.error?.message || "Unknown error";
    case "console_error":
      return (ev.data.error?.message || "").slice(0, 120);
    default:
      return JSON.stringify(ev.data).slice(0, 100);
  }
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Config & helpers ──────────────────────────────────────────────────────

const eventConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  click:                { label: "Click",        icon: "👆", color: "#60a5fa", bg: "#1e293b" },
  input:                { label: "Input",        icon: "⌨️", color: "#c084fc", bg: "#1e1533" },
  select_change:        { label: "Select",       icon: "📋", color: "#34d399", bg: "#052015" },
  form_submit:          { label: "Form Submit",  icon: "📤", color: "#fb923c", bg: "#2a1505" },
  route_change:         { label: "Navigate",     icon: "🔀", color: "#22d3ee", bg: "#0c2e33" },
  api_request:          { label: "API",          icon: "🌐", color: "#fbbf24", bg: "#2a2005" },
  error:                { label: "Error",        icon: "💥", color: "#f87171", bg: "#2a0505" },
  console_error:        { label: "Console Err",  icon: "⚠️", color: "#fb923c", bg: "#2a1505" },
  unhandled_rejection:  { label: "Rejection",    icon: "💥", color: "#f87171", bg: "#2a0505" },
};

function getStatusColor(code: number): string {
  if (code === 0) return "#ef4444";
  if (code < 300) return "#22c55e";
  if (code < 400) return "#fbbf24";
  if (code < 500) return "#f97316";
  return "#ef4444";
}

function getStatusLabel(code: number): string {
  if (code === 0) return "Network Error";
  const labels: Record<number, string> = {
    200:"OK",201:"Created",204:"No Content",301:"Moved",302:"Found",304:"Not Modified",
    400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",
    408:"Timeout",409:"Conflict",413:"Payload Too Large",422:"Unprocessable",429:"Rate Limited",
    500:"Internal Server Error",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout"
  };
  return labels[code] || (code < 300 ? "Success" : code < 400 ? "Redirect" : code < 500 ? "Client Error" : "Server Error");
}

function getSpeedLabel(ms: number): {label:string;color:string} {
  if (ms < 200) return {label:"Fast",color:"#22c55e"};
  if (ms < 1000) return {label:"Normal",color:"#fbbf24"};
  if (ms < 5000) return {label:"Slow",color:"#f97316"};
  return {label:"Very Slow",color:"#ef4444"};
}

function getErrorType(msg: string): {type:string;color:string} {
  const m = msg.toLowerCase();
  if (m.includes("typeerror") || m.includes("cannot read prop")) return {type:"TypeError",color:"#f87171"};
  if (m.includes("referenceerror")) return {type:"ReferenceError",color:"#fb923c"};
  if (m.includes("syntaxerror")) return {type:"SyntaxError",color:"#f472b6"};
  if (m.includes("rangeerror")) return {type:"RangeError",color:"#c084fc"};
  if (m.includes("networkerror") || m.includes("fetch") || m.includes("network")) return {type:"NetworkError",color:"#fbbf24"};
  if (m.includes("timeout")) return {type:"TimeoutError",color:"#f97316"};
  if (m.includes("chunk") || m.includes("loading")) return {type:"ChunkLoadError",color:"#fb923c"};
  return {type:"RuntimeError",color:"#f87171"};
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms/1000).toFixed(1)}s`;
  return `${Math.floor(ms/60000)}m ${Math.floor((ms%60000)/1000)}s`;
}

function describeEvent(event: { type: string; data: Record<string, any>; page: string }): string {
  const d = event.data;
  switch (event.type) {
    case "click":
      return `Clicked "${d.element?.text || d.element?.id || d.element?.tag || "element"}"`;
    case "input": {
      const val = d.element?.value;
      if (val && val !== "[REDACTED]") return `Typed "${val.slice(0,40)}" in "${d.element?.name || "field"}"`;
      return `Typed in "${d.element?.name || "field"}" (${d.element?.valueLength || 0} chars)`;
    }
    case "select_change":
      return `Selected "${d.element?.selectedText || d.element?.value}" from "${d.element?.name || "dropdown"}"`;
    case "form_submit":
      return `Submitted form "${d.form?.id || ""}" (${d.form?.fieldCount || 0} fields)`;
    case "route_change":
      return `${d.from} → ${d.to}`;
    case "api_request":
      return `${d.request?.method} ${d.request?.url?.slice(0, 60)} → ${d.request?.statusCode} (${d.request?.durationMs}ms)`;
    case "error":
    case "unhandled_rejection":
      return d.error?.message || "Unknown error";
    case "console_error":
      return (d.error?.message || "").slice(0, 120);
    default:
      return JSON.stringify(d).slice(0, 100);
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function smallBtnStyle(color: string): string {
  return `background:${color}22;color:${color};border:1px solid ${color}44;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;font-family:inherit;`;
}
