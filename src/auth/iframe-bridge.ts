// ── SDK iframe auth + upload bridge ──────────────────────────────────────
// The SDK runs on customer.com but auth cookies live on tracebug.dev.
// We solve that by mounting a hidden iframe of /sdk-bridge — same-origin to
// the cookies — and talking to it via postMessage. The customer site never
// sees the auth token.
//
// Pattern: one singleton per (cloudEndpoint) per page. Lazy mount on first
// call. Requests are correlated via requestId.

import { resolveCloudEndpoint } from "../cloud-endpoint";

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const BRIDGE_READY_TIMEOUT_MS = 20_000;
const SIGN_IN_POLL_INTERVAL_MS = 1500;
const SIGN_IN_TIMEOUT_MS = 3 * 60_000;

export interface BridgeUser {
  id: string;
  email: string | null;
}

export interface CheckAuthResult {
  authed: boolean;
  user: BridgeUser | null;
}

export interface UploadInitPayload {
  title?: string;
  sizeBytes: number;
  hasVideo: boolean;
  videoDurationS?: number | null;
  screenshotCount: number;
  /** Base64 JPEG data URL (~5-10KB at 320x180) for the dashboard card. */
  thumbnail?: string;
  /** Tester-assigned triage priority, surfaced in the share-portal header. */
  priority?: "high" | "medium" | "low";
}

export interface UploadInitResponse {
  id: string;
  shareToken: string;
  storageKey: string;
  uploadUrl: string;
  uploadToken: string;
  viewUrl: string;
}

let _instance: IframeBridge | null = null;

export function getBridge(cloudEndpoint: string): IframeBridge {
  if (!_instance || _instance.endpoint !== cloudEndpoint) {
    _instance?.destroy();
    _instance = new IframeBridge(cloudEndpoint);
  }
  return _instance;
}

export class IframeBridge {
  readonly endpoint: string;
  private iframe: HTMLIFrameElement | null = null;
  private readyPromise: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();
  private authChangeListeners = new Set<(authed: boolean) => void>();
  private origin: string;
  private boundOnMessage: (e: MessageEvent) => void;
  private readyCleanup: (() => void) | null = null;

  constructor(cloudEndpoint: string) {
    // Enforce HTTPS (or localhost) here — every auth/upload path funnels
    // through this class, so a bad endpoint can't reach postMessage/iframe.
    this.endpoint = resolveCloudEndpoint(cloudEndpoint);
    this.origin = new URL(this.endpoint).origin;
    this.boundOnMessage = this.onMessage.bind(this);
  }

