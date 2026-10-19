// Every fetch/XHR reached the report twice: once from the wrapper, once from
// the Resource Timing backfill — and the timing copy always claimed `GET`,
// because Resource Timing has no method. A real export carried 112 rows for 75
// distinct paths, including a POST shadowed by a GET to the same endpoint.
//
// The two sources disagree about how to spell a URL (relative vs resolved) and
// about when the request happened (completion vs start), so those two things
// are what these tests pin down.
import { describe, it, expect } from "vitest";
import { dedupeNetworkRows, normalizeUrl, DEDUPE_WINDOW_MS } from "../src/network-dedupe";

const BASE = "https://app.example.com/orders";

/** A fetch/XHR wrapper row: relative URL, true method, emitted on completion. */
const wrapper = (url: string, o: Partial<{ method: string; status: number; duration: number; timestamp: number }> = {}) => ({
  method: o.method ?? "POST",
  url,
  status: o.status ?? 200,
  duration: o.duration ?? 100,
  timestamp: o.timestamp ?? 1_000_100, // completed at t, started at t - duration
});

/** A Resource Timing row: resolved URL, always GET, knows the real start. */
const timing = (url: string, o: Partial<{ startedAt: number; duration: number; initiatorType: string; status: number }> = {}) => ({
  method: "GET",
  url,
  status: o.status ?? 200,
  duration: o.duration ?? 100,
  timestamp: 1_000_500, // observed later than it started — this is the trap
  source: "resource-timing",
  initiatorType: o.initiatorType ?? "fetch",
  startedAt: o.startedAt ?? 1_000_000,
});

describe("normalizeUrl makes the two spellings comparable", () => {
  it("resolves a relative URL against the page", () => {
    expect(normalizeUrl("/api/orders", BASE)).toBe("https://app.example.com/api/orders");
  });

  it("leaves an absolute URL alone", () => {
    expect(normalizeUrl("https://app.example.com/api/orders", BASE)).toBe("https://app.example.com/api/orders");
  });

  it("drops the fragment — it never reaches the server", () => {
    expect(normalizeUrl("/api/orders#section", BASE)).toBe("https://app.example.com/api/orders");
  });

  it("keeps the query string — it is often the whole repro", () => {
    expect(normalizeUrl("/api/orders?status=failed", BASE)).toContain("?status=failed");
  });

  it("returns an unparseable URL as-is rather than collapsing it", () => {
    expect(normalizeUrl("::not a url::")).toBe("::not a url::");
  });
});

describe("a relative wrapper row and its absolute timing twin are one request", () => {
  it("drops the timing row and keeps the wrapper's method and status", () => {
    const rows = [wrapper("/api/orders", { method: "POST", status: 201 }), timing("https://app.example.com/api/orders")];
    const out = dedupeNetworkRows(rows, { baseUrl: BASE });
    expect(out).toHaveLength(1);
    expect(out[0].method).toBe("POST");
    expect(out[0].status).toBe(201);
  });

  it("pairs them on START, not on the emitted timestamp", () => {
    // The wrapper emitted 500ms after the timing row's own emit stamp. Only
    // comparing starts (1_000_000 both sides) can see these are the same call.
    const rows = [wrapper("/api/orders", { duration: 100, timestamp: 1_000_100 }), timing("https://app.example.com/api/orders", { startedAt: 1_000_000 })];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(1);
  });

  it("works whichever order the two sources landed in", () => {
    const rows = [timing("https://app.example.com/api/orders"), wrapper("/api/orders")];
    const out = dedupeNetworkRows(rows, { baseUrl: BASE });
    expect(out).toHaveLength(1);
    expect(out[0].method).toBe("POST");
  });

  it("pairs two absolute spellings too — an app may write either", () => {
    const rows = [wrapper("https://app.example.com/api/orders"), timing("https://app.example.com/api/orders")];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(1);
  });

  it("keeps both when the starts are too far apart to be one request", () => {
    const rows = [wrapper("/api/orders", { timestamp: 1_000_100, duration: 100 }), timing("https://app.example.com/api/orders", { startedAt: 1_000_000 + DEDUPE_WINDOW_MS + 20 })];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(2);
  });

  it("keeps both when they are different paths", () => {
    const rows = [wrapper("/api/orders"), timing("https://app.example.com/api/invoices")];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(2);
  });
});

