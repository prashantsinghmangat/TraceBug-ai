// ── TraceBug MCP Server ──────────────────────────────────────────────────
// `npx tracebug mcp [--dir <path>]`
//
// A local, stdio Model Context Protocol server that lets AI coding agents
// (Claude Code, Cursor, Windsurf, …) read TraceBug bug reports. It operates
// on the *exported files* — the same self-contained `.html` replay a tester
// hands a developer (the report JSON is embedded in a `tb-data` script tag).
// Nothing is uploaded anywhere: the agent reads bug context from disk.
//
// Protocol: JSON-RPC 2.0, newline-delimited over stdio (MCP stdio transport).
// Hand-rolled on purpose — a tools-only server needs five methods, and this
// keeps the published package free of extra runtime dependencies.

import * as fs from "node:fs";
import * as path from "node:path";

// ── Payload shape (mirrors BundlePayload in src/exporters/html-template.ts) ──

interface ReportPayload {
  meta: {
    title: string;
    severity: string;
    priority?: string;
    summary: string;
    rootCause: string;
    page: string;
    generatedAt: number;
    sessionId: string;
    environment: string;
    durationMs: number;
  };
  description?: string;
  events?: Array<{ timestamp: number; type: string; description: string; elapsed: string; isError: boolean }>;
  screenshots?: Array<{ timestamp: number; dataUrl: string; filename: string }>;
  video?: { mimeType: string; durationMs: number; sizeBytes: number; comments: Array<{ offsetMs: number; text: string }> };
  info?: Array<{ k: string; v: string }>;
  consoleErrors?: Array<{ message: string; stack?: string; timestamp: number }>;
  consoleLogs?: Array<{ level: string; message: string; stack?: string; timestamp: number }>;
  networkErrors?: Array<{ method: string; url: string; status: number; duration: number; timestamp: number; response?: string }>;
  networkRequests?: Array<{ method: string; url: string; status: number; duration: number; timestamp: number; response?: string }>;
  actions?: string[];
  actionChips?: Array<{ verb: string; kind: string; target?: string; nounLabel?: string; detail?: string; frustration?: string; timestamp: number; isError?: boolean }>;
  annotations?: Array<{ severity: string; text: string; expected?: string; actual?: string }>;
  rootCauseHint?: { hint: string; confidence: string };
}

// ── File discovery & parsing ─────────────────────────────────────────────

const TB_DATA_RE = /<script id="tb-data" type="application\/json">([\s\S]*?)<\/script>/;
const MAX_SCAN_DEPTH = 3;
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "out"]);

/** Extract the embedded report payload from a TraceBug export file.
 *  Returns null when the file is not a TraceBug export. */
export function parseReportFile(filePath: string): ReportPayload | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  try {
    if (filePath.endsWith(".html")) {
      const m = TB_DATA_RE.exec(raw);
      if (!m) return null;
      const payload = JSON.parse(m[1].replace(/<\\\/script>/gi, "</script>"));
      return isReportPayload(payload) ? payload : null;
    }
    if (filePath.endsWith(".json")) {
      const payload = JSON.parse(raw);
      return isReportPayload(payload) ? payload : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isReportPayload(p: unknown): p is ReportPayload {
  return (
    typeof p === "object" && p !== null &&
    typeof (p as ReportPayload).meta === "object" && (p as ReportPayload).meta !== null &&
    typeof (p as ReportPayload).meta.title === "string" &&
    typeof (p as ReportPayload).meta.sessionId === "string"
  );
}

/** Recursively find TraceBug export files under `dir` (depth-limited). */
export function scanReportFiles(dir: string, depth = 0): string[] {
  if (depth > MAX_SCAN_DEPTH) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        found.push(...scanReportFiles(full, depth + 1));
      }
    } else if (entry.name.endsWith(".html") || entry.name.endsWith(".json")) {
      if (parseReportFile(full) !== null) found.push(full);
    }
  }
  return found;
}

// ── Tool implementations ─────────────────────────────────────────────────
// Each returns a JSON-serializable object. Screenshots/video data URLs are
// stripped from text results (token-heavy); get_screenshot returns real image
// content instead.

function requireReport(baseDir: string, file: string): { payload: ReportPayload; resolved: string } {
  const resolved = path.isAbsolute(file) ? file : path.join(baseDir, file);
  const payload = parseReportFile(resolved);
  if (!payload) {
    throw new Error(
      `Not a TraceBug export: ${resolved}. Use list_bug_reports to find valid report files.`
    );
  }
  return { payload, resolved };
}

