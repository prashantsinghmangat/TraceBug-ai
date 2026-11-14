// Which browser-extension origins may call tracebug.dev's APIs (CORS + the
// Origin checks in middleware.ts and lib/ext-auth.ts). Edge-safe: no Node APIs.
//
// Chrome: only TraceBug's own extension. The Web Store ID is fixed; an unpacked
// dev build gets a different ID per machine (the manifest has no "key"), so add
// yours to EXT_DEV_CHROME_IDS (comma-separated) in .env.local to test against a
// local server.
// Firefox: every install gets a random moz-extension:// UUID, so the scheme is
// the only check possible there.

const STORE_CHROME_ID = "fdemmibikigigkfjngclmdheeajhdgaj";

function chromeIds(): Set<string> {
  const extra = (process.env.EXT_DEV_CHROME_IDS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([STORE_CHROME_ID, ...extra]);
}

/** True for TraceBug's Chrome extension (store or listed dev IDs) or any Firefox extension origin. */
export function isOurExtensionOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  const chrome = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  if (chrome) return chromeIds().has(chrome[1]);
  return /^moz-extension:\/\/[0-9a-f-]{36}$/i.test(origin);
}

/** Any extension scheme at all — used to tell "another extension" apart from a web page. */
export function isExtensionOrigin(origin: string | null | undefined): boolean {
  return !!origin && /^(chrome-extension|moz-extension):\/\//.test(origin);
}
