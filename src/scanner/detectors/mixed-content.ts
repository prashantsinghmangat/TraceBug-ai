// ── Mixed-content detector ────────────────────────────────────────────────
// Flags every `http://` resource on a `https://` page. Browsers block most
// of these silently (active content) or downgrade them (passive content),
// so users rarely notice — but the asset usually fails or breaks the lock
// icon. Worth surfacing.

import { Issue } from "../../types";
import { buildSelector, makeIssueId } from "../helpers";

const ATTR_TARGETS: Array<{ tag: string; attr: string }> = [
  { tag: "img", attr: "src" },
  { tag: "script", attr: "src" },
  { tag: "iframe", attr: "src" },
  { tag: "link", attr: "href" },
  { tag: "audio", attr: "src" },
  { tag: "video", attr: "src" },
  { tag: "source", attr: "src" },
  { tag: "embed", attr: "src" },
  { tag: "object", attr: "data" },
];

export async function detectMixedContent(): Promise<Issue[]> {
  // Only relevant on HTTPS pages — skip on plain HTTP and file:// origins.
  if (typeof window === "undefined" || window.location.protocol !== "https:") {
    return [];
  }

  const issues: Issue[] = [];
  for (const { tag, attr } of ATTR_TARGETS) {
    const elements = document.querySelectorAll(`${tag}[${attr}]`);
    for (const el of Array.from(elements)) {
      if (el.closest("#tracebug-root")) continue;
      const value = (el as HTMLElement).getAttribute(attr) || "";
      if (!value.startsWith("http://")) continue;

      // <link> only matters when it's loading something the browser fetches —
      // stylesheets, preloads, manifests, icons. Skip rel="canonical" etc.
      if (tag === "link") {
        const rel = ((el as HTMLLinkElement).rel || "").toLowerCase();
        const fetchableRels = ["stylesheet", "preload", "prefetch", "manifest", "icon", "shortcut icon"];
        if (!fetchableRels.some(r => rel.includes(r))) continue;
      }

      issues.push({
        id: makeIssueId("mixed-content"),
        detector: "mixed-content",
        severity: tag === "script" || tag === "iframe" ? "serious" : "moderate",
        title: `Mixed content: ${tag} loads over HTTP`,
        description: `<${tag}> on an HTTPS page references \`${value}\`. Browsers block or downgrade this — the resource usually fails to load and breaks the page's secure-context indicator.`,
        selector: buildSelector(el as HTMLElement),
        url: value,
        page: window.location.pathname,
        detectedAt: Date.now(),
      });
    }
  }
  return issues;
}
