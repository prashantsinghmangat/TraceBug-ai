// ── Event collectors ──────────────────────────────────────────────────────
// Each collector attaches browser listeners and calls `emit()` with raw data.
// Returns a cleanup function to detach everything.

import { EventType } from "./types";

type Emit = (type: EventType, data: Record<string, any>) => void;

const ROOT_ID = "tracebug-root";
const PANEL_ID = "tracebug-dashboard-panel";
const BTN_ID = "tracebug-dashboard-btn";

/** Internal/framework URLs that should not be tracked */
const INTERNAL_URL_PATTERNS = [
  /__nextjs_original-stack-frame/,
  /\/_next\/static\/webpack/,
  /\/__webpack_hmr/,
  /\.hot-update\./,
  /\/sockjs-node\//,
  /\/turbopack-hmr\//,
  /\/_next\/webpack-hmr/,
  /\/webpack-dev-server\//,
  /\/__vite_ping/,
  /\/@vite\/client/,
  /\/@react-refresh/,
];

/** Check if a URL is internal framework traffic that should be skipped */
function isInternalUrl(url: string): boolean {
  return INTERNAL_URL_PATTERNS.some(pattern => pattern.test(url));
}

/** Cached reference to the TraceBug root element */
let _rootCache: HTMLElement | null | undefined;
function getRoot(): HTMLElement | null {
  if (_rootCache === undefined) {
    _rootCache = document.getElementById(ROOT_ID);
  }
  // Re-check if cached value was removed from DOM
  if (_rootCache && !_rootCache.isConnected) {
    _rootCache = document.getElementById(ROOT_ID);
  }
  return _rootCache;
}

/** Check if an element belongs to TraceBug UI — skip our own events */
function isTraceBugElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  // Quick ID checks
  if (el.id === ROOT_ID || el.id === BTN_ID || el.id === PANEL_ID) return true;
  // Direct attribute check on the element itself
  if (el.dataset && el.dataset.tracebug) return true;
  // Walk up the DOM — if any ancestor is #tracebug-root, it's ours
  const root = getRoot();
  if (root && root.contains(el)) return true;
  // Also check for TraceBug annotation overlays, voice dialogs, and modals
  // (they may be appended outside #tracebug-root in some edge cases)
  let node: HTMLElement | null = el;
  while (node) {
    const id = node.id || "";
    if (id.startsWith("tracebug-") || id.startsWith("bt-")) return true;
    const cn = typeof node.className === "string" ? node.className : "";
    if (cn.includes("tracebug-") || cn.includes("bt-ann") || cn.includes("bt-voice")) return true;
    if (node.dataset && node.dataset.tracebug) return true;
    node = node.parentElement;
  }
  return false;
}

// ── Clicks ────────────────────────────────────────────────────────────────

export function collectClicks(emit: Emit): () => void {
  const handler = (e: MouseEvent) => {
    try {
      const t = e.target as HTMLElement;
      if (!t || isTraceBugElement(t)) return;

      const tag = t.tagName.toLowerCase();
      const data: Record<string, any> = {
        element: {
          tag,
          text: (t.innerText || "").slice(0, 120),
          id: t.id || "",
          className: typeof t.className === "string" ? t.className : "",
        },
      };

      const el = data.element;
      if (tag === "a") el.href = (t as HTMLAnchorElement).href || "";
      if (tag === "button" || (t as HTMLButtonElement).type === "submit") {
        el.buttonType = (t as HTMLButtonElement).type || "button";
        el.disabled = (t as HTMLButtonElement).disabled;
      }
      if (tag === "label") el.forField = (t as HTMLLabelElement).htmlFor || "";
      const ariaLabel = t.getAttribute("aria-label");
      if (ariaLabel) el.ariaLabel = ariaLabel;
      const role = t.getAttribute("role");
      if (role) el.role = role;
      const testId = t.getAttribute("data-testid");
      if (testId) el.testId = testId;
      const form = t.closest("form");
      if (form) { el.formId = form.id || ""; el.formAction = form.action || ""; }

      emit("click", data);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] Click capture error:', err);
    }
  };
  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

// ── Inputs (debounced per element) ────────────────────────────────────────

