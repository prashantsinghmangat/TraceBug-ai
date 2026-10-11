// ── Extension transport mode + integration status snapshot ──────────────────
// In extension mode the SDK runs in the HOST PAGE's main world, so anything it
// holds is readable by the site under test. Secrets therefore live in
// chrome.storage.local and all provider calls are made by the background
// service worker (see docs/launch/PLAN.md, Phase 2).
//
// The SDK still has to render "GitHub is configured / not configured" states
// synchronously. Rather than make every getter async, the content script pushes
// a NON-SECRET boolean snapshot into the page — at init and again on
// chrome.storage.onChanged — exactly like the existing redaction-rules bridge
// (<html data-tb-redact> → setRedactRules). Booleans only. Never a token.
// ─────────────────────────────────────────────────────────────────────────────

export type TransportMode = "page" | "extension";

let _mode: TransportMode = "page";

/**
 * Set by init() from `TraceBugConfig.transport`. Declared explicitly by
 * tracebug-init.js — never inferred from projectId (user-settable) or
 * feature-detected from the page (a hostile page could fake either).
 */
export function setTransportMode(mode: TransportMode | undefined): void {
  _mode = mode === "extension" ? "extension" : "page";
}

/** True when the SDK was injected by the browser extension. */
export function isExtensionMode(): boolean {
  return _mode === "extension";
}

/** Which integrations are configured — no secrets, just yes/no. */
export interface IntegrationStatus {
  github: boolean;
  linear: boolean;
  slack: boolean;
  ai: boolean;
}

const EMPTY: IntegrationStatus = { github: false, linear: false, slack: false, ai: false };

let _status: IntegrationStatus = { ...EMPTY };

/**
 * Called from the page bridge (`window.TraceBugSDK.setIntegrationStatus`) with
 * the snapshot the content script read out of extension storage. Coerced to
 * booleans so a malformed or hostile payload can never smuggle a value through.
 */
export function setIntegrationStatus(status: Partial<IntegrationStatus> | null | undefined): void {
  if (!status || typeof status !== "object") {
    _status = { ...EMPTY };
    return;
  }
  _status = {
    github: !!status.github,
    linear: !!status.linear,
    slack: !!status.slack,
    ai: !!status.ai,
  };
}

export function getIntegrationStatus(): IntegrationStatus {
  return { ..._status };
}
