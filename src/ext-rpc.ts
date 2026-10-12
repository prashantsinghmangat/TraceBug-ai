// ── Page → extension RPC ───────────────────────────────────────────────────
// The SDK runs in the host page's MAIN world, so it cannot touch chrome.*. It
// talks to the extension by dispatching CustomEvents that the content script
// (isolated world) relays to the background worker.
//
// Two families live here:
//
//   `tracebug-rec-request`      recording verbs (tb:rec:*), request/response
//                               correlated by id — the original bridge.
//   `tracebug-provider-request` Phase 2b provider verbs. These do NOT use a
//                               request/response pair: the worker answers
//                               immediately with {pending}, and the real
//                               outcome arrives later on
//                               `tracebug-provider-result`, after the user has
//                               approved it in an extension-owned window.
//
// SECURITY NOTE for anyone extending this file: everything dispatched here is
// a page event, so ANY script on the host page can dispatch it too. That is
// why the page never sends a credential or a destination — only content. The
// worker reads repo/team/webhook/key from extension storage and confirms the
// send with the user. Adding a field here does not make it trusted; see the
// allowlist in tracebug-extension/content-script.js and the validator in
// tracebug-extension/provider-bridge.js.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TrackerProvider, CreateIssueResult, IssueContent, SlackContent, AIAnalysisResult,
} from "./providers/api";

/** Thrown when the user clicks Cancel in the confirmation window, or lets it
 *  time out. Callers must treat this as a deliberate stop, NOT a failure —
 *  silently falling back to another filing method would be surprising. */
export class TraceBugCancelled extends Error {
  constructor(message = "Send cancelled.") {
    super(message);
    this.name = "TraceBugCancelled";
  }
}

let _rpcCounter = 0;

function nextId(prefix: string): string {
  return `${prefix}_${++_rpcCounter}_${Date.now().toString(36)}`;
}

/**
 * Request/response RPC over the recording bridge. Moved here from
 * video-recorder.ts so the provider bridge can share the id/timeout shape.
 */
export function rpcCall<T = unknown>(type: string, data?: unknown, timeoutMs = 60000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = nextId("tb_rpc");
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.id !== id) return;
      window.removeEventListener("tracebug-rec-response", handler);
      clearTimeout(timer);
      if (detail.error) reject(new Error(detail.error));
      else resolve(detail.result as T);
    };
    window.addEventListener("tracebug-rec-response", handler);

    const timer = setTimeout(() => {
      window.removeEventListener("tracebug-rec-response", handler);
      reject(new Error(`RPC timeout: ${type}`));
    }, timeoutMs);

    window.dispatchEvent(new CustomEvent("tracebug-rec-request", {
      detail: { id, type, data },
    }));
  });
}

// ── Provider bridge ────────────────────────────────────────────────────────

// The worker auto-cancels an unanswered confirmation at 120s. We wait a little
// longer so the worker's own timeout is what the user sees, with its wording,
// rather than a bare client-side "timeout".
const PROVIDER_TIMEOUT_MS = 150000;

interface ProviderAck {
  pending?: boolean;
  id?: string;
  error?: string;
}

interface ProviderResultDetail {
  id?: string;
  ok?: boolean;
  cancelled?: boolean;
  error?: string;
  result?: unknown;
}

/**
 * Dispatch one provider verb and resolve when the worker reports the outcome.
 *
 * Two hops, deliberately: the ack tells us the request was accepted and a
 * confirmation window is open; the result event arrives after the human
 * decision. Keeping them separate means no message channel is held open across
 * a service-worker restart — the MV3 worker is free to die while the user
 * reads the confirmation.
 */
function callProvider<T>(verb: string, detail: Record<string, unknown>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = nextId("tb_send");
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("tracebug-provider-ack", onAck);
      window.removeEventListener("tracebug-provider-result", onResult);
      clearTimeout(timer);
      fn();
    };

    const onAck = (e: Event) => {
      const d = (e as CustomEvent).detail as ProviderAck;
      if (!d || d.id !== id) return;
      // An ack carrying an error is a rejection before any window opened —
      // bad verb, bad payload, rate limit, no host access, too many pending.
      if (d.error) finish(() => reject(new Error(d.error!)));
    };

    const onResult = (e: Event) => {
      const d = (e as CustomEvent).detail as ProviderResultDetail;
      if (!d || d.id !== id) return;
      if (d.cancelled) finish(() => reject(new TraceBugCancelled(d.error || "Send cancelled.")));
      else if (d.error || d.ok === false) finish(() => reject(new Error(d.error || "Send failed.")));
      else finish(() => resolve(d.result as T));
    };

    window.addEventListener("tracebug-provider-ack", onAck);
    window.addEventListener("tracebug-provider-result", onResult);

    const timer = setTimeout(() => {
      finish(() => reject(new TraceBugCancelled("Send timed out waiting for confirmation.")));
    }, PROVIDER_TIMEOUT_MS);

    window.dispatchEvent(new CustomEvent("tracebug-provider-request", {
      detail: { id, type: verb, data: detail },
    }));
  });
}

/**
 * File a tracker issue / post to Slack from the service worker.
 * `content` is the ONLY thing that crosses: no destination, no credential.
 */
export function sendTrackerViaBridge(
  provider: TrackerProvider,
  content: IssueContent | SlackContent,
): Promise<CreateIssueResult> {
  return callProvider<CreateIssueResult>("tb:provider:send", { provider, payload: content });
}

/** Run LLM analysis from the service worker. `prompt` is already sanitized. */
export function analyzeViaBridge(prompt: string): Promise<AIAnalysisResult> {
  return callProvider<AIAnalysisResult>("tb:llm:analyze", { payload: { prompt } });
}