export function collectInputs(emit: Emit): () => void {
  const timers = new Map<EventTarget, ReturnType<typeof setTimeout>>();

  const handler = (e: Event) => {
    try {
      const t = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (!t || !("value" in t) || isTraceBugElement(t)) return;
      if (t.tagName.toLowerCase() === "select") return;

      const prev = timers.get(t);
      if (prev) clearTimeout(prev);

      timers.set(
        t,
        setTimeout(() => {
          try {
            const tag = t.tagName.toLowerCase();
            const inputType = (t as HTMLInputElement).type || "";
            const isSensitive = ["password", "credit-card", "ssn"].includes(inputType) ||
              /password|secret|token|ssn|credit/i.test(t.name || t.id || "");

            const data: Record<string, any> = {
              element: {
                tag, name: t.name || t.id || "", type: inputType,
                valueLength: (t.value || "").length,
                value: isSensitive ? "[REDACTED]" : (t.value || "").slice(0, 200),
                placeholder: t.placeholder || "",
              },
            };
            if (inputType === "checkbox" || inputType === "radio") {
              data.element.checked = (t as HTMLInputElement).checked;
              data.element.value = (t as HTMLInputElement).checked ? "checked" : "unchecked";
            }
            if (inputType === "number" || inputType === "range") { data.element.value = t.value; }
            emit("input", data);
          } catch (err) {
            if (typeof console !== 'undefined') console.warn('[TraceBug] Input capture error:', err);
          }
          timers.delete(t);
        }, 300)
      );
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] Input capture error:', err);
    }
  };

  document.addEventListener("input", handler, { capture: true });
  return () => {
    document.removeEventListener("input", handler, { capture: true });
    timers.forEach((t) => clearTimeout(t));
  };
}

// ── Select/Dropdown changes ──────────────────────────────────────────────

export function collectSelectChanges(emit: Emit): () => void {
  const handler = (e: Event) => {
    try {
      const t = e.target as HTMLSelectElement;
      if (!t || t.tagName.toLowerCase() !== "select" || isTraceBugElement(t)) return;
      const selectedOption = t.options[t.selectedIndex];
      emit("select_change", {
        element: {
          tag: "select", name: t.name || t.id || "", value: t.value,
          selectedText: selectedOption ? selectedOption.text : "",
          selectedIndex: t.selectedIndex, optionCount: t.options.length,
          allOptions: Array.from(t.options).map(o => o.text).slice(0, 20),
        },
      });
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] Select capture error:', err);
    }
  };
  document.addEventListener("change", handler, { capture: true });
  return () => document.removeEventListener("change", handler, { capture: true });
}

// ── Form submissions ─────────────────────────────────────────────────────

export function collectFormSubmits(emit: Emit): () => void {
  const handler = (e: Event) => {
    try {
      const form = e.target as HTMLFormElement;
      if (!form || form.tagName.toLowerCase() !== "form" || isTraceBugElement(form)) return;
      const formData: Record<string, string> = {};
      const elements = form.elements;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i] as HTMLInputElement;
        if (!el.name) continue;
        const isSensitive = ["password"].includes(el.type) || /password|secret|token|ssn|credit/i.test(el.name);
        if (el.type === "submit" || el.type === "button") continue;
        formData[el.name] = isSensitive ? "[REDACTED]" : (el.value || "").slice(0, 200);
      }
      emit("form_submit", {
        form: { id: form.id || "", action: form.action || "", method: form.method || "GET", fieldCount: elements.length, fields: formData },
      });
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] Form capture error:', err);
    }
  };
  document.addEventListener("submit", handler, { capture: true });
  return () => document.removeEventListener("submit", handler, { capture: true });
}

// ── Route changes (popstate + pushState/replaceState patches) ─────────────

export function collectRouteChanges(emit: Emit): () => void {
  let lastPath = window.location.pathname;

  const check = () => {
    const current = window.location.pathname;
    if (current !== lastPath) {
      const from = lastPath;
      lastPath = current;
      emit("route_change", { from, to: current });
    }
  };

  window.addEventListener("popstate", check);

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);

  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    origPush(...args);
    check();
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    origReplace(...args);
    check();
  };

  return () => {
    window.removeEventListener("popstate", check);
    history.pushState = origPush;
    history.replaceState = origReplace;
  };
}

// ── Fetch interception ────────────────────────────────────────────────────

