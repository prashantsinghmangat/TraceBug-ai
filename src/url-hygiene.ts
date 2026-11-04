// ── URL hygiene for titles & root-cause ranking ───────────────────────────
// Two jobs, shared by title-generator and report-builder:
//
// 1. isNoiseRequest() — a failed request to a badge, image proxy, font, or
//    analytics beacon is page noise, not the bug's cause. Found in the wild:
//    a failed shields.io badge behind GitHub's camo proxy was reported as
//    "API Failure (high confidence)" with a 500-char hex path as the title.
//
// 2. shortDisplayPath() — no URL shape may ever flood a title again: long
//    path segments (content hashes, camo hex, JWTs-in-path) get a middle
//    ellipsis, and the whole path is capped.

// ── Sensitive query-param detection (single source of truth) ──────────────
// Both the capture-time URL redactor (collectors.ts) and the defense-in-depth
// upload sanitizer (sanitize/cloud-upload.ts) must agree on which query-param
// NAMES are sensitive — they used to keep two separate lists that drifted
// (one caught `sig`/`signature`, the other caught `session`/`sid`/`csrf`; each
// under-redacted what the other caught). This regex is the strict union, so
// neither path ever redacts less than before. Substring, case-insensitive:
// `key` matches `api_key`/`x-api-key`, `token` matches `access_token`, etc.
import { isCustomSensitiveKey } from "./sanitize/custom-redaction";

const SENSITIVE_PARAM_RE =
  /token|key|secret|auth|password|passwd|pwd|credential|session|sid|csrf|sig|signature/i;

/** True when a query-param name looks sensitive and its value must be masked. */
export function isSensitiveParamName(name: string | undefined): boolean {
  return !!name && SENSITIVE_PARAM_RE.test(name);
}

