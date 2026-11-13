// PHASE2-CLOUD: cloud sharing (accounts with sessions, uploads, share links,
// server-side AI) is parked. While this is false:
//   - /auth, /dashboard 404 (their pages) and /sdk-bridge refuses sign-in;
//   - middleware.ts 404s every cloud route (CLOUD_ROUTE_PREFIXES) so the APIs
//     can't be used by anyone who gets a Supabase session some other way
//     (Supabase sign-ups are on for the Site Audit sign-in, ADR 009).
// Flip it only when Phase 2 ships, after reviewing those routes again.
export const PHASE2_CLOUD_LIVE = false;

export const CLOUD_ROUTE_PREFIXES = [
  "/api/sessions",
  "/api/upload",
  "/api/share",
  "/api/ai",
  "/share",
  "/auth/callback",
];

/** `/api/upload` matches `/api/upload` and `/api/upload/init`, not `/api/uploads`. */
export function isCloudRoute(path: string): boolean {
  return CLOUD_ROUTE_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));
}
