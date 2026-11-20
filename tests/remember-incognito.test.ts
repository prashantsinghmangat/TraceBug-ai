// Step 4: nothing is remembered from a private window. The worker decides
// that from Chrome's own sender.tab.incognito — never from anything the page
// or a frame puts in a message. A page in an incognito tab that claims
// `incognito: false` still gets nothing stored.
import { describe, it, expect } from "vitest";
import { createChromeMock, loadBackground, settle } from "./helpers/chrome-mock";

const ORIGIN = "https://app.example.com";
const SITES = "tb_tracker_sites_v1";

function send(mock: ReturnType<typeof createChromeMock>, message: Record<string, unknown>, incognito: boolean) {
  return new Promise<Record<string, unknown>>((resolve) => {
    mock.chrome.runtime.onMessage.emit(
      message,
      { id: mock.chrome.runtime.id, tab: { id: 7, incognito, windowId: 1 }, frameId: 0, origin: ORIGIN, url: `${ORIGIN}/orders?id=9` },
      (r: Record<string, unknown>) => resolve(r || {}),
    );
  });
}

async function pendingRecord(mock: ReturnType<typeof createChromeMock>) {
  await settle();
  const all = (mock.sessionStore["tb_pending_sends_v1"] || {}) as Record<string, Record<string, unknown>>;
  return Object.values(all)[0];
}

describe("private windows: decided by the sender, not the message", () => {
  for (const incognito of [true, false]) {
    it(`a tracker send from a ${incognito ? "private" : "normal"} tab claiming incognito:false`, async () => {
      const mock = createChromeMock({ local: { tb_integrations_v1: { github: { token: "ghp_unitTestToken0123456789abcdef" } } } });
      const worker = loadBackground(mock) as Record<string, (...a: unknown[]) => Promise<unknown>>;
      await settle();
      // The page lies at both levels it could reach.
      await send(mock, {
        type: "tb:provider:send", id: "tb_send_1", incognito: false,
        data: { provider: "github", payload: { title: "Login fails", body: "Steps: 1. click" } },
      }, incognito);
      const req = await pendingRecord(mock);
      expect(req, "the request was queued").toBeTruthy();
      expect(req.incognito).toBe(incognito);
      // What a successful create does next: remember for the request's site.
      await worker.rememberForSite(req, "github", "token:", "acme/api", { labels: ["bug"] });
      const sites = (mock.localStore[SITES] || {}) as Record<string, unknown>;
      if (incognito) expect(sites).toEqual({});
      else expect(Object.keys(sites)).toEqual([ORIGIN]); // the origin, not /orders?id=9
    });
  }
});
