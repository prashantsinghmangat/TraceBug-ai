// ── Failing-test generator ────────────────────────────────────────────────
// Turns a captured session into a runnable Playwright spec that REPRODUCES
// the bug: it replays the user's actions and asserts the captured failure is
// gone. Red until the bug is fixed, green after — the artifact an AI agent
// (or a human) iterates against. Closes the loop that diagnosis-only
// reports leave open: run test → see failure → patch → test passes.
//
// Deterministic, no AI. Locator preference mirrors Playwright's own advice:
// data-testid → id → aria-label → role+name → captured CSS selector → text.

import { BugReport, TraceBugEvent } from "../types";
import { isNoiseRequest } from "../url-hygiene";

/** Escape a value for a single-quoted TS string literal. */
function q(s: string): string {
  return "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\r?\n/g, " ") + "'";
}

/** Trim + collapse whitespace for role/text locators. */
function clean(s: string | undefined): string {
  return (s || "").replace(/\s+/g, " ").trim();
}

interface ElementData {
  tag?: string;
  text?: string;
  id?: string;
  testId?: string;
  ariaLabel?: string;
  role?: string;
  selector?: string;
  name?: string;
  type?: string;
  value?: string;
  checked?: boolean;
  selectedText?: string;
  buttonType?: string;
}

/** Best Playwright locator expression for a captured element. */
function locatorFor(el: ElementData): string | null {
  if (el.testId) return `page.getByTestId(${q(el.testId)})`;
  if (el.id) return `page.locator(${q("#" + el.id)})`;
  if (el.ariaLabel) return `page.getByLabel(${q(clean(el.ariaLabel))})`;
  const text = clean(el.text)?.split("\n")[0].slice(0, 60);
  const role = el.role || (el.tag === "button" || el.buttonType ? "button" : el.tag === "a" ? "link" : null);
  if (role && text) return `page.getByRole(${q(role)}, { name: ${q(text)} })`;
  if (el.selector) return `page.locator(${q(el.selector)})`;
  if (text) return `page.getByText(${q(text)}, { exact: false }).first()`;
  return null;
}

/** Locator for a form field captured by name-or-id (input events merge them). */
function fieldLocatorFor(el: ElementData): string | null {
  if (el.selector) return `page.locator(${q(el.selector)})`;
  if (el.name) return `page.locator(${q(`[name="${el.name}"], #${el.name}`)}).first()`;
  return null;
}

interface PrimaryFailure {
  kind: "network" | "console" | "none";
  /** URL pathname fragment for network failures; message snippet for console. */
  needle: string;
  display: string;
}

/** Pick the failure the test should assert on — same story-vs-noise rules as
 *  the timeline: beacons/assets don't count as the bug. */
function pickPrimaryFailure(report: BugReport): PrimaryFailure {
  const failing = (report.networkErrors || []).find(r => !isNoiseRequest(r.url));
  if (failing) {
    let needle = failing.url;
    try {
      needle = new URL(failing.url, "http://x.local").pathname;
    } catch {}
    return {
      kind: "network",
      needle,
      display: `${failing.method} ${failing.url} → ${failing.status === 0 ? "NETWORK_ERROR" : failing.status}`,
    };
  }
  const err = (report.consoleErrors || [])[0];
  if (err?.message) {
    // First 60 chars is enough to identify the error without over-matching.
    return { kind: "console", needle: clean(err.message).slice(0, 60), display: clean(err.message).slice(0, 120) };
  }
  return { kind: "none", needle: "", display: "" };
}

/**
 * Generate a runnable Playwright spec from a bug report, or null when the
 * session has no replayable user actions.
 */
