// ── TraceBug Playwright reporter ──────────────────────────────────────────
// Turns every failed Playwright test into a self-contained TraceBug `.html`
// bug report — the same artifact the Chrome extension exports, readable by
// the same MCP server (`npx -y tracebug mcp`). Upload the output folder as a
// CI artifact and any developer can hand the failure straight to their
// coding agent: no cloud viewer, no account, no upload.
//
// Two-line setup in playwright.config.ts:
//   reporter: [["list"], ["tracebug-sdk/playwright", { outputDir: "bug-reports" }]],
//
// Optional (richer reports — page console + network): swap the `test` import
// in your specs, or wire the fixture yourself:
//   import { test, expect } from "@playwright/test";
//   // becomes
//   import { test as base, expect } from "@playwright/test";
//   import { traceBugPage } from "tracebug-sdk/playwright";
//   export const test = base.extend({ page: traceBugPage });
//
// This module deliberately imports NOTHING from @playwright/test — all types
// are structural, so the SDK builds and tests without Playwright installed,
// and the reporter keeps working across Playwright versions.

import * as fs from "node:fs";
import * as path from "node:path";
import { buildReplayHtml, BundlePayload } from "../exporters/html-template";

// ── Structural slices of the Playwright API we touch ─────────────────────

interface StepLike {
  title: string;
  category?: string;
  startTime?: Date | string | number;
  duration?: number;
  error?: { message?: string };
  steps?: StepLike[];
}

interface AttachmentLike {
  name: string;
  contentType: string;
  path?: string;
  body?: Buffer | Uint8Array;
}

interface TestCaseLike {
  title: string;
  id?: string;
  retries?: number;
  location?: { file?: string; line?: number };
  titlePath?: () => string[];
  parent?: { project?: () => { name?: string } | undefined };
}

interface TestResultLike {
  status: string;
  retry?: number;
  startTime?: Date | string | number;
  duration?: number;
  errors?: Array<{ message?: string; stack?: string; snippet?: string }>;
  attachments?: AttachmentLike[];
  steps?: StepLike[];
}

interface PageLike {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (arg: any) => void): unknown;
}

interface TestInfoLike {
  status?: string;
  expectedStatus?: string;
  attach(name: string, options: { body: string | Buffer; contentType: string }): Promise<void>;
}

// Payload the fixture attaches for the reporter to pick up.
export const CAPTURE_ATTACHMENT = "tracebug-capture";

interface CaptureData {
  consoleLogs: Array<{ level: "error" | "warn" | "log" | "info"; message: string; stack?: string; timestamp: number }>;
  requests: Array<{ method: string; url: string; status: number; duration: number; timestamp: number; response?: string }>;
  navigations: Array<{ url: string; timestamp: number }>;
}

// ── Optional page fixture — captures console + network during the test ───
// Shaped as a Playwright fixture function so wiring it is one line:
//   base.extend({ page: traceBugPage })

export async function traceBugPage(
  { page }: { page: PageLike },
  use: (page: PageLike) => Promise<void>,
  testInfo: TestInfoLike,
): Promise<void> {
  const data: CaptureData = { consoleLogs: [], requests: [], navigations: [] };
  const CAP = 500; // per-list cap so a chatty app can't bloat the artifact

  page.on("console", ((msg: { type(): string; text(): string }) => {
    if (data.consoleLogs.length >= CAP) return;
    const t = msg.type();
    const level = t === "error" ? "error" : t === "warning" ? "warn" : t === "info" ? "info" : "log";
    data.consoleLogs.push({ level, message: msg.text(), timestamp: Date.now() });
  }) as never);

  page.on("pageerror", ((err: { message?: string; stack?: string }) => {
    if (data.consoleLogs.length >= CAP) return;
    data.consoleLogs.push({ level: "error", message: err?.message || String(err), stack: err?.stack, timestamp: Date.now() });
  }) as never);

  page.on("response", (async (res: {
    status(): number;
    url(): string;
    text(): Promise<string>;
    request(): { method(): string; timing?: () => { responseEnd?: number } };
  }) => {
    if (data.requests.length >= CAP) return;
    try {
      const status = res.status();
      const entry: CaptureData["requests"][number] = {
        method: res.request().method(),
        url: res.url(),
        status,
        duration: Math.max(0, Math.round(res.request().timing?.()?.responseEnd ?? 0)),
        timestamp: Date.now(),
      };
      if (status >= 400) {
        try { entry.response = (await res.text()).slice(0, 500); } catch { /* body may be unavailable */ }
      }
      data.requests.push(entry);
    } catch { /* never break the test on capture errors */ }
  }) as never);

  page.on("framenavigated", ((frame: { parentFrame?: () => unknown; url(): string }) => {
    try {
      if (!frame.parentFrame || frame.parentFrame() === null) {
        data.navigations.push({ url: frame.url(), timestamp: Date.now() });
      }
    } catch { /* ignore */ }
  }) as never);

  await use(page);

  // Attach only on unexpected outcomes — keeps passing runs artifact-free.
  if (testInfo.status !== testInfo.expectedStatus) {
    try {
      await testInfo.attach(CAPTURE_ATTACHMENT, {
        body: JSON.stringify(data),
        contentType: "application/json",
      });
    } catch { /* attach can fail after teardown; the reporter degrades gracefully */ }
  }
}

