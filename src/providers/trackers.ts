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

import type { CreateIssueResult, IssueAttachment, IssueContent } from "./api";
import { capProviderBody, isSendId, issueMarkerComment, parseJsonOrThrow, postGitHubIssue, postLinearIssue, PROVIDER_BODY_LIMITS } from "./api";
import type { IssueTracker, ResolvedAuth } from "./auth-store";
import type { OAuthSpec } from "./oauth";
import { GITHUB_APP_INSTALL_URL, OAUTH_CLIENTS, hasOAuthClient } from "./oauth-clients";

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
  /** Where a signed-in user adds more containers (e.g. the GitHub App's install page). */
  manageUrl?: string;
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
  /** The issue an earlier attempt of this send filed, if any — how a retry
   *  after an unclear failure avoids filing a duplicate. `since` is when the
   *  first attempt started (ms). Absent for a tracker that can't look it up. */
  findFiledIssue?(
    auth: ResolvedAuth,
    container: string,
    sendId: string,
    since: number,
    signal?: AbortSignal,
  ): Promise<CreateIssueResult | null>;
}

/** Upper bound on what one picker lists — a search box, not an export. */
export const MAX_CONTAINERS = 500;
const MAX_LABELS = 300;
const MAX_PEOPLE = 300;
/** Installations walked for repos. A user in more orgs than this can type the repo. */
const MAX_INSTALLATIONS = 20;

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

/**
 * Follow GitHub's pagination. `key` names the array inside an object response
 * (`/user/installations` answers `{ installations: [...] }`); without it the
 * response itself is the array.
 */
async function ghPages<T>(
  auth: ResolvedAuth,
  first: string,
  max: number,
  signal?: AbortSignal,
  key?: string,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = first;
  while (url && out.length < max) {
    // Only ever follow links back to the API host: a Link header is data.
    if (!url.startsWith(GH_API + "/")) break;
    const res = await fetch(url, { headers: ghHeaders(auth), signal });
    const data = (await parseJsonOrThrow(res, "GitHub", "tracker")) as unknown;
    const list = key && data && typeof data === "object" ? (data as Record<string, unknown>)[key] : data;
    if (!Array.isArray(list)) break;
    out.push(...(list as T[]));
    url = nextLink(res.headers.get("link"));
  }
  return out.slice(0, max);
}

type GhRepo = { full_name?: string; private?: boolean; archived?: boolean };

function toContainers(repos: GhRepo[]): Container[] {
  const seen = new Set<string>();
  const out: Container[] = [];
  for (const r of repos) {
    if (typeof r.full_name !== "string" || r.archived || seen.has(r.full_name)) continue;
    seen.add(r.full_name);
    out.push({ id: r.full_name, label: r.full_name, detail: r.private ? "private" : undefined });
  }
  return out;
}

/** A list that may legitimately be refused (no push access → 403/404): empty, not an error. */
async function optionalList<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p;
  } catch (err) {
    const s = (err as { status?: number }).status;
    if (s === 403 || s === 404) return [];
    throw err;
  }
}

