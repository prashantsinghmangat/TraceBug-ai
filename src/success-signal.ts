// ── Success signal ─────────────────────────────────────────────────────────
// Tells the extension (when present) that the user just got a real result:
// an audit finished, a ticket was saved, or a report was exported. The
// extension's content script counts these in chrome.storage.local to decide
// when the popup may show its one optional email ask
// (docs/launch/email-capture-plan.md). Nothing about the result is sent — only
// the kind. Without the extension nobody listens and the event is a no-op.

export type SuccessKind = "audit" | "ticket" | "export";

export function signalSuccess(kind: SuccessKind): void {
  try {
    window.dispatchEvent(new CustomEvent("tracebug-success", { detail: { kind } }));
  } catch {}
}
