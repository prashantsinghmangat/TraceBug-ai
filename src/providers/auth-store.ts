// ── Tracker credentials: where they live and how they stay fresh (ADR 010) ──
// Runs in the extension's service worker (bundled via api.ts). Storage is
// injected, so tests drive it with a plain object and the worker hands it
// chrome.storage.local under `tb_tracker_auth_v1`. Nothing here ever returns a
// token to a caller that renders UI: `describeAuth` is the only view the
// options page and the confirm window get, and it carries no secret.
//
// Two kinds of credential, one resolution order:
//   1. an OAuth sign-in (this store), unless it is marked "needs reconnect";
//   2. a pasted token in `tb_integrations_v1` (the "Advanced: use a token"
//      path, and every config saved before ADR 010 — so nobody has to
//      reconnect after the update).
// ─────────────────────────────────────────────────────────────────────────────

import type { OAuthSpec, TokenSet } from "./oauth";
import { OAuthError, refreshTokens } from "./oauth";

/** Trackers that file issues (title + body). Slack is a webhook, not here. */
export type IssueTracker = "github" | "linear";
export const ISSUE_TRACKERS: IssueTracker[] = ["github", "linear"];

export interface StoredOAuth {
  tokens: TokenSet;
  /** Display name of the signed-in account (login / email). Not a secret. */
  account?: string;
  connectedAt: number;
  /** Set when refresh failed for good. The UI shows "Reconnect". */
  needsReconnect?: boolean;
}

export type AuthMap = Partial<Record<IssueTracker, StoredOAuth>>;

export interface AuthStorage {
  read(): Promise<AuthMap>;
  write(map: AuthMap): Promise<void>;
}

/** The pasted-token config shape (`tb_integrations_v1`), read-only here. */
export interface LegacyIntegrations {
  github?: { token?: string; repo?: string; labels?: string[] };
  linear?: { apiKey?: string; teamId?: string };
}

export interface ResolvedAuth {
  via: "oauth" | "token";
  /** The credential. Stays inside the worker. */
  token: string;
  account?: string;
}

/** Refresh when less than this is left, so a token never expires mid-request. */
export const REFRESH_SKEW_MS = 60 * 1000;

export class NotConnectedError extends Error {
  constructor(label: string) {
    super(`${label} is not connected — connect it in TraceBug, or add a token in settings.`);
    this.name = "NotConnectedError";
  }
}

export class ReconnectNeededError extends Error {
  constructor(label: string) {
    super(`${label} needs you to reconnect — your sign-in expired or was revoked.`);
    this.name = "ReconnectNeededError";
  }
}

export function legacyToken(tracker: IssueTracker, i: LegacyIntegrations | null | undefined): string {
  if (!i) return "";
  if (tracker === "github") return (i.github && i.github.token) || "";
  if (tracker === "linear") return (i.linear && i.linear.apiKey) || "";
  return "";
}

/** The container the user typed before ADR 010; becomes the default pick. */
export function legacyContainer(tracker: IssueTracker, i: LegacyIntegrations | null | undefined): string {
  if (!i) return "";
  if (tracker === "github") return (i.github && i.github.repo) || "";
  if (tracker === "linear") return (i.linear && i.linear.teamId) || "";
  return "";
}

// One refresh in flight per tracker. GitHub and Linear both replace the
// refresh token on every use, so two refreshes would spend the same token
// twice (the loser signs the user out) or rotate it for nothing. The worker
// is the only caller (every tab, the panel, settings and the popup go through
// it), so this map is the one place a refresh can start. A caller that
// arrives just after a refresh finished — it read the old token, or its call
// failed with it — uses the stored fresh one instead of refreshing again.
const inflight = new Map<IssueTracker, Promise<TokenSet>>();

async function markReconnect(store: AuthStorage, tracker: IssueTracker): Promise<void> {
  const map = await store.read();
  const cur = map[tracker];
  if (!cur) return;
  map[tracker] = { ...cur, needsReconnect: true };
  await store.write(map);
}

async function doRefresh(
  store: AuthStorage,
  tracker: IssueTracker,
  spec: OAuthSpec,
  now: number,
  fetchFn: typeof fetch,
  /** The access token that just failed (a 401), if that's why we're here. */
  failed?: string,
): Promise<TokenSet> {
  const running = inflight.get(tracker);
  if (running) return running;
  const p = (async () => {
    const map = await store.read();
    const cur = map[tracker];
    // Someone else refreshed meanwhile: the stored token is new and not near expiry.
    if (cur && !cur.needsReconnect && cur.tokens.accessToken && cur.tokens.accessToken !== failed &&
        (!cur.tokens.expiresAt || cur.tokens.expiresAt - now > REFRESH_SKEW_MS)) {
      return cur.tokens;
    }
    const rt = cur && cur.tokens.refreshToken;
    if (!cur || !rt || (cur.tokens.refreshExpiresAt && cur.tokens.refreshExpiresAt <= now)) {
      await markReconnect(store, tracker);
      throw new ReconnectNeededError(spec.label);
    }
    let next: TokenSet;
    try {
      next = await refreshTokens(spec, rt, now, fetchFn);
    } catch (err) {
      // A refused refresh is final; a network failure is not — the user may
      // just be offline, and signing them out for that would be wrong.
      if (err instanceof OAuthError && (err.code === "invalid_grant" || err.code === "bad_refresh_token" || err.status === 401)) {
        await markReconnect(store, tracker);
        throw new ReconnectNeededError(spec.label);
      }
      throw err;
    }
    // GitHub has already spent the old refresh token: store the new one NOW,
    // with no other await first, so an MV3 worker shut down mid-flight can't
    // lose it. `map` was read just before the request (one tracker refreshes
    // at a time, so this tracker's entry can't have moved).
    map[tracker] = { ...cur, tokens: next, needsReconnect: false };
    await store.write(map);
    return next;
  })();
  inflight.set(tracker, p);
  try { return await p; } finally { inflight.delete(tracker); }
}