export const github: TrackerAdapter = {
  id: "github",
  label: "GitHub",
  containerNoun: "Repository",
  apiHosts: ["https://api.github.com/*"],
  manageUrl: GITHUB_APP_INSTALL_URL,
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
    if (auth.via === "oauth") {
      // A GitHub App sees only the repos the user installed it on, so list
      // those — /user/repos would offer repos the app cannot file into.
      const installs = await ghPages<{ id?: number }>(
        auth, `${GH_API}/user/installations?per_page=100`, MAX_INSTALLATIONS, signal, "installations");
      const repos: GhRepo[] = [];
      for (const inst of installs) {
        if (typeof inst.id !== "number" || repos.length >= MAX_CONTAINERS) continue;
        repos.push(...await ghPages<GhRepo>(
          auth, `${GH_API}/user/installations/${inst.id}/repositories?per_page=100`,
          MAX_CONTAINERS - repos.length, signal, "repositories"));
      }
      return toContainers(repos);
    }
    return toContainers(await ghPages<GhRepo>(
      auth,
      `${GH_API}/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member`,
      MAX_CONTAINERS,
      signal,
    ));
  },
  async listFields(auth, container, signal) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(container)) return [];
    const base = `${GH_API}/repos/${container}`;
    const [labels, people, milestones, repo] = await Promise.all([
      ghPages<{ name?: string }>(auth, `${base}/labels?per_page=100`, MAX_LABELS, signal),
      optionalList(ghPages<{ login?: string }>(auth, `${base}/assignees?per_page=100`, MAX_PEOPLE, signal)),
      optionalList(ghPages<{ number?: number; title?: string }>(
        auth, `${base}/milestones?state=open&per_page=100`, MAX_LABELS, signal)),
      // Only for its `permissions`: whether the warning below applies.
      fetch(base, { headers: ghHeaders(auth), signal })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null) as Promise<{ permissions?: { push?: boolean } } | null>,
    ]);
    const fields: FieldSpec[] = [{
      key: "labels",
      label: "Labels",
      kind: "multi",
      options: labels.filter((l) => typeof l.name === "string").map((l) => ({ id: l.name!, label: l.name! })),
    }];
    if (people.length) {
      fields.push({
        key: "assignee",
        label: "Assignee",
        kind: "single",
        options: people.filter((p) => typeof p.login === "string").map((p) => ({ id: p.login!, label: p.login! })),
      });
    }
    if (milestones.length) {
      fields.push({
        key: "milestone",
        label: "Milestone",
        kind: "single",
        options: milestones
          .filter((m) => typeof m.number === "number")
          .map((m) => ({ id: String(m.number), label: m.title || `#${m.number}` })),
      });
    }
    // Shown only when it applies: a known "no push access". Unknown → no note.
    if (repo && repo.permissions && repo.permissions.push === false) {
      fields[fields.length - 1].note =
        "You can't push to this repository, so GitHub will drop labels, assignees and milestones.";
    }
    return fields;
  },
  async createIssue(auth, container, values, content, signal) {
    const milestone = Number(asList(values.milestone)[0]);
    return postGitHubIssue({
      token: auth.token,
      repo: container,
      labels: asList(values.labels),
      assignees: asList(values.assignee).slice(0, 1),
      milestone: Number.isInteger(milestone) && milestone > 0 ? milestone : undefined,
    }, content, signal);
  },
  async findFiledIssue(auth, container, sendId, since, signal) {
    const mark = issueMarkerComment(sendId);
    if (!mark || !/^[\w.-]+\/[\w.-]+$/.test(container)) return null;
    // Only issues this user opened since just before the first attempt —
    // not the search API, whose index lags behind a fresh issue.
    const login = await github.whoAmI(auth, signal);
    if (!login) return null;
    const after = new Date(Math.max(0, since - 60_000)).toISOString();
    const res = await fetch(
      `${GH_API}/repos/${container}/issues?creator=${encodeURIComponent(login)}&since=${encodeURIComponent(after)}` +
      `&state=all&sort=created&direction=desc&per_page=100`,
      { headers: ghHeaders(auth), signal });
    const list = (await parseJsonOrThrow(res, "GitHub", "tracker")) as unknown;
    if (!Array.isArray(list)) return null;
    const hit = list.find((i: { body?: unknown }) => typeof i.body === "string" && i.body.includes(mark)) as
      { html_url?: string; number?: number } | undefined;
    if (!hit || typeof hit.html_url !== "string") return null;
    return { provider: "github", ok: true, url: hit.html_url, ref: hit.number ? `#${hit.number}` : undefined };
  },
};

// ── Linear ────────────────────────────────────────────────────────────────

/** Linear takes a personal API key verbatim, and an OAuth token as Bearer. */
function linearAuthHeader(auth: ResolvedAuth): string {
  return auth.via === "oauth" ? `Bearer ${auth.token}` : auth.token;
}

