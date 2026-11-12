// ── Default "How to fix" text per rule ─────────────────────────────────────
// For our own layout, SEO, performance and runtime rules. A detector that
// knows more (a measured colour, a header height) sets `fix` itself and wins.
// TraceBug's own words only — no page data — so it is safe outside `untrusted`.

export const DEFAULT_FIXES: Record<string, string> = {
  "ui/horizontal-overflow": "Find the element wider than the window (the evidence names it) and give it max-width: 100%, let it wrap, or put wide content such as tables in a container with overflow-x: auto.",
  "ui/off-screen": "Constrain this element to its container: check fixed widths, negative margins and absolute positioning; use max-width: 100% or let it wrap.",
  "ui/overlap": "Give each control its own space: fix the positioning or z-index of the element on top, or add spacing so both stay clickable.",
  "ui/text-clipped": "Let the container grow with its text (remove the fixed height or width, or overflow: hidden), or show the full text another way such as wrapping or a tooltip.",
  "ui/broken-image": "Check the image URL (the evidence shows it): fix the path, upload the missing file, or remove the image.",
  "ui/img-no-dimensions": "Add width and height attributes (or a CSS aspect-ratio) matching the image, so the browser reserves its space and the page doesn't jump while it loads.",
  "seo/missing-title": "Add a <title> to the page's <head> that says what this page is, in about 30–60 characters.",
  "seo/title-length": "Rewrite the <title> to about 30–60 characters so search results show it in full.",
  "seo/missing-description": "Add <meta name=\"description\" content=\"…\"> to the <head>: one or two sentences, about 70–160 characters, describing this page.",
  "seo/description-length": "Rewrite the meta description to about 70–160 characters so search results show it without cutting it off.",
  "seo/missing-canonical": "Add <link rel=\"canonical\" href=\"…\"> to the <head> with this page's preferred URL.",
  "seo/multiple-canonical": "Keep exactly one <link rel=\"canonical\"> in the <head>; remove the others.",
  "seo/missing-h1": "Add one <h1> that names the page's main topic, usually the visible page heading.",
  "seo/multiple-h1": "Keep one <h1> for the page's main heading and turn the others into <h2>–<h6> in order.",
  "seo/noindex": "If this page should appear in search results, remove noindex from the robots meta tag (or the X-Robots-Tag header). If it shouldn't, ignore this.",
  "seo/missing-viewport": "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to the <head>.",
  "perf/lcp": "Make the largest element arrive sooner: compress and resize it, serve modern formats (WebP/AVIF), add fetchpriority=\"high\" or a preload for it, and don't lazy-load it.",
  "perf/fcp": "Draw something sooner: inline the critical CSS, defer non-critical scripts and styles, and cut the work done before the first paint.",
  "perf/ttfb": "Speed up the server response: cache the page or its data, use a CDN, and reduce work done before the first byte is sent.",
  "perf/cls": "Reserve space for content that loads late: set width/height or aspect-ratio on images and embeds, and don't insert banners above existing content.",
  "perf/page-weight": "Download less: compress and resize images, remove unused JavaScript and CSS, and lazy-load what isn't on the first screen.",
  "perf/large-resource": "Shrink this file: compress or resize it, split large scripts, or load it only when it's needed.",
  "perf/render-blocking": "Stop this file blocking the first paint: add defer or async to scripts, inline the critical CSS and load the rest without blocking (media or preload).",
  "seo/og-image-missing": "Add <meta property=\"og:image\" content=\"https://…/preview.png\"> (1200×630 works everywhere) to the <head>.",
  "seo/og-text-missing": "Add the missing <meta property=\"og:title\"> / <meta property=\"og:description\"> to the <head>; they can repeat the page title and meta description.",
  "seo/og-image-relative": "Make og:image a full URL including https:// and the domain.",
  "seo/twitter-card-missing": "Add <meta name=\"twitter:card\" content=\"summary_large_image\"> to the <head>.",
  "seo/structured-data-invalid": "Fix the JSON in the <script type=\"application/ld+json\"> block (trailing commas and unescaped quotes are the usual cause), then check it with Google's Rich Results Test.",
  "seo/structured-data-untyped": "Give every JSON-LD item an \"@type\" (e.g. \"Organization\", \"Product\", \"FAQPage\") and an \"@context\": \"https://schema.org\".",
  "seo/robots-blocked": "Remove or narrow the Disallow rule in /robots.txt so it no longer matches this page — unless keeping it out of search is intended.",
  "seo/no-sitemap": "Publish /sitemap.xml listing your pages (most frameworks generate one) and add \"Sitemap: https://your-site/sitemap.xml\" to robots.txt.",
  "perf/image-oversized": "Serve the image at the size it's shown: resize the file, or use srcset/sizes (or your framework's image component) so each screen downloads the right size.",
  "perf/image-format": "Convert the image to WebP or AVIF (or let your image CDN or framework do it) and keep the JPEG/PNG only as a fallback in <picture>.",
  "mobile/horizontal-overflow": "Find what is wider than the phone screen (the elements listed with it) and let it shrink: max-width: 100%, wrapping long words (overflow-wrap: anywhere), or a container with overflow-x: auto for wide tables and code. Check at 390px wide.",
  "mobile/scroll-not-focusable": "Make the scrolling box reachable by keyboard: add tabindex=\"0\" plus role=\"region\" and an aria-label naming its content (e.g. aria-label=\"Code example\"), or let it wrap so it doesn't scroll at all.",
  "runtime/console-error": "Open the error's stack trace (Export report → your coding agent can read it) and fix the code that throws.",
  "runtime/failed-request": "Check the failed request (the evidence names it): the endpoint, its status code and the response body tell you whether the client or the server is wrong.",
  "runtime/mixed-content": "Load this resource over https://, or remove it.",
  "runtime/frustration-dead": "This element looks clickable but nothing happened: make it do something, or stop it looking clickable (cursor, styling, role).",
  "runtime/frustration-rage": "Users clicked here repeatedly: check that it responds, shows progress while busy, and isn't covered by something else.",
};

/** The detector's own fix, else the rule's default, else nothing. */
export function fixFor(ruleId: string | undefined, own: string | undefined): string | undefined {
  if (own) return own;
  if (!ruleId) return undefined;
  if (Object.prototype.hasOwnProperty.call(DEFAULT_FIXES, ruleId)) return DEFAULT_FIXES[ruleId];
  // Phone-width findings reuse the layout fixes, aimed at the narrow-screen CSS.
  const ui = ruleId.startsWith("mobile/") ? "ui/" + ruleId.slice(7) : "";
  return ui && Object.prototype.hasOwnProperty.call(DEFAULT_FIXES, ui) ? DEFAULT_FIXES[ui] + " Fix it in the styles for narrow screens (e.g. a max-width media query) and check at 390px." : undefined;
}
