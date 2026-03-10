"use client";

import { useEffect } from "react";

/**
 * Initializes TraceBug SDK on the client.
 *
 * In a real project you'd do:
 *   npm install tracebug-sdk
 *   import TraceBug from "tracebug-sdk";
 *
 * For this example we inline a copy of the SDK so it works without publishing.
 * The logic is identical to the built package.
 */
export default function TraceBugInit() {
  useEffect(() => {
    // ── Session ID ────────────────────────────────────────────────────
    let sessionId = sessionStorage.getItem("tracebug_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("tracebug_session_id", sessionId);
    }

    const PROJECT_ID = "demo-project";
    const STORAGE_KEY = "tracebug_sessions";

    // ── Storage helpers ───────────────────────────────────────────────
    type Session = {
      sessionId: string; projectId: string; createdAt: number; updatedAt: number;
      errorMessage: string | null; errorStack: string | null;
      reproSteps: string | null; errorSummary: string | null;
      events: any[];
    };

    function getSessions(): Session[] {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
    }
    function saveSessions(s: Session[]) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
    }
    function getSession(): Session {
      let sessions = getSessions();
      let s = sessions.find(s => s.sessionId === sessionId);
      if (!s) {
        s = { sessionId: sessionId!, projectId: PROJECT_ID, createdAt: Date.now(), updatedAt: Date.now(), errorMessage: null, errorStack: null, reproSteps: null, errorSummary: null, events: [] };
        sessions.push(s);
        if (sessions.length > 50) sessions = sessions.slice(-50);
        saveSessions(sessions);
      }
      return s;
    }
    getSession(); // ensure it exists

    function addEvent(type: string, data: any) {
      const sessions = getSessions();
      const s = sessions.find(s => s.sessionId === sessionId);
      if (!s) return;
      s.events.push({ id: Math.random().toString(36).slice(2, 10), sessionId, projectId: PROJECT_ID, type, page: window.location.pathname, timestamp: Date.now(), data });
      if (s.events.length > 200) s.events = s.events.slice(-200);
      s.updatedAt = Date.now();
      saveSessions(sessions);
    }

    // ── Repro step generator (runs locally) ───────────────────────────
    function generateRepro(events: any[], errorMsg: string, stack?: string) {
      const steps: string[] = [];
      let n = 1;
      for (const e of events) {
        switch (e.type) {
          case "route_change": {
            const to = e.data.to || e.page;
            const name = to === "/" ? "Home page" : to.split("/").filter(Boolean).map((p: string) => p[0].toUpperCase() + p.slice(1)).join(" ") + " page";
            steps.push(`${n++}. Navigate to ${name} (${to})`); break;
          }
          case "click": {
            const el = e.data.element;
            const label = el?.text?.trim() || el?.id || el?.tag || "element";
            steps.push(`${n++}. Click "${label.slice(0, 50)}"`); break;
          }
          case "input": {
            const inp = e.data.element;
            const field = inp?.name || inp?.id || "field";
            steps.push(inp?.tag === "select"
              ? `${n++}. Change "${field}" dropdown value`
              : `${n++}. Type in "${field}" field`
            ); break;
          }
          case "api_request": {
            const r = e.data.request;
            if (r?.statusCode >= 400 || r?.statusCode === 0)
              steps.push(`${n++}. API call fails: ${r.method} ${r.url?.slice(0, 60)} → ${r.statusCode || "Network Error"}`);
            break;
          }
          case "error": case "unhandled_rejection":
            steps.push(`${n++}. ❌ Error: "${(e.data.error?.message || errorMsg).slice(0, 120)}"`); break;
        }
      }
      if (steps.length === 0) steps.push("1. (No interactions recorded before error)");

      const summary = [`Error: ${errorMsg}`];
      if (stack) { const m = stack.match(/at\s+(\S+)\s+\(([^)]+)\)/); if (m) summary.push(`Thrown in: ${m[1]} at ${m[2]}`); }
      return { reproSteps: steps.join("\n"), errorSummary: summary.join("\n") };
    }

    function processError(errorMsg: string, stack?: string) {
      setTimeout(() => {
        const sessions = getSessions();
        const s = sessions.find(s => s.sessionId === sessionId);
        if (!s) return;
        const result = generateRepro(s.events, errorMsg, stack);
        s.errorMessage = errorMsg;
        s.errorStack = stack || null;
        s.reproSteps = result.reproSteps;
        s.errorSummary = result.errorSummary;
        s.updatedAt = Date.now();
        saveSessions(sessions);
        console.info("[TraceBug] Bug report ready. Click 🐛 to view.");
      }, 100);
    }

    // ── Collectors ────────────────────────────────────────────────────
    const cleanups: (() => void)[] = [];

    // Clicks
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t || t.closest("#tracebug-dashboard-panel, #tracebug-dashboard-btn")) return;
      addEvent("click", { element: { tag: t.tagName?.toLowerCase(), text: (t.innerText || "").slice(0, 120), id: t.id || "", className: typeof t.className === "string" ? t.className : "" } });
    };
    document.addEventListener("click", onClick, true);
    cleanups.push(() => document.removeEventListener("click", onClick, true));

    // Input (debounced)
    const inputTimers = new Map<EventTarget, ReturnType<typeof setTimeout>>();
    const onInput = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t || !("value" in t)) return;
      const prev = inputTimers.get(t);
      if (prev) clearTimeout(prev);
      inputTimers.set(t, setTimeout(() => {
        addEvent("input", { element: { tag: t.tagName?.toLowerCase(), name: t.name || t.id || "", type: t.type || "", valueLength: (t.value || "").length } });
        inputTimers.delete(t);
      }, 300));
    };
    document.addEventListener("input", onInput, true);
    cleanups.push(() => { document.removeEventListener("input", onInput, true); inputTimers.forEach(t => clearTimeout(t)); });

    // Route changes
    let lastPath = window.location.pathname;
    const checkRoute = () => {
      if (window.location.pathname !== lastPath) {
        const from = lastPath;
        lastPath = window.location.pathname;
        addEvent("route_change", { from, to: lastPath });
      }
    };
    window.addEventListener("popstate", checkRoute);
    const origPush = history.pushState.bind(history);
    const origReplace = history.replaceState.bind(history);
    history.pushState = function (...args: [any, string, string?]) { origPush(...args); checkRoute(); };
    history.replaceState = function (...args: [any, string, string?]) { origReplace(...args); checkRoute(); };
    cleanups.push(() => { window.removeEventListener("popstate", checkRoute); history.pushState = origPush; history.replaceState = origReplace; });

    // Fetch interception
    const originalFetch = window.fetch;
    window.fetch = async function (input: any, init?: any) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
      const method = (init?.method || "GET").toUpperCase();
      const start = Date.now();
      try {
        const res = await originalFetch.call(window, input, init);
        addEvent("api_request", { request: { url: url?.slice(0, 500), method, statusCode: res.status, durationMs: Date.now() - start } });
        return res;
      } catch (err) {
        addEvent("api_request", { request: { url: url?.slice(0, 500), method, statusCode: 0, durationMs: Date.now() - start } });
        throw err;
      }
    };
    cleanups.push(() => { window.fetch = originalFetch; });

    // Errors
    const prevOnError = window.onerror;
    window.onerror = (msg, source, line, col, error) => {
      addEvent("error", { error: { message: String(msg), stack: error?.stack, source, line, column: col } });
      processError(String(msg), error?.stack);
      if (prevOnError) prevOnError(msg, source, line, col, error);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      addEvent("unhandled_rejection", { error: { message: e.reason?.message || String(e.reason), stack: e.reason?.stack } });
      processError(e.reason?.message || String(e.reason), e.reason?.stack);
    };
    window.addEventListener("unhandledrejection", onRejection);
    const origConsoleError = console.error;
    console.error = function (...args: any[]) {
      addEvent("console_error", { error: { message: args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ") } });
      origConsoleError.apply(console, args);
    };
    cleanups.push(() => { window.onerror = prevOnError; window.removeEventListener("unhandledrejection", onRejection); console.error = origConsoleError; });

    // ── Dashboard panel (injected into page) ──────────────────────────
    mountInBrowserDashboard();

    console.info(`[TraceBug] Initialized — session: ${sessionId}`);
    return () => cleanups.forEach(fn => fn());
  }, []);

  return null;
}