async function linearQuery<T>(auth: ResolvedAuth, query: string, signal?: AbortSignal, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", authorization: linearAuthHeader(auth) },
    body: JSON.stringify(variables ? { query, variables } : { query }),
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
  async listFields(auth, container, signal) {
    if (!LINEAR_ID_RE.test(container)) return [];
    const d = await linearQuery<{
      team?: {
        members?: { nodes?: Array<{ id?: string; name?: string; displayName?: string; active?: boolean }> };
        projects?: { nodes?: Array<{ id?: string; name?: string; completedAt?: string | null; canceledAt?: string | null; archivedAt?: string | null }> };
      } | null;
      issueLabels?: { nodes?: Array<{ id?: string; name?: string }> };
    }>(auth,
      "query($team: String!) { team(id: $team) {" +
      " members(first: 250) { nodes { id name displayName active } }" +
      " projects(first: 100) { nodes { id name completedAt canceledAt archivedAt } } }" +
      " issueLabels(first: 250, filter: { or: [ { team: { id: { eq: $team } } }, { team: { null: true } } ] }) { nodes { id name } } }",
      signal, { team: container });
    const team = d.team || {};
    const labels = ((d.issueLabels && d.issueLabels.nodes) || []).filter((l) => typeof l.id === "string" && l.name);
    const people = ((team.members && team.members.nodes) || []).filter((m) => typeof m.id === "string" && m.active !== false);
    const projects = ((team.projects && team.projects.nodes) || [])
      .filter((x) => typeof x.id === "string" && x.name && !x.completedAt && !x.canceledAt && !x.archivedAt);
    const fields: FieldSpec[] = [
      { key: "labels", label: "Labels", kind: "multi", options: labels.map((l) => ({ id: l.id!, label: l.name! })) },
      { key: "assignee", label: "Assignee", kind: "single",
        options: people.map((m) => ({ id: m.id!, label: m.displayName || m.name || m.id! })) },
      { key: "priority", label: "Priority", kind: "single", options: LINEAR_PRIORITIES },
    ];
    if (projects.length) {
      fields.push({ key: "project", label: "Project", kind: "single", options: projects.map((x) => ({ id: x.id!, label: x.name! })) });
    }
    return fields;
  },
  async createIssue(auth, container, values, content, signal) {
    // Files first, so the issue can link them; one that fails is named in the
    // result and the issue is filed anyway.
    const up = await uploadLinearFiles(auth, content.attachments || [], signal);
    const priority = Number(asList(values.priority)[0]);
    const r = await postLinearIssue(
      {
        apiKey: auth.token,
        teamId: container,
        bearer: auth.via === "oauth",
        labelIds: asList(values.labels).filter((x) => LINEAR_ID_RE.test(x)),
        assigneeId: asList(values.assignee).filter((x) => LINEAR_ID_RE.test(x))[0],
        priority: Number.isInteger(priority) ? priority : undefined,
        projectId: asList(values.project).filter((x) => LINEAR_ID_RE.test(x))[0],
        descriptionReady: true,
      },
      { title: content.title, body: linearDescription(content.body, up.links), sendId: content.sendId },
      signal,
    );
    if (up.failed.length) r.notAttached = up.failed;
    r.attached = up.links.length;
    return r;
  },
  async findFiledIssue(auth, _container, sendId, _since, signal) {
    // The send id IS the issue id (postLinearIssue), so ask for it directly.
    if (!isSendId(sendId)) return null;
    try {
      const d = await linearQuery<{ issue?: { identifier?: string; url?: string } | null }>(
        auth, `{ issue(id: "${sendId}") { identifier url } }`, signal);
      const i = d.issue;
      return i && typeof i.url === "string" ? { provider: "linear", ok: true, url: i.url, ref: i.identifier } : null;
    } catch (err) {
      // "Entity not found" — it was never created. Anything else is a real failure.
      if (!(err as { status?: number }).status && /not found/i.test((err as Error).message || "")) return null;
      throw err;
    }
  },
};

/**
 * Look for the issue an earlier, unclear attempt may have filed: once, then
 * once more after a short wait in case the tracker's listing lags.
 */
