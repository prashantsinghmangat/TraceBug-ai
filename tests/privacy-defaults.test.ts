import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { redactUrl } from "../src/url-hygiene";
import { captureEnvironment } from "../src/environment";
import { collectFormSubmits, collectInputs } from "../src/collectors";
import { captureStorageSnapshot, setCookieValueCapture } from "../src/storage-capture";
import { summarizeEvidence } from "../src/evidence-summary";
import { summarizeRedactions } from "../src/redaction-summary";
import type { BugReport, TraceBugEvent } from "../src/types";

// 1.12 item 5: privacy by default. The page URL, hidden form fields, typed
// tokens and every cookie of the host reached local exports and the AI prompt.

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3OCJ9.c2lnbmF0dXJlMTIzNDU2";

type Emitted = { type: string; data: any };

describe("redactUrl", () => {
  it("masks sensitive query params and keeps the rest", () => {
    expect(redactUrl("/api/users?q=hi&token=abc&page=2")).toBe("/api/users?q=hi&token=[REDACTED]&page=2");
  });
  it("masks an OAuth fragment and a hash route's query", () => {
    expect(redactUrl("https://app.test/cb#access_token=xyz&state=1")).toBe("https://app.test/cb#access_token=[REDACTED]&state=1");
    expect(redactUrl("https://app.test/#/cb?session=abc")).toBe("https://app.test/#/cb?session=[REDACTED]");
  });
  it("leaves URLs without params untouched", () => {
    expect(redactUrl("https://app.test/orders/42")).toBe("https://app.test/orders/42");
    expect(redactUrl("https://app.test/#/orders")).toBe("https://app.test/#/orders");
  });
});

describe("page URL", () => {
  afterEach(() => history.replaceState(null, "", "/"));
  it("the environment URL is redacted at capture", () => {
    history.replaceState(null, "", "/checkout?coupon=SAVE20&api_key=secret123");
    const url = captureEnvironment().url;
    expect(url).toContain("coupon=SAVE20");
    expect(url).toContain("api_key=[REDACTED]");
    expect(url).not.toContain("secret123");
  });
});

describe("form submits", () => {
  let emitted: Emitted[];
  let stop: () => void;
  beforeEach(() => {
    emitted = [];
    stop = collectFormSubmits((type: any, data: any) => emitted.push({ type, data }));
  });
  afterEach(() => stop());

  it("skips hidden fields (counted), masks sensitive ones, scrubs tokens, redacts the action", () => {
    document.body.innerHTML = `
      <form id="f" action="/pay?sig=abc123">
        <input type="hidden" name="csrf" value="tok-123">
        <input type="hidden" name="orderId" value="42">
        <input name="password" type="password" value="hunter2">
        <input name="note" value="Bearer abcdefghijklmnop1234">
        <input name="qty" value="3">
      </form>`;
    document.getElementById("f")!.dispatchEvent(new Event("submit", { bubbles: true }));
    const form = emitted[0].data.form;
    expect(form.fields).not.toHaveProperty("csrf");
    expect(form.fields).not.toHaveProperty("orderId");
    expect(form.hiddenSkipped).toBe(2);
    expect(form.fields.password).toBe("[REDACTED]");
    expect(form.fields.note).toBe("Bearer [REDACTED]");
    expect(form.fields.qty).toBe("3");
    expect(form.action).toContain("sig=[REDACTED]");
  });

  it("omits hiddenSkipped when there were none", () => {
    document.body.innerHTML = `<form id="f"><input name="qty" value="3"></form>`;
    document.getElementById("f")!.dispatchEvent(new Event("submit", { bubbles: true }));
    expect(emitted[0].data.form).not.toHaveProperty("hiddenSkipped");
  });
});

describe("typed values", () => {
  it("a token pasted into a plain field is scrubbed", () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<input id="q" name="search">`;
    const emitted: Emitted[] = [];
    const stop = collectInputs((type: any, data: any) => emitted.push({ type, data }));
    const el = document.getElementById("q") as HTMLInputElement;
    el.value = `debug ${JWT}`;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(400);
    stop();
    vi.useRealTimers();
    const value = emitted[0].data.element.value as string;
    expect(value).not.toContain(JWT);
    expect(value).toContain("[REDACTED]");
    expect(value.startsWith("debug ")).toBe(true);
  });
});

describe("cookies", () => {
  function clearCookies() {
    for (const c of document.cookie.split(/;\s*/)) {
      const name = c.split("=")[0];
      if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
  beforeEach(() => {
    clearCookies();
    document.cookie = "theme=dark; path=/";
    document.cookie = "session_id=abcdef123456; path=/";
  });
  afterEach(() => { setCookieValueCapture(false); clearCookies(); });

  it("are captured by name only by default", () => {
    const cookies = captureStorageSnapshot().cookies!;
    expect(cookies.map((c) => c.key).sort()).toEqual(["session_id", "theme"]);
    for (const c of cookies) {
      expect(c.value).toBe("");
      expect(c.valueOmitted).toBe(true);
    }
  });

  it("values are opt-in, and sensitive ones stay masked", () => {
    setCookieValueCapture(true);
    const cookies = captureStorageSnapshot().cookies!;
    expect(cookies.find((c) => c.key === "theme")).toEqual({ key: "theme", value: "dark" });
    const sid = cookies.find((c) => c.key === "session_id")!;
    expect(sid.redacted).toBe(true);
    expect(sid.value).not.toContain("abcdef123456");
  });
});

describe("evidence block", () => {
  function ev(type: TraceBugEvent["type"], data: any = {}): TraceBugEvent {
    return { id: "1", sessionId: "s", projectId: "p", type, page: "/", timestamp: 1, data };
  }
  function report(events: TraceBugEvent[], storage?: any): BugReport {
    return {
      title: "t", networkErrors: [], networkRequests: [], consoleErrors: [], screenshots: [],
      session: { sessionId: "s", events, consoleLevel: "warnings" },
      ...(storage ? { storage } : {}),
    } as unknown as BugReport;
  }

  it("says cookie values, hidden fields and HttpOnly cookies were not captured", () => {
    const s = summarizeEvidence(report(
      [ev("form_submit", { form: { fields: {}, hiddenSkipped: 2 } })],
      { local: [], session: [], cookies: [{ key: "theme", value: "", valueOmitted: true }] },
    ));
    expect(s.notCaptured.join("|")).toContain("cookie values (names only");
    expect(s.notCaptured.join("|")).toContain("2 hidden form fields");
    expect(s.notCaptured.join("|")).toContain("HttpOnly cookies");
  });

  it("adds nothing about cookies or hidden fields when neither applies", () => {
    const s = summarizeEvidence(report([ev("click")]));
    expect(s.notCaptured.join("|")).not.toMatch(/cookie|hidden form/i);
  });

  it("counts a token scrubbed out of a typed value", () => {
    const r = report([
      ev("input", { element: { name: "search", value: "debug eyJ…[REDACTED]" } }),
      ev("input", { element: { name: "search", value: "debug eyJ…[REDACTED]" } }), // same value, once
      ev("input", { element: { name: "password", value: "[REDACTED]" } }),
    ]);
    const s = summarizeRedactions(r);
    expect(s.tokens).toBe(1);
    expect(s.formFields).toBe(1);
  });
});