export function toolListBugReports(baseDir: string, args: { dir?: string }) {
  const scanDir = args.dir ? (path.isAbsolute(args.dir) ? args.dir : path.join(baseDir, args.dir)) : baseDir;
  const files = scanReportFiles(scanDir);
  const reports = files.map((file) => {
    const p = parseReportFile(file)!;
    return {
      file: path.relative(baseDir, file) || file,
      title: p.meta.title,
      summary: p.meta.summary,
      severity: p.meta.severity,
      priority: p.meta.priority ?? null,
      page: p.meta.page,
      generatedAt: new Date(p.meta.generatedAt).toISOString(),
      rootCause: p.rootCauseHint ?? p.meta.rootCause ?? null,
      counts: {
        consoleErrors: p.consoleErrors?.length ?? 0,
        networkFailures: p.networkErrors?.length ?? 0,
        userActions: p.actionChips?.length ?? p.actions?.length ?? 0,
        screenshots: p.screenshots?.length ?? 0,
        hasVideo: Boolean(p.video),
      },
    };
  });
  return { count: reports.length, scannedDir: scanDir, reports };
}

export function toolGetBugReport(baseDir: string, args: { file: string }) {
  const { payload: p } = requireReport(baseDir, args.file);
  return {
    title: p.meta.title,
    summary: p.meta.summary,
    severity: p.meta.severity,
    priority: p.meta.priority ?? null,
    page: p.meta.page,
    generatedAt: new Date(p.meta.generatedAt).toISOString(),
    sessionDurationMs: p.meta.durationMs,
    environment: p.meta.environment,
    environmentDetails: p.info ?? [],
    description: p.description || null,
    rootCause: p.rootCauseHint ?? p.meta.rootCause ?? null,
    annotations: p.annotations ?? [],
    consoleErrorCount: p.consoleErrors?.length ?? 0,
    networkFailureCount: p.networkErrors?.length ?? 0,
    screenshotCount: p.screenshots?.length ?? 0,
    video: p.video
      ? { durationMs: p.video.durationMs, comments: p.video.comments }
      : null,
    note:
      "Use get_console_errors, get_network_activity, get_repro_steps, and get_screenshot for full detail.",
  };
}

export function toolGetConsoleErrors(baseDir: string, args: { file: string }) {
  const { payload: p } = requireReport(baseDir, args.file);
  const logs = p.consoleLogs?.length
    ? p.consoleLogs
    : (p.consoleErrors ?? []).map((e) => ({ level: "error" as const, ...e }));
  return {
    count: logs.length,
    entries: logs.map((l) => ({
      level: l.level,
      message: l.message,
      stack: l.stack ?? null,
      at: new Date(l.timestamp).toISOString(),
    })),
  };
}

export function toolGetNetworkActivity(baseDir: string, args: { file: string; failuresOnly?: boolean }) {
  const { payload: p } = requireReport(baseDir, args.file);
  const failures = p.networkErrors ?? [];
  const all = p.networkRequests ?? [];
  const rows = args.failuresOnly !== false ? failures : all.length ? all : failures;
  return {
    failureCount: failures.length,
    totalCaptured: all.length || failures.length,
    showing: args.failuresOnly !== false ? "failures only (pass failuresOnly:false for all requests)" : "all requests",
    requests: rows.map((r) => ({
      method: r.method,
      url: r.url,
      status: r.status,
      durationMs: r.duration,
      at: new Date(r.timestamp).toISOString(),
      responseSnippet: r.response ?? null,
    })),
  };
}

export function toolGetReproSteps(baseDir: string, args: { file: string }) {
  const { payload: p } = requireReport(baseDir, args.file);
  return {
    title: p.meta.title,
    rootCause: p.rootCauseHint ?? p.meta.rootCause ?? null,
    steps: p.actions ?? [],
    actions: (p.actionChips ?? []).map((c) => ({
      action: [c.verb, c.nounLabel ?? c.target].filter(Boolean).join(" "),
      kind: c.kind,
      detail: c.detail ?? null,
      frustrationSignal: c.frustration ?? null,
      causedError: c.isError ?? false,
      at: new Date(c.timestamp).toISOString(),
    })),
    timeline: (p.events ?? []).map((e) => ({
      elapsed: e.elapsed,
      type: e.type,
      description: e.description,
      isError: e.isError,
    })),
  };
}

export function toolGetScreenshot(baseDir: string, args: { file: string; index?: number }) {
  const { payload: p } = requireReport(baseDir, args.file);
  const shots = p.screenshots ?? [];
  const index = args.index ?? 0;
  if (!shots.length) throw new Error("This report contains no screenshots.");
  if (index < 0 || index >= shots.length) {
    throw new Error(`Screenshot index ${index} out of range (0–${shots.length - 1}).`);
  }
  const shot = shots[index];
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(shot.dataUrl);
  if (!m) throw new Error(`Screenshot ${index} has an unsupported data URL format.`);
  return {
    image: { mimeType: m[1], base64: m[2] },
    filename: shot.filename,
    takenAt: new Date(shot.timestamp).toISOString(),
    totalScreenshots: shots.length,
  };
}

// ── Tool registry (MCP tools/list definitions + dispatch) ────────────────

