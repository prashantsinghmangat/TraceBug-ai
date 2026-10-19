// ── Who owns a capture ────────────────────────────────────────────────────
//
// A capture's state used to live only in the host page's `localStorage`,
// which is scoped to one origin — while the thing being captured is a TAB,
// which spans origins. Moving to another site killed the capture in silence:
// the HUD vanished with no Stop control, nothing said why, and returning to
// the first site RESURRECTED it, because the start flag was still sitting in
// that origin's storage. A capture that had been over for minutes came back
// with its timer still counting.
//
// The service worker is the only part of TraceBug that spans origins, so it
// holds the answer and the page asks: before resuming anything, and on every
// injection, because a page on the NEW origin has no state of its own and the
// worker's notice is the only way it can know what happened.
//
// This is also the first piece of ADR 008 (the extension owns the session):
// deciding whether a capture is running has moved out of page storage for
// good. The events themselves follow in v2.0.
//
// In the npm SDK there is no extension and no second origin to cross — every
// function here answers "not applicable" and the caller keeps its old
// behaviour.

import { rpcCall } from "./ext-rpc";
import { isExtensionContext } from "./video-recorder";

/** Why a capture is no longer running. One reason today; the shape is here so
 *  a future one (tab closed, extension updated) does not change the wire. */
export interface CaptureEndedNotice {
  reason: "cross-site";
  /** Host the capture was started on — what the sentence names. */
  host: string;
  at: number;
}

export interface CaptureStatus {
  /** True only when the worker confirms a capture is live on THIS tab. */
  running: boolean;
  startedAt: number | null;
  /** Delivered once, to the first page that asks. */
  ended: CaptureEndedNotice | null;
}

/** Nothing to ask: no extension, so no cross-origin capture to lose. */
const NOT_APPLICABLE: CaptureStatus = { running: false, startedAt: null, ended: null };

/** This document's origin. Sent as a fallback for browsers that do not fill
 *  in `sender.origin`/`sender.url`; the worker trusts those over this. */
function currentOrigin(): string {
  try { return location.origin || ""; } catch { return ""; }
}

/**
 * Ask the worker whether this tab's capture is still running.
 *
 * `unknown` is not an option the caller has to handle: if the RPC fails (the
 * extension was reloaded, the worker is gone), this resolves to "not running",
 * which makes the page CLEAR its flags rather than resume. A capture that
 * cannot be confirmed is one the user has no working Stop control for, and a
 * stale HUD is exactly the bug this removes.
 */
export async function getCaptureStatus(): Promise<CaptureStatus> {
  if (!isExtensionContext()) return NOT_APPLICABLE;
  try {
    const res = await rpcCall<Partial<CaptureStatus>>("tb:capture:status", { origin: currentOrigin() }, 3000);
    return {
      running: !!res?.running,
      startedAt: typeof res?.startedAt === "number" ? res.startedAt : null,
      ended: res?.ended ?? null,
    };
  } catch {
    return NOT_APPLICABLE;
  }
}

/** Tell the worker a capture has started here, and on which origin.
 *
 *  The origin travels as a FALLBACK only: the worker prefers `sender.origin` /
 *  `sender.url`, which Chrome fills in itself — no host permission needed, and
 *  a page cannot forge them. (`tab.url` is not an option: it is undefined
 *  without `<all_urls>`, and a capture must not depend on a permission the
 *  user declined.) Best-effort: a failure costs the cross-site notice, not the
 *  capture. */
export async function announceCaptureStarted(startedAt: number): Promise<void> {
  if (!isExtensionContext()) return;
  try {
    await rpcCall("tb:capture:started", { origin: currentOrigin(), startedAt }, 3000);
  } catch { /* the capture runs regardless */ }
}

/** Tell the worker this tab is no longer capturing. */
export async function announceCaptureStopped(): Promise<void> {
  if (!isExtensionContext()) return;
  try {
    await rpcCall("tb:capture:stopped", {}, 3000);
  } catch { /* nothing left to clean up on this side */ }
}

/** The sentence shown on the page the user landed on. Names the site they
 *  left, because "your capture ended" without a reason reads as a crash. */
export function captureEndedMessage(notice: CaptureEndedNotice): string {
  const host = notice.host ? notice.host : "the previous site";
  // "It was kept" without saying WHERE is a dead end: the session lives in
  // that origin's storage, so this page cannot open it and nothing on this
  // page ever will. The instruction is the whole point of the sentence.
  return `Capture ended when you left ${host} — captures can't follow you across sites yet. `
    + `What you captured there was kept: go back to ${host} to open its ticket.`;
}
