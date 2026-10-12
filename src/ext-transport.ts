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
  // A fresh init is a fresh page, so the once-per-page notice below is armed
  // again. This is also what gives tests a clean slate between cases.
  _pageOnlyNoticeShown = false;
  // The shortcut is re-published by the content script on every init; until
  // then we know nothing, and claiming a key is bound would silence the
  // in-page handler for no reason.
  _boundShortcut = "";
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

// ── Cross-site capture access ───────────────────────────────────────────────
// Phase 1 moved <all_urls> to optional_host_permissions, so capture surviving
// a navigation to another origin is now something the user has to allow. The
// SDK cannot ask: chrome.permissions is exposed to neither the page world nor
// a content script. The worker answers, the content script publishes the
// answer alongside the integration booleans on <html data-tb-caps>, and this
// is where the SDK reads it.
//
// THREE states, and the third one matters: `undefined` means "we could not
// find out" (pre-1.11 content script, attribute never published, hostile page
// stripped it). The UI must stay silent then — a wrong "you have no access"
// hint is worse than no hint.

let _hostAccess: boolean | undefined = undefined;

export function setHostAccess(granted: boolean | undefined | null): void {
  _hostAccess = typeof granted === "boolean" ? granted : undefined;
}

/** true = granted · false = not granted · undefined = unknown, say nothing. */
export function getHostAccess(): boolean | undefined {
  return _hostAccess;
}

/** Only true when we KNOW capture will stop at the next cross-origin load. */
export function isCaptureLimitedToThisPage(): boolean {
  return isExtensionMode() && _hostAccess === false;
}

// The once-per-page guard for the "capturing this page only" notice. It lives
// here rather than next to the toast it drives (src/dashboard.ts) for one
// reason: the withheld-access path is the one Phase 1 could not cover
// automatically — granting an optional permission needs a native dialog no
// test runner can click — so the half that IS testable has to be reachable
// from a test. See tests/ext-secrets.test.ts.
let _pageOnlyNoticeShown = false;

/**
 * True at most once per SDK init, and only when access is KNOWN to be
 * withheld. An `undefined` host-access state returns false: a wrong "you have
 * no access" hint is worse than no hint.
 *
 * Calling this CONSUMES the one chance to show the notice, so call it only at
 * the point of actually showing it.
 */
export function shouldShowPageOnlyNotice(): boolean {
  if (_pageOnlyNoticeShown || !isCaptureLimitedToThisPage()) return false;
  _pageOnlyNoticeShown = true;
  return true;
}

// ── The browser's own keyboard shortcut ─────────────────────────────────────
// Phase 3 made Ctrl/Cmd+Shift+B a real `commands` entry, so the key now has
// two possible owners. Two consequences the SDK has to respect:
//
//   1. No UI may hardcode the key. The user can rebind it or clear it, and
//      the default is NOT Ctrl+Shift+B: Chrome refuses that (bookmarks bar)
//      and also refuses Alt+Shift+B (focus bookmarks bar), returning an empty
//      shortcut for both, so the shipped default is Alt+B.
//   2. If the user rebinds the command ONTO Ctrl/Cmd+Shift+B, the in-page
//      keydown handler must stand down, or one press opens Quick Bug twice.
//
// The worker reads chrome.commands.getAll() (the page world and content
// scripts cannot), and the content script publishes the result on
// <html data-tb-caps>. "" means nothing is bound.

let _boundShortcut = "";

export function setBoundShortcut(shortcut: string | null | undefined): void {
  _boundShortcut = typeof shortcut === "string" ? shortcut : "";
}

/** The shortcut the browser bound, or "" — show this, never a literal key. */
export function getBoundShortcut(): string {
  return _boundShortcut;
}

/**
 * Normalise a shortcut into comparable parts. `chrome.commands.getAll()`
 * reports "Ctrl+Shift+B" on Windows/Linux and either "Command+Shift+B" or the
 * glyph form "⌘⇧B" on macOS, so both spellings have to reduce to the same
 * thing. Command, Ctrl and macOS's MacCtrl collapse together deliberately —
 * that is exactly what matchesShortcut() does when it matches "ctrl+shift+b"
 * against either a Cmd or a Ctrl press.
 */
function shortcutParts(shortcut: string): string[] {
  return shortcut
    .replace(/⌘/g, "+command+")
    .replace(/⇧/g, "+shift+")
    .replace(/⌥/g, "+alt+")
    .replace(/⌃/g, "+ctrl+")
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean)
    // "macctrl" is Chrome's manifest token for the LITERAL Control key on
    // macOS, as opposed to Command. It collapses here too, because
    // matchesShortcut() treats a real Ctrl press as a match for
    // "ctrl+shift+b" on every platform.
    .map((p) => (p === "command" || p === "cmd" || p === "meta" || p === "control" || p === "macctrl" ? "ctrl" : p))
    .sort();
}

/**
 * True when the BROWSER owns Ctrl/Cmd+Shift+B, so the SDK's own keydown
 * handler must ignore it. False in SDK (npm) mode, where there is no browser
 * command at all and the page handler is the only thing there is — and false
 * when the user rebound the command to some other key, because then
 * Ctrl+Shift+B really does still belong to the page.
 */
export function browserOwnsQuickCapture(): boolean {
  if (!isExtensionMode() || !_boundShortcut) return false;
  const parts = shortcutParts(_boundShortcut);
  return parts.length === 3 && parts[0] === "b" && parts[1] === "ctrl" && parts[2] === "shift";
}