const FILE_PROP = {
  file: {
    type: "string",
    description: "Path to a TraceBug export file (.html), absolute or relative to the server's base directory. Get paths from list_bug_reports.",
  },
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: "list_bug_reports",
    description:
      "Scan a directory for TraceBug bug-report export files (.html/.json) and summarize each: title, summary, severity, root-cause hint, and captured-data counts. Start here.",
    inputSchema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Directory to scan (default: the server's base directory). Scans up to 3 levels deep, skipping node_modules etc." },
      },
    },
  },
  {
    name: "get_bug_report",
    description:
      "Get the overview of one TraceBug bug report: title, summary, severity, root-cause hint, environment, tester annotations, and what captured data is available.",
    inputSchema: { type: "object", properties: { ...FILE_PROP }, required: ["file"] },
  },
  {
    name: "get_console_errors",
    description: "Get the captured console output (errors, warnings, logs) with stack traces from a TraceBug bug report.",
    inputSchema: { type: "object", properties: { ...FILE_PROP }, required: ["file"] },
  },
  {
    name: "get_network_activity",
    description:
      "Get captured network requests from a TraceBug bug report. Defaults to failed requests (status >= 400 or 0) with response snippets; pass failuresOnly:false for every captured request.",
    inputSchema: {
      type: "object",
      properties: {
        ...FILE_PROP,
        failuresOnly: { type: "boolean", description: "true (default) = failures only; false = all captured requests" },
      },
      required: ["file"],
    },
  },
  {
    name: "get_repro_steps",
    description:
      "Get the reproduction context from a TraceBug bug report: plain-English steps, structured user actions (with rage/dead-click frustration signals), and the full session timeline.",
    inputSchema: { type: "object", properties: { ...FILE_PROP }, required: ["file"] },
  },
  {
    name: "get_screenshot",
    description:
      "Get one screenshot from a TraceBug bug report as an image. Screenshots are auto-named from the action that triggered them (e.g. 01_click_submit.png).",
    inputSchema: {
      type: "object",
      properties: {
        ...FILE_PROP,
        index: { type: "number", description: "Zero-based screenshot index (default 0). list_bug_reports shows the count." },
      },
      required: ["file"],
    },
  },
];

type ToolResult =
  | { content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>; isError?: boolean };

export function callTool(baseDir: string, name: string, args: Record<string, unknown>): ToolResult {
  try {
    switch (name) {
      case "list_bug_reports":
        return textResult(toolListBugReports(baseDir, args as { dir?: string }));
      case "get_bug_report":
        return textResult(toolGetBugReport(baseDir, args as { file: string }));
      case "get_console_errors":
        return textResult(toolGetConsoleErrors(baseDir, args as { file: string }));
      case "get_network_activity":
        return textResult(toolGetNetworkActivity(baseDir, args as { file: string; failuresOnly?: boolean }));
      case "get_repro_steps":
        return textResult(toolGetReproSteps(baseDir, args as { file: string }));
      case "get_screenshot": {
        const r = toolGetScreenshot(baseDir, args as { file: string; index?: number });
        return {
          content: [
            { type: "image", data: r.image.base64, mimeType: r.image.mimeType },
            { type: "text", text: JSON.stringify({ filename: r.filename, takenAt: r.takenAt, totalScreenshots: r.totalScreenshots }) },
          ],
        };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
  } catch (err) {
    return { content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }], isError: true };
  }
}

function textResult(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ── JSON-RPC 2.0 stdio loop (MCP stdio transport) ────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export function handleMessage(baseDir: string, msg: JsonRpcRequest): object | null {
  // Notifications (no id) never get a response.
  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case "initialize":
      return reply(msg.id, {
        protocolVersion: (msg.params?.protocolVersion as string) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "tracebug", version: SERVER_VERSION },
        instructions:
          "TraceBug exposes locally-exported bug reports (self-contained .html files) to AI agents. Call list_bug_reports first to discover reports, then drill in with the get_* tools. All data is read from local disk — nothing is uploaded.",
      });
    case "ping":
      return reply(msg.id, {});
    case "tools/list":
      return reply(msg.id, { tools: TOOL_DEFINITIONS });
    case "tools/call": {
      const name = msg.params?.name as string;
      const args = (msg.params?.arguments as Record<string, unknown>) ?? {};
      return reply(msg.id, callTool(baseDir, name, args));
    }
    default:
      if (isNotification) return null; // e.g. notifications/initialized, notifications/cancelled
      return { jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `Method not found: ${msg.method}` } };
  }
}

function reply(id: number | string | null | undefined, result: object): object {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

let SERVER_VERSION = "0.0.0";

/** Start the MCP server on stdio. Resolves when stdin closes. */
export function runMcpServer(baseDir: string, version: string): Promise<void> {
  SERVER_VERSION = version;
  process.stderr.write(`TraceBug MCP server — reading bug reports from ${baseDir}\n`);

  return new Promise((resolve) => {
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let msg: JsonRpcRequest;
        try {
          msg = JSON.parse(line);
        } catch {
          process.stdout.write(
            JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n"
          );
          continue;
        }
        const response = handleMessage(baseDir, msg);
        if (response) process.stdout.write(JSON.stringify(response) + "\n");
      }
    });
    process.stdin.on("end", () => resolve());
  });
}
