// ── Screen-capture failures, as sentences ─────────────────────────────────
// Phase 4. Two different failures arrive from getDisplayMedia under the SAME
// error name, NotAllowedError:
//
//   1. The user closed the "Choose what to share" picker. Nothing to say — a
//      cancel is a decision, not an error.
//   2. The OPERATING SYSTEM refused. On macOS a browser that is not ticked
//      under System Settings → Privacy & Security → Screen Recording cannot
//      capture at all, and the picker either never appears or yields nothing.
//
// Collapsing both into "cancelled" is what made a blocked browser look like a
// change of mind, with nothing pointing at the fix. The message is the only
// thing that separates them, so that is what we read — NOT the platform and
// NOT the user agent. macOS is the only OS that gates screen capture this way,
// so the error itself identifies the situation; sniffing for "Mac" would add a
// second, less reliable guess on top of a reliable one.
//
// A near-copy of isSystemPermissionDenial lives in
// tracebug-extension/offscreen.js, which runs the extension's own capture and
// cannot import this module. tests/capture-errors.test.ts asserts both copies
// agree, so a drift fails there rather than in a user's recording.

/**
 * Did the OS refuse screen capture, as opposed to the user cancelling?
 *
 * Accepts the DOMException itself, or a `{name, message}` shape, or a bare
 * string (the extension transport passes error text across the RPC boundary,
 * where a DOMException cannot survive structured cloning).
 */
export function isSystemPermissionDenial(err: unknown): boolean {
  if (!err) return false;
  if (typeof err === "string") return SYSTEM_DENIAL_RE.test(err);
  const e = err as { name?: string; message?: string };
  const name = e.name || "";
  const msg = String(e.message || "");
  // NotFoundError too: a browser denied at the OS level can report "no screen
  // capture source available" instead of a refusal.
  if (name !== "NotAllowedError" && name !== "NotFoundError") return false;
  return SYSTEM_DENIAL_RE.test(msg);
}

// Chrome says "Permission denied by system". Other engines word it differently,
// so match the idea, not one vendor's string.
const SYSTEM_DENIAL_RE = /\bby system\b|system permission|not permitted by system|screen recording/i;

/**
 * The sentence shown when a capture could not start. Returns null for a plain
 * cancel: the user closed the picker on purpose and does not need telling.
 *
 * Deliberately names the exact place to go. "Permission denied" is true and
 * useless; the only thing that fixes this is four clicks in System Settings,
 * and the browser has to be restarted afterwards, which is the part people
 * miss and then conclude TraceBug is broken.
 */
export function explainCaptureFailure(codeOrError: unknown): string | null {
  const code = typeof codeOrError === "string" ? codeOrError : "";
  if (code === "cancelled") return null;
  if (code === "system-permission" || isSystemPermissionDenial(codeOrError)) {
    return (
      "Your system is blocking screen recording. Open System Settings → Privacy & Security → " +
      "Screen Recording, switch your browser on, then quit and reopen it — the permission only " +
      "takes effect after a restart. You can capture without video in the meantime: it records " +
      "the console, network and an interactive replay."
    );
  }
  if (code === "unsupported" || /not supported/i.test(code)) {
    return "This browser can't record the screen. Capture without video still works.";
  }
  return code || null;
}
