// ── The common tracker interface (ADR 010) ──────────────────────────────────
// One shape for every issue tracker, so the confirm window's Create panel and
// the worker never special-case a vendor:
//
//   listContainers  → repos / teams / projects the credential can see
//   listFields      → labels, assignees, … for one container
//   createIssue     → { url, ref }
//
// Every function takes a ResolvedAuth (from auth-store.ts) and runs in the
// service worker. What goes back to the window is display data only.
// ─────────────────────────────────────────────────────────────────────────────

import type { CreateIssueResult, IssueContent } from "./api";
import { capProviderBody, parseJsonOrThrow, postGitHubIssue, postLinearIssue } from "./api";
import type { IssueTracker, ResolvedAuth } from "./auth-store";
import type { OAuthSpec } from "./oauth";
import { OAUTH_CLIENTS, hasOAuthClient } from "./oauth-clients";

export interface Container {
  /** What the API takes: "owner/repo", a team id, … */
  id: string;
  /** What the person picks from. */
  label: string;
  /** e.g. "private". */
  detail?: string;
}

export interface FieldOption {
  id: string;
  label: string;
}

export interface FieldSpec {
  key: string;
  label: string;
  kind: "multi" | "single";
  options: FieldOption[];
  /** One sentence shown under the field. */
  note?: string;
}

export type FieldValues = Record<string, string | string[]>;

export interface ConnectSpec {
  flow: "device" | "pkce";
  spec: OAuthSpec;
  /** Optional host permissions the sign-in needs, requested on Connect. */
  hosts: string[];
}

export interface TrackerAdapter {
  id: IssueTracker;
  label: string;
  /** What "container" means here, for the picker's label. */
  containerNoun: string;
  /** Host permissions the API calls need. */
  apiHosts: string[];
  /** Built from oauth-clients.ts; null until the owner registers the app. */
  connect(): ConnectSpec | null;
  whoAmI(auth: ResolvedAuth, signal?: AbortSignal): Promise<string>;
  listContainers(auth: ResolvedAuth, signal?: AbortSignal): Promise<Container[]>;
  listFields(auth: ResolvedAuth, container: string, signal?: AbortSignal): Promise<FieldSpec[]>;
  createIssue(
    auth: ResolvedAuth,
    container: string,
    values: FieldValues,
    content: IssueContent,
    signal?: AbortSignal,
  ): Promise<CreateIssueResult>;
}

/** Upper bound on what one picker lists — a search box, not an export. */
export const MAX_CONTAINERS = 500;
const MAX_LABELS = 300;

function asList(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter((s) => typeof s === "string" && s);
  return typeof v === "string" && v ? [v] : [];
}

// ── GitHub ────────────────────────────────────────────────────────────────

const GH_API = "https://api.github.com";

function ghHeaders(auth: ResolvedAuth): Record<string, string> {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${auth.token}`,
    "x-github-api-version": "2022-11-28",
  };
}

/** `Link: <…?page=2>; rel="next"` → the next URL, if any. */
export function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const part of link.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m) return m[1];
  }
  return null;
}

async function ghPages<T>(auth: ResolvedAuth, first: string, max: number, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = first;
  while (url && out.length < max) {
    // Only ever follow links back to the API host: a Link header is data.
    if (!url.startsWith(GH_API + "/")) break;
    const res = await fetch(url, { headers: ghHeaders(auth), signal });
    const data = (await parseJsonOrThrow(res, "GitHub", "tracker")) as unknown;
    if (!Array.isArray(data)) break;
    out.push(...(data as T[]));
    url = nextLink(res.headers.get("link"));
  }
  return out.slice(0, max);
}

export const github: TrackerAdapter = {
  id: "github",
  label: "GitHub",
  containerNoun: "Repository",
  apiHosts: ["https://api.github.com/*"],
  connect() {
    if (!hasOAuthClient("github")) return null;
    return {
      flow: "device",
      // A GitHub App takes no scopes: its permissions are set on the app.
      spec: {
        label: "GitHub",
        clientId: OAUTH_CLIENTS.github,
        deviceCodeUrl: "https://github.com/login/device/code",
        tokenUrl: "https://github.com/login/oauth/access_token",
      },
      hosts: ["https://github.com/*", "https://api.github.com/*"],
    };
  },
  async whoAmI(auth, signal) {
    const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(auth), signal });
    const d = (await parseJsonOrThrow(res, "GitHub", "tracker")) as { login?: string };
    return d.login || "";
  },
  async listContainers(auth, signal) {
    type Repo = { full_name?: string; private?: boolean; archived?: boolean };
    const repos = await ghPages<Repo>(
      auth,
      `${GH_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
      MAX_CONTAINERS,
      signal,
    );
    return repos
      .filter((r) => typeof r.full_name === "string" && !r.archived)
      .map((r) => ({ id: r.full_name!, label: r.full_name!, detail: r.private ? "private" : undefined }));
  },
  async listFields(auth, container, signal) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(container)) return [];
    type Label = { name?: string };
    const labels = await ghPages<Label>(auth, `${GH_API}/repos/${container}/labels?per_page=100`, MAX_LABELS, signal);
    const options = labels.filter((l) => typeof l.name === "string").map((l) => ({ id: l.name!, label: l.name! }));
    return [{
      key: "labels",
      label: "Labels",
      kind: "multi",
      options,
      note: "GitHub drops labels silently unless you can push to the repository.",
    }];
  },
  async createIssue(auth, container, values, content, signal) {
    return postGitHubIssue({ token: auth.token, repo: container, labels: asList(values.labels) }, content, signal);
  },
};