describe("the backfill keeps doing its job", () => {
  it("never drops images, scripts, CSS, fonts or media", () => {
    const assets = ["img", "image", "script", "css", "link", "font", "media", "video", "audio"];
    const rows = [
      wrapper("/static/thing.png"),
      ...assets.map((initiatorType) => timing("https://app.example.com/static/thing.png", { initiatorType })),
    ];
    // Even with a wrapper row at the same URL and instant, every asset row survives.
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(1 + assets.length);
  });

  it("keeps a timing row no wrapper explains — that is the whole point of it", () => {
    const rows = [timing("https://app.example.com/api/before-the-sdk-loaded")];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(1);
  });

  it("keeps beacons and other non-wrapper traffic", () => {
    const rows = [wrapper("/api/orders"), timing("https://app.example.com/telemetry", { initiatorType: "beacon" })];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(2);
  });
});

describe("repeated requests to one URL stay visible", () => {
  it("keeps N polls as N rows instead of collapsing them", () => {
    // A report that hid a retry loop would be worse than the duplicates this
    // removes: each timing row consumes the wrapper row it paired with.
    const rows = [
      wrapper("/api/presence", { timestamp: 1_000_100 }),
      wrapper("/api/presence", { timestamp: 1_005_100 }),
      wrapper("/api/presence", { timestamp: 1_010_100 }),
      timing("https://app.example.com/api/presence", { startedAt: 1_000_000 }),
      timing("https://app.example.com/api/presence", { startedAt: 1_005_000 }),
      timing("https://app.example.com/api/presence", { startedAt: 1_010_000 }),
    ];
    const out = dedupeNetworkRows(rows, { baseUrl: BASE });
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.method === "POST")).toBe(true);
  });

  it("keeps a timing row that outnumbers the wrapper rows", () => {
    const rows = [
      wrapper("/api/presence", { timestamp: 1_000_100 }),
      timing("https://app.example.com/api/presence", { startedAt: 1_000_000 }),
      timing("https://app.example.com/api/presence", { startedAt: 1_005_000 }),
    ];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(2);
  });
});

describe("it degrades safely", () => {
  it("returns the rows untouched when nothing came from a wrapper", () => {
    const rows = [timing("https://app.example.com/a"), timing("https://app.example.com/b")];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE })).toHaveLength(2);
  });

  it("without a base URL, only already-absolute pairs can match", () => {
    // Costs recall, never correctness: a relative row keeps its own row.
    const relative = dedupeNetworkRows([wrapper("/api/orders"), timing("https://app.example.com/api/orders")]);
    expect(relative).toHaveLength(2);
    const absolute = dedupeNetworkRows([wrapper("https://app.example.com/api/orders"), timing("https://app.example.com/api/orders")]);
    expect(absolute).toHaveLength(1);
  });

  it("handles empty and single-row inputs", () => {
    expect(dedupeNetworkRows([])).toEqual([]);
    expect(dedupeNetworkRows([wrapper("/api/orders")])).toHaveLength(1);
  });

  it("preserves the order of what it keeps", () => {
    const rows = [
      wrapper("/api/a", { timestamp: 1_000_100 }),
      timing("https://app.example.com/api/a", { startedAt: 1_000_000 }),
      wrapper("/api/b", { timestamp: 1_002_100 }),
      timing("https://app.example.com/static/x.png", { initiatorType: "img" }),
    ];
    expect(dedupeNetworkRows(rows, { baseUrl: BASE }).map((r) => r.url)).toEqual([
      "/api/a", "/api/b", "https://app.example.com/static/x.png",
    ]);
  });
});