// `name=value` pairs after `?`, `&` or `#` — the query, an OAuth-style
// fragment (`#access_token=…`) and a hash route's query (`#/cb?token=…`).
const URL_PARAM_RE = /([?&#])([^=&#?]+)=([^&#]*)/g;

/**
 * Mask the values of sensitive params in a URL's query and fragment.
 * Used for every URL a report keeps — requests, the page URL, link hrefs,
 * form actions, the DOM replay's page URL — so none is captured unmasked.
 *
 *   /api/users?api_key=abc123        → /api/users?api_key=[REDACTED]
 *   /cb#access_token=xyz&state=1     → /cb#access_token=[REDACTED]&state=1
 *
 * Defensive: returns the original URL on any failure.
 */
export function redactUrl(url: string): string {
  if (!url) return url;
  try {
    const start = url.search(/[?#]/);
    if (start === -1) return url;
    return url.slice(0, start) + url.slice(start).replace(URL_PARAM_RE, (m, sep: string, key: string) =>
      isSensitiveParamName(key) || isCustomSensitiveKey(key) ? `${sep}${key}=[REDACTED]` : m);
  } catch {
    return url;
  }
}

// A URL inside free text (a stack frame, a console message). Stops at
// whitespace, quotes, brackets and parentheses — the delimiters around a URL
// in a stack frame ("at fn (http://…/app.js?v=1:42:7)").
const URL_IN_TEXT_RE = /\b(?:https?|wss?):\/\/[^\s"'`<>()[\]{}]+/g;
// A stack frame's trailing ":line" or ":line:col".
const LINE_COL_RE = /(:\d+){1,2}$/;

/**
 * Mask sensitive params of every URL found in a string. An inline script's
 * stack frames carry the page URL, query and all — `access_token=…` reached
 * the report, the AI prompt and the exported file through the error stack.
 * A frame's ":line:col" suffix is kept, not swallowed into the masked value.
 */
export function redactUrlsInText(s: string): string {
  if (!s || s.indexOf("://") === -1) return s;
  try {
    return s.replace(URL_IN_TEXT_RE, (m) => {
      const tail = m.match(LINE_COL_RE)?.[0] || "";
      return redactUrl(m.slice(0, m.length - tail.length)) + tail;
    });
  } catch {
    return s;
  }
}

/** The browser's automatic favicon request (`/favicon.ico` at the site root):
 *  made by the browser, not the app, so its 404 is never the app's bug. */
export function isBrowserFavicon(url: string | undefined): boolean {
  return !!url && /^(?:https?:\/\/[^/]+)?\/favicon\.ico(?:[?#]|$)/i.test(url);
}

/** Static-asset file extensions — failures here are resource noise, not APIs. */
const ASSET_EXT_RE =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|css|woff2?|ttf|otf|eot|map|mp4|webm|ogg|mp3|pdf)(\?|#|$)/i;

/** Hosts that serve images, fonts, badges, or analytics — never the app's API. */
const NOISE_HOSTS = [
  "camo.githubusercontent.com",
  "avatars.githubusercontent.com",
  "img.shields.io",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "google-analytics.com",
  "www.google-analytics.com",
  "googletagmanager.com",
  "www.googletagmanager.com",
  "stats.g.doubleclick.net",
  "connect.facebook.net",
  "cdn.segment.com",
  "api.segment.io",
  "gravatar.com",
  "www.gravatar.com",
];

/** Subdomain prefixes that are telemetry infrastructure on any domain —
 *  collector.github.com, stats.wp.com, telemetry.mozilla.org, … */
const NOISE_HOST_PREFIX_RE =
  /^(collector|stats|telemetry|analytics|metrics|beacon|track(ing)?|pixel|events|logs?)\./i;

/** Path shapes that are beacons, not APIs. Applied to THIRD-PARTY urls only —
 *  an app's own /api/analytics dashboard fetch must not be flagged. */
const NOISE_PATH_RE =
  /(^|\/)(collect|collector|beacon|telemetry|pixel|track|tracking)(\/|$)|\/_private\//i;

/** Longest path segment we render verbatim; longer ones get a middle ellipsis. */
const SEGMENT_MAX = 24;
/** Hard cap for a rendered path in titles/hints. */
const PATH_MAX = 60;

/**
 * True when a request is page noise (asset/badge/font/analytics/beacon)
 * rather than an application API call — used to keep such failures out of
 * bug titles, high-confidence root-cause hints, and the Actions story.
 */
export function isNoiseRequest(url: string | undefined): boolean {
  if (!url) return false;
  if (ASSET_EXT_RE.test(url)) return true;
  // Relative URL → same-origin app route → never beacon-classified.
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (NOISE_HOSTS.some(h => host === h || host.endsWith("." + h))) return true;
    if (NOISE_HOST_PREFIX_RE.test(host)) return true;
    // Beacon-shaped paths only count off the current page's origin (when we
    // can know it — in Node/MCP contexts absolute URLs get the full check).
    const pageHost =
      typeof window !== "undefined" ? window.location.hostname.toLowerCase() : null;
    if (pageHost && host === pageHost) return false;
    return NOISE_PATH_RE.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * True for sub-resource loads (scripts, styles, images, fonts, media).
 * Unlike isNoiseRequest this includes first-party .js/.css — a SUCCESSFUL
 * chunk load is page mechanics, but a FAILED one is a real signal, so
 * callers decide what to do with status.
 */
export function isStaticResource(url: string | undefined): boolean {
  if (!url) return false;
  return ASSET_EXT_RE.test(url) || /\.(m?js)(\?|#|$)/i.test(url);
}

/**
 * Render a URL's path safely for titles and one-line hints: hash-like
 * segments become "7201bf24…3042f0", and the result never exceeds PATH_MAX.
 * Falls back to a capped raw string for unparseable input.
 */
export function shortDisplayPath(url: string | undefined, base?: string): string {
  if (!url) return "";
  let pathname: string;
  try {
    const origin =
      base || (typeof window !== "undefined" ? window.location.origin : "http://relative.local");
    pathname = new URL(url, origin).pathname || url;
  } catch {
    pathname = url;
  }
  const segments = pathname.split("/").map(seg =>
    seg.length > SEGMENT_MAX ? `${seg.slice(0, 10)}…${seg.slice(-6)}` : seg
  );
  let out = segments.join("/");
  if (out.length > PATH_MAX) out = out.slice(0, PATH_MAX - 1) + "…";
  return out;
}