// ── Inline dashboard (same as src/dashboard.ts) ──────────────────────────
// Duplicated here so the example app is self-contained without building the SDK.

function mountInBrowserDashboard() {
  if (document.getElementById("tracebug-dashboard-btn")) return;
  const STORAGE_KEY = "tracebug_sessions";

  type Session = {
    sessionId: string; projectId: string; createdAt: number; updatedAt: number;
    errorMessage: string | null; errorStack: string | null;
    reproSteps: string | null; errorSummary: string | null;
    events: any[];
  };

  function getSessions(): Session[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  }

  // Floating button
  const btn = document.createElement("button");
  btn.id = "tracebug-dashboard-btn";
  btn.innerHTML = "🐛";
  btn.title = "TraceBug AI";
  Object.assign(btn.style, {
    position: "fixed", bottom: "20px", right: "20px", zIndex: "99999",
    width: "48px", height: "48px", borderRadius: "50%",
    border: "2px solid #ef4444", background: "#1a1a2e", color: "#ef4444",
    fontSize: "22px", cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "transform 0.2s", fontFamily: "system-ui, sans-serif",
  });
  btn.onmouseenter = () => btn.style.transform = "scale(1.1)";
  btn.onmouseleave = () => btn.style.transform = "scale(1)";

  // Panel
  const panel = document.createElement("div");
  panel.id = "tracebug-dashboard-panel";
  Object.assign(panel.style, {
    position: "fixed", top: "0", right: "-480px", width: "470px", height: "100vh",
    zIndex: "99998", background: "#0f0f1a", borderLeft: "1px solid #2a2a3e",
    color: "#e0e0e0", fontFamily: "'SF Mono', Consolas, monospace, system-ui, sans-serif",
    fontSize: "13px", overflow: "hidden", transition: "right 0.3s ease",
    display: "flex", flexDirection: "column", boxShadow: "-4px 0 30px rgba(0,0,0,0.6)",
  });

  let isOpen = false;
  btn.onclick = () => {
    isOpen = !isOpen;
    panel.style.right = isOpen ? "0" : "-480px";
    btn.innerHTML = isOpen ? "✕" : "🐛";
    if (isOpen) renderList();
  };

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const timeAgo = (ts: number) => { const d = Math.floor((Date.now() - ts) / 1000); return d < 60 ? "just now" : d < 3600 ? `${Math.floor(d/60)}m ago` : d < 86400 ? `${Math.floor(d/3600)}h ago` : `${Math.floor(d/86400)}d ago`; };
  const sbtn = (c: string) => `background:${c}22;color:${c};border:1px solid ${c}44;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;font-family:inherit;`;

  const eventCfg: Record<string, {label:string;icon:string;color:string;bg:string}> = {
    click:{label:"Click",icon:"👆",color:"#60a5fa",bg:"#1e293b"}, input:{label:"Input",icon:"⌨️",color:"#c084fc",bg:"#1e1533"},
    route_change:{label:"Navigate",icon:"🔀",color:"#22d3ee",bg:"#0c2e33"}, api_request:{label:"API",icon:"🌐",color:"#fbbf24",bg:"#2a2005"},
    error:{label:"Error",icon:"💥",color:"#f87171",bg:"#2a0505"}, console_error:{label:"Console Err",icon:"⚠️",color:"#fb923c",bg:"#2a1505"},
    unhandled_rejection:{label:"Rejection",icon:"💥",color:"#f87171",bg:"#2a0505"},
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

  function describeEv(e: any): string {
    const d = e.data;
    switch(e.type) {
      case "click": return `Clicked "${d.element?.text || d.element?.id || d.element?.tag || "element"}"`;
      case "input": return `Typed in "${d.element?.name || "field"}" (${d.element?.valueLength || 0} chars)`;
      case "route_change": return `${d.from} → ${d.to}`;
      case "api_request": return `${d.request?.method} ${d.request?.url?.slice(0,60)} → ${d.request?.statusCode} (${d.request?.durationMs}ms)`;
      case "error": case "unhandled_rejection": return d.error?.message || "Unknown error";
      case "console_error": return (d.error?.message || "").slice(0,120);
      default: return JSON.stringify(d).slice(0,100);
    }
  }

  function renderList() {
    const sessions = getSessions().sort((a,b) => b.updatedAt - a.updatedAt);
    const errors = sessions.filter(s => s.errorMessage);
    panel.innerHTML = `
      <div style="padding:16px 20px;border-bottom:1px solid #2a2a3e;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div>
          <div style="font-size:16px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">🐛 TraceBug AI</div>
          <div style="font-size:11px;color:#666;margin-top:2px">${errors.length} error${errors.length!==1?"s":""} · ${sessions.length} session${sessions.length!==1?"s":""}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button id="bt-r" style="${sbtn("#3b82f6")}">↻ Refresh</button>
          <button id="bt-c" style="${sbtn("#ef4444")}">Clear All</button>
        </div>
      </div>
      <div id="bt-ct" style="flex:1;overflow-y:auto;padding:12px 16px"></div>`;
    panel.querySelector("#bt-r")!.addEventListener("click", renderList);
    panel.querySelector("#bt-c")!.addEventListener("click", () => { if(confirm("Delete all?")) { localStorage.removeItem(STORAGE_KEY); renderList(); }});
    const ct = panel.querySelector("#bt-ct") as HTMLElement;
    if (sessions.length === 0) { ct.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#555"><div style="font-size:36px;margin-bottom:12px">🔍</div><div style="font-family:system-ui,sans-serif">No sessions yet.</div></div>`; return; }
    for (const s of sessions) {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a3e;border-radius:8px;padding:12px;margin-bottom:10px;cursor:pointer;transition:border-color 0.2s";
      card.onmouseenter = () => card.style.borderColor = "#4a4a6e";
      card.onmouseleave = () => card.style.borderColor = "#2a2a3e";
      const dot = s.errorMessage ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px"></span>' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px"></span>';
      const badge = s.reproSteps ? '<span style="font-size:10px;background:#14532d;color:#4ade80;padding:2px 6px;border-radius:4px;margin-left:6px">Repro Ready</span>' : "";
      card.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center">${dot}<span style="color:#888;font-size:11px">${s.sessionId.slice(0,12)}…</span>${badge}</div>
          <span style="color:#555;font-size:10px">${timeAgo(s.updatedAt)}</span>
        </div>
        ${s.errorMessage ? `<div style="color:#f87171;font-size:12px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.errorMessage)}</div>` : ""}
        <div style="color:#555;font-size:11px;margin-top:4px">${s.events.length} events</div>`;
      card.onclick = () => renderDetail(s);
      ct.appendChild(card);
    }
  }

  function renderDetail(s: Session) {
    const ct = panel.querySelector("#bt-ct") as HTMLElement;

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

    let h = "";

    // ── Header with back button ──
    h += `<button id="bt-bk" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;margin-bottom:12px;padding:0;font-family:inherit">← Back to sessions</button>`;

    // ── Session overview card ──
    h += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
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

      h += `<div style="border:1px solid ${criticalCount > 0 ? "#7f1d1d" : "#78350f"};background:${criticalCount > 0 ? "#1a0505" : "#1a1005"};border-radius:10px;padding:14px;margin-bottom:14px">
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
        h += `<div style="border:1px solid ${sevBorder};background:${sevBg};border-radius:6px;padding:10px;margin-bottom:6px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:13px">${p.icon}</span>
            <span style="font-size:11px;font-weight:600;color:${p.color};font-family:system-ui,sans-serif">${esc(p.title)}</span>
          </div>
          <div style="color:#888;font-size:11px;line-height:1.4;padding-left:22px;word-break:break-word">${esc(p.detail)}</div>
        </div>`;
      }
      h += `</div>`;
    }

    // ── Error details (expanded) ──
    if (s.errorMessage) {
      const errType = getErrorType(s.errorMessage);
      h += `<div style="border:1px solid #7f1d1d;background:#1a0505;border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:13px;font-weight:700;color:#fca5a5;font-family:system-ui,sans-serif">Error Details</span>
          <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}44">${errType.type}</span>
        </div>
        <div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
          <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Message</div>
          <div style="color:#fca5a5;font-size:12px;line-height:1.5;word-break:break-word">${esc(s.errorMessage)}</div>
        </div>`;
      if (s.errorStack) {
        // Parse stack to show file/line info
        const locationMatch = s.errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
        if (locationMatch) {
          h += `<div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
            <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Location</div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12px;color:#60a5fa">${esc(locationMatch[1])}</span>
              <span style="font-size:10px;color:#555">at</span>
              <span style="font-size:10px;color:#888;word-break:break-all">${esc(locationMatch[2])}</span>
            </div>
          </div>`;
        }
        h += `<details style="margin-top:4px">
          <summary style="font-size:10px;color:#555;cursor:pointer;user-select:none;font-family:system-ui,sans-serif">View Full Stack Trace</summary>
          <pre style="color:#dc262690;font-size:10px;margin-top:6px;white-space:pre-wrap;line-height:1.4;max-height:150px;overflow:auto;background:#0a0a0a;padding:8px;border-radius:4px">${esc(s.errorStack)}</pre>
        </details>`;
      }
      h += `</div>`;
    }

    // ── Performance insights (if API calls exist) ──
    if (apiEvents.length > 0) {
      h += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
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

        h += `<div style="background:${isFail ? "#0f0205" : "#0f0f1a"};border:1px solid ${isFail ? "#7f1d1d44" : "#1e1e32"};border-radius:6px;padding:8px 10px;margin-bottom:4px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10px;font-weight:600;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${r?.method || "GET"}</span>
              <span style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${esc(urlPath)}</span>
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
      h += `</div>`;
    }

    // ── Reproduction steps ──
    if (s.reproSteps) {
      h += `<div style="border:1px solid #14532d;background:#031a09;border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div style="font-size:13px;font-weight:700;color:#4ade80;font-family:system-ui,sans-serif">📋 Reproduction Steps</div>
          <button id="bt-cp" style="${sbtn("#3b82f6")}font-size:10px">Copy</button>
        </div>
        <pre style="color:#bbf7d0;font-size:12px;white-space:pre-wrap;line-height:1.7;margin:0">${esc(s.reproSteps)}</pre>
        ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:10px;padding-top:8px"><div style="font-size:10px;font-weight:600;color:#4ade80;margin-bottom:4px;font-family:system-ui,sans-serif">Summary</div><pre style="color:#86efac;font-size:11px;white-space:pre-wrap;line-height:1.4;margin:0">${esc(s.errorSummary)}</pre></div>` : ""}
      </div>`;
    }

    // ── Event Timeline (detailed) ──
    h += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">Event Timeline (${s.events.length})</div>
      <span style="font-size:10px;color:#555">${new Date(firstTs).toLocaleTimeString()} — ${new Date(lastTs).toLocaleTimeString()}</span>
    </div>
    <div style="position:relative;padding-left:24px">
      <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;

    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      const c = eventCfg[ev.type] || {label:ev.type,icon:"📌",color:"#666",bg:"#1a1a2e"};
      const isErr = ["error","unhandled_rejection","console_error"].includes(ev.type);
      const isApiErr = ev.type === "api_request" && (ev.data.request?.statusCode >= 400 || ev.data.request?.statusCode === 0);
      const isSlowApi = ev.type === "api_request" && ev.data.request?.durationMs > 3000;
      const hasProblem = isErr || isApiErr;
      const dotColor = hasProblem ? "#ef4444" : isSlowApi ? "#f97316" : c.color;
      const timeSincePrev = i > 0 ? ev.timestamp - s.events[i-1].timestamp : 0;

      // Time gap indicator
      if (timeSincePrev > 2000 && i > 0) {
        h += `<div style="position:relative;margin-bottom:4px;margin-top:4px">
          <div style="position:absolute;left:-21px;top:4px;width:6px;height:6px;border-radius:50%;background:#2a2a3e;border:1px solid #333"></div>
          <div style="font-size:9px;color:#444;font-style:italic;padding:2px 0">⏱ ${formatDuration(timeSincePrev)} later</div>
        </div>`;
      }

      h += `<div style="position:relative;margin-bottom:6px">
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
        h += `<div style="margin-top:4px">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="font-size:10px;font-weight:700;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${r?.method || "GET"}</span>
              <span style="font-size:11px;color:#aaa;word-break:break-all">${esc(urlPath?.slice(0, 80) || "")}</span>
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
        const target = el?.text?.trim() || el?.id || el?.tag || "element";
        h += `<div style="color:#aaa;font-size:11px;line-height:1.4">Clicked "<span style="color:#60a5fa">${esc(target.slice(0,60))}</span>"</div>`;
        if (el?.tag || el?.id || el?.className) {
          h += `<div style="font-size:9px;color:#444;margin-top:3px">${el.tag ? `&lt;${el.tag}&gt;` : ""}${el.id ? ` #${el.id}` : ""}${el.className ? ` .${esc(el.className.split(" ")[0])}` : ""}</div>`;
        }
      } else if (ev.type === "input") {
        const inp = ev.data.element;
        h += `<div style="color:#aaa;font-size:11px;line-height:1.4">${inp?.tag === "select" ? "Changed" : "Typed in"} "<span style="color:#c084fc">${esc(inp?.name || inp?.id || "field")}</span>" ${inp?.type ? `<span style="font-size:9px;color:#555">(${inp.type})</span>` : ""}</div>
          <div style="font-size:9px;color:#444;margin-top:2px">${inp?.valueLength || 0} characters</div>`;
      } else if (ev.type === "route_change") {
        h += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:2px">
            <span style="color:#888;background:#0f0f1a;padding:2px 6px;border-radius:3px">${esc(ev.data.from || "/")}</span>
            <span style="color:#22d3ee">→</span>
            <span style="color:#22d3ee;background:#0c2e3344;padding:2px 6px;border-radius:3px;font-weight:600">${esc(ev.data.to || "/")}</span>
          </div>`;
      } else if (ev.type === "error" || ev.type === "unhandled_rejection") {
        const errType = getErrorType(ev.data.error?.message || "");
        h += `<div style="margin-top:2px">
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
              <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}33">${errType.type}</span>
            </div>
            <div style="color:#fca5a5;font-size:11px;line-height:1.4;word-break:break-word">${esc(ev.data.error?.message || "Unknown error")}</div>
            ${ev.data.error?.source ? `<div style="font-size:9px;color:#555;margin-top:3px">at ${esc(ev.data.error.source)}${ev.data.error.line ? `:${ev.data.error.line}` : ""}${ev.data.error.column ? `:${ev.data.error.column}` : ""}</div>` : ""}
          </div>`;
      } else if (ev.type === "console_error") {
        h += `<div style="color:#fb923c;font-size:11px;line-height:1.4;word-break:break-word">${esc((ev.data.error?.message || "").slice(0,200))}</div>`;
      } else {
        h += `<div style="color:#aaa;font-size:11px;line-height:1.3">${esc(describeEv(ev))}</div>`;
      }

      h += `</div></div>`;
    }

    h += `</div>`;

    // ── Footer actions ──
    h += `<div style="margin-top:16px;padding:12px 0;border-top:1px solid #1e1e32;display:flex;gap:8px">
      <button id="bt-cp2" style="${sbtn("#3b82f6")}font-size:11px;flex:1">📋 Copy Full Report</button>
      <button id="bt-dl" style="${sbtn("#ef4444")}font-size:11px">🗑 Delete</button>
    </div>`;

    ct.innerHTML = h;

    // ── Wire up buttons ──
    ct.querySelector("#bt-bk")!.addEventListener("click", renderList);

    const cpBtn = ct.querySelector("#bt-cp");
    if (cpBtn) cpBtn.addEventListener("click", () => {
      const text = `Reproduction Steps:\n${s.reproSteps}\n\nError: ${s.errorMessage}\n\n${s.errorSummary||""}`;
      navigator.clipboard.writeText(text).then(() => { (cpBtn as HTMLElement).textContent = "✓ Copied!"; setTimeout(() => (cpBtn as HTMLElement).textContent = "Copy", 2000); });
    });

    const cp2Btn = ct.querySelector("#bt-cp2");
    if (cp2Btn) cp2Btn.addEventListener("click", () => {
      let report = `TraceBug Session Report\n${"=".repeat(40)}\n`;
      report += `Session: ${s.sessionId}\nDate: ${new Date(s.createdAt).toLocaleString()}\nDuration: ${formatDuration(sessionDur)}\nEvents: ${s.events.length}\n\n`;
      if (problems.length > 0) {
        report += `Problems (${problems.length}):\n${"-".repeat(30)}\n`;
        for (const p of problems) report += `[${p.severity.toUpperCase()}] ${p.title}\n  ${p.detail}\n\n`;
      }
      if (s.errorMessage) report += `Error: ${s.errorMessage}\n${s.errorStack ? `Stack: ${s.errorStack}\n` : ""}\n`;
      if (s.reproSteps) report += `Reproduction Steps:\n${s.reproSteps}\n\n`;
      if (apiEvents.length > 0) {
        report += `API Calls:\n${"-".repeat(30)}\n`;
        for (const ev of apiEvents) {
          const r = ev.data.request;
          report += `${r?.method} ${r?.url} → ${r?.statusCode} (${r?.durationMs}ms)\n`;
        }
      }
      navigator.clipboard.writeText(report).then(() => { (cp2Btn as HTMLElement).textContent = "✓ Copied!"; setTimeout(() => (cp2Btn as HTMLElement).textContent = "📋 Copy Full Report", 2000); });
    });

    ct.querySelector("#bt-dl")!.addEventListener("click", () => {
      if (confirm("Delete this session?")) {
        const all = getSessions().filter(x => x.sessionId !== s.sessionId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        renderList();
      }
    });
  }
}