export async function findFiledIssueWithRetry(
  adapter: TrackerAdapter,
  auth: ResolvedAuth,
  container: string,
  sendId: string,
  since: number,
  signal?: AbortSignal,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<CreateIssueResult | null> {
  if (!adapter.findFiledIssue) return null;
  const first = await adapter.findFiledIssue(auth, container, sendId, since, signal);
  if (first) return first;
  await wait(2000);
  return adapter.findFiledIssue(auth, container, sendId, since, signal);
}

// ── Linear attachments ────────────────────────────────────────────────────
// fileUpload (GraphQL) returns a signed uploadUrl + headers and an assetUrl;
// the worker PUTs the bytes, then links assetUrl in the description. The PUT
// is cross-origin and Linear's storage refuses browser CORS, so it needs a
// host permission for the upload origin — an OPTIONAL one, listed here once
// the owner has confirmed the exact origin (ADR 010). Until then this list is
// empty and every attachment is reported as not attached; the issue is filed.
export const LINEAR_UPLOAD_ORIGINS: readonly string[] = [];

/** "Linear stores attachments on <this>": a name people recognise for the upload origin. */
export function uploadStorageName(origin: string): string {
  const known: Record<string, string> = {
    "https://storage.googleapis.com": "Google Cloud Storage",
    "https://uploads.linear.app": "Linear's own file storage",
  };
  if (known[origin]) return known[origin];
  try { return new URL(origin).hostname; } catch { return origin; }
}

/** TraceBug's own caps (Linear's depend on the workspace's plan). */
export const LINEAR_ATTACH_LIMITS = { fileBytes: 20 * 1024 * 1024, totalBytes: 30 * 1024 * 1024, files: 6 };

const LINEAR_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const LINEAR_PRIORITIES = [
  { id: "1", label: "Urgent" }, { id: "2", label: "High" }, { id: "3", label: "Medium" }, { id: "4", label: "Low" },
];

export interface UploadOutcome {
  links: Array<{ name: string; type: string; url: string }>;
  failed: Array<{ name: string; reason: string }>;
}

/** Description = the report, then its attachments; within Linear's limit. */
export function linearDescription(body: string, links: UploadOutcome["links"]): string {
  const lines = links.map((l) => (l.type.startsWith("image/") ? `![${mdText(l.name)}](${l.url})` : `[${mdText(l.name)}](${l.url})`));
  const tail = lines.length ? "\n\n**Attachments**\n\n" + lines.join("\n") : "";
  const limit = PROVIDER_BODY_LIMITS.linear - tail.length;
  const text = capProviderBody("linear", body).text;
  return (text.length > limit ? text.slice(0, Math.max(0, limit)) : text) + tail;
}

function mdText(s: string): string {
  return s.replace(/[[\]()\\]/g, "_");
}

export async function uploadLinearFiles(
  auth: ResolvedAuth,
  files: IssueAttachment[],
  signal?: AbortSignal,
  origins: readonly string[] = LINEAR_UPLOAD_ORIGINS,
): Promise<UploadOutcome> {
  const out: UploadOutcome = { links: [], failed: [] };
  let total = 0;
  for (const f of files.slice(0, LINEAR_ATTACH_LIMITS.files)) {
    const size = f.data.byteLength;
    if (!origins.length) { out.failed.push({ name: f.name, reason: "attachments to Linear aren't set up yet" }); continue; }
    if (size > LINEAR_ATTACH_LIMITS.fileBytes || total + size > LINEAR_ATTACH_LIMITS.totalBytes) {
      out.failed.push({ name: f.name, reason: `too large (${(size / 1048576).toFixed(1)} MB)` });
      continue;
    }
    try {
      const d = await linearQuery<{
        fileUpload?: { success?: boolean; uploadFile?: { uploadUrl?: string; assetUrl?: string; headers?: Array<{ key?: string; value?: string }> } | null };
      }>(auth,
        "mutation($contentType: String!, $filename: String!, $size: Int!) { fileUpload(contentType: $contentType, filename: $filename, size: $size) { success uploadFile { uploadUrl assetUrl headers { key value } } } }",
        signal, { contentType: f.type, filename: f.name, size });
      const u = d.fileUpload && d.fileUpload.uploadFile;
      if (!u || typeof u.uploadUrl !== "string" || typeof u.assetUrl !== "string") throw new Error("Linear didn't prepare the upload");
      const dest = new URL(u.uploadUrl);
      if (dest.protocol !== "https:" || !origins.includes(dest.origin)) throw new Error("unexpected upload address");
      const asset = new URL(u.assetUrl);
      if (asset.protocol !== "https:") throw new Error("unexpected file address");
      const headers: Record<string, string> = { "content-type": f.type, "cache-control": "public, max-age=31536000" };
      for (const h of u.headers || []) if (h && typeof h.key === "string" && typeof h.value === "string") headers[h.key] = h.value;
      const put = await fetch(dest.toString(), { method: "PUT", headers, body: new Blob([f.data as BlobPart], { type: f.type }), signal });
      if (!put.ok) throw new Error(`upload refused (HTTP ${put.status})`);
      total += size;
      out.links.push({ name: f.name, type: f.type, url: asset.toString() });
    } catch (err) {
      out.failed.push({ name: f.name, reason: (err as Error).message || "upload failed" });
    }
  }
  for (const f of files.slice(LINEAR_ATTACH_LIMITS.files)) out.failed.push({ name: f.name, reason: "too many files" });
  return out;
}

/** Disconnect: revoke a Linear OAuth grant (public client — no secret). Best effort. */
export async function revokeLinearToken(token: string, hint: "access_token" | "refresh_token"): Promise<boolean> {
  try {
    const res = await fetch("https://api.linear.app/oauth/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, token_type_hint: hint }).toString(),
    });
    return res.ok;
  } catch { return false; }
}

