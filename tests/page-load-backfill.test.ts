// What the Resource Timing backfill does with the page load that happened
// BEFORE the user hit Capture.
//
// Two bugs met here. The drain that runs when collectors attach fired while
// `recording` was still false: its emits were dropped, but the entries were
// marked seen, so the drain at session start skipped the whole page load — in
// the extension, which always injects late, that was every capture. And when
// entries did come through, each one claimed `GET`, because Resource Timing
// has no method field. A POST made before injection was reported as a GET.
//
// The rule now: a pre-capture request is included only if it FAILED or was
// SLOW, marked `phase: "page-load"`; and a method is only stated when it is
// actually known.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  drainPerformanceNetwork,
  resetPerformanceSeen,
  PAGE_LOAD_SLOW_MS,
} from "../src/collectors";

const ORIGIN = "https://app.example.com";
const TIME_ORIGIN = 1_700_000_000_000;
/** The capture armed 10s into the page's life. */
const CAPTURE_STARTED_AT = TIME_ORIGIN + 10_000;

interface FakeEntry {
  name: string;
  initiatorType: string;
  startTime: number;
  duration: number;
  responseStatus?: number;
}

const entry = (o: Partial<FakeEntry> & { name: string }): FakeEntry => ({
  initiatorType: "fetch",
  startTime: 1_000, // 1s into the page — before the capture armed
  duration: 50,
  ...o,
});

/** Install a fake Resource Timing buffer and return the emitted rows. */
function drain(entries: FakeEntry[], opts?: { captureStartedAt?: number }) {
  vi.stubGlobal("performance", {
    timeOrigin: TIME_ORIGIN,
    getEntriesByType: () => entries,
  });
  const rows: Record<string, unknown>[] = [];
  resetPerformanceSeen();
  drainPerformanceNetwork((_type, data) => { rows.push((data as { request: Record<string, unknown> }).request); }, opts);
  return rows;
}

beforeEach(() => { vi.unstubAllGlobals(); resetPerformanceSeen(); });

describe("a page load that happened before the capture", () => {
  it("includes a CSS file that failed", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/app.css`, initiatorType: "css", responseStatus: 404, duration: 20 })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe(`${ORIGIN}/app.css`);
    expect(rows[0].statusCode).toBe(404);
    expect(rows[0].phase).toBe("page-load");
  });

  it("excludes an image that loaded fine", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/hero.png`, initiatorType: "img", responseStatus: 200, duration: 30 })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(0);
  });

  it("includes a slow script even though it succeeded", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/vendor.js`, initiatorType: "script", responseStatus: 200, duration: PAGE_LOAD_SLOW_MS + 500 })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].phase).toBe("page-load");
    expect(rows[0].method).toBe("GET"); // a script IS a GET — that one is known
  });

  it("includes a pre-injection fetch only when it failed or was slow, with an unknown method", () => {
    const quiet = entry({ name: `${ORIGIN}/api/ok`, responseStatus: 200, duration: 40 });
    const failed = entry({ name: `${ORIGIN}/api/broken`, responseStatus: 500, duration: 40 });
    const slow = entry({ name: `${ORIGIN}/api/slow`, responseStatus: 200, duration: PAGE_LOAD_SLOW_MS + 1 });
    const rows = drain([quiet, failed, slow], { captureStartedAt: CAPTURE_STARTED_AT });
    expect(rows.map((r) => r.url)).toEqual([`${ORIGIN}/api/broken`, `${ORIGIN}/api/slow`]);
    // Resource Timing never told us the verb. "" renders as "—"; inventing
    // GET is what put a request in the report that never happened.
    expect(rows.every((r) => r.method === "")).toBe(true);
    expect(rows.every((r) => r.phase === "page-load")).toBe(true);
  });

  it("treats exactly-at-the-threshold as not slow", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/api/edge`, responseStatus: 200, duration: PAGE_LOAD_SLOW_MS })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(0);
  });
});

describe("Firefox, where responseStatus does not exist", () => {
  // Chrome 109+ only. Every status reads 0 there, so the failure half of the
  // rule cannot fire and only the slow ones come through — documented in
  // docs/compatibility.md rather than guessed at.
  it("still includes the slow ones", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/api/slow`, duration: PAGE_LOAD_SLOW_MS + 200 })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].statusCode).toBe(0);
  });

  it("cannot include a quick failure, and does not pretend otherwise", () => {
    const rows = drain([entry({ name: `${ORIGIN}/api/broken`, duration: 40 })], { captureStartedAt: CAPTURE_STARTED_AT });
    expect(rows).toHaveLength(0);
  });
});

describe("requests made DURING the capture are untouched by the rule", () => {
  it("keeps a fast, successful one", () => {
    const rows = drain(
      [entry({ name: `${ORIGIN}/api/during`, startTime: 15_000, responseStatus: 200, duration: 10 })],
      { captureStartedAt: CAPTURE_STARTED_AT },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].phase).toBeUndefined();
  });

  it("keeps everything when no capture start is given (a navigation resume)", () => {
    const rows = drain([
      entry({ name: `${ORIGIN}/a.png`, initiatorType: "img", responseStatus: 200, duration: 5 }),
      entry({ name: `${ORIGIN}/api/b`, responseStatus: 200, duration: 5 }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.phase === undefined)).toBe(true);
  });
});

describe("the seen-set no longer eats the page load", () => {
  it("re-emits entries that an earlier drain dropped before a session existed", () => {
    const entries = [entry({ name: `${ORIGIN}/api/broken`, responseStatus: 500, duration: 40 })];
    // Drain once with no session armed — this is what collector attach does.
    drain(entries);
    // Arming a session clears the set, so the same entry is reconsidered.
    const rows = drain(entries, { captureStartedAt: CAPTURE_STARTED_AT });
    expect(rows).toHaveLength(1);
  });

  it("does not mark an excluded entry as seen — it can still arrive later", () => {
    // A quiet page-load row is skipped, not consumed: if the same URL is
    // requested again during the capture it must still be reported.
    vi.stubGlobal("performance", { timeOrigin: TIME_ORIGIN, getEntriesByType: () => [entry({ name: `${ORIGIN}/api/quiet`, responseStatus: 200, duration: 10 })] });
    const rows: Record<string, unknown>[] = [];
    resetPerformanceSeen();
    const emit = (_t: string, d: unknown) => { rows.push((d as { request: Record<string, unknown> }).request); };
    drainPerformanceNetwork(emit, { captureStartedAt: CAPTURE_STARTED_AT });
    expect(rows).toHaveLength(0);
    drainPerformanceNetwork(emit); // same entry, now in-capture terms
    expect(rows).toHaveLength(1);
  });
});
