// ── Event collectors ──────────────────────────────────────────────────────
// Each collector attaches browser listeners and calls `emit()` with raw data.
// Returns a cleanup function to detach everything.

import { EventType } from "./types";

type Emit = (type: EventType, data: Record<string, any>) => void;

const ROOT_ID = "tracebug-root";
const PANEL_ID = "tracebug-dashboard-panel";
const BTN_ID = "tracebug-dashboard-btn";

// ── Network failure buffer ────────────────────────────────────────────────
// Ring buffer of the last 10 failed network requests with response snippets.
// Populated asynchronously from fetch/XHR wrappers; never blocks a request.

export interface NetworkFailure {
  url: string;
  method: string;
  status: number;
  response: string;
  timestamp: number;
}

const NETWORK_FAILURE_LIMIT = 10;
const RESPONSE_SNIPPET_CHARS = 200;
const _networkFailures: NetworkFailure[] = [];

function pushNetworkFailure(failure: NetworkFailure): void {
  try {
    _networkFailures.push(failure);
    if (_networkFailures.length > NETWORK_FAILURE_LIMIT) {
      _networkFailures.splice(0, _networkFailures.length - NETWORK_FAILURE_LIMIT);
    }
  } catch {}
}

/** Get the last 10 failed network requests (newest last). Returns a copy. */
export function getNetworkFailures(): NetworkFailure[] {
  return _networkFailures.slice();
}

/** Clear the network failure buffer. Called on SDK destroy. */
export function clearNetworkFailures(): void {
  _networkFailures.length = 0;
}

// ── URL redaction ─────────────────────────────────────────────────────────
// Strip sensitive query params before URLs are captured into events/reports.
// Matches param NAMES (case-insensitive) against this pattern — values are
// replaced with [REDACTED]. Prevents tokens leaking into exported bug reports.

const SENSITIVE_PARAM_RE = /token|key|secret|auth|password|sig|signature/i;

/**
 * Redact sensitive query-string values in a URL.
 *
 *   /api/users?api_key=abc123   → /api/users?api_key=[REDACTED]
 *   /api/users?q=hi&token=xxx   → /api/users?q=hi&token=[REDACTED]
 *
 * Defensive: wrapped in try/catch, returns the original URL on any failure.
 */
function sanitizeUrl(url: string): string {
  if (!url) return url;
  try {
    const qIdx = url.indexOf("?");
    if (qIdx === -1) return url;
    const base = url.slice(0, qIdx);
    const afterQ = url.slice(qIdx + 1);

    const hashIdx = afterQ.indexOf("#");
    const query = hashIdx === -1 ? afterQ : afterQ.slice(0, hashIdx);
    const hash = hashIdx === -1 ? "" : afterQ.slice(hashIdx);

    const redacted = query.split("&").map(part => {
      const eqIdx = part.indexOf("=");
      if (eqIdx === -1) return part;
      const key = part.slice(0, eqIdx);
      if (SENSITIVE_PARAM_RE.test(key)) return `${key}=[REDACTED]`;
      return part;
    }).join("&");

    return `${base}?${redacted}${hash}`;
  } catch {
    return url;
  }
}

// ── Safe response body reader ─────────────────────────────────────────────
// Only invoked on failed responses. Caps memory by streaming and stopping
// once we have enough bytes for a 200-char snippet. Skips binary content
// types so we never decode PDFs, images, or octet-streams into strings.

const MAX_BODY_BYTES = 10 * 1024; // 10KB hard cap — never more than this is read.
const BINARY_CONTENT_TYPE_RE = /^(image|video|audio)\/|^application\/(octet-stream|pdf|zip|x-protobuf|x-msgpack|wasm|vnd\.)/i;

/**
 * Safely read up to ~RESPONSE_SNIPPET_CHARS of a response body.
 * - Skips binary content types.
 * - Reads via ReadableStream so we can stop early (memory-safe).
 * - Never throws — returns "" on any failure.
 */
async function readResponseBodySafe(response: Response): Promise<string> {
  try {
    const ct = response.headers.get("content-type") || "";
    if (BINARY_CONTENT_TYPE_RE.test(ct)) return "";

    if (!response.body || typeof (response.body as any).getReader !== "function") {
      // No streaming available — last-resort text() read.
      // (Truncate after the fact; we can't do better without streams.)
      try {
        const text = await response.text();
        return typeof text === "string" ? text.slice(0, RESPONSE_SNIPPET_CHARS) : "";
      } catch { return ""; }
    }

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let collected = "";
    let bytesRead = 0;

    while (bytesRead < MAX_BODY_BYTES && collected.length < RESPONSE_SNIPPET_CHARS) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        bytesRead += value.byteLength;
        collected += decoder.decode(value, { stream: true });
      }
    }
    try { await reader.cancel(); } catch {}

    return collected.slice(0, RESPONSE_SNIPPET_CHARS);
  } catch {
    return "";
  }
}

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

      // CSS selector for precise reproduction
      try { el.selector = buildSelector(t); } catch {}

      // Bounding box for visual reproduction
      try {
        const r = t.getBoundingClientRect();
        el.boundingBox = { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
      } catch {}

      emit("click", data);
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[TraceBug] Click capture error:', err);
    }
  };
  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

