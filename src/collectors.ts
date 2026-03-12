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

    // Enrich with context depending on element type
    const el = data.element;

    // Links: capture href
    if (tag === "a") {
      el.href = (t as HTMLAnchorElement).href || "";
    }

    // Buttons: capture type and disabled state
    if (tag === "button" || (t as HTMLButtonElement).type === "submit") {
      el.buttonType = (t as HTMLButtonElement).type || "button";
      el.disabled = (t as HTMLButtonElement).disabled;
    }

    // If clicking on a label, capture the "for" attribute
    if (tag === "label") {
      el.forField = (t as HTMLLabelElement).htmlFor || "";
    }

    // Capture aria-label if present
    const ariaLabel = t.getAttribute("aria-label");
    if (ariaLabel) el.ariaLabel = ariaLabel;

    // Capture role if present
    const role = t.getAttribute("role");
    if (role) el.role = role;

    // Capture data-testid if present (common in React apps)
    const testId = t.getAttribute("data-testid");
    if (testId) el.testId = testId;

    // Closest form context
    const form = t.closest("form");
    if (form) {
      el.formId = form.id || "";
      el.formAction = form.action || "";
    }

    emit("click", data);
  };
  document.addEventListener("click", handler, { capture: true });
  return () => document.removeEventListener("click", handler, { capture: true });
}

// ── Inputs (debounced per element) ────────────────────────────────────────

export function collectInputs(emit: Emit): () => void {
  const timers = new Map<EventTarget, ReturnType<typeof setTimeout>>();

  const handler = (e: Event) => {
    const t = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (!t || !("value" in t) || isTraceBugElement(t)) return;

    // Skip selects — handled by collectSelectChanges
    if (t.tagName.toLowerCase() === "select") return;

    const prev = timers.get(t);
    if (prev) clearTimeout(prev);

    timers.set(
      t,
      setTimeout(() => {
        const tag = t.tagName.toLowerCase();
        const inputType = (t as HTMLInputElement).type || "";
        const isSensitive = ["password", "credit-card", "ssn"].includes(inputType) ||
          /password|secret|token|ssn|credit/i.test(t.name || t.id || "");

        const data: Record<string, any> = {
          element: {
            tag,
            name: t.name || t.id || "",
            type: inputType,
            valueLength: (t.value || "").length,
            value: isSensitive ? "[REDACTED]" : (t.value || "").slice(0, 200),
            placeholder: t.placeholder || "",
          },
        };

        // Checkbox / radio: capture checked state
        if (inputType === "checkbox" || inputType === "radio") {
          data.element.checked = (t as HTMLInputElement).checked;
          data.element.value = (t as HTMLInputElement).checked ? "checked" : "unchecked";
        }

        // Number inputs: capture as-is (not sensitive)
        if (inputType === "number" || inputType === "range") {
          data.element.value = t.value;
        }

        emit("input", data);
        timers.delete(t);
      }, 300)
    );
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
    const t = e.target as HTMLSelectElement;
    if (!t || t.tagName.toLowerCase() !== "select" || isTraceBugElement(t)) return;

    const selectedOption = t.options[t.selectedIndex];
    emit("select_change", {
      element: {
        tag: "select",
        name: t.name || t.id || "",
        value: t.value,
        selectedText: selectedOption ? selectedOption.text : "",
        selectedIndex: t.selectedIndex,
        optionCount: t.options.length,
        allOptions: Array.from(t.options).map(o => o.text).slice(0, 20),
      },
    });
  };

  document.addEventListener("change", handler, { capture: true });
  return () => document.removeEventListener("change", handler, { capture: true });
}

// ── Form submissions ─────────────────────────────────────────────────────