  // Mount iframe and resolve when it announces ready. Idempotent.
  ready(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      if (typeof window === "undefined" || typeof document === "undefined") {
        resolve(); // no-op in non-DOM contexts (e.g. SSR)
        return;
      }
      window.addEventListener("message", this.boundOnMessage);

      const iframe = document.createElement("iframe");
      iframe.src = `${this.endpoint}/sdk-bridge`;
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.left = "-9999px";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.title = "TraceBug auth bridge";
      this.iframe = iframe;

      // Wait for the bridge-ready postMessage.
      const onReady = (e: MessageEvent) => {
        if (e.origin !== this.origin) return;
        if (e.data?.type === "tracebug:bridge-ready") {
          cleanup();
          resolve();
        }
      };
      // If the bridge never announces ready (offline, blocked iframe, bad
      // deploy), give up: unmount, reset readyPromise so a later call can
      // retry with a fresh iframe, and reject instead of hanging forever.
      const timer = setTimeout(() => {
        cleanup();
        this.iframe?.remove();
        this.iframe = null;
        this.readyPromise = null;
        reject(new Error("bridge failed to load — check cloudEndpoint and network"));
      }, BRIDGE_READY_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener("message", onReady);
        this.readyCleanup = null;
      };
      this.readyCleanup = cleanup;
      window.addEventListener("message", onReady);
      document.documentElement.appendChild(iframe);
    });
    return this.readyPromise;
  }

  private onMessage(e: MessageEvent) {
    if (e.origin !== this.origin) return;
    const raw: unknown = e.data;
    if (!raw || typeof raw !== "object") return;
    const d = raw as { type?: unknown; authed?: unknown; requestId?: unknown; data?: unknown };

    // Auth state change broadcast (no requestId, no pending).
    if (d.type === "tracebug:auth-changed") {
      const authed = !!d.authed;
      this.authChangeListeners.forEach((cb) => cb(authed));
      return;
    }

    // Standard request/reply.
    if (typeof d.requestId !== "string") return;
    const p = this.pending.get(d.requestId);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(d.requestId);
    const data = d.data;
    if (data && typeof data === "object" && "error" in data && Object.keys(data).length === 1) {
      p.reject(new Error(String((data as { error: unknown }).error)));
    } else {
      p.resolve(data);
    }
  }

  private async send<T>(type: string, extra?: Record<string, unknown>): Promise<T> {
    await this.ready();
    if (!this.iframe?.contentWindow) throw new Error("bridge not mounted");
    const requestId = `req_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`bridge timeout (${type})`));
      }, DEFAULT_TIMEOUT_MS);
      this.pending.set(requestId, { resolve: resolve as (data: unknown) => void, reject, timer });
      this.iframe!.contentWindow!.postMessage({ type, requestId, ...extra }, this.origin);
    });
  }

  checkAuth(): Promise<CheckAuthResult> {
    return this.send("check-auth");
  }

  // Opens a popup to /auth. Resolves when the user is authenticated (or
  // rejects on timeout). The popup itself runs on tracebug.dev and
  // sets cookies the iframe also sees.
  async signIn(): Promise<BridgeUser> {
    const already = await this.checkAuth();
    if (already.authed && already.user) return already.user;

    await this.send("sign-in"); // tells bridge to open popup
    const start = Date.now();

    // Race: explicit auth-change broadcast vs polling fallback
    return new Promise<BridgeUser>((resolve, reject) => {
      let done = false;
      const finish = (err: unknown, user?: BridgeUser) => {
        if (done) return;
        done = true;
        this.authChangeListeners.delete(onChange);
        clearInterval(poller);
        clearTimeout(timeout);
        if (err) reject(err); else resolve(user!);
      };

      const onChange = async (authed: boolean) => {
        if (!authed) return;
        try {
          const r = await this.checkAuth();
          if (r.authed && r.user) finish(null, r.user);
        } catch (err) { finish(err); }
      };
      this.authChangeListeners.add(onChange);

      const poller = setInterval(async () => {
        try {
          const r = await this.checkAuth();
          if (r.authed && r.user) finish(null, r.user);
        } catch (err) { finish(err); }
        if (Date.now() - start > SIGN_IN_TIMEOUT_MS) {
          finish(new Error("sign-in timed out — please try again"));
        }
      }, SIGN_IN_POLL_INTERVAL_MS);

      const timeout = setTimeout(() => finish(new Error("sign-in timed out")), SIGN_IN_TIMEOUT_MS + 5000);
    });
  }

  async signOut(): Promise<void> {
    await this.send("sign-out");
  }

  getQuotas(): Promise<unknown> {
    return this.send("get-quotas");
  }

  async uploadInit(payload: UploadInitPayload): Promise<UploadInitResponse> {
    const res = await this.send<{ status: number; body: UploadInitResponse & { error?: string } }>("upload-init", { payload });
    if (res.status >= 400) {
      throw Object.assign(new Error(res.body?.error || `upload-init failed (${res.status})`), {
        status: res.status,
        body: res.body,
      });
    }
    return res.body;
  }

  async uploadBlob(storageKey: string, token: string, blob: Blob, contentType = "text/html"): Promise<void> {
    const res = await this.send<{ ok?: boolean; error?: string }>("upload-blob", {
      storageKey, token, blob, contentType,
    });
    if (res.error) throw new Error(res.error);
  }

  async uploadComplete(id: string): Promise<{ shareUrl: string; id: string }> {
    const res = await this.send<{ status: number; body: { shareUrl: string; id: string; error?: string } }>("upload-complete", { id });
    if (res.status >= 400) {
      throw new Error(res.body?.error || `upload-complete failed (${res.status})`);
    }
    return res.body;
  }

  destroy(): void {
    this.readyCleanup?.();
    window.removeEventListener("message", this.boundOnMessage);
    this.iframe?.remove();
    this.iframe = null;
    this.readyPromise = null;
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error("bridge destroyed"));
    });
    this.pending.clear();
    this.authChangeListeners.clear();
  }
}
