// The worker decides whether a capture is running (1.11.1). That makes one
// MV3 fact load-bearing: Chrome kills an idle service worker after ~30s and
// restarts it with BLANK module state.
//
// If `tb:capture:status` could answer before `_hydrated` restored captureTabs,
// a restarted worker would say "not running" about a capture that is running —
// and the page's rule (anything but a confirmed yes clears the flag) would
// then end it. The user-visible bug would be: start a capture, read the page
// for a minute, click a link on the same site, lose everything.
//
// So these load background.js against a SEEDED chrome.storage.session, which
// is precisely a restarted worker, and ask immediately — no settle() before
// the question, because the race is the point.
import { describe, it, expect, beforeEach } from "vitest";
import { createChromeMock, loadBackground, settle, type ChromeMock } from "./helpers/chrome-mock";

const KEY = "tb_sw_state_v1";
const TAB = 7;
const ORIGIN = "https://app.example.com";
const STARTED_AT = 1_700_000_000_000;

/** A worker that has just restarted, with this state already persisted. */
function restartedWorkerWith(state: Record<string, unknown>): ChromeMock {
  const mock = createChromeMock({ session: { [KEY]: state } });
  loadBackground(mock);
  return mock;
}

/** Send a message as a content script in `tabId` and resolve its reply. */
function ask(mock: ChromeMock, message: Record<string, unknown>, tabId = TAB): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    mock.chrome.runtime.onMessage.emit(
      message,
      { tab: { id: tabId }, origin: ORIGIN, url: `${ORIGIN}/orders` },
      (res: Record<string, unknown>) => resolve(res || {}),
    );
  });
}

const liveCapture = { captureTabs: [[TAB, { origin: ORIGIN, startedAt: STARTED_AT }]] };

describe("a restarted worker does not forget a live capture", () => {
  let mock: ChromeMock;
  beforeEach(() => { mock = restartedWorkerWith(liveCapture); });

  it("answers from persisted state, not from blank memory", async () => {
    const res = await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } });
    expect(res.running).toBe(true);
    expect(res.startedAt).toBe(STARTED_AT);
  });

  it("keeps the original start time, so the HUD timer does not restart at 00:00", async () => {
    const res = await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } });
    // A resumed HUD counts from this. Restarting it at zero would quietly
    // mis-report how long the capture has been running.
    expect(res.startedAt).toBe(STARTED_AT);
  });

  it("answers for the asking tab only — another tab is not capturing", async () => {
    const res = await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } }, TAB + 1);
    expect(res.running).toBe(false);
  });

  it("still ends the capture on a cross-origin ask after a restart", async () => {
    // Expressed through the SENDER, because that is what the worker trusts:
    // Chrome says this tab is on another origin now.
    const res: Record<string, unknown> = await new Promise((resolve) => {
      mock.chrome.runtime.onMessage.emit(
        { type: "tb:capture:status", data: { origin: "https://other.example" } },
        { tab: { id: TAB }, origin: "https://other.example", url: "https://other.example/x" },
        (r: Record<string, unknown>) => resolve(r || {}),
      );
    });
    expect(res.running).toBe(false);
    expect((res.ended as { reason: string; host: string }).reason).toBe("cross-site");
    expect((res.ended as { host: string }).host).toBe("app.example.com");
  });

  it("persists the capture back, so a SECOND restart still knows about it", async () => {
    await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } });
    await settle();
    const again = createChromeMock({ session: { [KEY]: (mock.sessionStore[KEY] as Record<string, unknown>) } });
    loadBackground(again);
    const res = await ask(again, { type: "tb:capture:status", data: { origin: ORIGIN } });
    expect(res.running).toBe(true);
  });
});

describe("the origin comes from Chrome, not from the page", () => {
  it("prefers sender.origin over whatever the page claims", async () => {
    // The page controls message.data. If it could name its own origin, a
    // script on site B could claim to be site A and keep a capture alive that
    // should have ended — or claim to be elsewhere and end one that should
    // not. sender.origin is filled in by Chrome and cannot be forged.
    const mock = restartedWorkerWith(liveCapture);
    const res: Record<string, unknown> = await new Promise((resolve) => {
      mock.chrome.runtime.onMessage.emit(
        { type: "tb:capture:status", data: { origin: ORIGIN } },      // the page lies: "still on A"
        { tab: { id: TAB }, origin: "https://evil.example", url: "https://evil.example/x" }, // Chrome: elsewhere
        (r: Record<string, unknown>) => resolve(r || {}),
      );
    });
    expect(res.running).toBe(false);
    expect((res.ended as { reason: string }).reason).toBe("cross-site");
  });

  it("falls back to the page's origin when Chrome does not supply one", async () => {
    // Firefox fills sender.url but not always sender.origin; an older Chrome
    // may supply neither. The page's value is then the only thing available,
    // and it is better than treating every capture as cross-site.
    const mock = restartedWorkerWith(liveCapture);
    const res: Record<string, unknown> = await new Promise((resolve) => {
      mock.chrome.runtime.onMessage.emit(
        { type: "tb:capture:status", data: { origin: ORIGIN } },
        { tab: { id: TAB } },                                          // no origin, no url
        (r: Record<string, unknown>) => resolve(r || {}),
      );
    });
    expect(res.running).toBe(true);
  });

  it("derives the origin from sender.url when only that is present", async () => {
    const mock = restartedWorkerWith(liveCapture);
    const res: Record<string, unknown> = await new Promise((resolve) => {
      mock.chrome.runtime.onMessage.emit(
        { type: "tb:capture:status", data: { origin: ORIGIN } },
        { tab: { id: TAB }, url: "https://other.example/page" },
        (r: Record<string, unknown>) => resolve(r || {}),
      );
    });
    expect(res.running).toBe(false);
  });

  it("records the TRUE origin when a capture starts", async () => {
    const mock = createChromeMock({ session: {} });
    loadBackground(mock);
    await new Promise((resolve) => {
      mock.chrome.runtime.onMessage.emit(
        { type: "tb:capture:started", data: { origin: "https://page-claims.example", startedAt: STARTED_AT } },
        { tab: { id: TAB }, origin: ORIGIN, url: `${ORIGIN}/` },
        resolve,
      );
    });
    await settle();
    // Asking from the real origin must say "still running" — which it only
    // can if the capture was recorded against sender.origin, not the claim.
    const res = await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } });
    expect(res.running).toBe(true);
  });
});

describe("stopping", () => {
  it("clears the capture and owes no notice — the user watched it end", async () => {
    const mock = restartedWorkerWith(liveCapture);
    await ask(mock, { type: "tb:capture:stopped", data: {} });
    await settle();
    const res = await ask(mock, { type: "tb:capture:status", data: { origin: ORIGIN } });
    expect(res.running).toBe(false);
    expect(res.ended).toBeFalsy();
  });
});
