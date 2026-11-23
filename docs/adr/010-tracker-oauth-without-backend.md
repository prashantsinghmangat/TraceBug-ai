# ADR 010 — Tracker sign-in without a backend

**Status:** Accepted 2026-11-17 (owner). Builds on ADR 001 (no backend), 004 (MV3), 005 (no dependencies).
Plan: `docs/launch/PLAN.md` Phase 13.

## Context

Filing into a tracker today means pasting a token and typing `owner/repo`, a Linear team id and label names
(`docs/integrations.md`). Jam's flow is Connect → pick a repo → pick fields → Create → the issue opens. We want that
flow without giving up ADR 001. TraceBug has no server, so it cannot hold a client secret, and anything shipped in
the extension is public.

## Decision

1. **Public clients only.** A tracker gets OAuth only if its docs allow a flow with no client secret: the device flow,
   or the authorization code flow with PKCE. If the vendor requires a secret, that tracker uses a pasted token (with
   the same pickers on top). **We never add a proxy to hold a secret.**
2. **Client IDs are public constants** in `src/providers/oauth-clients.ts`. They start as `TODO_OWNER_CLIENT_ID`, and a
   tracker with a placeholder ID shows only its token path.
3. **Tokens live only in `chrome.storage.local`** (`tb_tracker_auth_v1`), and only the service worker reads them.
   - The options page and the confirm window get display data from the worker: account name, repos, labels.
   - Tokens never reach the page, a URL, a log or a message to any page.
   - The pasted-token configs stay in `tb_integrations_v1`. Existing users keep working with no reconnect: their saved
     repo or team becomes the default selection.
