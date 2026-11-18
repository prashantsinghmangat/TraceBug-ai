// ── Public OAuth client IDs (ADR 010) ──────────────────────────────────────
// Client IDs of the apps the owner registers with each tracker. These are
// PUBLIC by design: every flow here is a public client (device flow or
// authorization code + PKCE), so there is no secret anywhere in TraceBug.
// Never add a client secret to this file — a tracker that needs one keeps its
// pasted-token path instead (ADR 010 §1).
//
// A tracker whose id is still the placeholder shows only its token path.
// ─────────────────────────────────────────────────────────────────────────────

export const TODO_OWNER_CLIENT_ID = "TODO_OWNER_CLIENT_ID";

export const OAUTH_CLIENTS = {
  /** GitHub App "TraceBug Dev" (org tracebugdev), Device Flow on (Issues: R/W, Metadata: R). */
  github: "Iv23lidsU0w7Ezzc9qyb",
  /** Linear OAuth app; PKCE, scopes `read,write`. */
  linear: TODO_OWNER_CLIENT_ID,
  /** Microsoft Entra app registration, multi-tenant, Azure DevOps delegated permission. */
  ado: TODO_OWNER_CLIENT_ID,
  /** gitlab.com application, "Confidential" unticked, scope `api`. */
  gitlab: TODO_OWNER_CLIENT_ID,
} as const;

export type OAuthTracker = keyof typeof OAUTH_CLIENTS;

/** The GitHub App's public page, where a user adds repositories to it. */
export const GITHUB_APP_INSTALL_URL = "https://github.com/apps/tracebug-dev/installations/new";

/** True once the owner has pasted a real client id for this tracker. */
export function hasOAuthClient(tracker: OAuthTracker): boolean {
  const id = OAUTH_CLIENTS[tracker];
  return !!id && id !== TODO_OWNER_CLIENT_ID;
}
