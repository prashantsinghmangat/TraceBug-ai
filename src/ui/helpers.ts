// ── Dashboard UI Helpers ─────────────────────────────────────────────────
// Shared utility functions used across all dashboard modules.

import type { TraceBugEvent } from "../types";

// ── Defensive style isolation (no Shadow DOM) ────────────────────────────
// Returns a conservative, scoped CSS reset for an injected-widget root so
// host-page styles can't leak in. It asserts our own base and neutralizes the
// common leak vectors (box-sizing, inherited text properties, button/input
// casing, svg/img sizing, link decoration) — it does NOT nuke our own rules,
// so it is safe to prepend to any widget's <style> block. Zero dependencies.
// Prepend it so our own, more-specific rules always win the cascade.
export function tbIsolationCss(root: string): string {
  return `
    ${root} {
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 14px; font-weight: 400; line-height: 1.5; font-style: normal;
      letter-spacing: normal; text-transform: none; text-align: left;
      text-indent: 0; white-space: normal; word-spacing: normal; text-shadow: none;
      -webkit-font-smoothing: antialiased;
    }
    ${root} *, ${root} *::before, ${root} *::after { box-sizing: border-box; }
    ${root} button, ${root} input, ${root} select, ${root} textarea {
      font-family: inherit; font-size: inherit; letter-spacing: normal;
      text-transform: none; margin: 0;
    }
    ${root} svg { max-width: none; max-height: none; vertical-align: middle; }
    ${root} img { max-width: none; }
    ${root} a { text-decoration: none; }
  `;
}

// ── Keyboard shortcut parsing ────────────────────────────────────────────
// Accepts strings like "ctrl+shift+s", "cmd+b", "alt+shift+a". Treats
// "ctrl" and "cmd" as interchangeable — on macOS we match Cmd, on other
// platforms we match Ctrl. Either one matches when the config says "ctrl".
// Order of modifiers in the string does not matter; the final segment
// (after the last "+") is the key.

interface ParsedShortcut {
  mod: boolean;  // ctrl OR cmd (cross-platform)
  shift: boolean;
  alt: boolean;
  key: string;
}

export function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = (shortcut || "").toLowerCase().split("+").map(s => s.trim());
  return {
    mod: parts.includes("ctrl") || parts.includes("control") || parts.includes("cmd") || parts.includes("meta"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    key: parts[parts.length - 1] || "",
  };
}

export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false;
  const s = parseShortcut(shortcut);
  const mod = e.ctrlKey || e.metaKey;
  const key = (e.key || "").toLowerCase();
  return (
    mod === s.mod &&
    e.shiftKey === s.shift &&
    e.altKey === s.alt &&
    key === s.key
  );
}

export const eventConfig: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  click:                { label: "Click",        icon: "\uD83D\uDC46", color: "#60a5fa", bg: "#1e293b" },
  input:                { label: "Input",        icon: "\u2328\uFE0F", color: "#c084fc", bg: "#1e1533" },
  select_change:        { label: "Select",       icon: "\uD83D\uDCCB", color: "#818CF8", bg: "#052015" },
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

export function describeEvent(event: { type: string; data: TraceBugEvent["data"]; page: string }): string {
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
    ? `background:transparent;border:none;border-bottom:2px solid var(--tb-accent, #6366F1);color:var(--tb-text-primary, #fff);padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;`
    : `background:transparent;border:none;border-bottom:2px solid transparent;color:var(--tb-text-muted, #666);padding:8px 14px;font-size:12px;font-weight:500;cursor:pointer;font-family:var(--tb-font-family, system-ui,sans-serif);white-space:nowrap;`;
}

// ── Trusted Types ─────────────────────────────────────────────────────────
// A host page can enforce `require-trusted-types-for 'script'` CSP (several
// Google properties do, confirmed on stitch.withgoogle.com's own response
// headers — no backend here, just a live check). That gates EVERY HTML-
// producing sink: innerHTML/outerHTML/insertAdjacentHTML, but also
// DOMParser.parseFromString and Range.createContextualFragment — there is no
// string-to-DOM API Trusted Types leaves open. The only way through is to
// become a source of TrustedHTML ourselves, via our own policy.
//
// Cached: the real browser API only allows creating a given policy name once
// per page (a second createPolicy() call with the same name throws), and
// nothing here ever needs a second one.
let _ttPolicy: TrustedTypePolicy | null | undefined;

function getTrustedTypesPolicy(): TrustedTypePolicy | null {
  if (_ttPolicy !== undefined) return _ttPolicy;
  try {
    const tt = (window as Window & { trustedTypes?: { createPolicy: (name: string, rules: { createHTML: (s: string) => string }) => TrustedTypePolicy } }).trustedTypes;
    _ttPolicy = tt ? tt.createPolicy("tracebug-html", { createHTML: (s: string) => s }) : null;
  } catch {
    // The site's CSP also restricts WHICH policy names are allowed (a
    // `trusted-types <allow-list>` directive not naming ours) — confirmed
    // this throws rather than silently failing. Nothing left to try.
    _ttPolicy = null;
  }
  return _ttPolicy;
}

interface TrustedTypePolicy {
  createHTML(input: string): string;
}

/**
 * Assign HTML the way `el.innerHTML = html` does, but survive a host page
 * that enforces Trusted Types CSP — there, a raw innerHTML assignment throws
 * synchronously ("This document requires 'TrustedHTML' assignment"), partway
 * through mounting the dashboard, leaving it half-built or entirely absent.
 *
 * Three tiers, each tried only if the one before it isn't available:
 *   1. The direct assignment — works on the overwhelming majority of pages.
 *   2. Our own Trusted Types policy, turning `html` into a value the CSP
 *      accepts. Works on any page enforcing Trusted Types without also
 *      restricting which policy names may be created (the common case).
 *   3. Give up on THIS element's markup rather than let the exception
 *      propagate and abort every statement after it in the caller — a page
 *      that both enforces Trusted Types AND locks the policy name allow-list
 *      has closed every string-to-HTML path there is; rendering nothing here
 *      is the least-bad outcome short of rewriting that surface in plain DOM
 *      APIs.
 */
export function setInnerHTML(el: Element, html: string): void {
  try {
    el.innerHTML = html;
    return;
  } catch { /* fall through */ }

  const policy = getTrustedTypesPolicy();
  if (policy) {
    try {
      // TrustedHTML satisfies the innerHTML setter at runtime; TypeScript's
      // lib.dom typings don't know that without the trusted-types package,
      // so the cast is a trust boundary we own, not a type-safety gap.
      el.innerHTML = policy.createHTML(html) as unknown as string;
      return;
    } catch { /* fall through to the last resort */ }
  }

  try { el.replaceChildren(); } catch { /* nothing left to try */ }
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