// ── "Use a token instead" (the Create panel) ───────────────────────────────
// The panel sends a pasted token or API key to the worker, which checks it
// against the API here BEFORE saving it. The answer never repeats the secret.

export type SecretCheck =
  | { ok: true; account: string }
  | { ok: false; code: "invalid" | "bad_token" | "missing_scope" | "no_access" | "network" | "error"; error: string };

/** Plausible shape only (the API decides): one line, no spaces, sane length. */
export function plausibleSecret(secret: unknown): secret is string {
  return typeof secret === "string" && /^[A-Za-z0-9_\-.:]{16,400}$/.test(secret);
}

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

export async function checkTrackerSecret(
  tracker: IssueTracker,
  secret: string,
  container?: string,
  signal?: AbortSignal,
): Promise<SecretCheck> {
  const label = tracker === "github" ? "GitHub" : "Linear";
  const noun = tracker === "github" ? "token" : "API key";
  if (!plausibleSecret(secret)) {
    return { ok: false, code: "invalid", error: `That doesn't look like a ${label} ${noun}. Paste the whole ${noun}, with nothing around it.` };
  }
  const auth: ResolvedAuth = { via: "token", token: secret };
  try {
    if (tracker === "github") {
      const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(auth), signal });
      if (res.status === 401) {
        return { ok: false, code: "bad_token", error: "GitHub didn't accept this token. Check it was copied whole and hasn't expired or been revoked." };
      }
      const me = (await parseJsonOrThrow(res, "GitHub", "tracker")) as { login?: string };
      // Classic tokens list their scopes; fine-grained tokens send no header
      // (their repository permissions show up on the repository check below).
      const scopes = res.headers.get("x-oauth-scopes");
      if (scopes !== null) {
        const list = scopes.split(",").map((x) => x.trim());
        if (!list.includes("repo") && !list.includes("public_repo")) {
          return { ok: false, code: "missing_scope", error: "This token can't create issues: it needs the \"repo\" scope (or \"public_repo\" for public repositories only)." };
        }
      }
      const repo = typeof container === "string" ? container.trim() : "";
      if (repo && REPO_RE.test(repo)) {
        const r = await fetch(`${GH_API}/repos/${repo}`, { headers: ghHeaders(auth), signal });
        if (r.status === 404 || r.status === 403) {
          return { ok: false, code: "no_access", error: `This token can't see ${repo}. Give it access to that repository (a fine-grained token needs it under "Repository access", with Issues: Read and write).` };
        }
      }
      return { ok: true, account: me.login || "" };
    }
    const d = await linearQuery<{ viewer?: { email?: string; name?: string } }>(auth, "query { viewer { name email } }", signal);
    return { ok: true, account: (d.viewer && (d.viewer.email || d.viewer.name)) || "" };
  } catch (err) {
    const e = err as { name?: string; status?: number; message?: string };
    if (e && e.status === 401) return { ok: false, code: "bad_token", error: `${label} didn't accept this ${noun}. Check it was copied whole and hasn't been revoked.` };
    if (e && /permission|scope|forbidden/i.test(e.message || "")) {
      return { ok: false, code: "missing_scope", error: `This ${label} ${noun} doesn't have the permissions TraceBug needs (read, and create issues).` };
    }
    if (e && (e.name === "TypeError" || /failed to fetch|networkerror/i.test(e.message || ""))) {
      return { ok: false, code: "network", error: `Could not reach ${label} to check the ${noun}. Check your connection and try again.` };
    }
    const msg = String((e && e.message) || `${label} request failed.`).split(secret).join("…");
    return { ok: false, code: "error", error: msg };
  }
}

/** Can this credential see this repository/team? For a remembered pick the
 *  list can't vouch for (it hit MAX_CONTAINERS): asked directly. */
export async function containerAccessible(
  tracker: IssueTracker,
  auth: ResolvedAuth,
  container: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (tracker === "github") {
    if (!REPO_RE.test(container)) return false;
    const res = await fetch(`${GH_API}/repos/${container}`, { headers: ghHeaders(auth), signal });
    if (res.status === 404 || res.status === 403) return false;
    await parseJsonOrThrow(res, "GitHub", "tracker");
    return true;
  }
  const d = await linearQuery<{ team?: { id?: string } | null }>(
    auth, "query($id: String!) { team(id: $id) { id } }", signal, { id: container }).catch(() => ({ team: null }));
  return !!(d.team && d.team.id);
}

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
