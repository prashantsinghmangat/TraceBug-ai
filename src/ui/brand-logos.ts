// ── Tracker logos for the ticket (Phase 13 step 5) ─────────────────────────
// Small inline SVG marks: no remote loads, no dependency. Each is an image
// with an accessible name. The extension's Integrations hub carries the same
// marks in tracebug-extension/integrations-hub.js (extension pages can't
// import the SDK bundle) — keep the two in step.

const MARKS: Record<string, { name: string; color: string; svg: string }> = {
  github: {
    name: "GitHub",
    color: "currentColor",
    svg: '<path fill="currentColor" d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.82 1.19 3.08 0 4.41-2.69 5.38-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/>',
  },
  linear: {
    name: "Linear",
    color: "#5E6AD2",
    svg: '<path fill="#5E6AD2" d="M1.2 13.9a11 11 0 0 0 8.9 8.9L1.2 13.9Zm-.2-3 12.1 12.1c.9-.1 1.8-.3 2.6-.6L1.6 8.3c-.3.8-.5 1.7-.6 2.6Zm1.4-4.3 15 15c.7-.4 1.3-.9 1.9-1.4L3.8 4.7c-.5.6-1 1.2-1.4 1.9ZM5.3 3.4A11 11 0 1 1 20.6 18.7L5.3 3.4Z"/>',
  },
  slack: {
    name: "Slack",
    color: "#E01E5A",
    svg: '<rect x="2" y="9.5" width="9" height="3.4" rx="1.7" fill="#36C5F0"/><rect x="9.5" y="2" width="3.4" height="9" rx="1.7" fill="#2EB67D"/><rect x="13" y="11.1" width="9" height="3.4" rx="1.7" fill="#E01E5A"/><rect x="11.1" y="13" width="3.4" height="9" rx="1.7" fill="#ECB22E"/>',
  },
};

/** An inline logo with an accessible name; "" for an unknown id. */
export function brandLogo(id: string, size = 15): string {
  const m = MARKS[id];
  if (!m) return "";
  return `<svg class="tb-brand" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${m.name}"><title>${m.name}</title>${m.svg}</svg>`;
}
