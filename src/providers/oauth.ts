// ── OAuth for public clients: device flow + PKCE (ADR 010) ──────────────────
// Hand-written (ADR 005), and bundled into the extension's service worker via
// api.ts, so: no DOM, no window, no localStorage. Every function takes its
// endpoints from an OAuthSpec, so one implementation serves every tracker.
//
// No client secret appears anywhere in this file, and none may be added: a
// tracker that needs one keeps its pasted-token path (ADR 010 §1).
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthSpec {
  /** Display name for error text. */
  label: string;
  clientId: string;
  /** Token endpoint — code exchange, device poll and refresh all POST here. */
  tokenUrl: string;
  /** Device flow: where the user code is requested. */
  deviceCodeUrl?: string;
  /** PKCE: the authorize page opened with identity.launchWebAuthFlow. */
  authorizeUrl?: string;
  /** Space-separated scopes, when the vendor takes any. */
  scope?: string;
  /** Extra authorize-URL parameters (e.g. Linear's `prompt=consent`). */
  authorizeParams?: Record<string, string>;
}

/** A token set as we store it: absolute times, never relative. */
export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** ms epoch; absent = the vendor said nothing about expiry. */
  expiresAt?: number;
  refreshExpiresAt?: number;
  scope?: string;
}

/**
 * A failure the UI needs to tell apart: `code` is the OAuth error code
 * (`access_denied`, `expired_token`, `invalid_grant`, …) or a status, so the
 * caller can say "you declined" rather than "request failed".
 */
export class OAuthError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "OAuthError";
    this.code = code;
    this.status = status;
  }
}

type FetchFn = typeof fetch;

// ── PKCE ──────────────────────────────────────────────────────────────────

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes → 43 base64url chars: inside RFC 7636's 43–128 range. */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return base64url(buf);
}

/** S256 only. `plain` is allowed by the RFC and offers nothing, so we never send it. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(32);
  return { verifier, challenge: await pkceChallenge(verifier) };
}

export function buildAuthorizeUrl(
  spec: OAuthSpec,
  opts: { redirectUri: string; state: string; challenge: string },
): string {
  if (!spec.authorizeUrl) throw new OAuthError("unsupported", `${spec.label} has no sign-in page configured.`);
  const u = new URL(spec.authorizeUrl);
  const p = u.searchParams;
  p.set("response_type", "code");
  p.set("client_id", spec.clientId);
  p.set("redirect_uri", opts.redirectUri);
  p.set("state", opts.state);
  p.set("code_challenge", opts.challenge);
  p.set("code_challenge_method", "S256");
  if (spec.scope) p.set("scope", spec.scope);
  for (const [k, v] of Object.entries(spec.authorizeParams || {})) p.set(k, v);
  return u.toString();
}

/**
 * Read the code out of the URL launchWebAuthFlow resolved with. The state must
 * match the one we sent — otherwise this is someone else's code, and using it
 * would connect the user to an account they never chose.
 */
export function parseRedirect(redirectUrl: string, expectedState: string, label: string): string {
  let u: URL;
  try { u = new URL(redirectUrl); } catch { throw new OAuthError("bad_redirect", `${label} sign-in returned an unreadable address.`); }
  const p = u.searchParams;
  const err = p.get("error");
  if (err) throw new OAuthError(err, describeOAuthError(err, label, p.get("error_description")));
  if (p.get("state") !== expectedState) {
    throw new OAuthError("state_mismatch", `${label} sign-in could not be verified. Try connecting again.`);
  }
  const code = p.get("code");
  if (!code) throw new OAuthError("no_code", `${label} sign-in did not return a code. Try connecting again.`);
  return code;
}

// ── Token endpoint ────────────────────────────────────────────────────────

/**
 * Turn a token response into a TokenSet. `now` is passed in so tests (and the
 * worker after a wake-up) agree on what "expires in 3600" means.
 */
export function parseTokenResponse(json: unknown, now: number, label: string): TokenSet {
  const j = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  if (typeof j.error === "string") {
    throw new OAuthError(j.error, describeOAuthError(j.error, label, j.error_description as string | undefined));
  }
  const accessToken = typeof j.access_token === "string" ? j.access_token : "";
  if (!accessToken) throw new OAuthError("no_token", `${label} did not return a token.`);
  const secs = (v: unknown) => (typeof v === "number" && v > 0 ? v : typeof v === "string" && +v > 0 ? +v : 0);
  const out: TokenSet = { accessToken };
  if (typeof j.refresh_token === "string" && j.refresh_token) out.refreshToken = j.refresh_token;
  if (secs(j.expires_in)) out.expiresAt = now + secs(j.expires_in) * 1000;
  if (secs(j.refresh_token_expires_in)) out.refreshExpiresAt = now + secs(j.refresh_token_expires_in) * 1000;
  if (typeof j.scope === "string") out.scope = j.scope;
  return out;
}

async function postForm(
  url: string,
  form: Record<string, string>,
  label: string,
  fetchFn: FetchFn,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetchFn(url, {
    method: "POST",
    signal,
    // GitHub answers form-encoded unless asked for JSON.
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
  });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* handled below */ }
  // OAuth errors come back as 400 with a JSON `error`; let parseTokenResponse
  // name them. Anything else non-OK without one is a plain HTTP failure.
  if (!res.ok && !(json && typeof (json as { error?: unknown }).error === "string")) {
    throw new OAuthError(String(res.status), `${label} sign-in failed (HTTP ${res.status}).`, res.status);
  }
  return json;
}

