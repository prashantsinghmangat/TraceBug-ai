// ── Outbound links and their UTM tags, in one place ────────────────────────
// Phase 5 asks for exactly this: "Store-listing URLs and UTM values live in one
// constants file." The reason is not tidiness — it is that these strings get
// baked into exported `.html` files that outlive the build, get pasted into
// GitHub issues, and are the only way to tell where an install came from. A
// listing URL duplicated across four files drifts, and a drifted one is a dead
// link in somebody's archived bug report.
//
// Nothing here is fetched at runtime, and none of it is personal: a UTM source
// names the SURFACE ("report", "issue", "review"), never a user, a session or a
// machine.

/**
 * The Chrome Web Store listing id.
 *
 * Verified against CHANGELOG.md (the 1.x publication entry) and
 * docs/{chrome-extension,getting-started,quickstart}.md, which all agree. Do
 * not retype it anywhere else — import from here.
 *
 * There is deliberately NO Firefox equivalent in this file. TraceBug is live on
 * AMO, but this repo contains no confirmed listing slug (only an API query in
 * someone's shell history), and a guessed store URL baked into an export is a
 * dead link for every Firefox user who reads that report. Add it here, in one
 * place, once the real slug is known.
 */
const CHROME_STORE_ID = "fdemmibikigigkfjngclmdheeajhdgaj";
const CHROME_STORE_BASE = `https://chromewebstore.google.com/detail/${CHROME_STORE_ID}`;

export type LinkSurface = "report" | "issue" | "review" | "welcome" | "bye";

/**
 * A store link tagged with the surface it was clicked from.
 *
 * `medium` is only used where the surface alone is ambiguous — an export footer
 * and an issue signature are both "a report someone else is reading", so Phase 5
 * asks for `utm_medium=export` on the first.
 */
export function storeUrl(surface: LinkSurface, medium?: string): string {
  const params = new URLSearchParams({ utm_source: surface });
  if (medium) params.set("utm_medium", medium);
  return `${CHROME_STORE_BASE}?${params.toString()}`;
}

/** Where to leave a review — the listing's own reviews tab. */
export function reviewUrl(surface: LinkSurface = "review"): string {
  return `${CHROME_STORE_BASE}/reviews?utm_source=${surface}`;
}

/** The exported report's footer line. One sentence, one link. */
export const EXPORT_FOOTER_TEXT = "Captured with TraceBug — free & local.";
export const EXPORT_FOOTER_CTA = "Capture your own →";
