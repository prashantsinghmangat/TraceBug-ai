// ── Dashboard UI Helpers ─────────────────────────────────────────────────
// Shared utility functions used across all dashboard modules.

export const eventConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  click:                { label: "Click",        icon: "\uD83D\uDC46", color: "#60a5fa", bg: "#1e293b" },
  input:                { label: "Input",        icon: "\u2328\uFE0F", color: "#c084fc", bg: "#1e1533" },
  select_change:        { label: "Select",       icon: "\uD83D\uDCCB", color: "#34d399", bg: "#052015" },
  form_submit:          { label: "Form Submit",  icon: "\uD83D\uDCE4", color: "#fb923c", bg: "#2a1505" },
  route_change:         { label: "Navigate",     icon: "\uD83D\uDD00", color: "#22d3ee", bg: "#0c2e33" },
  api_request:          { label: "API",          icon: "\uD83C\uDF10", color: "#fbbf24", bg: "#2a2005" },
  error:                { label: "Error",        icon: "\uD83D\uDCA5", color: "#f87171", bg: "#2a0505" },
  console_error:        { label: "Console Err",  icon: "\u26A0\uFE0F", color: "#fb923c", bg: "#2a1505" },
  unhandled_rejection:  { label: "Rejection",    icon: "\uD83D\uDCA5", color: "#f87171", bg: "#2a0505" },
};

export function getStatusColor(code: number): string {
  if (code === 0) return "#ef4444";
  if (code < 300) return "#22c55e";
  if (code < 400) return "#fbbf24";
  if (code < 500) return "#f97316";
  return "#ef4444";
}

export function getStatusLabel(code: number): string {
  if (code === 0) return "Network Error";
  const labels: Record<number, string> = {
    200:"OK",201:"Created",204:"No Content",301:"Moved",302:"Found",304:"Not Modified",
    400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",
    408:"Timeout",409:"Conflict",413:"Payload Too Large",422:"Unprocessable",429:"Rate Limited",
    500:"Internal Server Error",502:"Bad Gateway",503:"Service Unavailable",504:"Gateway Timeout"
  };
  return labels[code] || (code < 300 ? "Success" : code < 400 ? "Redirect" : code < 500 ? "Client Error" : "Server Error");
}

export function getSpeedLabel(ms: number): { label: string; color: string } {
  if (ms < 200) return { label: "Fast", color: "#22c55e" };
  if (ms < 1000) return { label: "Normal", color: "#fbbf24" };
  if (ms < 5000) return { label: "Slow", color: "#f97316" };
  return { label: "Very Slow", color: "#ef4444" };
}

export function getErrorType(msg: string): { type: string; color: string } {
  const m = msg.toLowerCase();
  if (m.includes("typeerror") || m.includes("cannot read prop")) return { type: "TypeError", color: "#f87171" };
  if (m.includes("referenceerror")) return { type: "ReferenceError", color: "#fb923c" };
  if (m.includes("syntaxerror")) return { type: "SyntaxError", color: "#f472b6" };
  if (m.includes("rangeerror")) return { type: "RangeError", color: "#c084fc" };
  if (m.includes("networkerror") || m.includes("fetch") || m.includes("network")) return { type: "NetworkError", color: "#fbbf24" };
  if (m.includes("timeout")) return { type: "TimeoutError", color: "#f97316" };
  if (m.includes("chunk") || m.includes("loading")) return { type: "ChunkLoadError", color: "#fb923c" };
  return { type: "RuntimeError", color: "#f87171" };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function describeEvent(event: { type: string; data: Record<string, any>; page: string }): string {
  const d = event.data;
  switch (event.type) {
    case "click":
      return `Clicked "${d.element?.text || d.element?.id || d.element?.tag || "element"}"`;
    case "input": {
      const val = d.element?.value;
      if (val && val !== "[REDACTED]") return `Typed "${val.slice(0, 40)}" in "${d.element?.name || "field"}"`;
      return `Typed in "${d.element?.name || "field"}" (${d.element?.valueLength || 0} chars)`;
    }
    case "select_change":
      return `Selected "${d.element?.selectedText || d.element?.value}" from "${d.element?.name || "dropdown"}"`;
    case "form_submit":
      return `Submitted form "${d.form?.id || ""}" (${d.form?.fieldCount || 0} fields)`;
    case "route_change":
      return `${d.from} \u2192 ${d.to}`;
    case "api_request":
      return `${d.request?.method} ${d.request?.url?.slice(0, 60)} \u2192 ${d.request?.statusCode} (${d.request?.durationMs}ms)`;
    case "error":
    case "unhandled_rejection":
      return d.error?.message || "Unknown error";
    case "console_error":
      return (d.error?.message || "").slice(0, 120);
    default:
      return JSON.stringify(d).slice(0, 100);
  }
}

export function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function smallBtnStyle(color: string): string {
  return `background:${color}22;color:${color};border:1px solid ${color}44;border-radius:var(--tb-radius-sm, 4px);padding:4px 10px;cursor:pointer;font-size:11px;font-family:var(--tb-font-family, inherit);`;
}

export function tabBtnStyle(active: boolean): string {
  return active
    ? `background:transparent;border:none;border-bottom:2px solid var(--tb-accent, #7B61FF);color:var(--tb-text-primary, #fff);padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;`
    : `background:transparent;border:none;border-bottom:2px solid transparent;color:var(--tb-text-muted, #666);padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;`;
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
