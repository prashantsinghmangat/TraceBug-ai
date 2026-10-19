// ── Masking text in the DOM replay ────────────────────────────────────────
//
// `maskAllInputs: true` covers <input>, <textarea> and <select>. It does NOT
// cover `contenteditable`: a rich editor's content is ordinary text nodes, so
// rrweb recorded every chat message, comment and document in full — including
// text the event capture had already redacted. The event row said
// "[REDACTED]" while the replay sitting beside it held the whole thing.
//
// Two things happen here, and they are deliberately split:
//
//  • `sensitiveEditorSelector()` is the CANDIDATE set rrweb is given as
//    `maskTextSelector`. rrweb only calls `maskTextFn` for nodes that already
//    matched the selector (or `maskTextClass`), so without a selector a mask
//    function is never consulted at all.
//  • `maskReplayText()` is the DECISION. When rrweb hands it the element it
//    re-checks the real rule and can UNMASK a selector false positive, so the
//    coarse CSS match never over-redacts on its own.
//
// Every name this matches on comes from the same place the input rule reads:
// SENSITIVE_FIELD_WORDS and the user's declared fields. No second list.

import {
  SENSITIVE_FIELD_WORDS,
  FIELD_LABEL_ATTRS,
  contentEditableHost,
  fieldLabel,
  isSensitiveField,
} from "./collectors";
import {
  applyCustomRedaction,
  getCustomSensitiveFields,
  hasCustomRedaction,
} from "./sanitize/custom-redaction";

/** rrweb's own masking: every non-space character becomes `*`. Matched so a
 *  masked editor looks like every other masked field in the replay. */
export function maskChars(text: string): string {
  return text.replace(/\S/g, "*");
}

/** Quote a value for use inside a CSS attribute selector. */
function cssAttrValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * The `maskTextSelector` for this recording: every contenteditable whose
 * label looks sensitive, by the same words the input rule uses plus whatever
 * the user declared.
 *
 * `[contenteditable]` on its own also matches `contenteditable="false"`;
 * that is left to `maskReplayText`, which resolves the real editing host and
 * unmasks anything the selector over-caught.
 *
 * When the user has redaction rules configured, the selector widens to `*`:
 * their Mask patterns are documented as applying to captured text, and the
 * replay is the largest body of captured text there is. With no rules — the
 * common case — the selector stays narrow and nothing extra is inspected.
 */
export function sensitiveEditorSelector(): string {
  if (hasCustomRedaction()) return "*";
  const words = [...SENSITIVE_FIELD_WORDS, ...getCustomSensitiveFields()].filter(Boolean);
  const parts: string[] = [];
  for (const word of words) {
    for (const attr of FIELD_LABEL_ATTRS) {
      parts.push(`[contenteditable][${attr}*="${cssAttrValue(word)}" i]`);
    }
  }
  return parts.join(",");
}

/**
 * Decide what a selected text node contributes to the replay.
 *
 * `element` is the text node's parent, and rrweb's type allows null — with no
 * element there is nothing to re-check, so a node the selector picked stays
 * masked rather than being let through on a guess.
 */
export function maskReplayText(text: string, element: HTMLElement | null): string {
  try {
    if (!element) return maskChars(text);
    const host = contentEditableHost(element);
    if (host && isSensitiveField(fieldLabel(host))) return maskChars(text);
    // Not a sensitive editor — the node is here either as a selector false
    // positive or because the user's rules widened the selector to `*`. Their
    // patterns still apply; everything else passes through untouched.
    return applyCustomRedaction(text);
  } catch {
    // A mask function that throws would take the snapshot down with it.
    // Failing closed costs fidelity; failing open leaks.
    return maskChars(text);
  }
}
