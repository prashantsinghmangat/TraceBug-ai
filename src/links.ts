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
 */
const CHROME_STORE_ID = "fdemmibikigigkfjngclmdheeajhdgaj";
const CHROME_STORE_BASE = `https://chromewebstore.google.com/detail/${CHROME_STORE_ID}`;

/**
 * The AMO listing slug — **verified, 2026-10-14**, not guessed.
 *
 * This file used to refuse a Firefox link because the slug was unknown and a
 * guess baked into an exported report is a dead link months later. The guess
 * that was circulating (`/addon/tracebug/`) is in fact a 404.
 *
 * Resolved by GUID instead of by name, which is the part that cannot be
 * mistaken: AMO's API for `tracebug@prashantsinghmangat` — the exact `gecko.id`
 * in `build/manifest.base.json` — returns slug `tracebug-bug-reports-for-ai`,
 * status `public`, current version 1.10.1 (the build that is live). The listing
 * TITLE is still the old "TraceBug — Bug Reports for AI"; 1.11 renames it, and
 * the slug does not change with it.
 */
const FIREFOX_STORE_SLUG = "tracebug-bug-reports-for-ai";
const FIREFOX_STORE_BASE = `https://addons.mozilla.org/firefox/addon/${FIREFOX_STORE_SLUG}`;

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

/**
 * The Firefox listing, tagged the same way.
 *
 * Nothing consumes this yet: which store an exported report should point at is
 * a product question (the reader's browser is not known at export time), and
 * this file's job is only to make sure the URL exists in exactly one place when
 * something does need it.
 */
export function firefoxStoreUrl(surface: LinkSurface, medium?: string): string {
  const params = new URLSearchParams({ utm_source: surface });
  if (medium) params.set("utm_medium", medium);
  return `${FIREFOX_STORE_BASE}?${params.toString()}`;
}

/** Where to leave a review — the listing's own reviews tab. */
export function reviewUrl(surface: LinkSurface = "review"): string {
  return `${CHROME_STORE_BASE}/reviews?utm_source=${surface}`;
}

/** The exported report's footer line. One sentence, one link. */
export const EXPORT_FOOTER_TEXT = "Captured with TraceBug — free & local.";
export const EXPORT_FOOTER_CTA = "Capture your own →";