export function generatePlaywrightTest(report: BugReport): string | null {
  const events: TraceBugEvent[] = [...(report.session?.events || [])].sort(
    (a, b) => a.timestamp - b.timestamp
  );

  // ── Steps ──────────────────────────────────────────────────────────────
  const steps: string[] = [];
  let lastStep = "";
  const push = (line: string) => {
    if (line === lastStep) return; // dedupe rage-clicks etc.
    steps.push(line);
    lastStep = line;
  };

  for (const ev of events) {
    const el = (ev.data?.element || {}) as ElementData;
    switch (ev.type) {
      case "click": {
        const loc = locatorFor(el);
        if (loc) push(`  await ${loc}.click();`);
        break;
      }
      case "input": {
        const loc = fieldLocatorFor(el);
        if (!loc) break;
        if (el.type === "checkbox" || el.type === "radio") {
          push(`  await ${loc}.${el.value === "unchecked" ? "uncheck" : "check"}();`);
        } else if (el.value === "[REDACTED]") {
          push(`  await ${loc}.fill(${q("TODO-redacted-value")}); // value was masked at capture — fill in a test value`);
        } else if (el.value) {
          push(`  await ${loc}.fill(${q(el.value)});`);
        }
        break;
      }
      case "select_change": {
        const loc = fieldLocatorFor(el);
        if (loc && el.selectedText) {
          push(`  await ${loc}.selectOption({ label: ${q(clean(el.selectedText))} });`);
        }
        break;
      }
      case "route_change": {
        if (ev.data?.to) push(`  // → navigated to ${ev.data.to}`);
        break;
      }
    }
  }

  const hasActions = steps.some(s => s.trimStart().startsWith("await"));
  if (!hasActions) return null;

  // ── Start URL ──────────────────────────────────────────────────────────
  let origin = "http://localhost:3000";
  let startPath = events[0]?.page || "/";
  try {
    const u = new URL(report.environment?.url || "");
    origin = u.origin;
    if (!events[0]?.page) startPath = u.pathname;
  } catch {}

  // ── Assertion ──────────────────────────────────────────────────────────
  const failure = pickPrimaryFailure(report);
  const title = clean(report.title) || "TraceBug captured bug";

  const lines: string[] = [];
  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`// Generated by TraceBug from bug report: ${title}`);
  lines.push(`// Session ${report.session?.sessionId?.slice(0, 8) || "?"} · captured ${new Date(report.generatedAt).toISOString()}`);
  lines.push(`//`);
  lines.push(`// This test REPRODUCES the captured bug — expect it to FAIL until the bug`);
  lines.push(`// is fixed, then pass. Point BASE_URL at your running dev server.`);
  lines.push(`const BASE_URL = process.env.BASE_URL || ${q(origin)};`);
  lines.push(``);
  lines.push(`test(${q(title)}, async ({ page }) => {`);

  if (failure.kind === "network") {
    lines.push(`  // Captured failure: ${failure.display}`);
    lines.push(`  const failedRequests: string[] = [];`);
    lines.push(`  page.on('response', (r) => {`);
    lines.push(`    if (r.status() >= 400) failedRequests.push(\`\${r.request().method()} \${r.url()} → \${r.status()}\`);`);
    lines.push(`  });`);
    lines.push(`  page.on('requestfailed', (r) => {`);
    lines.push(`    failedRequests.push(\`\${r.method()} \${r.url()} → \${r.failure()?.errorText ?? 'FAILED'}\`);`);
    lines.push(`  });`);
  } else {
    lines.push(failure.kind === "console"
      ? `  // Captured failure: ${failure.display}`
      : `  // No single captured failure — asserting the flow completes without page errors.`);
    lines.push(`  const pageErrors: string[] = [];`);
    lines.push(`  page.on('pageerror', (e) => pageErrors.push(e.message));`);
    lines.push(`  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });`);
  }

  lines.push(``);
  lines.push(`  await page.goto(BASE_URL + ${q(startPath)});`);
  lines.push(...steps);
  lines.push(``);
  lines.push(`  // Give in-flight requests/errors a moment to land before asserting.`);
  lines.push(`  await page.waitForLoadState('networkidle').catch(() => {});`);
  lines.push(``);

  if (failure.kind === "network") {
    lines.push(`  const stillFailing = failedRequests.filter((f) => f.includes(${q(failure.needle)}));`);
    lines.push(`  expect(stillFailing, 'Bug reproduced — this request failed during capture and is still failing').toEqual([]);`);
  } else if (failure.kind === "console") {
    lines.push(`  const stillFailing = pageErrors.filter((e) => e.includes(${q(failure.needle)}));`);
    lines.push(`  expect(stillFailing, 'Bug reproduced — this error was captured and is still thrown').toEqual([]);`);
  } else {
    lines.push(`  expect(pageErrors, 'The captured flow should complete without page errors').toEqual([]);`);
  }

  lines.push(`});`);
  lines.push(``);
  return lines.join("\n");
}

/** Suggested filename for the generated spec. */
export function playwrightTestFilename(report: BugReport): string {
  const slug = (clean(report.title) || "tracebug-bug")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "tracebug-bug";
  return `${slug}.spec.ts`;
}