export async function exchangeCode(
  spec: OAuthSpec,
  opts: { code: string; verifier: string; redirectUri: string },
  now: number,
  fetchFn: FetchFn = fetch,
  signal?: AbortSignal,
): Promise<TokenSet> {
  const json = await postForm(spec.tokenUrl, {
    grant_type: "authorization_code",
    client_id: spec.clientId,
    code: opts.code,
    code_verifier: opts.verifier,
    redirect_uri: opts.redirectUri,
  }, spec.label, fetchFn, signal);
  return parseTokenResponse(json, now, spec.label);
}

export async function refreshTokens(
  spec: OAuthSpec,
  refreshToken: string,
  now: number,
  fetchFn: FetchFn = fetch,
  signal?: AbortSignal,
): Promise<TokenSet> {
  const json = await postForm(spec.tokenUrl, {
    grant_type: "refresh_token",
    client_id: spec.clientId,
    refresh_token: refreshToken,
  }, spec.label, fetchFn, signal);
  const next = parseTokenResponse(json, now, spec.label);
  // Vendors that don't rotate send no new refresh token: keep the old one.
  if (!next.refreshToken) next.refreshToken = refreshToken;
  return next;
}

// ── Device flow (RFC 8628) ────────────────────────────────────────────────

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** Seconds between polls, as the server asked. */
  interval: number;
  expiresAt: number;
}

export async function requestDeviceCode(
  spec: OAuthSpec,
  now: number,
  fetchFn: FetchFn = fetch,
  signal?: AbortSignal,
): Promise<DeviceCode> {
  if (!spec.deviceCodeUrl) throw new OAuthError("unsupported", `${spec.label} has no device sign-in configured.`);
  const form: Record<string, string> = { client_id: spec.clientId };
  if (spec.scope) form.scope = spec.scope;
  const j = (await postForm(spec.deviceCodeUrl, form, spec.label, fetchFn, signal) || {}) as Record<string, unknown>;
  if (typeof j.error === "string") {
    throw new OAuthError(j.error, describeOAuthError(j.error, spec.label, j.error_description as string | undefined));
  }
  if (typeof j.device_code !== "string" || typeof j.user_code !== "string" || typeof j.verification_uri !== "string") {
    throw new OAuthError("bad_response", `${spec.label} did not return a sign-in code.`);
  }
  return {
    deviceCode: j.device_code,
    userCode: j.user_code,
    verificationUri: j.verification_uri,
    interval: typeof j.interval === "number" && j.interval > 0 ? j.interval : 5,
    expiresAt: now + (typeof j.expires_in === "number" && j.expires_in > 0 ? j.expires_in : 900) * 1000,
  };
}

/** One poll. `pending` means ask again after `interval` seconds. */
export type DevicePoll =
  | { status: "done"; tokens: TokenSet }
  | { status: "pending"; interval: number };

/**
 * ONE poll, not a loop. The extension window drives the loop: an MV3 worker can
 * be stopped between polls, so a worker-side loop would silently die halfway
 * through a sign-in.
 *
 * `slow_down` adds 5 s to the interval, as RFC 8628 §3.5 requires; the caller
 * keeps the returned interval. `expired_token` and `access_denied` throw an
 * OAuthError with a sentence the window shows next to a retry button.
 */
export async function pollDeviceToken(
  spec: OAuthSpec,
  code: { deviceCode: string; interval: number; expiresAt: number },
  now: number,
  fetchFn: FetchFn = fetch,
  signal?: AbortSignal,
): Promise<DevicePoll> {
  if (now >= code.expiresAt) {
    throw new OAuthError("expired_token", describeOAuthError("expired_token", spec.label));
  }
  const j = (await postForm(spec.tokenUrl, {
    client_id: spec.clientId,
    device_code: code.deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  }, spec.label, fetchFn, signal) || {}) as Record<string, unknown>;
  if (j.error === "authorization_pending") return { status: "pending", interval: code.interval };
  if (j.error === "slow_down") {
    const asked = typeof j.interval === "number" && j.interval > 0 ? j.interval : 0;
    return { status: "pending", interval: Math.max(asked, code.interval + 5) };
  }
  return { status: "done", tokens: parseTokenResponse(j, now, spec.label) };
}

// ── Error text ────────────────────────────────────────────────────────────

/** OAuth error code → a sentence for the person connecting. */
export function describeOAuthError(code: string, label: string, vendorText?: string | null): string {
  switch (code) {
    case "access_denied":
      return `You declined access in ${label}. Click Connect to try again.`;
    case "expired_token":
      return `The ${label} sign-in code expired before it was entered. Click Connect to get a new one.`;
    case "invalid_grant":
      return `${label} no longer accepts this sign-in. Connect again.`;
    case "device_flow_disabled":
      return `${label} sign-in is not enabled for TraceBug's app yet. Use a token in TraceBug settings for now.`;
    case "incorrect_client_credentials":
    case "invalid_client":
    case "unauthorized_client":
      return `${label} did not recognise TraceBug's app. Use a token in TraceBug settings for now.`;
    default:
      return vendorText ? `${label} sign-in failed: ${vendorText}` : `${label} sign-in failed (${code}).`;
  }
}