export function collectFormSubmits(emit: Emit): () => void {
  const handler = (e: Event) => {
    const form = e.target as HTMLFormElement;
    if (!form || form.tagName.toLowerCase() !== "form" || isTraceBugElement(form)) return;

    const formData: Record<string, string> = {};
    const elements = form.elements;
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i] as HTMLInputElement;
      if (!el.name) continue;
      const isSensitive = ["password"].includes(el.type) ||
        /password|secret|token|ssn|credit/i.test(el.name);
      if (el.type === "submit" || el.type === "button") continue;
      formData[el.name] = isSensitive ? "[REDACTED]" : (el.value || "").slice(0, 200);
    }

    emit("form_submit", {
      form: {
        id: form.id || "",
        action: form.action || "",
        method: form.method || "GET",
        fieldCount: elements.length,
        fields: formData,
      },
    });
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
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;
    const method = init?.method || "GET";
    const start = Date.now();

    // Skip internal framework requests
    if (isInternalUrl(url)) {
      return originalFetch.call(window, input, init);
    }

    try {
      const response = await originalFetch.call(window, input, init);
      emit("api_request", {
        request: {
          url: url.slice(0, 500),
          method: method.toUpperCase(),
          statusCode: response.status,
          durationMs: Date.now() - start,
        },
      });
      return response;
    } catch (err) {
      emit("api_request", {
        request: {
          url: url.slice(0, 500),
          method: method.toUpperCase(),
          statusCode: 0,
          durationMs: Date.now() - start,
        },
      });
      throw err;
    }
  };

  return () => {
    window.fetch = originalFetch;
  };
}

// ── XMLHttpRequest interception ───────────────────────────────────────────

export function collectXhrRequests(emit: Emit): () => void {
  const OrigXHR = window.XMLHttpRequest;
  const origOpen = OrigXHR.prototype.open;
  const origSend = OrigXHR.prototype.send;

  const xhrMeta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

  OrigXHR.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    xhrMeta.set(this, { method, url: typeof url === "string" ? url : url.toString() });
    return origOpen.apply(this, [method, url, ...rest] as any);
  };

  OrigXHR.prototype.send = function (body?: any) {
    const xhr = this;
    const start = Date.now();
    const meta = xhrMeta.get(xhr);
    const method = meta?.method || "GET";
    const url = meta?.url || "";

    // Skip internal framework requests
    if (isInternalUrl(url)) {
      return origSend.call(this, body);
    }

    xhr.addEventListener("loadend", function () {
      emit("api_request", {
        request: {
          url: url.slice(0, 500),
          method: method.toUpperCase(),
          statusCode: xhr.status,
          durationMs: Date.now() - start,
        },
      });
    });

    xhr.addEventListener("error", function () {
      emit("api_request", {
        request: {
          url: url.slice(0, 500),
          method: method.toUpperCase(),
          statusCode: 0,
          durationMs: Date.now() - start,
        },
      });
    });

    return origSend.call(this, body);
  };

  return () => {
    OrigXHR.prototype.open = origOpen;
    OrigXHR.prototype.send = origSend;
  };
}

// ── Errors (window.onerror + unhandledrejection + console.error) ──────────

export function collectErrors(emit: Emit): () => void {
  const prevOnError = window.onerror;

  window.onerror = (msg, source, line, col, error) => {
    emit("error", {
      error: {
        message: typeof msg === "string" ? msg : "Unknown error",
        stack: error?.stack,
        source,
        line,
        column: col,
      },
    });
    if (prevOnError) prevOnError(msg, source, line, col, error);
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    emit("unhandled_rejection", {
      error: {
        message: e.reason?.message || String(e.reason),
        stack: e.reason?.stack,
      },
    });
  };
  window.addEventListener("unhandledrejection", onRejection);

  const origConsoleError = console.error;
  let _insideEmit = false;
  console.error = function (...args: any[]) {
    // Guard against infinite loop: if emit() triggers console.error internally,
    // skip re-emitting to avoid recursion
    if (_insideEmit) {
      origConsoleError.apply(console, args);
      return;
    }
    _insideEmit = true;
    try {
      emit("console_error", {
        error: {
          message: args
            .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
            .join(" "),
        },
      });
    } finally {
      _insideEmit = false;
    }
    origConsoleError.apply(console, args);
  };

  return () => {
    window.onerror = prevOnError;
    window.removeEventListener("unhandledrejection", onRejection);
    console.error = origConsoleError;
  };
}