// ── The reporter ──────────────────────────────────────────────────────────

export interface TraceBugReporterOptions {
  /** Where to write the .html reports. Default: "bug-reports". */
  outputDir?: string;
}

export default class TraceBugReporter {
  private outputDir: string;
  private written: string[] = [];

  constructor(options: TraceBugReporterOptions = {}) {
    this.outputDir = options.outputDir || "bug-reports";
  }

  printsToStdio(): boolean { return false; }

  async onTestEnd(test: TestCaseLike, result: TestResultLike): Promise<void> {
    if (result.status === "passed" || result.status === "skipped" || result.status === "interrupted") return;
    // Only report the FINAL attempt — earlier retries would duplicate the bug.
    if ((result.retry ?? 0) < (test.retries ?? 0)) return;

    try {
      const payload = this.buildPayload(test, result);
      const html = buildReplayHtml(payload);
      fs.mkdirSync(this.outputDir, { recursive: true });
      const file = path.join(this.outputDir, this.filenameFor(test));
      fs.writeFileSync(file, html, "utf8");
      this.written.push(file);
    } catch (err) {
      // A broken reporter must never fail the run.
      console.error(`[TraceBug] failed to write report for "${test.title}":`, err);
    }
  }

  onEnd(): void {
    if (this.written.length === 0) return;
    const n = this.written.length;
    console.log(`\n\x1b[36m[TraceBug]\x1b[0m ${n} bug report${n === 1 ? "" : "s"} written:`);
    for (const f of this.written) console.log(`  \x1b[2m→\x1b[0m ${f}`);
    console.log(
      `  Debug with your coding agent: \x1b[1mclaude mcp add tracebug -- npx -y tracebug mcp --dir ${this.outputDir}\x1b[0m` +
      `\n  then \x1b[1m/tracebug:debug_bug_report\x1b[0m — or open the .html in a browser.\n`,
    );
  }

  // ── Payload assembly ─────────────────────────────────────────────────

