// ── Network error patterns ────────────────────────────────────────────────

import { ErrorPattern } from "./index";

export const networkPatterns: ErrorPattern[] = [
  {
    id: "network-cors-preflight",
    pattern: /cors.*preflight|preflight.*cors|preflight response is not successful/,
    hint: "CORS preflight (OPTIONS) failed — server rejected the cross-origin probe",
    fix: "add the `Access-Control-Allow-Origin`, `-Methods`, `-Headers` response headers on OPTIONS requests",
    category: "Network CORS",
  },
  {
    id: "network-cors",
    pattern: /(access-control-allow-origin|cross-origin.*blocked|cors policy|has been blocked by cors)/,
    hint: "blocked by CORS policy — server didn't return the expected access-control headers",
    fix: "set `Access-Control-Allow-Origin` on the API response, or proxy the request through your own origin",
    category: "Network CORS",
  },
  {
    id: "network-mixed-content",
    pattern: /(mixed content|insecure request.*has been blocked|blocked.*loading.*http)/,
    hint: "mixed content — HTTPS page tried to load an HTTP resource",
    fix: "switch the resource URL to https://, or proxy it through your origin",
    category: "Network security",
  },
  {
    id: "network-timeout",
    pattern: /(timeout|timed out|request timeout|deadline exceeded)/,
    hint: "request timed out — upstream service is slow, unreachable, or hanging",
    fix: "raise the client timeout, add a retry, or investigate slow downstream queries",
    category: "Network latency",
  },
  {
    id: "network-dns",
    pattern: /(dns_probe|name not resolved|err_name_not_resolved)/,
    hint: "DNS lookup failed — host doesn't resolve",
    fix: "check the URL spelling, DNS records, or VPN/network connectivity",
    category: "Network DNS",
  },
  {
    id: "network-offline",
    pattern: /(network.*offline|navigator.*offline|err_internet_disconnected|networkerror.*request)/,
    hint: "no network — the device is offline or the request was disconnected",
    fix: "show an offline UI; queue retries with `navigator.onLine` + `online` event listener",
    category: "Network offline",
  },
  {
    id: "network-aborted",
    pattern: /(aborterror|aborted|signal.*aborted|the user aborted|request was aborted)/,
    hint: "request was cancelled — usually a navigation away or AbortController.abort()",
    fix: "this is expected when the user navigates; ignore unless you didn't intend to cancel",
    category: "Network abort",
  },
  {
    id: "network-failed-fetch",
    pattern: /(failed to fetch|networkerror when attempting to fetch|load failed)/,
    hint: "fetch failed — typically CORS, blocked by client, offline, or server unreachable",
    fix: "check Network tab for the underlying status; verify the URL and CORS headers",
    category: "Network fetch",
  },
];
