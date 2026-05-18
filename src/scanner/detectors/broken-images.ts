// ── Broken-image detector ─────────────────────────────────────────────────
// Walks every <img> on the page and flags ones that failed to load. Uses
// `naturalWidth === 0 && complete === true` — the standard signal for
// "image attempted to load and failed." Skips images that haven't finished
// loading yet (we can't tell if they're broken until they settle).

import { Issue } from "../../types";
import { buildSelector, makeIssueId } from "../helpers";

export async function detectBrokenImages(): Promise<Issue[]> {
  const issues: Issue[] = [];
  const imgs = Array.from(document.images);

  for (const img of imgs) {
    // Skip TraceBug's own UI.
    if (img.closest("#tracebug-root")) continue;
    // Image still loading — can't decide yet.
    if (!img.complete) continue;
    // Decoded successfully — naturalWidth is non-zero.
    if (img.naturalWidth > 0) continue;

    // No src is a different problem (missing asset, not a broken load).
    const src = img.currentSrc || img.src;
    if (!src) continue;

    issues.push({
      id: makeIssueId("broken-image"),
      detector: "broken-image",
      severity: "moderate",
      title: `Broken image: ${truncateUrl(src)}`,
      description: `<img> element failed to load. The browser tried to fetch \`${src}\` and got a network error or a non-image response. ${
        img.alt ? `Alt text: "${img.alt}"` : "No alt text — also fails accessibility."
      }`,
      selector: buildSelector(img),
      url: src,
      page: window.location.pathname,
      detectedAt: Date.now(),
    });
  }

  return issues;
}

function truncateUrl(url: string): string {
  if (url.length <= 60) return url;
  // Keep the filename — easier to identify than the host.
  const tail = url.split("/").pop() || url.slice(-40);
  return `…/${tail}`;
}