export function collectApiRequests(emit: Emit): () => void {
  const originalFetch = window.fetch;

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Extract URL/method safely — handle Request objects, URL objects, strings
    let url = '';
    let method = 'GET';
    try {
      if (typeof input === 'string') { url = input; }
      else if (input instanceof URL) { url = input.href; }
      else if (input && typeof input === 'object' && 'url' in input) { url = (input as Request).url; method = (input as Request).method || 'GET'; }
      if (init?.method) method = init.method;
    } catch {}

    const start = Date.now();

    // Skip internal framework requests
    try { if (url && isInternalUrl(url)) return originalFetch.call(window, input, init); } catch {}

    // ALWAYS call the original fetch — tracking failures must never break user requests
    try {
      const response = await originalFetch.call(window, input, init);
      try {
        emit("api_request", {
          request: { url: url.slice(0, 500), method: method.toUpperCase(), statusCode: response.status, durationMs: Date.now() - start },
        });
      } catch {} // tracking failure — swallow silently
      return response;
    } catch (err) {
      try {
        emit("api_request", {
          request: { url: url.slice(0, 500), method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start },
        });
      } catch {} // tracking failure — swallow silently
      throw err; // re-throw the original error to the caller
    }
  };

  return () => { window.fetch = originalFetch; };
}

// ── XMLHttpRequest interception ───────────────────────────────────────────

export function collectXhrRequests(emit: Emit): () => void {
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

  OrigXHR.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    try { xhrMeta.set(this, { method, url: typeof url === "string" ? url : url.toString() }); } catch {}
    return origOpen.apply(this, [method, url, ...rest] as any);
  };

  OrigXHR.prototype.send = function (body?: any) {
    try {
      const xhr = this;
      const start = Date.now();
      const meta = xhrMeta.get(xhr);
      const method = meta?.method || "GET";
      const url = meta?.url || "";

      if (isInternalUrl(url)) return origSend.call(this, body);

      xhr.addEventListener("loadend", function () {
        try { emit("api_request", { request: { url: url.slice(0, 500), method: method.toUpperCase(), statusCode: xhr.status, durationMs: Date.now() - start } }); } catch {}
      });
      xhr.addEventListener("error", function () {
        try { emit("api_request", { request: { url: url.slice(0, 500), method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start } }); } catch {}
      });
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] XHR capture error:', err);
    }
    // ALWAYS call the original send — never eat a user's XHR request
    return origSend.call(this, body);
  };

  return () => { OrigXHR.prototype.open = origOpen; OrigXHR.prototype.send = origSend; };
}

// ── Errors (window.onerror + unhandledrejection + console.error) ──────────

export function collectErrors(emit: Emit): () => void {
  const prevOnError = window.onerror;

  window.onerror = (msg, source, line, col, error) => {
    try {
      emit("error", {
        error: {
          message: typeof msg === "string" ? msg : "Unknown error",
          stack: error?.stack, source, line, column: col,
        },
      });
    } catch {}
    if (prevOnError) { try { prevOnError(msg, source, line, col, error); } catch {} }
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    try {
      emit("unhandled_rejection", {
        error: { message: e.reason?.message || String(e.reason), stack: e.reason?.stack },
      });
    } catch {}
  };
  window.addEventListener("unhandledrejection", onRejection);

  const origConsoleError = console.error;
  let _insideEmit = false;
  console.error = function (...args: any[]) {
    if (_insideEmit) { origConsoleError.apply(console, args); return; }
    _insideEmit = true;
    try {
      emit("console_error", {
        error: { message: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") },
      });
    } catch {} finally { _insideEmit = false; }
    origConsoleError.apply(console, args);
  };

  return () => {
    window.onerror = prevOnError;
    window.removeEventListener("unhandledrejection", onRejection);
    console.error = origConsoleError;
  };
}

/**
 * Capture console.warn events.
 */
export function collectConsoleWarnings(emit: Emit): () => void {
  const origWarn = console.warn;
  let _inside = false;
  console.warn = function (...args: any[]) {
    if (_inside) { origWarn.apply(console, args); return; }
    _inside = true;
    try {
      emit("console_warn", {
        error: { message: args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ") },
      });
    } catch {} finally { _inside = false; }
    origWarn.apply(console, args); // ALWAYS call original
  };
  return () => { console.warn = origWarn; };
}

/**
 * Capture console.log events (capped at last 50 in storage).
 */
export function collectConsoleLogs(emit: Emit): () => void {
  const origLog = console.log;
  let _inside = false;
  let _count = 0;
  console.log = function (...args: any[]) {
    if (_inside || _count >= 50) { origLog.apply(console, args); return; }
    _inside = true;
    _count++;
    try {
      emit("console_log", {
        error: { message: args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ") },
      });
    } catch {} finally { _inside = false; }
    origLog.apply(console, args); // ALWAYS call original
  };
  return () => { console.log = origLog; };
}
