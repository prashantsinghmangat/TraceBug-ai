// ── WCAG success criteria (2.0 / 2.1 / 2.2, levels A and AA) ───────────────
// Maps a criterion number to its official short name, so a finding can say
// "1.4.3 Contrast (Minimum)" instead of an axe tag like "wcag143".
// Dependency-free: the MCP CLI and the exported viewer use the same data.

export const WCAG_CRITERIA: Record<string, string> = {
  "1.1.1": "Non-text Content",
  "1.2.1": "Audio-only and Video-only (Prerecorded)",
  "1.2.2": "Captions (Prerecorded)",
  "1.2.3": "Audio Description or Media Alternative (Prerecorded)",
  "1.2.4": "Captions (Live)",
  "1.2.5": "Audio Description (Prerecorded)",
  "1.3.1": "Info and Relationships",
  "1.3.2": "Meaningful Sequence",
  "1.3.3": "Sensory Characteristics",
  "1.3.4": "Orientation",
  "1.3.5": "Identify Input Purpose",
  "1.4.1": "Use of Color",
  "1.4.2": "Audio Control",
  "1.4.3": "Contrast (Minimum)",
  "1.4.4": "Resize Text",
  "1.4.5": "Images of Text",
  "1.4.10": "Reflow",
  "1.4.11": "Non-text Contrast",
  "1.4.12": "Text Spacing",
  "1.4.13": "Content on Hover or Focus",
  "2.1.1": "Keyboard",
  "2.1.2": "No Keyboard Trap",
  "2.1.4": "Character Key Shortcuts",
  "2.2.1": "Timing Adjustable",
  "2.2.2": "Pause, Stop, Hide",
  "2.3.1": "Three Flashes or Below Threshold",
  "2.4.1": "Bypass Blocks",
  "2.4.2": "Page Titled",
  "2.4.3": "Focus Order",
  "2.4.4": "Link Purpose (In Context)",
  "2.4.5": "Multiple Ways",
  "2.4.6": "Headings and Labels",
  "2.4.7": "Focus Visible",
  "2.4.11": "Focus Not Obscured (Minimum)",
  "2.5.1": "Pointer Gestures",
  "2.5.2": "Pointer Cancellation",
  "2.5.3": "Label in Name",
  "2.5.4": "Motion Actuation",
  "2.5.7": "Dragging Movements",
  "2.5.8": "Target Size (Minimum)",
  "3.1.1": "Language of Page",
  "3.1.2": "Language of Parts",
  "3.2.1": "On Focus",
  "3.2.2": "On Input",
  "3.2.3": "Consistent Navigation",
  "3.2.4": "Consistent Identification",
  "3.2.6": "Consistent Help",
  "3.3.1": "Error Identification",
  "3.3.2": "Labels or Instructions",
  "3.3.3": "Error Suggestion",
  "3.3.4": "Error Prevention (Legal, Financial, Data)",
  "3.3.7": "Redundant Entry",
  "3.3.8": "Accessible Authentication (Minimum)",
  "4.1.1": "Parsing",
  "4.1.2": "Name, Role, Value",
  "4.1.3": "Status Messages",
};

/** axe tags ("wcag143", "wcag1410") → known criterion numbers ("1.4.3", "1.4.10"). Unknown ones are dropped. */
export function wcagFromAxeTags(tags: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const t of tags || []) {
    const m = /^wcag(\d)(\d)(\d{1,2})$/.exec(t);
    if (!m) continue;
    const sc = `${m[1]}.${m[2]}.${m[3]}`;
    if (WCAG_CRITERIA[sc] && !out.includes(sc)) out.push(sc);
  }
  return out;
}

/** "1.4.3 Contrast (Minimum)", or the bare number for one we don't know. */
export function wcagLabel(sc: string): string {
  return WCAG_CRITERIA[sc] ? `${sc} ${WCAG_CRITERIA[sc]}` : sc;
}

/** Keep only well-formed, known criterion numbers (exports are untrusted input). */
export function cleanWcag(list: unknown): string[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out = list.filter((s): s is string => typeof s === "string" && Object.prototype.hasOwnProperty.call(WCAG_CRITERIA, s));
  return out.length ? [...new Set(out)].slice(0, 4) : undefined;
}
