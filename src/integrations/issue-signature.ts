// ── Issue signature ───────────────────────────────────────────────────────
// One line appended to a GitHub, Linear or Slack body: "Reported with
// TraceBug", linking to the listing tagged `utm_source=issue`.
//
// Why it is removable, and why that matters more than it looks: an issue body
// is written into someone else's tracker, often a client's or an employer's,
// and it stays there. A promotional line nobody can remove is the kind of
// thing that gets a tool banned from a team. Default on, one toggle off, and
// the toggle is remembered.
//
// Why it is not templated per provider beyond the link syntax: the sentence is
// the same claim everywhere, and three variants of it would drift.

import { storeUrl } from "../links";

const KEY = "tracebug_issue_signature";
const TEXT = "Reported with TraceBug";

/** On unless explicitly turned off, so a fresh profile gets it. */
export function issueSignatureEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

export function setIssueSignature(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* private mode */ }
}

/** Markdown form, for GitHub and Linear. */
export function issueSignatureMarkdown(): string {
  return `_[${TEXT}](${storeUrl("issue")})_`;
}

/** Slack's own link syntax — `<url|label>`, not markdown. */
export function issueSignatureSlack(): string {
  return `_<${storeUrl("issue")}|${TEXT}>_`;
}

/**
 * Append the signature to a markdown body, if it is enabled.
 *
 * Idempotent: a body that already carries the line is returned untouched, so a
 * caller that passes through two code paths cannot double-sign it.
 */
export function signIssueBody(body: string): string {
  if (!issueSignatureEnabled()) return body;
  if (body.includes(TEXT)) return body;
  return `${body.replace(/\s+$/, "")}\n\n---\n\n${issueSignatureMarkdown()}`;
}

/**
 * The Slack equivalent. Slack posts already ended with an UNLINKED
 * "_Reported via TraceBug_", so that line is replaced rather than appended to —
 * two signatures in one message would be worse than either.
 */
export function signSlackPost(text: string): string {
  const legacy = /\n*_Reported via TraceBug_\s*$/;
  const stripped = text.replace(legacy, "");
  if (!issueSignatureEnabled()) return stripped === text ? text : `${stripped}\n\n_Reported via TraceBug_`;
  if (stripped.includes(TEXT)) return stripped;
  return `${stripped.replace(/\s+$/, "")}\n\n${issueSignatureSlack()}`;
}

/** Test seam. */
export function _resetIssueSignature(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
