// ── Integration status model (Phase 13 step 5) ─────────────────────────────
// One answer to "what is connected, which one is the default, does anything
// need attention?" — shared by the popup header icon, the Integrations hub
// (popup + settings) and the ticket's send button. Pure: the worker feeds it
// the tb:tracker:status rows and the stored default, and hands pages the
// result. The page under test only ever gets `pageIntegrationHint` (an id and
// a boolean): repo, team and account names are private.

export type IntegrationId = "github" | "linear" | "slack";
export type ConnectionState = "connected" | "reconnect" | "error";

export const INTEGRATION_ORDER: readonly IntegrationId[] = ["github", "linear", "slack"];

/** One tb:tracker:status row (plus Slack), as the worker builds it. */
export interface StatusInput {
  id: string;
  label: string;
  connected: boolean;
  via?: "oauth" | "token" | "webhook" | null;
  account?: string;
  needsReconnect?: boolean;
  /** Where new issues start: repo for GitHub, team for Linear. */
  container?: string;
  containerLabel?: string;
  /** false = the API host permission was removed; undefined = unknown. */
  hostsGranted?: boolean;
}

export interface Connection {
  id: IntegrationId;
  label: string;
  state: ConnectionState;
  via: "oauth" | "token" | "webhook" | null;
  account: string;
  /** Display name of the default repo/team, "" when none is set. */
  container: string;
  isDefault: boolean;
  /** One line for the row: why it needs attention, or "". */
  detail: string;
}

export interface IntegrationSummary {
  connections: Connection[];
  defaultId: IntegrationId | null;
  attention: boolean;
  /** "GitHub · owner/repo · connected" for the default, or a call to connect. */
  tooltip: string;
}

const STATE_WORDS: Record<ConnectionState, string> = {
  connected: "connected",
  reconnect: "needs reconnect",
  error: "error",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isIntegrationId(id: unknown): id is IntegrationId {
  return typeof id === "string" && (INTEGRATION_ORDER as readonly string[]).includes(id);
}

/** null = not a connection at all (never set up, or disconnected). */
export function connectionState(row: StatusInput): ConnectionState | null {
  if (!row) return null;
  if (row.connected) return row.hostsGranted === false ? "error" : "connected";
  return row.needsReconnect ? "reconnect" : null;
}

/** A name a person recognises: a label, or the id unless it's an opaque UUID. */
function containerName(row: StatusInput): string {
  const label = String(row.containerLabel || "").trim();
  if (label) return label;
  const id = String(row.container || "").trim();
  return id && !UUID_RE.test(id) ? id : "";
}

function detailFor(row: StatusInput, state: ConnectionState): string {
  if (state === "reconnect") return "Your " + row.label + " sign-in expired. Reconnect to keep filing issues.";
  if (state === "error") return "TraceBug lost access to " + row.label + ". Test the connection to allow it again.";
  return "";
}

export function statusTooltip(conn: Connection | null): string {
  if (!conn) return "No tracker connected · connect one";
  return [conn.label, conn.container, STATE_WORDS[conn.state]].filter(Boolean).join(" · ");
}

/**
 * Rows in the fixed order (GitHub, Linear, Slack). The default is the stored
 * choice while it is still a connection, else the first connection — so
 * disconnecting the default never leaves the send button pointing nowhere.
 */
export function summarizeIntegrations(rows: StatusInput[], storedDefault?: string | null): IntegrationSummary {
  const byId = new Map<IntegrationId, StatusInput>();
  for (const r of rows || []) if (r && isIntegrationId(r.id) && !byId.has(r.id)) byId.set(r.id, r);
  const connections: Connection[] = [];
  for (const id of INTEGRATION_ORDER) {
    const row = byId.get(id);
    if (!row) continue;
    const state = connectionState(row);
    if (!state) continue;
    connections.push({
      id,
      label: row.label,
      state,
      via: row.via || null,
      account: String(row.account || ""),
      container: containerName(row),
      isDefault: false,
      detail: detailFor(row, state),
    });
  }
  const stored = isIntegrationId(storedDefault) ? connections.find((c) => c.id === storedDefault) : undefined;
  const def = stored || connections[0] || null;
  if (def) def.isDefault = true;
  return {
    connections,
    defaultId: def ? def.id : null,
    attention: connections.some((c) => c.state !== "connected"),
    tooltip: statusTooltip(def),
  };
}

/** What the page under test may know: no names, just an id and a flag. */
export function pageIntegrationHint(s: IntegrationSummary): { defaultTracker: IntegrationId | null; attention: boolean } {
  return { defaultTracker: s.defaultId, attention: s.attention };
}