4. **The picker lives in the confirm window, not the page** (owner decision, 2026-11-17).
   - The SDK runs in the host page's main world, so anything returned to it is readable by the site under test.
     That includes private repo, org and assignee names.
   - The page still sends **content only** (title, body and, from Phase 3, attachments) over `tb:provider:send`.
   - The extension-owned `confirm-send.html` becomes the "Create a [tracker ▾]" panel: tracker menu, Connect,
     searchable repo/project picker, fields loaded from the tracker, and Create. The issue then opens in a new tab.
   - List and lookup messages (`tb:tracker:*`) are accepted **only from extension pages**, using a `sender.url` check
     like `validateConfirmSender`. A page cannot call them.
   - **Updated 2026-11-19 (Phase 13 Step 3, owner-approved):** on Chrome the same panel is shown **inside the ticket**
     as an extension frame, `create-issue.html` (web-accessible with `use_dynamic_url`; no new permission). It is
     cross-origin to the page, so the reasoning above still holds: the page can't read repo names, people or field
     values. Rules:
     - the content script (never the page) mounts the frame;
     - the worker issues a one-time nonce per request and hands it to the content script, which posts it into its
       own frame only;
     - the first frame presenting it is bound by tab + frameId, and only that frame may list, read or create;
     - `postMessage` carries layout only and is checked by source window, origin and exact shape;
     - Create arms after the frame has been fully visible for 500 ms (IntersectionObserver v2: not covered, faded
       or transformed) and takes only trusted clicks;
     - **Updated 2026-11-19:** when v2 says hidden (any filter, e.g. a dark-mode extension), the content script gives
       a second opinion (hit test at the Create row, click-through layers over it, ancestor opacity/transform/filter;
       colour filters allowed); two clean checks arm, re-checked on the click. **Accepted gap, no fix planned:** a
       click-through `::before`/`::after` whose host element's box lies outside the Create row isn't checked, and
       neither is the shadow tree (open or closed) of a host whose own box lies outside the row. Worst
       case is an unwanted issue in the user's own repository;
     - a port from the frame ties the request to it, so closing the ticket or navigating away cancels it;
     - if the frame doesn't come up within 3.5 s, the extension window opens instead.
   - **Updated 2026-11-19 (Phase 13 Step 5, Integrations hub):** `popup.html` joins the extension pages allowed to
     send `tb:tracker:*`, plus one verb, `tb:tracker:set-primary` (the default tracker, `tb_tracker_default_v1`).
     The page gets only `{ defaultTracker, trackerAttention }` on `data-tb-caps` (an id from a fixed list and a
     boolean), so the ticket's status icon names the tracker but never the repository, team or account. The popup
     doesn't run sign-in itself: it closes when a sign-in window takes focus, so it hands off to settings.

     Firefox keeps the window (its build doesn't expose the frame). Design: `docs/audit/github-integration-design.md`
     (local).
   - This replaces the brief's "extend `tb:provider:send` with list messages" and "panel in the ticket UI".
   - Side benefits: `permissions.request` needs a user gesture in an extension page, which this window is, and the
     panel works on strict-CSP sites for free.
5. **Refresh and errors.**
   - The worker refreshes a token when it has less than 60 s left.
   - On a 401 it makes **one** refresh attempt, then marks the tracker "Reconnect".
   - All error text goes through `friendlyStatus` / `mapProviderError`.
6. **Disconnect** deletes the stored tokens and the remembered picks.
   - Where a revoke endpoint works without a secret, the worker calls it too: Linear `/oauth/revoke`, GitLab
     `/oauth/revoke`.
   - GitHub's revoke needs the secret, so we link the user to `github.com/settings/apps/authorizations`.
7. **Permissions** are optional only, requested on the Connect click. Approved:
   - `identity`;
   - hosts `https://github.com/*`, `https://dev.azure.com/*`, `https://app.vssps.visualstudio.com/*`,
     `https://login.microsoftonline.com/*`, `https://*.atlassian.net/*`, `https://api.atlassian.com/*` and
     `https://gitlab.com/*`;
   - self-hosted GitLab or Jira: that one origin, requested at runtime.
   - **Approved later** (2026-11-17), still optional and added in the phase that uses it: Linear's file-upload
     host and `https://*.visualstudio.com/*`.
   - Each host goes into the manifest in the phase that first uses it. Step 1 added only `identity`.
8. **Chrome first** (owner, 2026-11-17). Every phase is built and tested on Chrome. The Firefox port is its own
   phase at the end, and that is when `identity` gets decided.
   - Until then Firefox must not break: `build-ext.mjs` drops `identity` from the Firefox manifest, and the worker
     offers Connect only when the manifest declares it (feature detection, never the user agent).
   - Firefox keeps the pasted-token paths, which go through the same Create window.

## Per vendor (docs checked 2026-11-17)

| Tracker | Sign-in | Token life | Attachments |
|---|---|---|---|
| GitHub | **GitHub App + device flow** | 8 h, refresh 6 mo; no secret | none (text only) |
| Linear | **OAuth code + PKCE** | 24 h, refresh 30 d (rotating); no secret | `fileUpload` |
| Azure DevOps | **Entra code + PKCE**, work/school accounts; PAT for personal accounts | SPA refresh token 24 h | wit attachments |
| Jira Cloud | **site + email + API token** (3LO needs a secret) | token ≤ 1 year | REST attachments |
| GitLab | **OAuth code + PKCE** (gitlab.com); PAT for self-hosted | 2 h, refresh; no secret | project uploads |
| Slack | incoming webhook (unchanged; OAuth needs a secret) | — | — |

### GitHub
- **Updated 2026-11-20 (first tracker release = GitHub only):**
  - Refresh: one at a time in the worker; a caller that arrives after a refresh uses the stored token; the rotated
    tokens are written before any other await (an MV3 shutdown can't lose them).
  - SAML SSO: `X-GitHub-SSO: required; url=…` → "Authorise TraceBug for <org>"; `partial-results; organizations=…`
    → the list is kept with a link per org (`/organizations/{id}` → `https://github.com/orgs/<login>/sso`). Only
    `https://github.com/…` links are opened, by the worker (`tb:tracker:open-sso`).
  - Owner approval: GitHub reports a pending request only by sending the install window to the app's **Setup URL**
    with `?setup_action=request`, and only while "Request user authorization (OAuth) during installation" is
    unchecked. Both apps (production and Dev) set their Setup URL to their own github.com page; with github.com access
    (granted at Connect) the worker reads only `setup_action` from that window's address (`tabs.onUpdated`) and
    shows "Waiting for your organisation owner to approve TraceBug". Unlike the device flow (whose window is never
    read), this is a hint, never an auth signal; nothing is injected into github.com.
  - Rate limits (primary and secondary) → "GitHub rate limit: try again after HH:MM"; archived / Issues-off
    repositories are listed as unavailable.
  - Disconnect deletes the token locally; GitHub needs the client secret to revoke, so the user is pointed to
    github.com/settings/applications.
  - GitHub Enterprise Server isn't supported.
- **Device flow, with no secret.** It works for GitHub Apps once it is enabled in the app settings. The device-code
  request and the poll send only `client_id` ([authorizing OAuth apps][gh-dev]).
  - The endpoints don't support CORS pre-flight, so the service worker calls them using `https://github.com/*`.
- **Refresh with no secret.** User tokens expire after 8 h; refresh tokens last 6 months. `client_secret` is
  "Required unless the user access token was generated using the device flow" ([refreshing tokens][gh-refresh]).
- **The web flow is not an option.** PKCE was added in 2025, but the web flow's token exchange still requires the
  secret ([changelog][gh-pkce]).
- **Registered 2026-11-18:** GitHub App **TraceBug Dev**, owned by the free org `tracebugdev` (so the consent
  screen names the product, not a person), client ID `Iv23lidsU0w7Ezzc9qyb`, Device Flow on, webhook off, Issues
  read & write + Metadata read, installable on any account. No client secret or private key was generated.
  The app must stay **public** (Advanced → Make public): a private app installs only on `tracebugdev`.
  Public page: `https://github.com/apps/tracebug-dev`.
- **Why a GitHub App rather than an OAuth App:** the user picks which repos it can see, and its permissions are narrow.
  - We need Issues: read & write and Metadata: read ([permissions][gh-perms]).
  - Repos come from `GET /user/installations` → `/user/installations/{id}/repositories`.
- **Labels, assignees and milestone need push access.** Without it GitHub drops them silently, so the panel says so.
- **No attachment upload in REST.** The issue body says to attach the exported `.html`. We never commit files or
  create gists.

### Linear
- **PKCE is supported, and `client_secret` is optional with it**, for both the exchange and refresh
  ([Linear OAuth][lin-oauth]).
  - Authorize at `linear.app/oauth/authorize`; token and revoke at `api.linear.app/oauth/{token,revoke}`.
  - Access tokens last 24 h. Refresh tokens rotate, and last 30 days.
- **`fileUpload` uses a signed PUT, which is open** ([upload guide][lin-up]).
  - Linear says a client-side PUT is blocked by its CSP, so a PUT from the worker must be tested.
  - The docs don't name the upload host. Phase 3 reads it from a real `uploadUrl` before adding it. If it turns out
    to be a shared host such as `storage.googleapis.com`, ask again: that is far broader than "Linear's host".
- **Built 2026-11-19 (Phase 13 step 4).**
  - Linear's schema documents `fileUpload(contentType, filename, size)` returning `uploadUrl`, `assetUrl` and
    `headers`. The PUT must start within a minute and send exactly `size` bytes. "Workspace file-type restrictions
    and plan upload limits apply" — Linear publishes no numbers, so TraceBug caps uploads itself: 20 MB per file,
    30 MB per issue, 6 files.
  - The upload origin is still **unconfirmed**. A third-party guide says it is Google Cloud Storage. Until the owner
    reads it from a real `uploadUrl` and approves it, `LINEAR_UPLOAD_ORIGINS` (`src/providers/trackers.ts`) stays
    empty and no host is declared, so issues are filed without the files and the panel says so.
  - Disconnect revokes the grant at `api.linear.app/oauth/revoke` (token only, no secret).
  - Owner decision 2026-11-19: the upload origin (read from a real `uploadUrl`) is an OPTIONAL host, declared in
    both manifests and `LINEAR_UPLOAD_ORIGINS`. It is requested on the first Linear send with attachments, from the
    panel's Create click, with the reason "Linear stores attachments on <provider>". It is not requested at Connect.
    Declined: the issue is filed without the files and the panel says so. Uploads go only to the exact `uploadUrl`
    Linear returns, and only if its origin is on the list. A unit test keeps the list and the manifests in step.

### Azure DevOps
- **ADO's own OAuth is out.** It is deprecated, takes no new registrations since April 2025, and needed a secret
  ([ADO OAuth][ado-old]).
- **Entra is the route:** a public client, PKCE, scope `499b84ac-1321-427f-aa17-267ca6975798/.default offline_access`.
- **Blocker:** "Entra apps don't natively support Microsoft account (MSA) users for the Azure DevOps resource"
  ([Entra OAuth][ado-entra]). Personal accounts use the PAT path.
- **Not stated in the docs:** whether Entra accepts the `chromiumapp.org` / `extensions.allizom.org` redirects, and
  whether a worker's `chrome-extension://` Origin counts as an SPA origin.
  - Register as SPA first. If redemption fails with AADSTS9002327/90023, try "Mobile and desktop" with public client
    flows on; that also removes the 24 h refresh cap.
- **Legacy `*.visualstudio.com` organisations:** approved as optional on 2026-11-17, for Phase 4.
- **Phase 4 gate:** before any other Phase 4 code, check that Entra accepts the `chromiumapp.org` redirect. If it
  doesn't, stop.

### Jira Cloud
- **3LO doesn't fit.** It "supports the code grant flow only" and needs `client_secret` for the exchange and refresh
  ([3LO][jira-3lo]). The PKCE request [ECO-283][jira-eco] is still "Gathering Interest".
- **So the sign-in is site URL + email + API token (Basic auth).**
  - Tokens expire in at most 1 year, so the panel shows the expiry hint.
  - Scoped tokens go through `api.atlassian.com`, which is approved.

### GitLab
- **PKCE works for a non-confidential app.** The exchange and refresh need no secret, and `/oauth/token` serves CORS
  ([GitLab OAuth][gl-oauth]).
  - Tokens last 2 h. The scope is `api`: there is no narrower issues-only scope.
- **Self-hosted** needs its own app registration, so it uses the instance URL + PAT, plus a runtime origin request.
- **Uploads** go to `POST /projects/:id/uploads` (100 MB by default) and are linked from the description.

## Firefox

- **`identity` can't be optional in Firefox.** MDN's optional-permission list leaves it out
  ([optional_permissions][mdn-opt]). So `launchWebAuthFlow`, which the PKCE trackers need, would only work in Firefox
  as a **required** permission. That needs a new install/update prompt, which needs the owner's sign-off.
- **Until the Firefox phase** (decision 8), Firefox shows no Connect anywhere, GitHub included, and every tracker
  uses its token path.
- **Redirect URLs:** Firefox's is `https://<hash>.extensions.allizom.org/`. Chrome's is
  `https://fdemmibikigigkfjngclmdheeajhdgaj.chromiumapp.org/` for the store build. An unpacked build has its own id.

## Why there is still no backend

Every flow above ends with a token issued straight to the extension, by a request the extension makes itself. No
TraceBug server sees the token, the report or the tracker's answer. Where that is impossible (Jira, Slack, ClickUp,
Notion, Asana), we keep the token path rather than add a server.

**Rejected 2026-11-18: a token-swap endpoint for one-popup GitHub sign-in (Jam's model).** GitHub's redirect flow
needs the client secret at the code exchange even with PKCE (docs checked 2026-11-18), so a single Authorize popup
requires a server holding the secret. It would break ADR 001, put every user's token in transit through our server,
and add an uptime dependency to filing a bug. GitHub stays on the device flow; the friction is reduced in the client
instead (popup window, code on the clipboard, auto-close, in-page panel). Jam's MCP OAuth is the same story: it exists because Jam's data is in its cloud; TraceBug's MCP is stdio over
local files and needs no sign-in.

## Later candidates (not built)

- **ClickUp:** the token exchange needs the secret; the personal token never expires. Token path only.
- **Notion:** exchange and refresh use Basic auth with the client secret. Token path only.
- **Asana:** PKCE exists, but the secret is required and the docs say to call from a server. Token path only.

## Consequences

- **The owner registers four apps** (GitHub App, Linear, Entra, GitLab) and pastes their client IDs.
  - Each needs the Chrome redirect URI, and the Firefox one too if `identity` becomes required there.
  - Unpacked dev builds need their own redirect URIs, or a manifest `key` for a stable id.
- **More surface in the confirm window.** It is still textContent-only for anything that came from the page.
- **Token lifetimes are short** (GitHub 8 h, Linear 24 h, GitLab 2 h), so the refresh path is exercised constantly.
  Tests cover it for every provider.

[gh-dev]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
[gh-refresh]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
[gh-pkce]: https://github.blog/changelog/2025-07-14-pkce-support-for-oauth-and-github-app-authentication/
[gh-perms]: https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
[lin-oauth]: https://linear.app/developers/oauth-2-0-authentication
[lin-up]: https://linear.app/developers/how-to-upload-a-file-to-linear
[ado-old]: https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/azure-devops-oauth
[ado-entra]: https://learn.microsoft.com/en-us/azure/devops/integrate/get-started/authentication/entra-oauth
[jira-3lo]: https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
[jira-eco]: https://jira.atlassian.com/browse/ECO-283
[gl-oauth]: https://docs.gitlab.com/api/oauth2/
[mdn-opt]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_permissions