export interface AuthContext {
  store: AuthStorage;
  tracker: IssueTracker;
  label: string;
  /** The pasted-token config, for the fallback. */
  integrations: LegacyIntegrations | null | undefined;
  /** Null when the tracker has no OAuth client configured. */
  spec: OAuthSpec | null;
  now?: () => number;
  fetchFn?: typeof fetch;
}

/** A usable credential, refreshed first if it is about to expire. */
export async function resolveAuth(ctx: AuthContext): Promise<ResolvedAuth> {
  const now = (ctx.now || Date.now)();
  const map = await ctx.store.read();
  const o = map[ctx.tracker];
  const pasted = legacyToken(ctx.tracker, ctx.integrations);

  if (o && !o.needsReconnect) {
    const exp = o.tokens.expiresAt;
    if (!exp || exp - now > REFRESH_SKEW_MS) return { via: "oauth", token: o.tokens.accessToken, account: o.account };
    if (ctx.spec) {
      try {
        const t = await doRefresh(ctx.store, ctx.tracker, ctx.spec, now, ctx.fetchFn || fetch);
        return { via: "oauth", token: t.accessToken, account: o.account };
      } catch (err) {
        if (!(err instanceof ReconnectNeededError) || !pasted) throw err;
      }
    } else if (!pasted) {
      throw new ReconnectNeededError(ctx.label);
    }
  }
  if (pasted) return { via: "token", token: pasted };
  if (o) throw new ReconnectNeededError(ctx.label);
  throw new NotConnectedError(ctx.label);
}

/**
 * Run `fn` with a fresh credential. A 401 on an OAuth token gets exactly ONE
 * refresh and one retry; a second 401 (or a refused refresh) marks the tracker
 * "needs reconnect" and throws ReconnectNeededError. A pasted token has nothing
 * to refresh, so its 401 goes straight back with the provider's own wording.
 */
export async function withTrackerAuth<T>(ctx: AuthContext, fn: (auth: ResolvedAuth) => Promise<T>): Promise<T> {
  const auth = await resolveAuth(ctx);
  try {
    return await fn(auth);
  } catch (err) {
    if (auth.via !== "oauth" || statusOf(err) !== 401) throw err;
    if (!ctx.spec) {
      await markReconnect(ctx.store, ctx.tracker);
      throw new ReconnectNeededError(ctx.label);
    }
    const now = (ctx.now || Date.now)();
    const t = await doRefresh(ctx.store, ctx.tracker, ctx.spec, now, ctx.fetchFn || fetch, auth.token);
    try {
      return await fn({ ...auth, token: t.accessToken });
    } catch (err2) {
      if (statusOf(err2) === 401) {
        await markReconnect(ctx.store, ctx.tracker);
        throw new ReconnectNeededError(ctx.label);
      }
      throw err2;
    }
  }
}

function statusOf(err: unknown): number | undefined {
  const s = err && typeof err === "object" ? (err as { status?: unknown }).status : undefined;
  return typeof s === "number" ? s : undefined;
}

export async function saveOAuth(
  store: AuthStorage,
  tracker: IssueTracker,
  tokens: TokenSet,
  account: string | undefined,
  now: number,
): Promise<void> {
  const map = await store.read();
  map[tracker] = { tokens, account, connectedAt: now };
  await store.write(map);
}

export async function forgetOAuth(store: AuthStorage, tracker: IssueTracker): Promise<StoredOAuth | undefined> {
  const map = await store.read();
  const cur = map[tracker];
  delete map[tracker];
  await store.write(map);
  return cur;
}

/**
 * GitHub has exactly one connection: a sign-in or a pasted token (B11). Older
 * storage can hold both; this says which one to drop. The sign-in stays —
 * unless it needs reconnecting, when the token is the one that still works.
 */
export function extraGitHubConnection(
  map: AuthMap,
  integrations: LegacyIntegrations | null | undefined,
): "token" | "signin" | null {
  const o = map.github;
  if (!o || !legacyToken("github", integrations)) return null;
  return o.needsReconnect ? "signin" : "token";
}

/** What a settings screen may know. No token, no refresh token, no expiry. */
export interface AuthView {
  connected: boolean;
  via: "oauth" | "token" | null;
  account?: string;
  needsReconnect: boolean;
}

export function describeAuth(
  tracker: IssueTracker,
  map: AuthMap,
  integrations: LegacyIntegrations | null | undefined,
): AuthView {
  const o = map[tracker];
  const pasted = !!legacyToken(tracker, integrations);
  if (o && !o.needsReconnect) return { connected: true, via: "oauth", account: o.account, needsReconnect: false };
  if (pasted) return { connected: true, via: "token", needsReconnect: !!o };
  return { connected: false, via: null, needsReconnect: !!o };
}