/**
 * Build a stable CSS selector for an element. Prefers id, then data-testid,
 * then walks up the tree using nth-of-type for uniqueness.
 * Capped at 4 levels deep to keep selectors readable.
 */
function buildSelector(el: HTMLElement | null): string {
  if (!el) return "";
  if (el.id) return `#${CSS.escape(el.id)}`;
  const testId = el.getAttribute("data-testid");
  if (testId) return `[data-testid="${testId}"]`;

  const parts: string[] = [];
  let node: HTMLElement | null = el;
  let depth = 0;
  while (node && node !== document.body && depth < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
    const cls = typeof node.className === "string" ? node.className.trim().split(/\s+/).filter(Boolean)[0] : "";
    if (cls) part += `.${CSS.escape(cls)}`;
    // Add :nth-of-type if there are siblings with the same tag
    const parent: HTMLElement | null = node.parentElement;
    const currentTag = node.tagName;
    const currentNode: HTMLElement = node;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c: Element) => c.tagName === currentTag);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(currentNode) + 1})`;
    }
    parts.unshift(part);
    node = parent;
    depth++;
  }
  return parts.join(" > ");
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

    // Redact sensitive query params before the URL touches events/reports.
    const safeUrl = sanitizeUrl(url).slice(0, 500);

    // ALWAYS call the original fetch — tracking failures must never break user requests
    try {
      const response = await originalFetch.call(window, input, init);
      try {
        emit("api_request", {
          request: { url: safeUrl, method: method.toUpperCase(), statusCode: response.status, durationMs: Date.now() - start },
        });
      } catch {} // tracking failure — swallow silently

      // Async body capture for failed responses — never awaited on the hot path.
      // readResponseBodySafe caps at 10KB and skips binary content types.
      try {
        if (response.status >= 400 || response.status === 0) {
          const clone = response.clone();
          // Fire-and-forget; body read runs after the caller already has the response
          readResponseBodySafe(clone).then((snippet) => {
            pushNetworkFailure({
              url: safeUrl,
              method: method.toUpperCase(),
              status: response.status,
              response: snippet,
              timestamp: Date.now(),
            });
          }).catch(() => {
            pushNetworkFailure({
              url: safeUrl,
              method: method.toUpperCase(),
              status: response.status,
              response: "",
              timestamp: Date.now(),
            });
          });
        }
      } catch {} // clone unsupported (e.g. already consumed) — swallow silently

      return response;
    } catch (err) {
      try {
        emit("api_request", {
          request: { url: safeUrl, method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start },
        });
      } catch {} // tracking failure — swallow silently

      try {
        pushNetworkFailure({
          url: safeUrl,
          method: method.toUpperCase(),
          status: 0,
          response: (err as Error)?.message?.slice(0, RESPONSE_SNIPPET_CHARS) || "",
          timestamp: Date.now(),
        });
      } catch {}

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

  OrigXHR.prototype.send = function (this: XMLHttpRequest, body?: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const xhr: XMLHttpRequest = this;
      const start = Date.now();
      const meta = xhrMeta.get(xhr);
      const method = meta?.method || "GET";
      const url = meta?.url || "";

      if (isInternalUrl(url)) return origSend.call(this, body);

      // Redact sensitive query params once, reuse for every handler below.
      const safeUrl = sanitizeUrl(url).slice(0, 500);

      xhr.addEventListener("loadend", function () {
        try { emit("api_request", { request: { url: safeUrl, method: method.toUpperCase(), statusCode: xhr.status, durationMs: Date.now() - start } }); } catch {}
        try {
          if (xhr.status >= 400 || xhr.status === 0) {
            // responseText throws for non-text responseTypes — guard it.
            // Also skip binary content-type so we never stringify blobs/PDFs.
            let body = "";
            try {
              const ct = (xhr.getResponseHeader && xhr.getResponseHeader("content-type")) || "";
              if (!BINARY_CONTENT_TYPE_RE.test(ct)) {
                body = typeof xhr.responseText === "string" ? xhr.responseText : "";
              }
            } catch {}
            // Hard cap via slice — responseText is already in memory, but we
            // never allocate more than RESPONSE_SNIPPET_CHARS for the buffer entry.
            pushNetworkFailure({
              url: safeUrl,
              method: method.toUpperCase(),
              status: xhr.status,
              response: body.slice(0, RESPONSE_SNIPPET_CHARS),
              timestamp: Date.now(),
            });
          }
        } catch {}
      });
      xhr.addEventListener("error", function () {
        try { emit("api_request", { request: { url: safeUrl, method: method.toUpperCase(), statusCode: 0, durationMs: Date.now() - start } }); } catch {}
        try {
          pushNetworkFailure({
            url: safeUrl,
            method: method.toUpperCase(),
            status: 0,
            response: "",
            timestamp: Date.now(),
          });
        } catch {}
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
