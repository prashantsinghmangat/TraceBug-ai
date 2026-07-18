// ── Cloud endpoint resolution ─────────────────────────────────────────────
// The cloudEndpoint config value ends up in window.open(), an iframe src, and
// postMessage target origins, so it must be a well-formed http(s) URL. Plain
// http is only allowed for localhost (developing against a local portal).
// Anything else falls back to the production endpoint rather than throwing —
// a bad config value must never break the host app.

export const DEFAULT_CLOUD_ENDPOINT = "https://tracebug.dev";

export function resolveCloudEndpoint(endpoint?: string | null): string {
  const raw = endpoint?.trim();
  if (!raw) return DEFAULT_CLOUD_ENDPOINT;
  try {
    const url = new URL(raw);
    const isLocal =
      url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
      if (typeof console !== "undefined") {
        console.warn(`[TraceBug] cloudEndpoint must be HTTPS (or http on localhost) — using ${DEFAULT_CLOUD_ENDPOINT}`);
      }
      return DEFAULT_CLOUD_ENDPOINT;
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    if (typeof console !== "undefined") {
      console.warn(`[TraceBug] Invalid cloudEndpoint "${raw}" — using ${DEFAULT_CLOUD_ENDPOINT}`);
    }
    return DEFAULT_CLOUD_ENDPOINT;
  }
}