// ── Linear ────────────────────────────────────────────────────────────────

/** Linear takes a personal API key verbatim, and an OAuth token as Bearer. */
function linearAuthHeader(auth: ResolvedAuth): string {
  return auth.via === "oauth" ? `Bearer ${auth.token}` : auth.token;
}

async function linearQuery<T>(auth: ResolvedAuth, query: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: linearAuthHeader(auth) },
    body: JSON.stringify({ query }),
  });
  const data = (await parseJsonOrThrow(res, "Linear", "tracker")) as { data?: T; errors?: Array<{ message?: string }> };
  if (Array.isArray(data.errors) && data.errors.length) {
    throw new Error(data.errors[0]?.message || "Linear rejected the request.");
  }
  return (data.data || {}) as T;
}

export const linear: TrackerAdapter = {
  id: "linear",
  label: "Linear",
  containerNoun: "Team",
  apiHosts: ["https://api.linear.app/*"],
  connect() {
    if (!hasOAuthClient("linear")) return null;
    return {
      flow: "pkce",
      spec: {
        label: "Linear",
        clientId: OAUTH_CLIENTS.linear,
        authorizeUrl: "https://linear.app/oauth/authorize",
        tokenUrl: "https://api.linear.app/oauth/token",
        scope: "read,write",
      },
      hosts: ["https://api.linear.app/*"],
    };
  },
  async whoAmI(auth, signal) {
    const d = await linearQuery<{ viewer?: { email?: string; name?: string } }>(auth, "query { viewer { name email } }", signal);
    return (d.viewer && (d.viewer.email || d.viewer.name)) || "";
  },
  async listContainers(auth, signal) {
    const d = await linearQuery<{ teams?: { nodes?: Array<{ id?: string; key?: string; name?: string }> } }>(
      auth, "query { teams(first: 250) { nodes { id key name } } }", signal);
    return ((d.teams && d.teams.nodes) || [])
      .filter((t) => typeof t.id === "string")
      .map((t) => ({ id: t.id!, label: t.name || t.key || t.id!, detail: t.key }));
  },
  // Labels, assignee, priority and project arrive in Phase 3.
  async listFields() {
    return [];
  },
  async createIssue(auth, container, _values, content, signal) {
    return postLinearIssue(
      { apiKey: auth.token, teamId: container, bearer: auth.via === "oauth" },
      { title: content.title, body: capProviderBody("linear", content.body).text },
      signal,
    );
  },
};

export const TRACKER_ADAPTERS: Record<IssueTracker, TrackerAdapter> = { github, linear };

export function trackerAdapter(id: string): TrackerAdapter | null {
  return Object.prototype.hasOwnProperty.call(TRACKER_ADAPTERS, id) ? TRACKER_ADAPTERS[id as IssueTracker] : null;
}

/** Where an issue URL from each tracker may point before we open it in a tab. */
export const ISSUE_URL_HOSTS: Record<IssueTracker, string[]> = {
  github: ["github.com"],
  linear: ["linear.app"],
};

/** Only open https URLs on the tracker's own host — the URL came over the network. */
export function isTrustedIssueUrl(tracker: IssueTracker, url: unknown): url is string {
  if (typeof url !== "string") return false;
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  return (ISSUE_URL_HOSTS[tracker] || []).some((h) => u.hostname === h || u.hostname.endsWith("." + h));
}
