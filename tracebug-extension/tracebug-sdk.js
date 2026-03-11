"use strict";
var TraceBugModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    buildReport: () => buildReport,
    buildTimeline: () => buildTimeline,
    captureEnvironment: () => captureEnvironment,
    captureScreenshot: () => captureScreenshot,
    clearAllSessions: () => clearAllSessions,
    default: () => src_default,
    deleteSession: () => deleteSession,
    downloadAllScreenshots: () => downloadAllScreenshots,
    downloadPdfAsHtml: () => downloadPdfAsHtml,
    formatTimelineText: () => formatTimelineText,
    generateBugTitle: () => generateBugTitle,
    generateFlowSummary: () => generateFlowSummary,
    generateGitHubIssue: () => generateGitHubIssue,
    generateJiraTicket: () => generateJiraTicket,
    generatePdfReport: () => generatePdfReport,
    generateReproSteps: () => generateReproSteps,
    getAllSessions: () => getAllSessions,
    getScreenshots: () => getScreenshots
  });

  // src/storage.ts
  var SESSIONS_KEY = "tracebug_sessions";
  function getSessionId() {
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "bt_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    return id;
  }
  function getAllSessions() {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
  function saveSessions(sessions) {
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
      if (sessions.length > 1) {
        sessions.shift();
        try {
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
        } catch (e2) {
        }
      }
    }
  }
  function appendEvent(sessionId, event, maxEvents, maxSessions) {
    let sessions = getAllSessions();
    let session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      session = {
        sessionId,
        projectId: event.projectId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        errorMessage: null,
        errorStack: null,
        reproSteps: null,
        errorSummary: null,
        events: [],
        annotations: [],
        environment: null
      };
      sessions.push(session);
    }
    session.events.push(event);
    session.updatedAt = Date.now();
    if (session.events.length > maxEvents) {
      session.events = session.events.slice(-maxEvents);
    }
    if (sessions.length > maxSessions) {
      sessions = sessions.slice(-maxSessions);
    }
    saveSessions(sessions);
  }
  function updateSessionError(sessionId, errorMessage, errorStack, reproSteps, errorSummary) {
    const sessions = getAllSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    session.errorMessage = errorMessage;
    session.errorStack = errorStack || null;
    session.reproSteps = reproSteps;
    session.errorSummary = errorSummary;
    session.updatedAt = Date.now();
    saveSessions(sessions);
  }
  function deleteSession(sessionId) {
    const sessions = getAllSessions().filter((s) => s.sessionId !== sessionId);
    saveSessions(sessions);
  }
  function addAnnotation(sessionId, annotation) {
    const sessions = getAllSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    if (!session.annotations) session.annotations = [];
    session.annotations.push(annotation);
    session.updatedAt = Date.now();
    saveSessions(sessions);
  }
  function saveEnvironment(sessionId, env) {
    const sessions = getAllSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) return;
    session.environment = env;
    saveSessions(sessions);
  }
  function clearAllSessions() {
    localStorage.removeItem(SESSIONS_KEY);
  }

  // src/repro-generator.ts
  function generateReproSteps(events, errorMessage, errorStack) {
    var _a, _b;
    const steps = [];
    let stepNum = 1;
    let currentPage = "";
    let lastStepText = "";
    for (const event of events) {
      switch (event.type) {
        case "route_change": {
          const to = event.data.to || event.page;
          const pageName = friendlyPageName(to);
          steps.push(`${stepNum++}. Navigate to ${pageName} (${to})`);
          currentPage = to;
          break;
        }
        case "click": {
          const el = event.data.element;
          const label = describeElement(el);
          const stepText = `Click ${label}`;
          if (stepText !== lastStepText) {
            steps.push(`${stepNum++}. ${stepText}`);
            lastStepText = stepText;
          }
          break;
        }
        case "input": {
          const inp = event.data.element;
          const fieldName = (inp == null ? void 0 : inp.name) || (inp == null ? void 0 : inp.id) || "field";
          const inputType = (inp == null ? void 0 : inp.type) || "text";
          if (inputType === "checkbox" || inputType === "radio") {
            steps.push(`${stepNum++}. ${(inp == null ? void 0 : inp.checked) ? "Check" : "Uncheck"} "${fieldName}"`);
          } else {
            const val = inp == null ? void 0 : inp.value;
            if (val && val !== "[REDACTED]" && val.length <= 60) {
              steps.push(`${stepNum++}. Type "${val}" in "${fieldName}" field`);
            } else {
              steps.push(
                `${stepNum++}. Type in "${fieldName}" field (${(inp == null ? void 0 : inp.valueLength) || 0} characters)`
              );
            }
          }
          break;
        }
        case "select_change": {
          const sel = event.data.element;
          const fieldName = (sel == null ? void 0 : sel.name) || (sel == null ? void 0 : sel.id) || "dropdown";
          const selectedText = (sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "unknown";
          steps.push(`${stepNum++}. Select "${selectedText}" from "${fieldName}" dropdown`);
          break;
        }
        case "form_submit": {
          const f = event.data.form;
          const formName = (f == null ? void 0 : f.id) || (f == null ? void 0 : f.action) || "form";
          const fieldCount = (f == null ? void 0 : f.fieldCount) || 0;
          steps.push(`${stepNum++}. Submit ${formName} form (${fieldCount} fields)`);
          break;
        }
        case "api_request": {
          const req = event.data.request;
          if ((req == null ? void 0 : req.statusCode) >= 400 || (req == null ? void 0 : req.statusCode) === 0) {
            steps.push(
              `${stepNum++}. API call fails: ${req.method} ${shortenUrl(req.url)} \u2192 ${req.statusCode === 0 ? "Network Error" : `HTTP ${req.statusCode}`}`
            );
          }
          break;
        }
        case "error":
        case "unhandled_rejection": {
          const errMsg = ((_a = event.data.error) == null ? void 0 : _a.message) || errorMessage;
          const stepText = `\u274C Error: "${errMsg}"`;
          if (stepText !== lastStepText) {
            steps.push(`${stepNum++}. ${stepText}`);
            lastStepText = stepText;
          }
          break;
        }
        case "console_error": {
          const msg = ((_b = event.data.error) == null ? void 0 : _b.message) || "";
          if (msg.length > 0 && !msg.includes("Warning:") && !msg.includes("DevTools")) {
            const stepText = `Console error: "${msg.slice(0, 120)}"`;
            if (stepText !== lastStepText) {
              steps.push(`${stepNum++}. ${stepText}`);
              lastStepText = stepText;
            }
          }
          break;
        }
      }
    }
    if (steps.length === 0) {
      steps.push("1. (No user interactions recorded before the error)");
    }
    const summary = buildErrorSummary(errorMessage, errorStack, events);
    return {
      reproSteps: steps.join("\n"),
      errorSummary: summary
    };
  }
  function describeElement(el) {
    if (!el) return "an element";
    const tag = el.tag || "";
    const rawText = (el.text || "").trim();
    const text = rawText.includes("\n") ? rawText.split("\n")[0].trim() : rawText;
    const id = el.id || "";
    const ariaLabel = el.ariaLabel || "";
    if (ariaLabel && ariaLabel.length < 50) {
      return `"${ariaLabel}" ${tag}`;
    }
    if (text && text.length < 50) {
      return `"${text}" ${tag}`;
    }
    if (id) {
      return `#${id} ${tag}`;
    }
    return `a ${tag} element`;
  }
  function friendlyPageName(path) {
    if (path === "/") return "Home page";
    const parts = path.split("/").filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1));
    return parts.join(" ") + " page";
  }
  function shortenUrl(url) {
    try {
      const u = new URL(url, window.location.origin);
      return u.pathname + (u.search ? "..." : "");
    } catch (e) {
      return url.slice(0, 60);
    }
  }
  function buildErrorSummary(errorMessage, errorStack, events) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const parts = [];
    parts.push(`Error: ${errorMessage}`);
    if (errorStack) {
      const match = errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
      if (match) {
        parts.push(`Thrown in: ${match[1]} at ${match[2]}`);
      }
    }
    const errorEvents = events.filter(
      (e) => e.type === "error" || e.type === "unhandled_rejection"
    );
    if (errorEvents.length > 0) {
      parts.push(`Page: ${errorEvents[0].page}`);
    }
    const userActions = events.filter(
      (e) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
    );
    if (userActions.length > 0) {
      const last = userActions[userActions.length - 1];
      if (last.type === "click") {
        parts.push(
          `Last action: clicked "${((_a = last.data.element) == null ? void 0 : _a.text) || ((_b = last.data.element) == null ? void 0 : _b.id) || "element"}"`
        );
      } else if (last.type === "input") {
        const val = (_c = last.data.element) == null ? void 0 : _c.value;
        if (val && val !== "[REDACTED]") {
          parts.push(`Last action: typed "${val}" in "${((_d = last.data.element) == null ? void 0 : _d.name) || "field"}"`);
        } else {
          parts.push(`Last action: typed in "${((_e = last.data.element) == null ? void 0 : _e.name) || "field"}"`);
        }
      } else if (last.type === "select_change") {
        parts.push(`Last action: selected "${(_f = last.data.element) == null ? void 0 : _f.selectedText}" from "${((_g = last.data.element) == null ? void 0 : _g.name) || "dropdown"}"`);
      } else if (last.type === "form_submit") {
        parts.push(`Last action: submitted form "${((_h = last.data.form) == null ? void 0 : _h.id) || ""}"`);
      }
    }
    return parts.join("\n");
  }

  // src/screenshot.ts
  var PANEL_ID = "tracebug-dashboard-panel";
  var BTN_ID = "tracebug-dashboard-btn";
  var screenshotCounter = 0;
  var screenshots = [];
  var html2canvasLoaded = null;
  function getScreenshots() {
    return [...screenshots];
  }
  function clearScreenshots() {
    screenshots.length = 0;
    screenshotCounter = 0;
  }
  async function captureScreenshot(lastEvent) {
    screenshotCounter++;
    const eventContext = lastEvent ? buildEventLabel(lastEvent) : "manual_capture";
    const filename = `${String(screenshotCounter).padStart(2, "0")}_${sanitizeFilename(eventContext)}.png`;
    const panel = document.getElementById(PANEL_ID);
    const btn = document.getElementById(BTN_ID);
    const root = document.getElementById("tracebug-root");
    if (root) root.style.display = "none";
    let dataUrl;
    let width = window.innerWidth;
    let height = window.innerHeight;
    try {
      const renderer = await getHtml2Canvas();
      if (renderer) {
        const canvas = await renderer(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 1,
          logging: false,
          width: window.innerWidth,
          height: window.innerHeight,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight
        });
        dataUrl = canvas.toDataURL("image/png", 0.8);
        width = canvas.width;
        height = canvas.height;
      } else {
        dataUrl = await captureViaCanvas();
      }
    } catch (e) {
      dataUrl = await captureViaCanvas();
    }
    if (root) root.style.display = "";
    const screenshot = {
      id: `ss_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      dataUrl,
      filename,
      eventContext,
      page: window.location.pathname,
      width,
      height
    };
    screenshots.push(screenshot);
    return screenshot;
  }
  async function getHtml2Canvas() {
    if (html2canvasLoaded) return html2canvasLoaded;
    if (typeof window.html2canvas === "function") {
      html2canvasLoaded = window.html2canvas;
      return html2canvasLoaded;
    }
    try {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      script.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load html2canvas"));
        document.head.appendChild(script);
      });
      if (typeof window.html2canvas === "function") {
        html2canvasLoaded = window.html2canvas;
        return html2canvasLoaded;
      }
    } catch (e) {
    }
    return null;
  }
  async function captureViaCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 200;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, 400, 200);
    ctx.fillStyle = "#e0e0e0";
    ctx.font = "14px monospace";
    ctx.fillText("Screenshot (html2canvas unavailable)", 20, 40);
    ctx.fillStyle = "#888";
    ctx.font = "12px monospace";
    ctx.fillText(`Page: ${window.location.pathname}`, 20, 70);
    ctx.fillText(`Time: ${(/* @__PURE__ */ new Date()).toLocaleTimeString()}`, 20, 90);
    ctx.fillText(`Viewport: ${window.innerWidth}x${window.innerHeight}`, 20, 110);
    return canvas.toDataURL("image/png");
  }
  function buildEventLabel(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    switch (event.type) {
      case "click": {
        const el = event.data.element;
        const target = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.ariaLabel) || (el == null ? void 0 : el.tag) || "element";
        return `click_${target}`;
      }
      case "input": {
        const name = ((_b = event.data.element) == null ? void 0 : _b.name) || ((_c = event.data.element) == null ? void 0 : _c.id) || "field";
        return `enter_${name}`;
      }
      case "select_change": {
        const name = ((_d = event.data.element) == null ? void 0 : _d.name) || "dropdown";
        const val = ((_e = event.data.element) == null ? void 0 : _e.selectedText) || "";
        return `select_${name}_${val}`;
      }
      case "form_submit":
        return `submit_${((_f = event.data.form) == null ? void 0 : _f.id) || "form"}`;
      case "route_change":
        return `navigate_${event.data.to || "page"}`;
      case "api_request":
        return `api_${(_g = event.data.request) == null ? void 0 : _g.method}_${(_h = event.data.request) == null ? void 0 : _h.statusCode}`;
      case "error":
      case "unhandled_rejection":
        return "error_occurred";
      default:
        return event.type;
    }
  }
  function downloadAllScreenshots() {
    for (const ss of screenshots) {
      downloadDataUrl(ss.dataUrl, ss.filename);
    }
  }
  function downloadDataUrl(dataUrl, filename) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  function sanitizeFilename(str) {
    return str.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
  }

  // src/environment.ts
  function captureEnvironment() {
    const ua = navigator.userAgent;
    const browser = detectBrowser(ua);
    const os = detectOS(ua);
    const deviceType = detectDeviceType();
    const connection = getConnectionType();
    return {
      browser: browser.name,
      browserVersion: browser.version,
      os,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      screenResolution: `${screen.width}x${screen.height}`,
      language: navigator.language || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "unknown",
      userAgent: ua,
      url: window.location.href,
      deviceType,
      connectionType: connection,
      timestamp: Date.now()
    };
  }
  function detectBrowser(ua) {
    const tests = [
      ["Edge", /Edg(?:e|A|iOS)?\/(\d+[\d.]*)/],
      ["Opera", /(?:OPR|Opera)\/(\d+[\d.]*)/],
      ["Chrome", /Chrome\/(\d+[\d.]*)/],
      ["Firefox", /Firefox\/(\d+[\d.]*)/],
      ["Safari", /Version\/(\d+[\d.]*).*Safari/],
      ["IE", /(?:MSIE |Trident.*rv:)(\d+[\d.]*)/]
    ];
    for (const [name, regex] of tests) {
      const match = ua.match(regex);
      if (match) return { name, version: match[1] };
    }
    return { name: "Unknown", version: "" };
  }
  function detectOS(ua) {
    var _a, _b, _c, _d, _e;
    if (/Windows NT 10/.test(ua)) return "Windows 10/11";
    if (/Windows NT/.test(ua)) return "Windows";
    if (/Mac OS X (\d+[._]\d+)/.test(ua)) {
      const ver = (_b = (_a = ua.match(/Mac OS X (\d+[._]\d+)/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.replace(/_/g, ".");
      return `macOS ${ver}`;
    }
    if (/CrOS/.test(ua)) return "Chrome OS";
    if (/Linux/.test(ua)) return "Linux";
    if (/Android (\d+[\d.]*)/.test(ua)) return `Android ${(_c = ua.match(/Android (\d+[\d.]*)/)) == null ? void 0 : _c[1]}`;
    if (/iPhone|iPad/.test(ua)) {
      const ver = (_e = (_d = ua.match(/OS (\d+_\d+)/)) == null ? void 0 : _d[1]) == null ? void 0 : _e.replace(/_/g, ".");
      return `iOS ${ver || ""}`;
    }
    return "Unknown OS";
  }
  function detectDeviceType() {
    const w = window.innerWidth;
    if (/Mobi|Android.*Mobile|iPhone/i.test(navigator.userAgent) || w < 768) return "mobile";
    if (/iPad|Android(?!.*Mobile)|Tablet/i.test(navigator.userAgent) || w >= 768 && w < 1024) return "tablet";
    return "desktop";
  }
  function getConnectionType() {
    const nav = navigator;
    if (nav.connection) {
      const c = nav.connection;
      return c.effectiveType || c.type || "unknown";
    }
    return "unknown";
  }

  // src/title-generator.ts
  function generateBugTitle(session) {
    var _a;
    const events = session.events;
    const errorEvents = events.filter((e) => e.type === "error" || e.type === "unhandled_rejection");
    const userActions = events.filter(
      (e) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
    );
    if (errorEvents.length === 0) {
      return generateFlowTitle(userActions, events);
    }
    const errorMsg = ((_a = errorEvents[0].data.error) == null ? void 0 : _a.message) || session.errorMessage || "Unknown error";
    const errorType = classifyError(errorMsg);
    const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
    const page = errorEvents[0].page || "";
    const context = getActionContext(lastAction);
    const pageName = friendlyPage(page);
    if (context && pageName) {
      return `${pageName}: ${context} Fails \u2014 ${errorType}`;
    }
    if (context) {
      return `${context} Fails Due to ${errorType}`;
    }
    if (pageName) {
      return `${errorType} on ${pageName}`;
    }
    return `${errorType}: ${truncate(errorMsg, 60)}`;
  }
  function generateFlowSummary(events) {
    const userActions = events.filter(
      (e) => ["click", "input", "select_change", "form_submit", "route_change"].includes(e.type)
    );
    if (userActions.length === 0) return "No user interactions recorded";
    const parts = [];
    for (const ev of userActions.slice(-5)) {
      parts.push(describeAction(ev));
    }
    return parts.join(" \u2192 ");
  }
  function generateFlowTitle(userActions, allEvents) {
    const failedApis = allEvents.filter(
      (e) => {
        var _a, _b;
        return e.type === "api_request" && (((_a = e.data.request) == null ? void 0 : _a.statusCode) >= 400 || ((_b = e.data.request) == null ? void 0 : _b.statusCode) === 0);
      }
    );
    if (failedApis.length > 0) {
      const api = failedApis[0].data.request;
      const lastAction = userActions.length > 0 ? userActions[userActions.length - 1] : null;
      const context = getActionContext(lastAction);
      return context ? `${context} \u2014 API ${api == null ? void 0 : api.method} Returns ${(api == null ? void 0 : api.statusCode) || "Network Error"}` : `API Failure: ${api == null ? void 0 : api.method} ${shortenUrl2(api == null ? void 0 : api.url)} Returns ${(api == null ? void 0 : api.statusCode) || "Network Error"}`;
    }
    if (userActions.length === 0) return "Empty Session \u2014 No User Interactions";
    const lastActions = userActions.slice(-3);
    const parts = lastActions.map((a) => describeAction(a));
    return `Session: ${parts.join(" \u2192 ")}`;
  }
  function getActionContext(event) {
    var _a, _b, _c, _d, _e, _f;
    if (!event) return "";
    switch (event.type) {
      case "click": {
        const el = event.data.element;
        const text = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.ariaLabel) || "";
        if (text && text.length < 40) return `"${text}" Action`;
        if (el == null ? void 0 : el.id) return `${capitalize(el.id.replace(/[-_]/g, " "))} Action`;
        return "Button Click";
      }
      case "input": {
        const name = ((_b = event.data.element) == null ? void 0 : _b.name) || ((_c = event.data.element) == null ? void 0 : _c.id) || "";
        return name ? `${capitalize(name.replace(/[-_]/g, " "))} Input` : "Form Input";
      }
      case "select_change": {
        const name = ((_d = event.data.element) == null ? void 0 : _d.name) || "";
        const value = ((_e = event.data.element) == null ? void 0 : _e.selectedText) || "";
        if (name && value) return `Setting ${capitalize(name)} to "${value}"`;
        return "Dropdown Selection";
      }
      case "form_submit": {
        const formId = ((_f = event.data.form) == null ? void 0 : _f.id) || "";
        return formId ? `${capitalize(formId.replace(/[-_]/g, " "))} Submission` : "Form Submission";
      }
      case "route_change":
        return `Navigation to ${friendlyPage(event.data.to || "")}`;
      default:
        return "";
    }
  }
  function describeAction(ev) {
    var _a, _b, _c, _d, _e;
    switch (ev.type) {
      case "click": {
        const text = ((_b = (_a = ev.data.element) == null ? void 0 : _a.text) == null ? void 0 : _b.trim()) || ((_c = ev.data.element) == null ? void 0 : _c.id) || "element";
        return `Click "${truncate(text, 20)}"`;
      }
      case "input":
        return `Type in "${((_d = ev.data.element) == null ? void 0 : _d.name) || "field"}"`;
      case "select_change":
        return `Select "${((_e = ev.data.element) == null ? void 0 : _e.selectedText) || "option"}"`;
      case "form_submit":
        return "Submit Form";
      case "route_change":
        return `Go to ${ev.data.to || "/"}`;
      default:
        return ev.type;
    }
  }
  function classifyError(msg) {
    const m = msg.toLowerCase();
    if (m.includes("typeerror") || m.includes("cannot read prop") || m.includes("is not a function"))
      return "TypeError";
    if (m.includes("referenceerror") || m.includes("is not defined"))
      return "ReferenceError";
    if (m.includes("syntaxerror"))
      return "SyntaxError";
    if (m.includes("rangeerror"))
      return "RangeError";
    if (m.includes("networkerror") || m.includes("failed to fetch") || m.includes("network"))
      return "Network Error";
    if (m.includes("timeout") || m.includes("timed out"))
      return "Timeout Error";
    if (m.includes("aborted"))
      return "Aborted Request";
    if (m.includes("permission") || m.includes("cors"))
      return "Permission Error";
    const typeMatch = msg.match(/^(\w+Error):/);
    if (typeMatch) return typeMatch[1];
    return "Runtime Error";
  }
  function friendlyPage(path) {
    if (!path || path === "/") return "Home Page";
    const parts = path.split("/").filter(Boolean);
    return parts.map((p) => capitalize(p)).join(" ") + " Page";
  }
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + "..." : str;
  }
  function shortenUrl2(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (e) {
      return url.slice(0, 40);
    }
  }

  // src/timeline-builder.ts
  function buildTimeline(events) {
    var _a, _b;
    if (events.length === 0) return [];
    const startTs = events[0].timestamp;
    const timeline = [];
    let lastDescription = "";
    for (const ev of events) {
      const elapsed = formatElapsed(ev.timestamp - startTs);
      const isError = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
      const isApiError = ev.type === "api_request" && (((_a = ev.data.request) == null ? void 0 : _a.statusCode) >= 400 || ((_b = ev.data.request) == null ? void 0 : _b.statusCode) === 0);
      const description = describeTimelineEvent(ev);
      const entryKey = `${ev.type}:${description}`;
      if (entryKey === lastDescription) continue;
      lastDescription = entryKey;
      timeline.push({
        timestamp: ev.timestamp,
        elapsed,
        type: ev.type,
        description,
        isError: isError || isApiError,
        page: ev.page
      });
    }
    return timeline;
  }
  function formatTimelineText(entries) {
    if (entries.length === 0) return "(empty session)";
    const lines = [];
    for (const entry of entries) {
      const marker = entry.isError ? "!!" : "  ";
      lines.push(`${entry.elapsed} ${marker} ${entry.type.padEnd(18)} ${entry.description}`);
    }
    return lines.join("\n");
  }
  function describeTimelineEvent(ev) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        let target = ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.ariaLabel) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        if (target.includes("\n")) target = target.split("\n")[0].trim();
        return `click "${target.slice(0, 50)}"`;
      }
      case "input": {
        const name = ((_b = ev.data.element) == null ? void 0 : _b.name) || ((_c = ev.data.element) == null ? void 0 : _c.id) || "field";
        const val = (_d = ev.data.element) == null ? void 0 : _d.value;
        if (val && val !== "[REDACTED]") return `input "${name}" = "${val.slice(0, 30)}"`;
        return `input "${name}"`;
      }
      case "select_change": {
        const name = ((_e = ev.data.element) == null ? void 0 : _e.name) || "dropdown";
        return `select "${name}" \u2192 "${((_f = ev.data.element) == null ? void 0 : _f.selectedText) || ""}"`;
      }
      case "form_submit": {
        const id = ((_g = ev.data.form) == null ? void 0 : _g.id) || "form";
        return `submit ${id} (${((_h = ev.data.form) == null ? void 0 : _h.fieldCount) || 0} fields)`;
      }
      case "route_change":
        return `${ev.data.from || "/"} \u2192 ${ev.data.to || "/"}`;
      case "api_request": {
        const r = ev.data.request;
        const status = (r == null ? void 0 : r.statusCode) === 0 ? "NETWORK_ERR" : String(r == null ? void 0 : r.statusCode);
        return `${r == null ? void 0 : r.method} ${shortenUrl3(r == null ? void 0 : r.url)} \u2192 ${status} (${r == null ? void 0 : r.durationMs}ms)`;
      }
      case "error":
      case "unhandled_rejection":
        return ((_i = ev.data.error) == null ? void 0 : _i.message) || "Unknown error";
      case "console_error":
        return (((_j = ev.data.error) == null ? void 0 : _j.message) || "").slice(0, 80);
      default:
        return JSON.stringify(ev.data).slice(0, 60);
    }
  }
  function formatElapsed(ms) {
    const totalSeconds = Math.floor(ms / 1e3);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor(ms % 1e3 / 10);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(2, "0")}`;
  }
  function shortenUrl3(url) {
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).pathname.slice(0, 40);
    } catch (e) {
      return (url || "").slice(0, 40);
    }
  }

  // src/report-builder.ts
  function buildReport(session, extraScreenshots) {
    const environment = session.environment || captureEnvironment();
    let steps = session.reproSteps || "";
    if (!steps && session.events.length > 0) {
      const errorMsg = session.errorMessage || "Issue reported by tester";
      const result = generateReproSteps(session.events, errorMsg, session.errorStack || void 0);
      steps = result.reproSteps;
    }
    const seenErrors = /* @__PURE__ */ new Set();
    const consoleErrors = session.events.filter((e) => ["error", "unhandled_rejection", "console_error"].includes(e.type)).map((e) => {
      var _a, _b;
      return {
        message: ((_a = e.data.error) == null ? void 0 : _a.message) || "",
        stack: (_b = e.data.error) == null ? void 0 : _b.stack,
        timestamp: e.timestamp
      };
    }).filter((e) => {
      if (seenErrors.has(e.message)) return false;
      seenErrors.add(e.message);
      return true;
    });
    const networkErrors = session.events.filter((e) => {
      var _a, _b;
      return e.type === "api_request" && (((_a = e.data.request) == null ? void 0 : _a.statusCode) >= 400 || ((_b = e.data.request) == null ? void 0 : _b.statusCode) === 0);
    }).map((e) => {
      var _a, _b, _c, _d;
      return {
        method: ((_a = e.data.request) == null ? void 0 : _a.method) || "GET",
        url: ((_b = e.data.request) == null ? void 0 : _b.url) || "",
        status: ((_c = e.data.request) == null ? void 0 : _c.statusCode) || 0,
        duration: ((_d = e.data.request) == null ? void 0 : _d.durationMs) || 0,
        timestamp: e.timestamp
      };
    });
    const screenshots2 = [...getScreenshots(), ...extraScreenshots || []];
    const timeline = buildTimeline(session.events);
    const title = generateBugTitle(session);
    return {
      title,
      steps,
      environment,
      consoleErrors,
      networkErrors,
      annotations: session.annotations || [],
      screenshots: screenshots2,
      timeline,
      session,
      generatedAt: Date.now()
    };
  }

  // src/github-issue.ts
  function generateGitHubIssue(report) {
    const env = report.environment;
    let md = `## ${report.title}

`;
    md += `**Environment:** ${env.browser} ${env.browserVersion} \xB7 ${env.os} \xB7 ${env.viewport} \xB7 ${env.deviceType}
`;
    md += `**URL:** ${env.url}

`;
    md += `### Steps to Reproduce

`;
    if (report.steps) {
      md += `${report.steps}

`;
    } else {
      md += `_No steps recorded_

`;
    }
    if (report.annotations.length > 0) {
      md += `### Tester Notes

`;
      for (const note of report.annotations) {
        md += `- **[${note.severity.toUpperCase()}]** ${note.text}
`;
        if (note.expected) md += `  - **Expected:** ${note.expected}
`;
        if (note.actual) md += `  - **Actual:** ${note.actual}
`;
      }
      md += `
`;
    }
    const hasTesterResult = report.annotations.some((a) => a.actual);
    if (!hasTesterResult && report.consoleErrors.length > 0) {
      md += `### Error

`;
      md += `\`${report.consoleErrors[0].message}\`

`;
    }
    if (report.consoleErrors.length > 0) {
      md += `### Console Errors

`;
      md += `\`\`\`
`;
      for (const err of report.consoleErrors.slice(0, 3)) {
        md += `${err.message}
`;
        if (err.stack) {
          const stackLines = err.stack.split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3);
          if (stackLines.length > 0) md += `${stackLines.join("\n")}
`;
        }
      }
      md += `\`\`\`

`;
    }
    if (report.networkErrors.length > 0) {
      md += `### Failed Requests

`;
      md += `| Method | URL | Status | Duration |
`;
      md += `|--------|-----|--------|----------|
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : `${req.status}`;
        const url = req.url.length > 60 ? req.url.slice(0, 57) + "..." : req.url;
        md += `| ${req.method} | \`${url}\` | ${status} | ${req.duration}ms |
`;
      }
      md += `
`;
    }
    if (report.screenshots.length > 0) {
      md += `### Screenshots

`;
      md += `> Drag and drop the downloaded screenshot files below:

`;
      for (const ss of report.screenshots) {
        md += `- \`${ss.filename}\`
`;
      }
      md += `
`;
    }
    const significantTimeline = report.timeline.filter(
      (e) => e.type !== "api_request" || e.isError
    );
    if (significantTimeline.length > 0) {
      md += `<details>
<summary>Session Timeline (${significantTimeline.length} events)</summary>

`;
      md += `\`\`\`
`;
      md += formatTimelineText(significantTimeline);
      md += `
\`\`\`

`;
      md += `</details>

`;
    }
    md += `---
`;
    md += `_[TraceBug SDK](https://www.npmjs.com/package/tracebug-sdk) \xB7 Session: \`${report.session.sessionId.slice(0, 8)}\`_
`;
    return md;
  }

  // src/jira-issue.ts
  function generateJiraTicket(report) {
    const env = report.environment;
    const priority = determinePriority(report);
    const labels = ["tracebug", "bug"];
    if (report.consoleErrors.length > 0) labels.push("has-errors");
    if (report.networkErrors.length > 0) labels.push("api-failure");
    const envStr = `${env.browser} ${env.browserVersion} / ${env.os} / ${env.viewport} / ${env.deviceType}`;
    let desc = "";
    desc += `h3. Steps to Reproduce
`;
    if (report.steps) {
      desc += `{noformat}
${report.steps}
{noformat}

`;
    }
    if (report.annotations.length > 0) {
      desc += `h3. Tester Notes
`;
      for (const note of report.annotations) {
        desc += `* *[${note.severity.toUpperCase()}]* ${note.text}
`;
        if (note.expected) desc += `** *Expected:* ${note.expected}
`;
        if (note.actual) desc += `** *Actual:* ${note.actual}
`;
      }
      desc += `
`;
    }
    const hasTesterResult = report.annotations.some((a) => a.actual);
    if (!hasTesterResult && report.consoleErrors.length > 0) {
      desc += `h3. Actual Result
Application throws error:
{code}${report.consoleErrors[0].message}{code}

`;
    }
    if (report.consoleErrors.length > 0) {
      desc += `h3. Console Errors
{code}
`;
      for (const err of report.consoleErrors.slice(0, 3)) {
        desc += `${err.message}
`;
        if (err.stack) {
          const stackLines = err.stack.split("\n").filter((l) => l.trim().startsWith("at ")).slice(0, 3);
          if (stackLines.length > 0) desc += `${stackLines.join("\n")}
`;
        }
      }
      desc += `{code}

`;
    }
    if (report.networkErrors.length > 0) {
      desc += `h3. Failed Requests
`;
      desc += `||Method||URL||Status||Duration||
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        desc += `|${req.method}|${req.url.slice(0, 80)}|${status}|${req.duration}ms|
`;
      }
      desc += `
`;
    }
    if (report.screenshots.length > 0) {
      desc += `h3. Screenshots
`;
      desc += `_Attach the downloaded screenshot files:_
`;
      for (const ss of report.screenshots) {
        desc += `* !${ss.filename}|thumbnail!
`;
      }
      desc += `
`;
    }
    const significantTimeline = report.timeline.filter(
      (e) => e.type !== "api_request" || e.isError
    );
    if (significantTimeline.length > 0) {
      desc += `h3. Session Timeline
{code}
`;
      desc += formatTimelineText(significantTimeline);
      desc += `
{code}

`;
    }
    desc += `h3. Environment
`;
    desc += `* *Browser:* ${env.browser} ${env.browserVersion}
`;
    desc += `* *OS:* ${env.os}
`;
    desc += `* *Viewport:* ${env.viewport}
`;
    desc += `* *Device:* ${env.deviceType}
`;
    desc += `* *URL:* ${env.url}

`;
    desc += `----
_Generated by TraceBug SDK \xB7 Session: ${report.session.sessionId.slice(0, 8)}_
`;
    return {
      summary: report.title,
      description: desc,
      environment: envStr,
      stepsToReproduce: report.steps || "",
      priority,
      labels
    };
  }
  function determinePriority(report) {
    const hasCriticalError = report.consoleErrors.some(
      (e) => /TypeError|ReferenceError|SyntaxError/i.test(e.message)
    );
    if (hasCriticalError) return "Highest";
    const hasServerError = report.networkErrors.some((r) => r.status >= 500);
    if (hasServerError) return "High";
    if (report.networkErrors.length > 0) return "Medium";
    if (report.consoleErrors.length > 0) return "Low";
    if (report.annotations.some((a) => a.severity === "critical" || a.severity === "major")) return "Medium";
    return "Low";
  }

  // src/pdf-generator.ts
  function generatePdfReport(report) {
    const html = buildPdfHtml(report);
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 300);
    };
  }
  function downloadPdfAsHtml(report) {
    const html = buildPdfHtml(report);
    downloadAsHtml(html, `tracebug-report-${report.session.sessionId.slice(0, 8)}.html`);
  }
  function buildPdfHtml(report) {
    const env = report.environment;
    const session = report.session;
    const hasError = report.consoleErrors.length > 0;
    let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>TraceBug Report \u2014 ${escapeHtml(report.title)}</title>
<style>
  @page { margin: 20mm 15mm; size: A4; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a2e; line-height: 1.5; padding: 24px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 20px; color: #0f0f1a; margin-bottom: 4px; border-bottom: 2px solid #ef4444; padding-bottom: 8px; }
  h2 { font-size: 15px; color: #1a1a2e; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e0e0e0; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .badge { display: inline-block; font-size: 10px; padding: 2px 8px; border-radius: 4px; font-weight: 600; }
  .badge-error { background: #fee2e2; color: #dc2626; }
  .badge-success { background: #dcfce7; color: #16a34a; }
  .badge-warn { background: #fef3c7; color: #d97706; }
  .env-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin: 12px 0; }
  .env-item { background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; }
  .env-label { font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
  .env-value { font-size: 13px; color: #1a1a2e; margin-top: 2px; }
  .steps { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .steps pre { white-space: pre-wrap; font-size: 12px; line-height: 1.8; font-family: inherit; }
  .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .error-msg { color: #dc2626; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
  .stack { font-family: monospace; font-size: 10px; color: #666; white-space: pre-wrap; max-height: 150px; overflow: auto; background: #fff5f5; padding: 8px; border-radius: 4px; margin-top: 6px; }
  .network-table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
  .network-table th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e2e8f0; }
  .network-table td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  .network-table tr.error td { background: #fef2f2; }
  .timeline { margin: 12px 0; }
  .timeline-item { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid #f8f9fa; font-size: 11px; }
  .timeline-time { color: #888; font-family: monospace; min-width: 70px; }
  .timeline-type { min-width: 90px; font-weight: 600; }
  .timeline-desc { color: #444; flex: 1; }
  .timeline-item.error { background: #fef2f2; }
  .timeline-item.error .timeline-type { color: #dc2626; }
  .annotation { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 10px; margin: 6px 0; }
  .annotation-severity { font-size: 9px; font-weight: 700; text-transform: uppercase; }
  .screenshot-list { margin: 8px 0; }
  .screenshot-item { margin: 12px 0; }
  .screenshot-item img { max-width: 100%; border: 1px solid #e0e0e0; border-radius: 6px; }
  .screenshot-label { font-size: 10px; color: #888; margin-top: 4px; }
  .footer { text-align: center; color: #888; font-size: 10px; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e0e0e0; }
  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
  .print-btn:hover { background: #2563eb; }
</style></head><body>`;
    html += `<button class="print-btn no-print" onclick="window.print()">Save as PDF</button>
`;
    html += `<h1>TraceBug Bug Report</h1>
`;
    html += `<div class="meta">${escapeHtml(report.title)} \xB7 ${new Date(report.generatedAt).toLocaleString()}</div>
`;
    html += `<h2>Environment</h2>
`;
    html += `<div class="env-grid">
    <div class="env-item"><div class="env-label">Browser</div><div class="env-value">${escapeHtml(env.browser)} ${escapeHtml(env.browserVersion)}</div></div>
    <div class="env-item"><div class="env-label">OS</div><div class="env-value">${escapeHtml(env.os)}</div></div>
    <div class="env-item"><div class="env-label">Viewport</div><div class="env-value">${escapeHtml(env.viewport)}</div></div>
    <div class="env-item"><div class="env-label">Device</div><div class="env-value">${env.deviceType}</div></div>
    <div class="env-item"><div class="env-label">Connection</div><div class="env-value">${escapeHtml(env.connectionType)}</div></div>
    <div class="env-item"><div class="env-label">URL</div><div class="env-value" style="word-break:break-all;font-size:10px">${escapeHtml(env.url)}</div></div>
  </div>
`;
    html += `<h2>Steps to Reproduce</h2>
`;
    if (report.steps) {
      html += `<div class="steps"><pre>${escapeHtml(report.steps)}</pre></div>
`;
    } else {
      html += `<p style="color:#888">No steps recorded</p>
`;
    }
    if (report.annotations.length > 0) {
      html += `<h2>Tester Notes</h2>
`;
      for (const note of report.annotations) {
        const severityColor = note.severity === "critical" ? "#dc2626" : note.severity === "major" ? "#d97706" : note.severity === "minor" ? "#2563eb" : "#666";
        html += `<div class="annotation">
        <span class="annotation-severity" style="color:${severityColor}">${note.severity}</span>
        <div style="margin-top:4px">${escapeHtml(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px"><strong>Expected:</strong> ${escapeHtml(note.expected)}</div>` : ""}
        ${note.actual ? `<div style="margin-top:2px"><strong>Actual:</strong> ${escapeHtml(note.actual)}</div>` : ""}
      </div>
`;
      }
    }
    if (report.consoleErrors.length > 0) {
      html += `<h2>Console Errors <span class="badge badge-error">${report.consoleErrors.length}</span></h2>
`;
      for (const err of report.consoleErrors) {
        html += `<div class="error-box">
        <div class="error-msg">${escapeHtml(err.message)}</div>
        ${err.stack ? `<div class="stack">${escapeHtml(err.stack)}</div>` : ""}
      </div>
`;
      }
    }
    if (report.networkErrors.length > 0) {
      html += `<h2>Failed Network Requests <span class="badge badge-error">${report.networkErrors.length}</span></h2>
`;
      html += `<table class="network-table">
      <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead>
      <tbody>
`;
      for (const req of report.networkErrors) {
        const status = req.status === 0 ? "Network Error" : String(req.status);
        html += `<tr class="error"><td>${req.method}</td><td style="word-break:break-all">${escapeHtml(req.url.slice(0, 80))}</td><td>${status}</td><td>${req.duration}ms</td></tr>
`;
      }
      html += `</tbody></table>
`;
    }
    if (report.screenshots.length > 0) {
      html += `<h2>Screenshots</h2>
<div class="screenshot-list">
`;
      for (const ss of report.screenshots) {
        html += `<div class="screenshot-item">
        <div class="screenshot-label">${escapeHtml(ss.filename)} \u2014 ${escapeHtml(ss.eventContext)}</div>
        <img src="${ss.dataUrl}" alt="${escapeHtml(ss.filename)}" />
      </div>
`;
      }
      html += `</div>
`;
    }
    if (report.timeline.length > 0) {
      html += `<h2>Session Timeline (${report.timeline.length} events)</h2>
<div class="timeline">
`;
      for (const entry of report.timeline) {
        const errClass = entry.isError ? " error" : "";
        html += `<div class="timeline-item${errClass}">
        <span class="timeline-time">${escapeHtml(entry.elapsed)}</span>
        <span class="timeline-type">${escapeHtml(entry.type)}</span>
        <span class="timeline-desc">${escapeHtml(entry.description)}</span>
      </div>
`;
      }
      html += `</div>
`;
    }
    html += `<div class="footer">Generated by TraceBug SDK \xB7 Session: ${session.sessionId.slice(0, 8)} \xB7 ${new Date(report.generatedAt).toLocaleString()}</div>
`;
    html += `</body></html>`;
    return html;
  }
  function downloadAsHtml(html, filename) {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // src/dashboard.ts
  var PANEL_ID2 = "tracebug-dashboard-panel";
  var BTN_ID2 = "tracebug-dashboard-btn";
  var _isRecording = true;
  var _onToggleRecording = null;
  function setRecordingState(isRecording, onToggle) {
    _isRecording = isRecording;
    _onToggleRecording = onToggle;
  }
  function updateRecordingState(isRecording) {
    _isRecording = isRecording;
    const indicator = document.getElementById("bt-rec-indicator");
    if (indicator) {
      indicator.style.background = isRecording ? "#22c55e" : "#ef4444";
      indicator.title = isRecording ? "Recording" : "Paused";
    }
    const recBtn = document.getElementById("bt-rec-toggle");
    if (recBtn) {
      recBtn.textContent = isRecording ? "\u23F8 Pause" : "\u25B6 Record";
      recBtn.style.color = isRecording ? "#fbbf24" : "#22c55e";
      recBtn.style.borderColor = isRecording ? "#fbbf2444" : "#22c55e44";
      recBtn.style.background = isRecording ? "#fbbf2422" : "#22c55e22";
    }
  }
  function mountDashboard() {
    if (document.getElementById(BTN_ID2)) return () => {
    };
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
    #${BTN_ID2} {
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
    #${BTN_ID2}:hover {
      transform: scale(1.1) !important;
    }
    #${BTN_ID2}.bt-panel-open {
      right: 484px !important;
    }
    #${PANEL_ID2} {
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
    const root = document.createElement("div");
    root.id = "tracebug-root";
    const btn = document.createElement("button");
    btn.id = BTN_ID2;
    btn.innerHTML = "\u{1F41B}";
    btn.title = "TraceBug AI Dashboard";
    const panel = document.createElement("div");
    panel.id = PANEL_ID2;
    panel.style.right = "-480px";
    let isOpen = false;
    btn.onclick = () => {
      isOpen = !isOpen;
      panel.style.right = isOpen ? "0" : "-480px";
      btn.innerHTML = isOpen ? "\u2715" : "\u{1F41B}";
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
    const keyHandler = async (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
        const currentSession = sessions[0];
        const lastEvent = (currentSession == null ? void 0 : currentSession.events[currentSession.events.length - 1]) || null;
        showToast("\u{1F4F8} Capturing screenshot...", root);
        try {
          const ss = await captureScreenshot(lastEvent);
          showToast(`\u2713 Screenshot: ${ss.filename}`, root);
          showAnnotationEditor(ss, root);
        } catch (e2) {
          showToast("\u2717 Screenshot failed", root);
        }
      }
    };
    document.addEventListener("keydown", keyHandler);
    return () => {
      root.remove();
      style.remove();
      document.removeEventListener("keydown", keyHandler);
    };
  }
  function renderPanel(panel) {
    const sessions = getAllSessions().sort((a, b) => b.updatedAt - a.updatedAt);
    const errorSessions = sessions.filter((s) => s.errorMessage);
    const allSessions = sessions;
    panel.innerHTML = `
    <div style="padding:16px 20px;border-bottom:1px solid #2a2a3e;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
      <div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="font-size:16px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">\u{1F41B} TraceBug AI</div>
          <div id="bt-rec-indicator" style="width:8px;height:8px;border-radius:50%;background:${_isRecording ? "#22c55e" : "#ef4444"};animation:${_isRecording ? "bt-pulse 2s infinite" : "none"}" title="${_isRecording ? "Recording" : "Paused"}"></div>
        </div>
        <div style="font-size:11px;color:#666;margin-top:2px">${errorSessions.length} error${errorSessions.length !== 1 ? "s" : ""} \xB7 ${allSessions.length} session${allSessions.length !== 1 ? "s" : ""}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button id="bt-rec-toggle" style="${smallBtnStyle(_isRecording ? "#fbbf24" : "#22c55e")}font-size:10px">${_isRecording ? "\u23F8 Pause" : "\u25B6 Record"}</button>
        <button id="bt-refresh" style="${smallBtnStyle("#3b82f6")}font-size:10px">\u21BB</button>
        <button id="bt-clear" style="${smallBtnStyle("#ef4444")}font-size:10px">Clear</button>
      </div>
    </div>
    <style>@keyframes bt-pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }</style>
    <div id="bt-content" style="flex:1;overflow-y:auto;padding:12px 16px"></div>
  `;
    const content = panel.querySelector("#bt-content");
    panel.querySelector("#bt-refresh").addEventListener("click", () => renderPanel(panel));
    panel.querySelector("#bt-clear").addEventListener("click", () => {
      if (confirm("Delete all TraceBug sessions?")) {
        clearAllSessions();
        renderPanel(panel);
      }
    });
    panel.querySelector("#bt-rec-toggle").addEventListener("click", () => {
      if (_onToggleRecording) _onToggleRecording();
    });
    if (allSessions.length === 0) {
      content.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:#555">
        <div style="font-size:36px;margin-bottom:12px">\u{1F50D}</div>
        <div style="font-family:system-ui,sans-serif">No sessions recorded yet.</div>
        <div style="font-size:11px;margin-top:8px;color:#444">Interact with the app to start capturing events.</div>
      </div>
    `;
      return;
    }
    content.innerHTML = "";
    for (const session of allSessions) {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #2a2a3e;border-radius:8px;padding:12px;margin-bottom:10px;cursor:pointer;transition:border-color 0.2s";
      card.onmouseenter = () => card.style.borderColor = "#4a4a6e";
      card.onmouseleave = () => card.style.borderColor = "#2a2a3e";
      const hasError = !!session.errorMessage;
      const dot = hasError ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px"></span>' : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;margin-right:6px"></span>';
      const badge = session.reproSteps ? '<span style="font-size:10px;background:#14532d;color:#4ade80;padding:2px 6px;border-radius:4px;margin-left:6px">Repro Ready</span>' : "";
      card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center">
          ${dot}
          <span style="color:#888;font-size:11px">${session.sessionId.slice(0, 12)}\u2026</span>
          ${badge}
        </div>
        <span style="color:#555;font-size:10px">${timeAgo(session.updatedAt)}</span>
      </div>
      ${hasError ? `<div style="color:#f87171;font-size:12px;margin-top:6px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml2(session.errorMessage)}</div>` : ""}
      <div style="color:#555;font-size:11px;margin-top:4px">${session.events.length} events</div>
    `;
      card.onclick = () => renderSessionDetail(panel, session);
      content.appendChild(card);
    }
  }
  function renderSessionDetail(panel, session) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
    const content = panel.querySelector("#bt-content");
    const s = session;
    const problems = [];
    const apiEvents = s.events.filter((e) => e.type === "api_request");
    const errorEvents = s.events.filter((e) => ["error", "unhandled_rejection"].includes(e.type));
    const consoleErrors = s.events.filter((e) => e.type === "console_error");
    const failedApis = apiEvents.filter((e) => {
      var _a2, _b2;
      return ((_a2 = e.data.request) == null ? void 0 : _a2.statusCode) >= 400 || ((_b2 = e.data.request) == null ? void 0 : _b2.statusCode) === 0;
    });
    const slowApis = apiEvents.filter((e) => {
      var _a2;
      return ((_a2 = e.data.request) == null ? void 0 : _a2.durationMs) > 3e3;
    });
    for (const ev of errorEvents) {
      const errType = getErrorType(((_a = ev.data.error) == null ? void 0 : _a.message) || "");
      problems.push({ severity: "critical", icon: "\u{1F4A5}", title: `${errType.type}: Runtime Exception`, detail: ((_b = ev.data.error) == null ? void 0 : _b.message) || "Unknown error", color: "#ef4444" });
    }
    for (const ev of failedApis) {
      const r = ev.data.request;
      const code = (r == null ? void 0 : r.statusCode) || 0;
      const severity = code >= 500 || code === 0 ? "critical" : "warning";
      problems.push({ severity, icon: code === 0 ? "\u{1F50C}" : "\u{1F6AB}", title: `HTTP ${code} \u2014 ${getStatusLabel(code)}`, detail: `${r == null ? void 0 : r.method} ${(_c = r == null ? void 0 : r.url) == null ? void 0 : _c.slice(0, 80)}`, color: getStatusColor(code) });
    }
    for (const ev of slowApis) {
      const r = ev.data.request;
      if (!failedApis.includes(ev)) {
        problems.push({ severity: "warning", icon: "\u{1F40C}", title: `Slow Response \u2014 ${formatDuration(r == null ? void 0 : r.durationMs)}`, detail: `${r == null ? void 0 : r.method} ${(_d = r == null ? void 0 : r.url) == null ? void 0 : _d.slice(0, 80)}`, color: "#f97316" });
      }
    }
    for (const ev of consoleErrors) {
      const msg = ((_e = ev.data.error) == null ? void 0 : _e.message) || "";
      if (!msg.includes("Warning:") && !msg.includes("ReactDOM")) {
        problems.push({ severity: "info", icon: "\u26A0\uFE0F", title: "Console Error", detail: msg.slice(0, 120), color: "#fb923c" });
      }
    }
    const firstTs = s.events.length > 0 ? s.events[0].timestamp : s.createdAt;
    const lastTs = s.events.length > 0 ? s.events[s.events.length - 1].timestamp : s.createdAt;
    const sessionDur = lastTs - firstTs;
    const avgApiTime = apiEvents.length > 0 ? Math.round(apiEvents.reduce((sum, e) => {
      var _a2;
      return sum + (((_a2 = e.data.request) == null ? void 0 : _a2.durationMs) || 0);
    }, 0) / apiEvents.length) : 0;
    const maxApiTime = apiEvents.length > 0 ? Math.max(...apiEvents.map((e) => {
      var _a2;
      return ((_a2 = e.data.request) == null ? void 0 : _a2.durationMs) || 0;
    })) : 0;
    const pagesVisited = new Set(s.events.map((e) => e.page)).size;
    let html = "";
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <button id="bt-back" style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:12px;padding:0;font-family:inherit">\u2190 Back to sessions</button>
    <div style="display:flex;gap:6px">
      <button id="bt-download-json" style="${smallBtnStyle("#22d3ee")}font-size:10px" title="Download as JSON">\u2B07 JSON</button>
      <button id="bt-download-txt" style="${smallBtnStyle("#a78bfa")}font-size:10px" title="Download as text report">\u2B07 Report</button>
      <button id="bt-download-html" style="${smallBtnStyle("#f472b6")}font-size:10px" title="Download visual HTML report">\u2B07 HTML</button>
    </div>
  </div>`;
    html += `<div style="background:#0c1222;border:1px solid #1e3a5f;border-radius:10px;padding:10px;margin-bottom:14px">
    <div style="font-size:10px;color:#60a5fa;font-weight:700;margin-bottom:8px;font-family:system-ui,sans-serif">QA TOOLS</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button id="bt-screenshot" style="${smallBtnStyle("#22d3ee")}font-size:10px">\u{1F4F8} Screenshot</button>
      <button id="bt-add-note" style="${smallBtnStyle("#a78bfa")}font-size:10px">\u{1F4DD} Add Note</button>
      <button id="bt-github-issue" style="${smallBtnStyle("#e0e0e0")}font-size:10px">\u{1F419} GitHub Issue</button>
      <button id="bt-jira-ticket" style="${smallBtnStyle("#2684FF")}font-size:10px">\u{1F3AB} Jira Ticket</button>
      <button id="bt-download-pdf" style="${smallBtnStyle("#f472b6")}font-size:10px">\u{1F4C4} PDF Report</button>
    </div>
  </div>`;
    html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">Session Overview</div>
      <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${problems.some((p) => p.severity === "critical") ? "#7f1d1d" : problems.length > 0 ? "#78350f" : "#14532d"};color:${problems.some((p) => p.severity === "critical") ? "#fca5a5" : problems.length > 0 ? "#fbbf24" : "#4ade80"};font-family:system-ui,sans-serif">${problems.some((p) => p.severity === "critical") ? "Has Errors" : problems.length > 0 ? "Has Warnings" : "Healthy"}</span>
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
      <span style="font-size:10px;color:#555">ID: ${s.sessionId.slice(0, 8)}\u2026</span>
      <span style="font-size:10px;color:#444">\xB7</span>
      <span style="font-size:10px;color:#555">${new Date(s.createdAt).toLocaleString()}</span>
    </div>
  </div>`;
    if (problems.length > 0) {
      const criticalCount = problems.filter((p) => p.severity === "critical").length;
      const warningCount = problems.filter((p) => p.severity === "warning").length;
      const infoCount = problems.filter((p) => p.severity === "info").length;
      html += `<div style="border:1px solid ${criticalCount > 0 ? "#7f1d1d" : "#78350f"};background:${criticalCount > 0 ? "#1a0505" : "#1a1005"};border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:13px;font-weight:700;color:${criticalCount > 0 ? "#fca5a5" : "#fbbf24"};font-family:system-ui,sans-serif">\u{1F50D} Problems Detected (${problems.length})</div>
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
          <span style="font-size:11px;font-weight:600;color:${p.color};font-family:system-ui,sans-serif">${escapeHtml2(p.title)}</span>
        </div>
        <div style="color:#888;font-size:11px;line-height:1.4;padding-left:22px;word-break:break-word">${escapeHtml2(p.detail)}</div>
      </div>`;
      }
      html += `</div>`;
    }
    if (s.errorMessage) {
      const errType = getErrorType(s.errorMessage);
      html += `<div style="border:1px solid #7f1d1d;background:#1a0505;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:13px;font-weight:700;color:#fca5a5;font-family:system-ui,sans-serif">Error Details</span>
        <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}44">${errType.type}</span>
      </div>
      <div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
        <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Message</div>
        <div style="color:#fca5a5;font-size:12px;line-height:1.5;word-break:break-word">${escapeHtml2(s.errorMessage)}</div>
      </div>`;
      if (s.errorStack) {
        const locationMatch = s.errorStack.match(/at\s+(\S+)\s+\(([^)]+)\)/);
        if (locationMatch) {
          html += `<div style="background:#0f0205;border-radius:6px;padding:10px;margin-bottom:8px">
          <div style="font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-family:system-ui,sans-serif">Error Location</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:12px;color:#60a5fa">${escapeHtml2(locationMatch[1])}</span>
            <span style="font-size:10px;color:#555">at</span>
            <span style="font-size:10px;color:#888;word-break:break-all">${escapeHtml2(locationMatch[2])}</span>
          </div>
        </div>`;
        }
        html += `<details style="margin-top:4px">
        <summary style="font-size:10px;color:#555;cursor:pointer;user-select:none;font-family:system-ui,sans-serif">View Full Stack Trace</summary>
        <pre style="color:#dc262690;font-size:10px;margin-top:6px;white-space:pre-wrap;line-height:1.4;max-height:150px;overflow:auto;background:#0a0a0a;padding:8px;border-radius:4px">${escapeHtml2(s.errorStack)}</pre>
      </details>`;
      }
      html += `</div>`;
    }
    if (apiEvents.length > 0) {
      html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;font-family:system-ui,sans-serif">\u26A1 Performance</div>
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
          <div style="font-size:13px;color:${failedApis.length === 0 ? "#22c55e" : "#fbbf24"};margin-top:2px">${apiEvents.length > 0 ? Math.round((apiEvents.length - failedApis.length) / apiEvents.length * 100) : 0}%</div>
        </div>
      </div>`;
      for (const ev of apiEvents) {
        const r = ev.data.request;
        const code = (r == null ? void 0 : r.statusCode) || 0;
        const dur = (r == null ? void 0 : r.durationMs) || 0;
        const speed = getSpeedLabel(dur);
        const statusClr = getStatusColor(code);
        const isFail = code >= 400 || code === 0;
        const urlPath = ((r == null ? void 0 : r.url) || "").replace(/https?:\/\/[^/]+/, "").slice(0, 50);
        html += `<div style="background:${isFail ? "#0f0205" : "#0f0f1a"};border:1px solid ${isFail ? "#7f1d1d44" : "#1e1e32"};border-radius:6px;padding:8px 10px;margin-bottom:4px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:600;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${(r == null ? void 0 : r.method) || "GET"}</span>
            <span style="font-size:10px;color:#888;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px">${escapeHtml2(urlPath)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:10px;font-weight:700;color:${statusClr}">${code}</span>
            <span style="font-size:9px;color:${statusClr}66">${getStatusLabel(code)}</span>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:3px;background:#1e1e32;border-radius:2px;overflow:hidden">
            <div style="height:100%;width:${Math.min(100, dur / Math.max(maxApiTime, 1) * 100)}%;background:${speed.color};border-radius:2px"></div>
          </div>
          <span style="font-size:10px;color:${speed.color};white-space:nowrap">${formatDuration(dur)}</span>
          ${dur > 3e3 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color}">${speed.label}</span>` : ""}
        </div>
      </div>`;
      }
      html += `</div>`;
    }
    if (s.reproSteps) {
      html += `<div style="border:1px solid #14532d;background:#031a09;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-size:13px;font-weight:700;color:#4ade80;font-family:system-ui,sans-serif">\u{1F4CB} Reproduction Steps</div>
        <button id="bt-copy" style="${smallBtnStyle("#3b82f6")}font-size:10px">Copy</button>
      </div>
      <pre style="color:#bbf7d0;font-size:12px;white-space:pre-wrap;line-height:1.7;margin:0">${escapeHtml2(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:10px;padding-top:8px"><div style="font-size:10px;font-weight:600;color:#4ade80;margin-bottom:4px;font-family:system-ui,sans-serif">Summary</div><pre style="color:#86efac;font-size:11px;white-space:pre-wrap;line-height:1.4;margin:0">${escapeHtml2(s.errorSummary)}</pre></div>` : ""}
    </div>`;
    }
    const annotations = s.annotations || [];
    if (annotations.length > 0) {
      html += `<div style="border:1px solid #1e3a5f;background:#0c1222;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#60a5fa;margin-bottom:10px;font-family:system-ui,sans-serif">\u{1F4DD} Tester Notes (${annotations.length})</div>`;
      for (const note of annotations) {
        const sevColor = note.severity === "critical" ? "#ef4444" : note.severity === "major" ? "#f97316" : note.severity === "minor" ? "#3b82f6" : "#888";
        html += `<div style="border:1px solid #2a2a3e;background:#12121f;border-radius:6px;padding:10px;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:9px;padding:1px 6px;border-radius:3px;background:${sevColor}22;color:${sevColor};border:1px solid ${sevColor}44;font-weight:600;text-transform:uppercase">${note.severity}</span>
          <span style="font-size:10px;color:#555">${new Date(note.timestamp).toLocaleTimeString()}</span>
        </div>
        <div style="color:#e0e0e0;font-size:12px;line-height:1.4">${escapeHtml2(note.text)}</div>
        ${note.expected ? `<div style="margin-top:4px;font-size:11px"><span style="color:#22c55e;font-weight:600">Expected:</span> <span style="color:#aaa">${escapeHtml2(note.expected)}</span></div>` : ""}
        ${note.actual ? `<div style="margin-top:2px;font-size:11px"><span style="color:#ef4444;font-weight:600">Actual:</span> <span style="color:#aaa">${escapeHtml2(note.actual)}</span></div>` : ""}
      </div>`;
      }
      html += `</div>`;
    }
    const screenshots2 = getScreenshots();
    if (screenshots2.length > 0) {
      html += `<div style="border:1px solid #2a2a3e;background:#12121f;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#22d3ee;margin-bottom:10px;font-family:system-ui,sans-serif">\u{1F4F8} Screenshots (${screenshots2.length})</div>`;
      for (const ss of screenshots2) {
        html += `<div style="margin-bottom:10px">
        <div style="font-size:10px;color:#888;margin-bottom:4px">${escapeHtml2(ss.filename)} \u2014 ${escapeHtml2(ss.page)}</div>
        <img src="${ss.dataUrl}" style="max-width:100%;border:1px solid #2a2a3e;border-radius:6px" />
      </div>`;
      }
      html += `</div>`;
    }
    const envInfo = s.environment;
    if (envInfo) {
      html += `<div style="background:#12121f;border:1px solid #2a2a3e;border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px;font-family:system-ui,sans-serif">\u{1F5A5} Environment</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Browser</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml2(envInfo.browser)} ${escapeHtml2(envInfo.browserVersion)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">OS</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml2(envInfo.os)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Viewport</span><div style="font-size:12px;color:#e0e0e0">${escapeHtml2(envInfo.viewport)}</div></div>
        <div style="background:#0f0f1a;border-radius:6px;padding:6px 8px"><span style="font-size:9px;color:#555">Device</span><div style="font-size:12px;color:#e0e0e0">${envInfo.deviceType}</div></div>
      </div>
    </div>`;
    }
    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
    <div style="font-size:13px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">Event Timeline (${s.events.length})</div>
    <span style="font-size:10px;color:#555">${new Date(firstTs).toLocaleTimeString()} \u2014 ${new Date(lastTs).toLocaleTimeString()}</span>
  </div>
  <div style="position:relative;padding-left:24px">
    <div style="position:absolute;left:7px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      const c = eventConfig[ev.type] || { label: ev.type, icon: "\u{1F4CC}", color: "#666", bg: "#1a1a2e" };
      const isErr = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
      const isApiErr = ev.type === "api_request" && (((_f = ev.data.request) == null ? void 0 : _f.statusCode) >= 400 || ((_g = ev.data.request) == null ? void 0 : _g.statusCode) === 0);
      const isSlowApi = ev.type === "api_request" && ((_h = ev.data.request) == null ? void 0 : _h.durationMs) > 3e3;
      const hasProblem = isErr || isApiErr;
      const dotColor = hasProblem ? "#ef4444" : isSlowApi ? "#f97316" : c.color;
      const timeSincePrev = i > 0 ? ev.timestamp - s.events[i - 1].timestamp : 0;
      if (timeSincePrev > 2e3 && i > 0) {
        html += `<div style="position:relative;margin-bottom:4px;margin-top:4px">
        <div style="position:absolute;left:-21px;top:4px;width:6px;height:6px;border-radius:50%;background:#2a2a3e;border:1px solid #333"></div>
        <div style="font-size:9px;color:#444;font-style:italic;padding:2px 0">\u23F1 ${formatDuration(timeSincePrev)} later</div>
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
      if (ev.type === "api_request") {
        const r = ev.data.request;
        const code = (r == null ? void 0 : r.statusCode) || 0;
        const dur = (r == null ? void 0 : r.durationMs) || 0;
        const speed = getSpeedLabel(dur);
        const urlPath = ((r == null ? void 0 : r.url) || "").replace(/https?:\/\/[^/]+/, "");
        html += `<div style="margin-top:4px">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;font-weight:700;color:#e0e0e0;background:#1e293b;padding:1px 5px;border-radius:3px">${(r == null ? void 0 : r.method) || "GET"}</span>
            <span style="font-size:11px;color:#aaa;word-break:break-all">${escapeHtml2((urlPath == null ? void 0 : urlPath.slice(0, 80)) || "")}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;font-weight:700;color:${getStatusColor(code)}">${code}</span>
              <span style="font-size:10px;color:${getStatusColor(code)}88">${getStatusLabel(code)}</span>
            </div>
            <span style="color:#333">\xB7</span>
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:10px;color:${speed.color}">${formatDuration(dur)}</span>
              ${dur > 3e3 ? `<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:${speed.color}22;color:${speed.color};border:1px solid ${speed.color}33">${speed.label}</span>` : ""}
            </div>
          </div>
          <div style="height:3px;background:#1e1e32;border-radius:2px;overflow:hidden;margin-top:6px">
            <div style="height:100%;width:${Math.min(100, dur / Math.max(maxApiTime, 1) * 100)}%;background:${speed.color};border-radius:2px;transition:width 0.3s"></div>
          </div>
        </div>`;
      } else if (ev.type === "click") {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_i = el == null ? void 0 : el.text) == null ? void 0 : _i.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Clicked "<span style="color:#60a5fa">${escapeHtml2(target.slice(0, 60))}</span>"</div>`;
        const details = [];
        if (el == null ? void 0 : el.tag) details.push(`&lt;${el.tag}&gt;`);
        if (el == null ? void 0 : el.id) details.push(`#${el.id}`);
        if (el == null ? void 0 : el.className) details.push(`.${escapeHtml2(el.className.split(" ")[0])}`);
        if (el == null ? void 0 : el.href) details.push(`\u2192 ${escapeHtml2(el.href.slice(0, 60))}`);
        if (el == null ? void 0 : el.role) details.push(`role="${el.role}"`);
        if (el == null ? void 0 : el.testId) details.push(`data-testid="${el.testId}"`);
        if (details.length > 0) {
          html += `<div style="font-size:9px;color:#444;margin-top:3px">${details.join(" ")}</div>`;
        }
      } else if (ev.type === "input") {
        const inp = ev.data.element;
        const fieldName = (inp == null ? void 0 : inp.name) || (inp == null ? void 0 : inp.id) || "field";
        const inputType = (inp == null ? void 0 : inp.type) || "text";
        if (inputType === "checkbox" || inputType === "radio") {
          html += `<div style="color:#aaa;font-size:11px;line-height:1.4">${(inp == null ? void 0 : inp.checked) ? "Checked" : "Unchecked"} "<span style="color:#c084fc">${escapeHtml2(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>`;
        } else {
          const val = inp == null ? void 0 : inp.value;
          if (val && val !== "[REDACTED]") {
            html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml2(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>`;
            html += `<div style="font-size:10px;color:#a78bfa;margin-top:3px;background:#1e153344;padding:3px 8px;border-radius:4px;border:1px solid #1e1533;word-break:break-word">"${escapeHtml2(val.slice(0, 150))}"</div>`;
          } else {
            html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Typed in "<span style="color:#c084fc">${escapeHtml2(fieldName)}</span>" <span style="font-size:9px;color:#555">(${inputType})</span></div>
            <div style="font-size:9px;color:#444;margin-top:2px">${(inp == null ? void 0 : inp.valueLength) || 0} characters ${val === "[REDACTED]" ? '<span style="color:#f87171">\u{1F512} redacted</span>' : ""}</div>`;
          }
        }
        if (inp == null ? void 0 : inp.placeholder) {
          html += `<div style="font-size:9px;color:#333;margin-top:2px">placeholder: "${escapeHtml2(inp.placeholder)}"</div>`;
        }
      } else if (ev.type === "select_change") {
        const sel = ev.data.element;
        const fieldName = (sel == null ? void 0 : sel.name) || (sel == null ? void 0 : sel.id) || "dropdown";
        html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Changed "<span style="color:#34d399">${escapeHtml2(fieldName)}</span>" dropdown</div>`;
        html += `<div style="font-size:11px;color:#34d399;margin-top:3px;background:#05201544;padding:4px 8px;border-radius:4px;border:1px solid #14532d">Selected: "<strong>${escapeHtml2((sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "")}</strong>"</div>`;
        if ((sel == null ? void 0 : sel.allOptions) && sel.allOptions.length > 0) {
          html += `<div style="font-size:9px;color:#444;margin-top:3px">Options: ${sel.allOptions.map((o) => escapeHtml2(o)).join(", ")}</div>`;
        }
      } else if (ev.type === "form_submit") {
        const f = ev.data.form;
        html += `<div style="color:#aaa;font-size:11px;line-height:1.4">Submitted form ${(f == null ? void 0 : f.id) ? `"<span style="color:#fb923c">${escapeHtml2(f.id)}</span>"` : ""}</div>`;
        if ((f == null ? void 0 : f.fields) && Object.keys(f.fields).length > 0) {
          html += `<div style="margin-top:4px;background:#1a150544;padding:6px 8px;border-radius:4px;border:1px solid #2a2a3e">`;
          for (const [key, val] of Object.entries(f.fields)) {
            html += `<div style="font-size:10px;margin-bottom:2px"><span style="color:#888">${escapeHtml2(key)}:</span> <span style="color:#fbbf24">${escapeHtml2(String(val).slice(0, 80))}</span></div>`;
          }
          html += `</div>`;
        }
        if (f == null ? void 0 : f.method) {
          html += `<div style="font-size:9px;color:#444;margin-top:2px">${f.method.toUpperCase()} ${f.action ? `\u2192 ${escapeHtml2(f.action.slice(0, 60))}` : ""}</div>`;
        }
      } else if (ev.type === "route_change") {
        html += `<div style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:2px">
          <span style="color:#888;background:#0f0f1a;padding:2px 6px;border-radius:3px">${escapeHtml2(ev.data.from || "/")}</span>
          <span style="color:#22d3ee">\u2192</span>
          <span style="color:#22d3ee;background:#0c2e3344;padding:2px 6px;border-radius:3px;font-weight:600">${escapeHtml2(ev.data.to || "/")}</span>
        </div>`;
      } else if (ev.type === "error" || ev.type === "unhandled_rejection") {
        const errType = getErrorType(((_j = ev.data.error) == null ? void 0 : _j.message) || "");
        html += `<div style="margin-top:2px">
          <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px">
            <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${errType.color}22;color:${errType.color};border:1px solid ${errType.color}33">${errType.type}</span>
          </div>
          <div style="color:#fca5a5;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml2(((_k = ev.data.error) == null ? void 0 : _k.message) || "Unknown error")}</div>
          ${((_l = ev.data.error) == null ? void 0 : _l.source) ? `<div style="font-size:9px;color:#555;margin-top:3px">at ${escapeHtml2(ev.data.error.source)}${ev.data.error.line ? `:${ev.data.error.line}` : ""}${ev.data.error.column ? `:${ev.data.error.column}` : ""}</div>` : ""}
        </div>`;
      } else if (ev.type === "console_error") {
        html += `<div style="color:#fb923c;font-size:11px;line-height:1.4;word-break:break-word">${escapeHtml2((((_m = ev.data.error) == null ? void 0 : _m.message) || "").slice(0, 200))}</div>`;
      } else {
        html += `<div style="color:#aaa;font-size:11px;line-height:1.3">${escapeHtml2(describeEvent(ev))}</div>`;
      }
      html += `</div></div>`;
    }
    html += `</div>`;
    html += `<div style="margin-top:16px;padding:12px 0;border-top:1px solid #1e1e32;display:flex;gap:8px">
    <button id="bt-copy-report" style="${smallBtnStyle("#3b82f6")}font-size:11px;flex:1">\u{1F4CB} Copy Full Report</button>
    <button id="bt-delete" style="${smallBtnStyle("#ef4444")}font-size:11px">\u{1F5D1} Delete</button>
  </div>`;
    content.innerHTML = html;
    content.querySelector("#bt-back").addEventListener("click", () => renderPanel(panel));
    const copyBtn = content.querySelector("#bt-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const text = `Reproduction Steps:
${s.reproSteps}

Error: ${s.errorMessage}

${s.errorSummary || ""}`;
        navigator.clipboard.writeText(text).then(() => {
          copyBtn.textContent = "\u2713 Copied!";
          setTimeout(() => copyBtn.textContent = "Copy", 2e3);
        });
      });
    }
    content.querySelector("#bt-download-json").addEventListener("click", () => {
      downloadFile(
        `tracebug-${s.sessionId.slice(0, 8)}.json`,
        JSON.stringify(s, null, 2),
        "application/json"
      );
    });
    content.querySelector("#bt-download-txt").addEventListener("click", () => {
      const report = buildTextReport(s, problems, apiEvents, sessionDur);
      downloadFile(
        `tracebug-report-${s.sessionId.slice(0, 8)}.txt`,
        report,
        "text/plain"
      );
    });
    content.querySelector("#bt-download-html").addEventListener("click", () => {
      const htmlReport = buildHtmlReport(s, problems, apiEvents, sessionDur);
      downloadFile(
        `tracebug-report-${s.sessionId.slice(0, 8)}.html`,
        htmlReport,
        "text/html"
      );
    });
    const copyReportBtn = content.querySelector("#bt-copy-report");
    if (copyReportBtn) {
      copyReportBtn.addEventListener("click", () => {
        const report = buildTextReport(s, problems, apiEvents, sessionDur);
        navigator.clipboard.writeText(report).then(() => {
          copyReportBtn.textContent = "\u2713 Copied!";
          setTimeout(() => copyReportBtn.textContent = "\u{1F4CB} Copy Full Report", 2e3);
        });
      });
    }
    content.querySelector("#bt-delete").addEventListener("click", () => {
      if (confirm("Delete this session?")) {
        deleteSession(session.sessionId);
        renderPanel(panel);
      }
    });
    const ssBtn = content.querySelector("#bt-screenshot");
    if (ssBtn) {
      ssBtn.addEventListener("click", async () => {
        ssBtn.textContent = "\u{1F4F8} Capturing...";
        try {
          const lastEvent = s.events[s.events.length - 1] || null;
          const ss = await captureScreenshot(lastEvent);
          ssBtn.textContent = `\u2713 ${ss.filename}`;
          setTimeout(() => {
            ssBtn.textContent = "\u{1F4F8} Screenshot";
          }, 3e3);
          const root = document.getElementById("tracebug-root");
          if (root) showAnnotationEditor(ss, root);
        } catch (e) {
          ssBtn.textContent = "\u2717 Failed";
          setTimeout(() => {
            ssBtn.textContent = "\u{1F4F8} Screenshot";
          }, 2e3);
        }
      });
    }
    const noteBtn = content.querySelector("#bt-add-note");
    if (noteBtn) {
      noteBtn.addEventListener("click", () => {
        showNoteDialog(s.sessionId, panel, session);
      });
    }
    const ghBtn = content.querySelector("#bt-github-issue");
    if (ghBtn) {
      ghBtn.addEventListener("click", () => {
        const report = buildReport(session);
        const md = generateGitHubIssue(report);
        navigator.clipboard.writeText(md).then(() => {
          ghBtn.textContent = "\u2713 Copied!";
          setTimeout(() => {
            ghBtn.textContent = "\u{1F419} GitHub Issue";
          }, 2e3);
          if (report.screenshots.length > 0) {
            downloadAllScreenshots();
          }
        });
      });
    }
    const jiraBtn = content.querySelector("#bt-jira-ticket");
    if (jiraBtn) {
      jiraBtn.addEventListener("click", () => {
        const report = buildReport(session);
        const ticket = generateJiraTicket(report);
        const text = `Summary: ${ticket.summary}
Priority: ${ticket.priority}
Labels: ${ticket.labels.join(", ")}

${ticket.description}`;
        navigator.clipboard.writeText(text).then(() => {
          jiraBtn.textContent = "\u2713 Copied!";
          setTimeout(() => {
            jiraBtn.textContent = "\u{1F3AB} Jira Ticket";
          }, 2e3);
          if (report.screenshots.length > 0) {
            downloadAllScreenshots();
          }
        });
      });
    }
    const pdfBtn = content.querySelector("#bt-download-pdf");
    if (pdfBtn) {
      pdfBtn.addEventListener("click", () => {
        const report = buildReport(session);
        generatePdfReport(report);
      });
    }
  }
  function showNoteDialog(sessionId, panel, session) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10;display:flex;align-items:center;justify-content:center;padding:20px";
    overlay.innerHTML = `
    <div style="background:#12121f;border:1px solid #2a2a3e;border-radius:12px;padding:20px;width:100%;max-width:420px">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px;font-family:system-ui,sans-serif">\u{1F4DD} Add Tester Note</div>
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
          <option value="critical">Critical \u2014 App broken/unusable</option>
          <option value="major">Major \u2014 Feature not working</option>
          <option value="minor" selected>Minor \u2014 Cosmetic/UX issue</option>
          <option value="info">Info \u2014 Observation/Note</option>
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
    overlay.querySelector("#bt-note-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#bt-note-save").addEventListener("click", () => {
      const text = overlay.querySelector("#bt-note-text").value.trim();
      if (!text) return;
      const annotation = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        text,
        expected: overlay.querySelector("#bt-note-expected").value.trim() || void 0,
        actual: overlay.querySelector("#bt-note-actual").value.trim() || void 0,
        severity: overlay.querySelector("#bt-note-severity").value
      };
      addAnnotation(sessionId, annotation);
      overlay.remove();
      const updatedSessions = getAllSessions();
      const updatedSession = updatedSessions.find((s) => s.sessionId === sessionId);
      if (updatedSession) {
        renderSessionDetail(panel, updatedSession);
      }
    });
  }
  function buildTextReport(s, problems, apiEvents, sessionDur) {
    let report = `TraceBug Session Report
${"=".repeat(50)}

`;
    report += `Session ID: ${s.sessionId}
`;
    report += `Date: ${new Date(s.createdAt).toLocaleString()}
`;
    report += `Duration: ${formatDuration(sessionDur)}
`;
    report += `Events: ${s.events.length}

`;
    if (problems.length > 0) {
      report += `Problems Detected (${problems.length})
${"-".repeat(40)}
`;
      for (const p of problems) {
        report += `[${p.severity.toUpperCase()}] ${p.title}
  ${p.detail}

`;
      }
    }
    if (s.errorMessage) {
      report += `Error Details
${"-".repeat(40)}
`;
      report += `Message: ${s.errorMessage}
`;
      if (s.errorStack) report += `Stack:
${s.errorStack}
`;
      report += `
`;
    }
    if (s.reproSteps) {
      report += `Reproduction Steps
${"-".repeat(40)}
${s.reproSteps}

`;
    }
    if (s.errorSummary) {
      report += `Summary
${"-".repeat(40)}
${s.errorSummary}

`;
    }
    report += `Event Timeline
${"-".repeat(40)}
`;
    for (const ev of s.events) {
      const time = new Date(ev.timestamp).toLocaleTimeString();
      report += `[${time}] ${ev.type.toUpperCase()} on ${ev.page}
`;
      report += `  ${describeEventForReport(ev)}
`;
    }
    if (apiEvents.length > 0) {
      report += `
API Calls
${"-".repeat(40)}
`;
      for (const ev of apiEvents) {
        const r = ev.data.request;
        report += `${r == null ? void 0 : r.method} ${r == null ? void 0 : r.url} \u2192 ${r == null ? void 0 : r.statusCode} (${r == null ? void 0 : r.durationMs}ms)
`;
      }
    }
    return report;
  }
  function buildHtmlReport(s, problems, apiEvents, sessionDur) {
    const hasError = !!s.errorMessage;
    let html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TraceBug Report \u2014 ${s.sessionId.slice(0, 8)}</title>
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
<h1>\u{1F41B} TraceBug Session Report</h1>
<div class="meta">Session: ${s.sessionId} \xB7 ${new Date(s.createdAt).toLocaleString()} \xB7 Duration: ${formatDuration(sessionDur)}</div>`;
    html += `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-size:14px;font-weight:700;font-family:system-ui,sans-serif">Session Overview</span>
      <span class="badge" style="background:${hasError ? "#7f1d1d" : "#14532d"};color:${hasError ? "#fca5a5" : "#4ade80"}">${hasError ? "Has Errors" : "Healthy"}</span>
    </div>
    <div class="stat-grid">
      <div class="stat"><div class="stat-label">Duration</div><div class="stat-value">${formatDuration(sessionDur)}</div></div>
      <div class="stat"><div class="stat-label">Events</div><div class="stat-value">${s.events.length}</div></div>
      <div class="stat"><div class="stat-label">Pages</div><div class="stat-value">${new Set(s.events.map((e) => e.page)).size}</div></div>
      <div class="stat"><div class="stat-label">API Calls</div><div class="stat-value">${apiEvents.length}</div></div>
    </div>
  </div>`;
    if (problems.length > 0) {
      html += `<h2>\u{1F50D} Problems Detected (${problems.length})</h2>`;
      for (const p of problems) {
        const cls = p.severity === "critical" ? "" : p.severity === "warning" ? " warning" : " info";
        html += `<div class="problem${cls}">
        <div style="margin-bottom:4px"><span style="font-size:14px">${p.icon}</span> <strong style="color:${p.color}">${escapeHtml2(p.title)}</strong></div>
        <div style="color:#888;font-size:12px;padding-left:24px">${escapeHtml2(p.detail)}</div>
      </div>`;
      }
    }
    if (s.errorMessage) {
      html += `<h2>\u{1F4A5} Error Details</h2><div class="card" style="border-color:#7f1d1d;background:#1a0505">
      <div style="color:#fca5a5;font-size:13px;line-height:1.5;margin-bottom:8px">${escapeHtml2(s.errorMessage)}</div>
      ${s.errorStack ? `<pre style="color:#dc262690;font-size:11px;background:#0a0a0a;padding:10px;border-radius:6px;max-height:200px;overflow:auto">${escapeHtml2(s.errorStack)}</pre>` : ""}
    </div>`;
    }
    if (s.reproSteps) {
      html += `<h2>\u{1F4CB} Reproduction Steps</h2><div class="card" style="border-color:#14532d;background:#031a09">
      <pre style="color:#bbf7d0;line-height:1.8">${escapeHtml2(s.reproSteps)}</pre>
      ${s.errorSummary ? `<div style="border-top:1px solid #14532d;margin-top:12px;padding-top:10px"><pre style="color:#86efac;font-size:11px">${escapeHtml2(s.errorSummary)}</pre></div>` : ""}
    </div>`;
    }
    html += `<h2>\u{1F4CA} Event Timeline (${s.events.length})</h2>
    <div style="position:relative;padding-left:28px">
    <div style="position:absolute;left:9px;top:0;bottom:0;width:2px;background:linear-gradient(to bottom, #2a2a3e, #1e1e32)"></div>`;
    for (let i = 0; i < s.events.length; i++) {
      const ev = s.events[i];
      const c = eventConfig[ev.type] || { label: ev.type, icon: "\u{1F4CC}", color: "#666", bg: "#1a1a2e" };
      const isErr = ["error", "unhandled_rejection", "console_error"].includes(ev.type);
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
<div style="text-align:center;color:#333;font-size:11px;margin-top:32px;padding:16px;border-top:1px solid #1e1e32">Generated by TraceBug AI \xB7 ${(/* @__PURE__ */ new Date()).toLocaleString()}</div>
</body></html>`;
    return html;
  }
  function describeEventHtml(ev) {
    var _a, _b, _c;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        let s = `Clicked "<span style="color:#60a5fa">${escapeHtml2(target.slice(0, 60))}</span>"`;
        if (el == null ? void 0 : el.href) s += ` <span style="font-size:10px;color:#444">\u2192 ${escapeHtml2(el.href.slice(0, 60))}</span>`;
        return s;
      }
      case "input": {
        const inp = ev.data.element;
        const val = inp == null ? void 0 : inp.value;
        let s = `Typed in "<span style="color:#c084fc">${escapeHtml2((inp == null ? void 0 : inp.name) || "field")}</span>"`;
        if (val && val !== "[REDACTED]") s += `<div class="value-box">"${escapeHtml2(val.slice(0, 150))}"</div>`;
        else if (val === "[REDACTED]") s += ` <span style="color:#f87171;font-size:10px">\u{1F512} redacted</span>`;
        return s;
      }
      case "select_change": {
        const sel = ev.data.element;
        let s = `Changed "<span style="color:#34d399">${escapeHtml2((sel == null ? void 0 : sel.name) || "dropdown")}</span>"`;
        s += `<div class="select-box">Selected: "<strong>${escapeHtml2((sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value) || "")}</strong>"</div>`;
        return s;
      }
      case "form_submit": {
        const f = ev.data.form;
        let s = `Submitted form ${(f == null ? void 0 : f.id) ? `"${escapeHtml2(f.id)}"` : ""}`;
        if (f == null ? void 0 : f.fields) {
          s += `<div style="margin-top:4px">`;
          for (const [key, val] of Object.entries(f.fields)) {
            s += `<div style="font-size:10px"><span style="color:#888">${escapeHtml2(key)}:</span> ${escapeHtml2(String(val).slice(0, 80))}</div>`;
          }
          s += `</div>`;
        }
        return s;
      }
      case "route_change":
        return `<span style="color:#888">${escapeHtml2(ev.data.from || "/")}</span> <span style="color:#22d3ee">\u2192</span> <span style="color:#22d3ee;font-weight:600">${escapeHtml2(ev.data.to || "/")}</span>`;
      case "api_request": {
        const r = ev.data.request;
        return `<span style="font-weight:600">${r == null ? void 0 : r.method}</span> ${escapeHtml2(((r == null ? void 0 : r.url) || "").slice(0, 80))} \u2192 <span style="color:${getStatusColor((r == null ? void 0 : r.statusCode) || 0)};font-weight:700">${r == null ? void 0 : r.statusCode}</span> <span style="color:#555">(${r == null ? void 0 : r.durationMs}ms)</span>`;
      }
      case "error":
      case "unhandled_rejection":
        return `<span style="color:#fca5a5">${escapeHtml2(((_b = ev.data.error) == null ? void 0 : _b.message) || "Unknown error")}</span>`;
      case "console_error":
        return `<span style="color:#fb923c">${escapeHtml2((((_c = ev.data.error) == null ? void 0 : _c.message) || "").slice(0, 200))}</span>`;
      default:
        return escapeHtml2(JSON.stringify(ev.data).slice(0, 100));
    }
  }
  function describeEventForReport(ev) {
    var _a, _b, _c, _d;
    switch (ev.type) {
      case "click": {
        const el = ev.data.element;
        const target = (el == null ? void 0 : el.ariaLabel) || ((_a = el == null ? void 0 : el.text) == null ? void 0 : _a.trim()) || (el == null ? void 0 : el.id) || (el == null ? void 0 : el.tag) || "element";
        let s = `Clicked "${target}"`;
        if (el == null ? void 0 : el.href) s += ` \u2192 ${el.href}`;
        return s;
      }
      case "input": {
        const inp = ev.data.element;
        const val = inp == null ? void 0 : inp.value;
        if (val && val !== "[REDACTED]") return `Typed "${val}" in "${(inp == null ? void 0 : inp.name) || "field"}" (${(inp == null ? void 0 : inp.type) || "text"})`;
        return `Typed in "${(inp == null ? void 0 : inp.name) || "field"}" (${(inp == null ? void 0 : inp.valueLength) || 0} chars, ${(inp == null ? void 0 : inp.type) || "text"})`;
      }
      case "select_change": {
        const sel = ev.data.element;
        return `Selected "${(sel == null ? void 0 : sel.selectedText) || (sel == null ? void 0 : sel.value)}" from "${(sel == null ? void 0 : sel.name) || "dropdown"}" dropdown`;
      }
      case "form_submit": {
        const f = ev.data.form;
        let s = `Submitted form "${(f == null ? void 0 : f.id) || ""}" (${f == null ? void 0 : f.fieldCount} fields)`;
        if (f == null ? void 0 : f.fields) {
          const entries = Object.entries(f.fields);
          if (entries.length > 0) s += ` \u2014 ` + entries.map(([k, v]) => `${k}="${String(v).slice(0, 40)}"`).join(", ");
        }
        return s;
      }
      case "route_change":
        return `${ev.data.from || "/"} \u2192 ${ev.data.to || "/"}`;
      case "api_request": {
        const r = ev.data.request;
        return `${r == null ? void 0 : r.method} ${(_b = r == null ? void 0 : r.url) == null ? void 0 : _b.slice(0, 80)} \u2192 ${r == null ? void 0 : r.statusCode} (${r == null ? void 0 : r.durationMs}ms)`;
      }
      case "error":
      case "unhandled_rejection":
        return ((_c = ev.data.error) == null ? void 0 : _c.message) || "Unknown error";
      case "console_error":
        return (((_d = ev.data.error) == null ? void 0 : _d.message) || "").slice(0, 120);
      default:
        return JSON.stringify(ev.data).slice(0, 100);
    }
  }
  function downloadFile(filename, content, mimeType) {
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
  var eventConfig = {
    click: { label: "Click", icon: "\u{1F446}", color: "#60a5fa", bg: "#1e293b" },
    input: { label: "Input", icon: "\u2328\uFE0F", color: "#c084fc", bg: "#1e1533" },
    select_change: { label: "Select", icon: "\u{1F4CB}", color: "#34d399", bg: "#052015" },
    form_submit: { label: "Form Submit", icon: "\u{1F4E4}", color: "#fb923c", bg: "#2a1505" },
    route_change: { label: "Navigate", icon: "\u{1F500}", color: "#22d3ee", bg: "#0c2e33" },
    api_request: { label: "API", icon: "\u{1F310}", color: "#fbbf24", bg: "#2a2005" },
    error: { label: "Error", icon: "\u{1F4A5}", color: "#f87171", bg: "#2a0505" },
    console_error: { label: "Console Err", icon: "\u26A0\uFE0F", color: "#fb923c", bg: "#2a1505" },
    unhandled_rejection: { label: "Rejection", icon: "\u{1F4A5}", color: "#f87171", bg: "#2a0505" }
  };
  function getStatusColor(code) {
    if (code === 0) return "#ef4444";
    if (code < 300) return "#22c55e";
    if (code < 400) return "#fbbf24";
    if (code < 500) return "#f97316";
    return "#ef4444";
  }
  function getStatusLabel(code) {
    if (code === 0) return "Network Error";
    const labels = {
      200: "OK",
      201: "Created",
      204: "No Content",
      301: "Moved",
      302: "Found",
      304: "Not Modified",
      400: "Bad Request",
      401: "Unauthorized",
      403: "Forbidden",
      404: "Not Found",
      405: "Method Not Allowed",
      408: "Timeout",
      409: "Conflict",
      413: "Payload Too Large",
      422: "Unprocessable",
      429: "Rate Limited",
      500: "Internal Server Error",
      502: "Bad Gateway",
      503: "Service Unavailable",
      504: "Gateway Timeout"
    };
    return labels[code] || (code < 300 ? "Success" : code < 400 ? "Redirect" : code < 500 ? "Client Error" : "Server Error");
  }
  function getSpeedLabel(ms) {
    if (ms < 200) return { label: "Fast", color: "#22c55e" };
    if (ms < 1e3) return { label: "Normal", color: "#fbbf24" };
    if (ms < 5e3) return { label: "Slow", color: "#f97316" };
    return { label: "Very Slow", color: "#ef4444" };
  }
  function getErrorType(msg) {
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
  function formatDuration(ms) {
    if (ms < 1e3) return `${ms}ms`;
    if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
    return `${Math.floor(ms / 6e4)}m ${Math.floor(ms % 6e4 / 1e3)}s`;
  }
  function describeEvent(event) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
    const d = event.data;
    switch (event.type) {
      case "click":
        return `Clicked "${((_a = d.element) == null ? void 0 : _a.text) || ((_b = d.element) == null ? void 0 : _b.id) || ((_c = d.element) == null ? void 0 : _c.tag) || "element"}"`;
      case "input": {
        const val = (_d = d.element) == null ? void 0 : _d.value;
        if (val && val !== "[REDACTED]") return `Typed "${val.slice(0, 40)}" in "${((_e = d.element) == null ? void 0 : _e.name) || "field"}"`;
        return `Typed in "${((_f = d.element) == null ? void 0 : _f.name) || "field"}" (${((_g = d.element) == null ? void 0 : _g.valueLength) || 0} chars)`;
      }
      case "select_change":
        return `Selected "${((_h = d.element) == null ? void 0 : _h.selectedText) || ((_i = d.element) == null ? void 0 : _i.value)}" from "${((_j = d.element) == null ? void 0 : _j.name) || "dropdown"}"`;
      case "form_submit":
        return `Submitted form "${((_k = d.form) == null ? void 0 : _k.id) || ""}" (${((_l = d.form) == null ? void 0 : _l.fieldCount) || 0} fields)`;
      case "route_change":
        return `${d.from} \u2192 ${d.to}`;
      case "api_request":
        return `${(_m = d.request) == null ? void 0 : _m.method} ${(_o = (_n = d.request) == null ? void 0 : _n.url) == null ? void 0 : _o.slice(0, 60)} \u2192 ${(_p = d.request) == null ? void 0 : _p.statusCode} (${(_q = d.request) == null ? void 0 : _q.durationMs}ms)`;
      case "error":
      case "unhandled_rejection":
        return ((_r = d.error) == null ? void 0 : _r.message) || "Unknown error";
      case "console_error":
        return (((_s = d.error) == null ? void 0 : _s.message) || "").slice(0, 120);
      default:
        return JSON.stringify(d).slice(0, 100);
    }
  }
  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - ts) / 1e3);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
  function escapeHtml2(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function smallBtnStyle(color) {
    return `background:${color}22;color:${color};border:1px solid ${color}44;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:11px;font-family:inherit;`;
  }
  function showToast(message, root) {
    const existing = root.querySelector(".bt-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "bt-toast";
    toast.style.cssText = `
    position:fixed;top:20px;left:50%;transform:translateX(-50%);
    background:#1a1a2e;color:#e0e0e0;border:1px solid #3b82f6;
    border-radius:8px;padding:10px 20px;font-size:13px;
    font-family:system-ui,sans-serif;z-index:2147483647;
    box-shadow:0 4px 20px rgba(0,0,0,0.5);pointer-events:auto;
    transition:opacity 0.3s;
  `;
    toast.textContent = message;
    root.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
  function showAnnotationEditor(screenshot, root) {
    const overlay = document.createElement("div");
    overlay.id = "bt-annotation-overlay";
    overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;
    background:rgba(0,0,0,0.85);z-index:2147483647;
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;pointer-events:auto;
    font-family:system-ui,sans-serif;
  `;
    const maxW = window.innerWidth * 0.85;
    const maxH = window.innerHeight * 0.78;
    const imgRatio = screenshot.width / screenshot.height;
    let displayW = screenshot.width;
    let displayH = screenshot.height;
    if (displayW > maxW) {
      displayW = maxW;
      displayH = displayW / imgRatio;
    }
    if (displayH > maxH) {
      displayH = maxH;
      displayW = displayH * imgRatio;
    }
    displayW = Math.round(displayW);
    displayH = Math.round(displayH);
    const toolbarHtml = `
    <div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">
      <span style="color:#888;font-size:11px;margin-right:8px">ANNOTATE:</span>
      <button class="bt-ann-tool" data-tool="rect" style="${annToolBtnStyle(true)}">\u25AD Highlight</button>
      <button class="bt-ann-tool" data-tool="arrow" style="${annToolBtnStyle(false)}">\u2192 Arrow</button>
      <button class="bt-ann-tool" data-tool="text" style="${annToolBtnStyle(false)}">T Text</button>
      <span style="color:#333;margin:0 4px">|</span>
      <button class="bt-ann-tool" data-tool="color-red" style="background:#ef4444;border:2px solid #ef4444;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-yellow" style="background:#eab308;border:2px solid #eab308;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-green" style="background:#22c55e;border:2px solid #22c55e;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <button class="bt-ann-tool" data-tool="color-blue" style="background:#3b82f6;border:2px solid #3b82f6;width:22px;height:22px;border-radius:50%;cursor:pointer;padding:0"></button>
      <span style="color:#333;margin:0 4px">|</span>
      <button id="bt-ann-undo" style="${annActionBtnStyle()}">\u21A9 Undo</button>
      <button id="bt-ann-clear" style="${annActionBtnStyle()}">\u2715 Clear</button>
      <div style="flex:1"></div>
      <span style="color:#555;font-size:10px">Ctrl+Shift+S</span>
    </div>
  `;
    const actionsHtml = `
    <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
      <button id="bt-ann-save" style="background:#3b82f6;color:white;border:none;border-radius:6px;padding:8px 20px;cursor:pointer;font-size:13px;font-family:inherit">\u2713 Save Annotated</button>
      <button id="bt-ann-download" style="background:#22c55e22;color:#22c55e;border:1px solid #22c55e44;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:12px;font-family:inherit">\u2193 Download</button>
      <button id="bt-ann-cancel" style="background:#66666622;color:#888;border:1px solid #66666644;border-radius:6px;padding:8px 16px;cursor:pointer;font-size:12px;font-family:inherit">Cancel</button>
      <div style="flex:1"></div>
      <span style="color:#555;font-size:10px">${screenshot.filename}</span>
    </div>
  `;
    overlay.innerHTML = `${toolbarHtml}<div id="bt-ann-canvas-wrap" style="position:relative;cursor:crosshair"></div>${actionsHtml}`;
    root.appendChild(overlay);
    const canvasWrap = overlay.querySelector("#bt-ann-canvas-wrap");
    const img = new Image();
    img.onload = () => {
      img.style.cssText = `width:${displayW}px;height:${displayH}px;border-radius:6px;display:block;user-select:none;pointer-events:none`;
      canvasWrap.appendChild(img);
      const canvas = document.createElement("canvas");
      canvas.width = displayW;
      canvas.height = displayH;
      canvas.style.cssText = `position:absolute;top:0;left:0;width:${displayW}px;height:${displayH}px;border-radius:6px;`;
      canvasWrap.appendChild(canvas);
      initAnnotationCanvas(canvas, displayW, displayH, overlay, screenshot, root);
    };
    img.src = screenshot.dataUrl;
    overlay.querySelector("#bt-ann-cancel").addEventListener("click", () => overlay.remove());
    const escHandler = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }
  function initAnnotationCanvas(canvas, width, height, overlay, screenshot, root) {
    const ctx = canvas.getContext("2d");
    const actions = [];
    let currentTool = "rect";
    let currentColor = "#ef4444";
    let isDrawing = false;
    let startX = 0, startY = 0;
    function redraw() {
      ctx.clearRect(0, 0, width, height);
      for (const action of actions) {
        drawAction(ctx, action);
      }
    }
    function drawAction(c, a) {
      c.strokeStyle = a.color;
      c.fillStyle = a.color;
      c.lineWidth = 2.5;
      if (a.type === "rect") {
        const w = a.endX - a.startX;
        const h = a.endY - a.startY;
        c.globalAlpha = 0.15;
        c.fillRect(a.startX, a.startY, w, h);
        c.globalAlpha = 1;
        c.strokeRect(a.startX, a.startY, w, h);
      } else if (a.type === "arrow") {
        drawArrow(c, a.startX, a.startY, a.endX, a.endY, a.color);
      } else if (a.type === "text" && a.text) {
        c.font = "bold 14px system-ui, sans-serif";
        const metrics = c.measureText(a.text);
        const padding = 4;
        c.globalAlpha = 0.85;
        c.fillStyle = "#000";
        c.fillRect(a.startX - padding, a.startY - 16, metrics.width + padding * 2, 22);
        c.globalAlpha = 1;
        c.fillStyle = a.color;
        c.fillText(a.text, a.startX, a.startY);
      }
    }
    function drawArrow(c, x1, y1, x2, y2, color) {
      const headLen = 12;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      c.strokeStyle = color;
      c.fillStyle = color;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(x1, y1);
      c.lineTo(x2, y2);
      c.stroke();
      c.beginPath();
      c.moveTo(x2, y2);
      c.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
      c.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
      c.closePath();
      c.fill();
    }
    overlay.querySelectorAll(".bt-ann-tool").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tool = btn.dataset.tool || "";
        if (tool.startsWith("color-")) {
          currentColor = getComputedStyle(btn).backgroundColor;
          overlay.querySelectorAll("[data-tool^='color-']").forEach((cb) => {
            cb.style.border = `2px solid ${getComputedStyle(cb).backgroundColor}`;
          });
          btn.style.border = `2px solid #fff`;
          return;
        }
        currentTool = tool;
        overlay.querySelectorAll(".bt-ann-tool:not([data-tool^='color-'])").forEach((tb) => {
          tb.style.background = "#22222244";
          tb.style.color = "#888";
          tb.style.borderColor = "#33333344";
        });
        btn.style.background = "#3b82f633";
        btn.style.color = "#3b82f6";
        btn.style.borderColor = "#3b82f6";
      });
    });
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      if (currentTool === "text") {
        const text = prompt("Enter annotation text:");
        if (text) {
          actions.push({ type: "text", color: currentColor, startX, startY, endX: startX, endY: startY, text });
          redraw();
        }
        return;
      }
      isDrawing = true;
    });
    canvas.addEventListener("mousemove", (e) => {
      if (!isDrawing) return;
      const rect = canvas.getBoundingClientRect();
      const curX = e.clientX - rect.left;
      const curY = e.clientY - rect.top;
      redraw();
      const preview = { type: currentTool, color: currentColor, startX, startY, endX: curX, endY: curY };
      drawAction(ctx, preview);
    });
    canvas.addEventListener("mouseup", (e) => {
      if (!isDrawing) return;
      isDrawing = false;
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      if (Math.abs(endX - startX) < 5 && Math.abs(endY - startY) < 5) {
        redraw();
        return;
      }
      actions.push({ type: currentTool, color: currentColor, startX, startY, endX, endY });
      redraw();
    });
    overlay.querySelector("#bt-ann-undo").addEventListener("click", () => {
      actions.pop();
      redraw();
    });
    overlay.querySelector("#bt-ann-clear").addEventListener("click", () => {
      actions.length = 0;
      redraw();
    });
    overlay.querySelector("#bt-ann-save").addEventListener("click", () => {
      const merged = mergeAnnotations(screenshot.dataUrl, canvas, width, height);
      screenshot.dataUrl = merged;
      showToast("\u2713 Annotations saved to screenshot", root);
      overlay.remove();
    });
    overlay.querySelector("#bt-ann-download").addEventListener("click", () => {
      const merged = mergeAnnotations(screenshot.dataUrl, canvas, width, height);
      const a = document.createElement("a");
      a.href = merged;
      a.download = screenshot.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(`\u2713 Downloaded: ${screenshot.filename}`, root);
    });
  }
  function mergeAnnotations(baseDataUrl, annotationCanvas, w, h) {
    const mergeCanvas = document.createElement("canvas");
    mergeCanvas.width = w;
    mergeCanvas.height = h;
    const mCtx = mergeCanvas.getContext("2d");
    const img = new Image();
    img.src = baseDataUrl;
    mCtx.drawImage(img, 0, 0, w, h);
    mCtx.drawImage(annotationCanvas, 0, 0);
    return mergeCanvas.toDataURL("image/png", 0.9);
  }
  function annToolBtnStyle(active) {
    if (active) {
      return "background:#3b82f633;color:#3b82f6;border:1px solid #3b82f6;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;";
    }
    return "background:#22222244;color:#888;border:1px solid #33333344;border-radius:5px;padding:5px 12px;cursor:pointer;font-size:12px;font-family:inherit;";
  }
  function annActionBtnStyle() {
    return "background:#22222244;color:#888;border:1px solid #33333344;border-radius:5px;padding:5px 10px;cursor:pointer;font-size:11px;font-family:inherit;";
  }

  // src/collectors.ts
  var PANEL_ID3 = "tracebug-dashboard-panel";
  var BTN_ID3 = "tracebug-dashboard-btn";
  var INTERNAL_URL_PATTERNS = [
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
    /\/@react-refresh/
  ];
  function isInternalUrl(url) {
    return INTERNAL_URL_PATTERNS.some((pattern) => pattern.test(url));
  }
  function isTraceBugElement(el) {
    if (!el) return false;
    if (el.id === BTN_ID3 || el.id === PANEL_ID3) return true;
    const panel = document.getElementById(PANEL_ID3);
    const btn = document.getElementById(BTN_ID3);
    if (panel && panel.contains(el)) return true;
    if (btn && btn.contains(el)) return true;
    return false;
  }
  function collectClicks(emit) {
    const handler = (e) => {
      const t = e.target;
      if (!t || isTraceBugElement(t)) return;
      const tag = t.tagName.toLowerCase();
      const data = {
        element: {
          tag,
          text: (t.innerText || "").slice(0, 120),
          id: t.id || "",
          className: typeof t.className === "string" ? t.className : ""
        }
      };
      const el = data.element;
      if (tag === "a") {
        el.href = t.href || "";
      }
      if (tag === "button" || t.type === "submit") {
        el.buttonType = t.type || "button";
        el.disabled = t.disabled;
      }
      if (tag === "label") {
        el.forField = t.htmlFor || "";
      }
      const ariaLabel = t.getAttribute("aria-label");
      if (ariaLabel) el.ariaLabel = ariaLabel;
      const role = t.getAttribute("role");
      if (role) el.role = role;
      const testId = t.getAttribute("data-testid");
      if (testId) el.testId = testId;
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
  function collectInputs(emit) {
    const timers = /* @__PURE__ */ new Map();
    const handler = (e) => {
      const t = e.target;
      if (!t || !("value" in t) || isTraceBugElement(t)) return;
      if (t.tagName.toLowerCase() === "select") return;
      const prev = timers.get(t);
      if (prev) clearTimeout(prev);
      timers.set(
        t,
        setTimeout(() => {
          const tag = t.tagName.toLowerCase();
          const inputType = t.type || "";
          const isSensitive = ["password", "credit-card", "ssn"].includes(inputType) || /password|secret|token|ssn|credit/i.test(t.name || t.id || "");
          const data = {
            element: {
              tag,
              name: t.name || t.id || "",
              type: inputType,
              valueLength: (t.value || "").length,
              value: isSensitive ? "[REDACTED]" : (t.value || "").slice(0, 200),
              placeholder: t.placeholder || ""
            }
          };
          if (inputType === "checkbox" || inputType === "radio") {
            data.element.checked = t.checked;
            data.element.value = t.checked ? "checked" : "unchecked";
          }
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
  function collectSelectChanges(emit) {
    const handler = (e) => {
      const t = e.target;
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
          allOptions: Array.from(t.options).map((o) => o.text).slice(0, 20)
        }
      });
    };
    document.addEventListener("change", handler, { capture: true });
    return () => document.removeEventListener("change", handler, { capture: true });
  }
  function collectFormSubmits(emit) {
    const handler = (e) => {
      const form = e.target;
      if (!form || form.tagName.toLowerCase() !== "form" || isTraceBugElement(form)) return;
      const formData = {};
      const elements = form.elements;
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (!el.name) continue;
        const isSensitive = ["password"].includes(el.type) || /password|secret|token|ssn|credit/i.test(el.name);
        if (el.type === "submit" || el.type === "button") continue;
        formData[el.name] = isSensitive ? "[REDACTED]" : (el.value || "").slice(0, 200);
      }
      emit("form_submit", {
        form: {
          id: form.id || "",
          action: form.action || "",
          method: form.method || "GET",
          fieldCount: elements.length,
          fields: formData
        }
      });
    };
    document.addEventListener("submit", handler, { capture: true });
    return () => document.removeEventListener("submit", handler, { capture: true });
  }
  function collectRouteChanges(emit) {
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
    history.pushState = function(...args) {
      origPush(...args);
      check();
    };
    history.replaceState = function(...args) {
      origReplace(...args);
      check();
    };
    return () => {
      window.removeEventListener("popstate", check);
      history.pushState = origPush;
      history.replaceState = origReplace;
    };
  }
  function collectApiRequests(emit) {
    const originalFetch = window.fetch;
    window.fetch = async function(input, init) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init == null ? void 0 : init.method) || "GET";
      const start = Date.now();
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
            durationMs: Date.now() - start
          }
        });
        return response;
      } catch (err) {
        emit("api_request", {
          request: {
            url: url.slice(0, 500),
            method: method.toUpperCase(),
            statusCode: 0,
            durationMs: Date.now() - start
          }
        });
        throw err;
      }
    };
    return () => {
      window.fetch = originalFetch;
    };
  }
  function collectXhrRequests(emit) {
    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;
    OrigXHR.prototype.open = function(method, url, ...rest) {
      this._tb_method = method;
      this._tb_url = typeof url === "string" ? url : url.toString();
      return origOpen.apply(this, [method, url, ...rest]);
    };
    OrigXHR.prototype.send = function(body) {
      const xhr = this;
      const start = Date.now();
      const method = xhr._tb_method || "GET";
      const url = xhr._tb_url || "";
      if (isInternalUrl(url)) {
        return origSend.call(this, body);
      }
      xhr.addEventListener("loadend", function() {
        emit("api_request", {
          request: {
            url: url.slice(0, 500),
            method: method.toUpperCase(),
            statusCode: xhr.status,
            durationMs: Date.now() - start
          }
        });
      });
      xhr.addEventListener("error", function() {
        emit("api_request", {
          request: {
            url: url.slice(0, 500),
            method: method.toUpperCase(),
            statusCode: 0,
            durationMs: Date.now() - start
          }
        });
      });
      return origSend.call(this, body);
    };
    return () => {
      OrigXHR.prototype.open = origOpen;
      OrigXHR.prototype.send = origSend;
    };
  }
  function collectErrors(emit) {
    const prevOnError = window.onerror;
    window.onerror = (msg, source, line, col, error) => {
      emit("error", {
        error: {
          message: typeof msg === "string" ? msg : "Unknown error",
          stack: error == null ? void 0 : error.stack,
          source,
          line,
          column: col
        }
      });
      if (prevOnError) prevOnError(msg, source, line, col, error);
    };
    const onRejection = (e) => {
      var _a, _b;
      emit("unhandled_rejection", {
        error: {
          message: ((_a = e.reason) == null ? void 0 : _a.message) || String(e.reason),
          stack: (_b = e.reason) == null ? void 0 : _b.stack
        }
      });
    };
    window.addEventListener("unhandledrejection", onRejection);
    const origConsoleError = console.error;
    console.error = function(...args) {
      emit("console_error", {
        error: {
          message: args.map((a) => typeof a === "string" ? a : JSON.stringify(a)).join(" ")
        }
      });
      origConsoleError.apply(console, args);
    };
    return () => {
      window.onerror = prevOnError;
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = origConsoleError;
    };
  }

  // src/index.ts
  var import_meta = {};
  var TraceBugSDK = class {
    constructor() {
      this.config = null;
      this.cleanups = [];
      this.initialized = false;
      this.recording = true;
      this.sessionId = null;
    }
    /**
     * Initialize TraceBug. Call once on app startup.
     *
     *   TraceBug.init({ projectId: "my-app" });
     *
     * Options:
     *  - projectId:       Required. Identifies your app.
     *  - maxEvents:       Max events per session in storage (default 200).
     *  - maxSessions:     Max sessions kept in localStorage (default 50).
     *  - enableDashboard: Show the floating bug button (default true).
     *  - enabled:         Control when SDK is active (default "auto").
     */
    init(config) {
      var _a;
      if (this.initialized) {
        console.warn("[TraceBug] Already initialized.");
        return;
      }
      if (!this.shouldEnable((_a = config.enabled) != null ? _a : "auto")) {
        console.info("[TraceBug] Disabled in this environment.");
        return;
      }
      this.config = {
        maxEvents: 200,
        maxSessions: 50,
        enableDashboard: true,
        ...config
      };
      this.initialized = true;
      this.recording = true;
      this.sessionId = getSessionId();
      const sessionId = this.sessionId;
      const env = captureEnvironment();
      saveEnvironment(sessionId, env);
      const emit = (type, data) => {
        var _a2, _b;
        if (!this.recording) return;
        const event = {
          id: Math.random().toString(36).slice(2, 10),
          sessionId,
          projectId: this.config.projectId,
          type,
          page: window.location.pathname,
          timestamp: Date.now(),
          data
        };
        appendEvent(
          sessionId,
          event,
          this.config.maxEvents,
          this.config.maxSessions
        );
        if (type === "error" || type === "unhandled_rejection") {
          this.processError(sessionId, (_a2 = data.error) == null ? void 0 : _a2.message, (_b = data.error) == null ? void 0 : _b.stack);
        }
      };
      this.cleanups.push(collectClicks(emit));
      this.cleanups.push(collectInputs(emit));
      this.cleanups.push(collectSelectChanges(emit));
      this.cleanups.push(collectFormSubmits(emit));
      this.cleanups.push(collectRouteChanges(emit));
      this.cleanups.push(collectApiRequests(emit));
      this.cleanups.push(collectXhrRequests(emit));
      this.cleanups.push(collectErrors(emit));
      if (this.config.enableDashboard) {
        setRecordingState(this.recording, () => {
          if (this.recording) {
            this.pauseRecording();
          } else {
            this.resumeRecording();
          }
          updateRecordingState(this.recording);
        });
        this.cleanups.push(mountDashboard());
      }
      console.info(
        `[TraceBug] Initialized \u2014 project: ${config.projectId}, session: ${sessionId}`
      );
    }
    /** Pause recording — events will not be captured until resumed */
    pauseRecording() {
      this.recording = false;
      console.info("[TraceBug] Recording paused.");
    }
    /** Resume recording after a pause */
    resumeRecording() {
      this.recording = true;
      console.info("[TraceBug] Recording resumed.");
    }
    /** Check if currently recording */
    isRecording() {
      return this.recording;
    }
    /** Get current session ID */
    getSessionId() {
      return this.sessionId;
    }
    // ── Screenshot ──────────────────────────────────────────────────────
    /** Capture a screenshot of the current page */
    async takeScreenshot() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      const lastEvent = (session == null ? void 0 : session.events[session.events.length - 1]) || null;
      const screenshot = await captureScreenshot(lastEvent);
      console.info(`[TraceBug] Screenshot captured: ${screenshot.filename}`);
      return screenshot;
    }
    /** Get all screenshots from current session */
    getScreenshots() {
      return getScreenshots();
    }
    // ── Annotations ─────────────────────────────────────────────────────
    /** Add a tester note/annotation to the current session */
    addNote(options) {
      if (!this.sessionId) return;
      const annotation = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        text: options.text,
        expected: options.expected,
        actual: options.actual,
        severity: options.severity || "info",
        screenshotId: options.screenshotId
      };
      addAnnotation(this.sessionId, annotation);
      console.info(`[TraceBug] Note added: "${options.text}"`);
    }
    // ── Report Generation ───────────────────────────────────────────────
    /** Generate a complete bug report for the current session */
    generateReport() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      return buildReport(session);
    }
    /** Generate GitHub issue markdown */
    getGitHubIssue() {
      const report = this.generateReport();
      if (!report) return null;
      return generateGitHubIssue(report);
    }
    /** Generate Jira ticket payload */
    getJiraTicket() {
      const report = this.generateReport();
      if (!report) return null;
      return generateJiraTicket(report);
    }
    /** Download a PDF bug report */
    downloadPdf() {
      const report = this.generateReport();
      if (!report) {
        console.warn("[TraceBug] No session data to generate PDF.");
        return;
      }
      generatePdfReport(report);
    }
    /** Get auto-generated bug title */
    getBugTitle() {
      if (!this.sessionId) return null;
      const sessions = getAllSessions();
      const session = sessions.find((s) => s.sessionId === this.sessionId);
      if (!session) return null;
      return generateBugTitle(session);
    }
    /** Get environment info */
    getEnvironment() {
      return captureEnvironment();
    }
    // ── Private methods ─────────────────────────────────────────────────
    /**
     * Determine if TraceBug should be active based on the `enabled` config.
     */
    shouldEnable(mode) {
      if (mode === "off") return false;
      if (mode === "all") return true;
      if (Array.isArray(mode)) {
        const host2 = typeof window !== "undefined" ? window.location.hostname : "";
        return mode.some((h) => host2 === h || host2.endsWith("." + h));
      }
      const env = this.detectEnvironment();
      const host = typeof window !== "undefined" ? window.location.hostname : "";
      const isStaging = /staging|\.stg\.|\.uat\.|\.qa\.|\.dev\./i.test(host);
      if (mode === "development") {
        return env === "development";
      }
      if (mode === "staging") {
        return env === "development" || isStaging;
      }
      if (env === "production" && !isStaging) {
        return false;
      }
      return true;
    }
    /**
     * Detect the current environment from various sources.
     */
    detectEnvironment() {
      var _a;
      try {
        if (typeof (import_meta == null ? void 0 : import_meta.env) !== "undefined") {
          const meta = import_meta.env;
          if (meta.PROD === true) return "production";
          if (meta.DEV === true) return "development";
          if (meta.MODE) return meta.MODE;
        }
      } catch (e) {
      }
      try {
        const g = globalThis;
        if (typeof g.process !== "undefined" && ((_a = g.process.env) == null ? void 0 : _a.NODE_ENV)) {
          return g.process.env.NODE_ENV;
        }
      } catch (e) {
      }
      if (typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]") {
          return "development";
        }
      }
      return "production";
    }
    /**
     * When an error event is captured, pull the session timeline from
     * localStorage and generate reproduction steps.
     */
    processError(sessionId, errorMessage, errorStack) {
      if (!errorMessage) return;
      setTimeout(() => {
        const sessions = getAllSessions();
        const session = sessions.find((s) => s.sessionId === sessionId);
        if (!session) return;
        const result = generateReproSteps(
          session.events,
          errorMessage,
          errorStack
        );
        updateSessionError(
          sessionId,
          errorMessage,
          errorStack,
          result.reproSteps,
          result.errorSummary
        );
        console.info(
          "[TraceBug] Bug report generated. Click the bug button to view reproduction steps."
        );
      }, 100);
    }
    /**
     * Tear down the SDK — removes all listeners and the dashboard.
     */
    destroy() {
      this.cleanups.forEach((fn) => fn());
      this.cleanups = [];
      this.initialized = false;
      this.config = null;
      this.recording = false;
      this.sessionId = null;
      clearScreenshots();
    }
  };
  var TraceBug = new TraceBugSDK();
  var src_default = TraceBug;
  return __toCommonJS(src_exports);
})();

        // Expose TraceBug on window for extension use (only once)
        if (typeof window !== 'undefined' && typeof TraceBugModule !== 'undefined' && !window.__TRACEBUG_LOADED__) {
          window.__TRACEBUG_LOADED__ = true;
          window.TraceBug = TraceBugModule.default || TraceBugModule;
          window.TraceBugSDK = TraceBugModule;
        }
      
