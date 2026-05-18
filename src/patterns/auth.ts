// ── Auth / JWT error patterns ─────────────────────────────────────────────

import { ErrorPattern } from "./index";

export const authPatterns: ErrorPattern[] = [
  {
    id: "auth-jwt-expired",
    pattern: /(jwt expired|token expired|expired token|tokenexpired)/,
    hint: "JWT or session token expired — the user needs to refresh or re-authenticate",
    fix: "trigger a silent token refresh on 401; if refresh fails, redirect to login",
    category: "Auth tokens",
  },
  {
    id: "auth-jwt-invalid",
    pattern: /(invalid token|invalid signature|jwt malformed|jsonwebtokenerror)/,
    hint: "JWT signature/format invalid — wrong secret, wrong algorithm, or corrupted token",
    fix: "verify the signing secret matches between client and server; re-issue the token",
    category: "Auth tokens",
  },
  {
    id: "auth-401",
    pattern: /(401|unauthorized)/,
    hint: "401 Unauthorized — auth header missing, malformed, or rejected",
    fix: "ensure the request includes a valid `Authorization: Bearer <token>` header; check token in DevTools",
    category: "Auth 401",
  },
  {
    id: "auth-403",
    pattern: /(403|forbidden|insufficient permission|access denied|not authorized)/,
    hint: "403 Forbidden — user is authenticated but lacks permission for this resource",
    fix: "check the user's role/scope on the backend; verify the route's permission requirements",
    category: "Auth 403",
  },
  {
    id: "auth-csrf",
    pattern: /(csrf|cross.?site.?request.?forgery|x-xsrf-token|xsrf)/,
    hint: "CSRF token missing or mismatched",
    fix: "include the CSRF cookie/header in the request, or fetch a fresh token before submitting",
    category: "Auth CSRF",
  },
];