  private buildPayload(test: TestCaseLike, result: TestResultLike): BundlePayload {
    const startMs = toMs(result.startTime) ?? Date.now() - (result.duration ?? 0);
    const capture = readCapture(result.attachments ?? []);
    const errors = result.errors ?? [];
    const firstError = errors[0];
    const firstErrorLine = stripAnsi(firstError?.message ?? "").split("\n")[0].trim();

    // Console: page capture (if the fixture ran) + runner errors.
    const consoleLogs: NonNullable<BundlePayload["consoleLogs"]> = [
      ...capture.consoleLogs,
      ...errors.map((e) => ({
        level: "error" as const,
        message: stripAnsi(e.message ?? "Test error"),
        stack: stripAnsi(e.stack ?? ""),
        timestamp: startMs + (result.duration ?? 0),
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);

    const networkRequests = capture.requests;
    const networkErrors = networkRequests.filter((r) => r.status === 0 || r.status >= 400);

    // Steps → timeline + plain-English repro steps.
    const flatSteps = flattenSteps(result.steps ?? []);
    const events: NonNullable<BundlePayload["events"]> = flatSteps.map((s) => {
      const ts = toMs(s.startTime) ?? startMs;
      return {
        timestamp: ts,
        type: stepType(s),
        description: stripAnsi(s.title),
        elapsed: fmtElapsed(ts - startMs),
        isError: Boolean(s.error),
      };
    });
    for (const log of consoleLogs) {
      if (log.level !== "error") continue;
      events.push({
        timestamp: log.timestamp,
        type: "error",
        description: log.message.split("\n")[0].slice(0, 200),
        elapsed: fmtElapsed(log.timestamp - startMs),
        isError: true,
      });
    }
    events.sort((a, b) => a.timestamp - b.timestamp);

    const actions = flatSteps
      .filter((s) => s.category === "test.step" || s.category === "pw:api")
      .slice(0, 30)
      .map((s, i) => `${i + 1}. ${stripAnsi(s.title)}`);

    // Screenshots: any image attachment (Playwright's screenshot-on-failure).
    const screenshots: NonNullable<BundlePayload["screenshots"]> = [];
    for (const a of result.attachments ?? []) {
      if (!a.contentType?.startsWith("image/")) continue;
      const bytes = attachmentBytes(a);
      if (!bytes) continue;
      screenshots.push({
        timestamp: startMs + (result.duration ?? 0),
        dataUrl: `data:${a.contentType};base64,${Buffer.from(bytes).toString("base64")}`,
        filename: a.name.endsWith(".png") ? a.name : `${a.name}.png`,
      });
    }

    const lastNav = capture.navigations[capture.navigations.length - 1];
    const page = lastNav?.url || test.location?.file || "";
    const project = test.parent?.project?.()?.name;
    const titlePath = test.titlePath?.().filter(Boolean).join(" › ") || test.title;

    return {
      meta: {
        title: `Test failed: ${test.title}`,
        severity: "high",
        summary: firstErrorLine || `${result.status} after ${result.duration ?? 0}ms`,
        rootCause: "",
        page,
        generatedAt: Date.now(),
        sessionId: test.id || `pwtest_${startMs.toString(36)}`,
        environment: ["Playwright", project, result.status].filter(Boolean).join(" · "),
        durationMs: result.duration ?? 0,
      },
      description: [
        `**Test:** ${titlePath}`,
        test.location?.file ? `**File:** ${test.location.file}${test.location.line ? `:${test.location.line}` : ""}` : "",
        "",
        firstError?.message ? "```\n" + stripAnsi(firstError.message).slice(0, 2000) + "\n```" : "",
        firstError?.snippet ? "```\n" + stripAnsi(firstError.snippet).slice(0, 1000) + "\n```" : "",
      ].filter(Boolean).join("\n"),
      events,
      screenshots,
      consoleLogs,
      consoleErrors: consoleLogs
        .filter((l) => l.level === "error")
        .map((l) => ({ message: l.message, stack: l.stack, timestamp: l.timestamp })),
      networkErrors,
      networkRequests,
      actions,
      actionChips: [],
      annotations: [],
      rootCauseHint: rootCauseFor(networkErrors, capture.consoleLogs, firstErrorLine),
    };
  }

  private filenameFor(test: TestCaseLike): string {
    const slug = test.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "test";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `tracebug-test-${slug}-${stamp}.html`;
  }
}

// ── Local root-cause heuristic (mirrors the SDK's tiering) ───────────────

function rootCauseFor(
  networkErrors: CaptureData["requests"],
  pageConsole: CaptureData["consoleLogs"],
  errorLine: string,
): BundlePayload["rootCauseHint"] {
  const server = networkErrors.find((r) => r.status >= 500);
  if (server) {
    return {
      hint: `${server.method} ${server.url} returned ${server.status}${server.response ? ` (${server.response.slice(0, 120)})` : ""} during the test — the failure likely follows from this server error`,
      confidence: "high",
    };
  }
  const client = networkErrors.find((r) => r.status >= 400 || r.status === 0);
  if (client) {
    return {
      hint: `${client.method} ${client.url} failed with ${client.status || "a network error"} during the test — check whether the assertion depends on this response`,
      confidence: "medium",
    };
  }
  const pageError = pageConsole.find((l) => l.level === "error" && l.stack);
  if (pageError) {
    return {
      hint: `Uncaught page error before the failure: ${pageError.message.split("\n")[0].slice(0, 160)}`,
      confidence: "medium",
    };
  }
  if (errorLine) {
    return { hint: `Assertion/runner failure: ${errorLine.slice(0, 200)}`, confidence: "low" };
  }
  return undefined;
}

// ── Small helpers ─────────────────────────────────────────────────────────

function readCapture(attachments: AttachmentLike[]): CaptureData {
  const empty: CaptureData = { consoleLogs: [], requests: [], navigations: [] };
  const att = attachments.find((a) => a.name === CAPTURE_ATTACHMENT);
  if (!att) return empty;
  try {
    const bytes = attachmentBytes(att);
    if (!bytes) return empty;
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
    return {
      consoleLogs: Array.isArray(parsed.consoleLogs) ? parsed.consoleLogs : [],
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      navigations: Array.isArray(parsed.navigations) ? parsed.navigations : [],
    };
  } catch {
    return empty;
  }
}

function attachmentBytes(a: AttachmentLike): Uint8Array | null {
  if (a.body) return a.body;
  if (a.path) {
    try { return fs.readFileSync(a.path); } catch { return null; }
  }
  return null;
}

function flattenSteps(steps: StepLike[], out: StepLike[] = []): StepLike[] {
  for (const s of steps) {
    if (s.category === "hook" || s.category === "fixture") {
      // hooks/fixtures are noise; still descend for nested api calls
      flattenSteps(s.steps ?? [], out);
      continue;
    }
    out.push(s);
    flattenSteps(s.steps ?? [], out);
  }
  return out;
}

function stepType(s: StepLike): string {
  const t = s.title.toLowerCase();
  if (t.includes("goto") || t.includes("navigate")) return "route_change";
  if (t.startsWith("click") || t.includes(".click")) return "click";
  if (t.includes("fill") || t.includes("type") || t.includes("press")) return "input";
  if (t.startsWith("expect")) return "assertion";
  return s.category === "test.step" ? "step" : "action";
}

function toMs(v: Date | string | number | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}
