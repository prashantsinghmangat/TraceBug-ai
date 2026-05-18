# Shareable Cloud Report Portal — Implementation Plan

> **Status:** Final draft for review (not yet implemented)
> **Owner:** Prashant Singh Mangat
> **Last updated:** 2026-05-18
> **Supersedes:** all earlier drafts of this document

---

## 1. Context & Goal

### Today
TraceBug is a **zero-backend, browser-only** tool. The HTML export
([src/exporters/html-replay.ts](../src/exporters/html-replay.ts)) builds a
self-contained `.html` file and triggers a browser download. Users email or
Slack that file to teammates.

### Goal
Add **cloud sharing** alongside the existing local download. One click →
SDK uploads the report to TraceBug's backend → returns a public link like
`https://tracebug.netlify.app/share/abc123` that anyone can open.

### Product positioning
> **Local-first replay debugging with optional cloud sharing.**

The cloud is **only** for: auth, storage, sharing, dashboards.
Replay generation stays 100% client-side. This is our moat vs. Sentry / LogRocket / FullStory.

---

## 2. Free Plan (the only plan for now)

We ship one tier: **Free**. Paid tiers are deferred to a future phase.

### What's free
| Capability | Limit |
|---|---|
| Local bug capture, export `.html`, GitHub / Linear / Slack / clipboard exports | **Unlimited** — no login |
| Active video shares | **5 per user** |
| Active screenshot-only shares | **10 per user** |
| Screenshots inside a shared ticket | **Max 5 per ticket** |
| Video length inside a shared ticket | **Max 2 minutes** (capped by 50 MB per-file storage limit) |
| Upload file size | **Max 50 MB** per share (Supabase Storage free-tier hard ceiling) |
| Total active shares per user | **Up to 15** (5 video + 10 screenshot) |
| Share retention | **14 days** auto-delete · user can click **"Extend"** in dashboard to add 14 more days, unlimited times |
| Dashboard listing your shares | ✅ |

### What requires login
- **Only** creating a shareable cloud URL
- Local capture, local export, all integrations — no login

### Quota mechanics (when user hits a cap)
- 6th video share → modal: *"You've used 5/5 video shares. Delete one to share another."* with a one-click delete list
- 11th screenshot share → same modal for screenshots
- 6+ screenshots in a single shared ticket → modal: *"Select which screenshots to keep (max 5)"* with checkboxes; user picks 5, the rest are stripped before upload

### Video duration cap (2 min, enforced during recording)
The cap applies to **cloud upload only**; local recording stays unlimited if `shareReport()` is never called. The 2-min cap is set by the 50 MB per-file storage limit at standard WebM quality. Mechanics during an active recording:

| Time | Behavior |
|---|---|
| `0:00 – 1:30` | Recording proceeds normally |
| `1:30` | Toast warning: *"30 seconds left in recording — cloud share limit is 2 min"* |
| `1:55` | Final toast: *"Recording stops in 5 seconds"* |
| `2:00` | **Auto-stop**: recording ends, ticket modal opens automatically with the report pre-built |
| User clicks "Share" | Upload proceeds as normal |

Implementation hook: wire into the existing [setAutoStopHandler](../src/video-recorder.ts#L67) infrastructure already used by other auto-stop scenarios — no new mechanism needed. A small `MAX_CLOUD_RECORDING_S = 120` constant gates this.

If the user doesn't want the cap, they can record locally (no upload) — that path is unaffected. Phase 2 Pro tier will lift this to 10 min.

### Marketing copy (Jam-inspired)
```
TraceBug — Free
$0 / forever
• Unlimited local bug reports
• 5 video share links (2 min each)
• 10 screenshot share links
• Up to 5 screenshots per share
• 50 MB max per upload
• GitHub / Linear / Slack export
• Chrome extension + SDK
```

---

## 3. Architecture (2 vendors only)

```
┌─────────────────────────────┐
│  Customer's web app         │
│  TraceBug SDK               │
│       │                     │
│       ▼                     │
│  hidden iframe              │
│  tracebug.netlify.app/      │
│         sdk-bridge          │ ── auth cookies live here, not on customer.com
└──────┬──────────────────────┘
       │ ① postMessage: "share this report" + report blob
       ▼
┌─────────────────────────────────────────────┐
│  iframe → Next.js API on Netlify            │
│  • Supabase session cookie auto-sent        │
│  • POST /api/upload/init                    │
│    - check quota (5 video / 10 screen)      │
│    - mint UUID + share_token                │
│    - return Supabase signed upload URL      │
│  • PUT (HTML blob) → directly to Supabase   │
│    Storage (50 MB hard limit)               │
│  • POST /api/upload/complete                │
│    - mark session as uploaded               │
└──────┬──────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│  Supabase (single vendor for everything)     │
│  ┌────────────────────────────────────────┐  │
│  │  Postgres + RLS                        │  │
│  │  - sessions table                      │  │
│  │  - pg_cron expiry job                  │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  Auth (email magic link)               │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  Storage bucket: reports (private)     │  │
│  │  - key: <uuid>.html (max 50 MB)        │  │
│  │  - access only via signed URLs         │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘

       ┌────────────────────────────────────────────┐
       │  Recipient                                 │
       │  GET tracebug.netlify.app/share/<token>    │
       │  ► no login required                       │
       │  ► Next.js SSR fetches signed Storage URL  │
       │  ► renders report in <iframe srcdoc>       │
       └────────────────────────────────────────────┘
```

### Stack
| Layer | Choice | Free-tier headroom |
|---|---|---|
| Frontend + API | **Next.js 14 on Netlify** (existing) | 100 GB bandwidth / 125K functions / month |
| Auth | **Supabase Auth** (Email magic link) | 50K MAU |
| Database | **Supabase Postgres** (with RLS) | 500 MB storage, 2 GB transfer / month |
| File storage | **Supabase Storage** (private bucket, signed URLs) | 1 GB storage, 2 GB egress / month, **50 MB per file** |
| Rate limit | Deferred to Phase 2 (Supabase row-count check serves as quota guard) | — |

### Why this stack
- **2 vendors only** — every additional vendor is operational tax. No Prisma, Trigger.dev, Upstash, PostHog, Vercel migration. Even Cloudflare R2 was dropped — Supabase Storage covers MVP needs without needing a separate account or credit card.
- **Reuses existing Netlify deploy** — zero migration risk
- **Single Supabase project** for auth + DB + storage — one dashboard, one set of credentials, one RLS model
- **Email magic link only** — no passwords means zero password-reset support burden; Google/GitHub OAuth deferred

### When to migrate Storage to Cloudflare R2 (Phase 2)
Supabase Storage's 2 GB/month egress limit will bite when we get viral. Migration to R2 is a 1-day job:
- Add Cloudflare account + R2 bucket + credit card on file
- Swap `website/lib/storage.ts` from Supabase client to AWS SDK pointed at R2
- All other code (API routes, SDK, viewer) unaware of the change
- R2 gives 10 GB storage + zero egress forever — meaningful upgrade when traffic justifies the switch

---

## 4. Auth Bridge (the trickiest piece)

### The problem
SDK runs on `customer.com`. Auth cookies live on `tracebug.netlify.app`. Different origins, no automatic session sharing. We need:
- Customer's site to **never** see TraceBug auth tokens (security)
- User logs in **once** → SDK on any customer site is authenticated (UX)
- Chrome extension + SDK + website share the same session

### The solution: hidden iframe bridge (Loom / Intercom pattern)

```
customer.com page
  └─ TraceBug SDK (window context A)
       │
       │  postMessage protocol (origin-checked)
       │
       └─ <iframe hidden src="https://tracebug.netlify.app/sdk-bridge"> (window context B)
              │
              │  has access to Supabase cookies on tracebug.netlify.app
              │
              └─ calls /api/upload/init, /api/upload/complete on behalf of SDK
```

**Flow:**
1. SDK mounts a hidden iframe pointing at `tracebug.netlify.app/sdk-bridge`
2. SDK sends `postMessage({ type: 'check-auth' })`; iframe replies `{ authed: true/false, user: {...} | null }`
3. If not authed and user clicks "Share":
   - Iframe opens an OAuth popup window for magic-link login (focused on `tracebug.netlify.app/auth/popup`)
   - User completes login → popup closes → iframe re-checks → SDK is now authed
4. SDK sends `postMessage({ type: 'create-share', blob, hasVideo, screenshotCount })`
5. Iframe calls `/api/upload/init` (cookies auto-sent because same origin) → signed upload URL
6. Iframe PUTs blob to Supabase Storage (50 MB max, MIME-validated)
7. Iframe calls `/api/upload/complete` → returns `{ shareUrl, id }`
8. Iframe postMessages result back to SDK

### Security properties
- Customer site **never sees** the JWT — it lives only inside the iframe + Supabase cookies
- All postMessages are **origin-validated** on both sides
- Cookies are `HttpOnly`, `Secure`, `SameSite=None; Partitioned` (third-party-cookie safe in modern browsers)
- The iframe URL `/sdk-bridge` only accepts requests from origins listed in an allowlist (we'll start with `*` then tighten)

### Chrome extension login
Extension has its own context (`chrome.storage.local`). Simpler path:
1. User clicks "Sign in" in extension popup → opens `tracebug.netlify.app/auth?source=extension` in a new tab
2. After login, Supabase sets a cookie on `tracebug.netlify.app`
3. Extension can call our API with `credentials: 'include'` and the cookie auto-rides
4. Same session works seamlessly when the SDK iframe loads later

### Session persistence
- Supabase issues a refresh token with 30-day expiry
- Both extension and iframe silently refresh in the background
- User logs in **once every 30 days**, max

---

## 5. Database Schema (Supabase Postgres)

### Tables

```sql
-- Supabase manages auth.users automatically. We just reference it.

CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token       TEXT NOT NULL UNIQUE,             -- random 12-char URL slug
  title             TEXT,
  storage_key       TEXT NOT NULL,                    -- Supabase Storage object key (path inside `reports` bucket)
  size_bytes        BIGINT NOT NULL,
  has_video         BOOLEAN NOT NULL DEFAULT FALSE,
  video_duration_s  INTEGER,                          -- null when no video
  screenshot_count  INTEGER NOT NULL DEFAULT 0,
  visibility        TEXT NOT NULL DEFAULT 'public'    -- 'public' for MVP; 'private' later
                    CHECK (visibility IN ('public', 'private')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  extended_count    INTEGER NOT NULL DEFAULT 0,       -- how many times user clicked Extend
  deleted_at        TIMESTAMPTZ                       -- soft delete
);

CREATE INDEX idx_sessions_user_active
  ON sessions(user_id, has_video)
  WHERE deleted_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_sessions_share_token
  ON sessions(share_token)
  WHERE deleted_at IS NULL AND expires_at > NOW();

CREATE INDEX idx_sessions_expires
  ON sessions(expires_at)
  WHERE deleted_at IS NULL;
```

### Cleanup of expired shares
Use **Supabase pg_cron** (free, built-in) to run nightly:

```sql
-- Runs every day at 03:00 UTC
SELECT cron.schedule('expire-shares', '0 3 * * *', $$
  UPDATE sessions
  SET deleted_at = NOW()
  WHERE expires_at < NOW() AND deleted_at IS NULL;
$$);
```

A separate Netlify scheduled function runs hourly to purge Supabase Storage objects whose row has `deleted_at IS NOT NULL` (decouples storage cost from DB cleanup). The function uses the service-role key to call `supabase.storage.from('reports').remove([...keys])`.

### Row Level Security (RLS) — enabled from day 1

```sql
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Logged-in user can see / modify only their own sessions
CREATE POLICY "users manage own sessions" ON sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public viewer access goes through service-role key in our Next.js API
-- (server-side only; never exposed to browser). Service role bypasses RLS.
```

### Storage RLS policies (on `storage.objects` table, for the `reports` bucket)

```sql
-- Only logged-in users can upload, and only into a path keyed by their user_id
CREATE POLICY "users upload to their own folder" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can read their own files (via signed URLs from API)
CREATE POLICY "users read their own files" ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own files
CREATE POLICY "users delete their own files" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'reports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Public viewer access goes through service-role key in our Next.js API
-- (server-side only; never exposed to browser). Service role bypasses RLS.
```

Object naming convention: `<user_id>/<session_id>.html` — RLS folder check matches `auth.uid()` to the first path segment.

### Quota enforcement (in API route, before issuing signed upload URL)

```ts
const { data: existing } = await supabase
  .from('sessions')
  .select('id, has_video')
  .eq('user_id', user.id)
  .is('deleted_at', null);

const videoUsed = existing.filter(s => s.has_video).length;
const screenshotUsed = existing.filter(s => !s.has_video).length;

if (req.hasVideo && videoUsed >= 5) {
  return json({ error: 'video_quota_reached', used: videoUsed, limit: 5 }, 403);
}
if (!req.hasVideo && screenshotUsed >= 10) {
  return json({ error: 'screenshot_quota_reached', used: screenshotUsed, limit: 10 }, 403);
}
```

---

## 6. API Design (Next.js Route Handlers)

All routes live under [website/app/api/](../website/app/api/).

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/magic-link` | Public | Trigger Supabase magic-link email |
| `GET` | `/api/auth/callback` | Public | Supabase OAuth callback (sets cookie) |
| `POST` | `/api/auth/signout` | Required | Clears Supabase session |
| `GET` | `/api/me` | Required | `{ id, email, quotas: { video: {used,limit}, screenshot: {used,limit} } }` |
| `POST` | `/api/upload/init` | Required | Body: `{ title, sizeBytes, hasVideo, videoDurationS, screenshotCount }` → Returns `{ id, share_token, uploadUrl, viewUrl }`. Quota-checked, size-checked, duration-checked. |
| `POST` | `/api/upload/complete` | Required | Body: `{ id }` → marks session uploaded; idempotent |
| `GET` | `/api/sessions` | Required | Returns user's active sessions for dashboard (active = not deleted, not expired) |
| `DELETE` | `/api/sessions/[id]` | Required | Soft-delete (`deleted_at = now`), schedule R2 object deletion |
| `POST` | `/api/sessions/[id]/extend` | Required | Adds 14 days to `expires_at`, increments `extended_count`. No cap on extensions. |
| `GET` | `/api/share/[token]` | Public | Returns metadata + signed Storage GET URL (5-min TTL); 404 if expired or deleted |

### Hard size & duration caps (enforced in `/api/upload/init`)
- `sizeBytes > 50 MB` → 413 Payload Too Large *(Supabase Storage hard ceiling)*
- `videoDurationS > 120` (2 min) → 400 Bad Request
- `screenshotCount > 5` → 400 Bad Request (SDK should trim before calling)

### Upload flow uses **signed upload URLs only**
- Heavy bytes go **directly** from browser to Supabase Storage
- Netlify Functions' 6 MB body cap **never bites** because the API route only sees the metadata
- Implementation: `supabase.storage.from('reports').createSignedUploadUrl(path)` — built into `@supabase/supabase-js`, no extra dependency
- The 50 MB cap is enforced both client-side (size check before requesting URL) AND server-side (in `/api/upload/init`) AND at the bucket level (Supabase rejects oversized PUTs)

---

## 7. SDK Changes

### New files
- [src/exporters/share-link.ts](../src/exporters/share-link.ts) — orchestrates: build blob → trim screenshots → talk to iframe → return URL
- [src/auth/iframe-bridge.ts](../src/auth/iframe-bridge.ts) — mounts hidden iframe, postMessage protocol, origin-checks
- [src/ui/share-modal.ts](../src/ui/share-modal.ts) — login prompt, screenshot trim picker, quota-reached UI

### Modified files
- [src/types.ts](../src/types.ts) — add `cloudEndpoint?: string` to `TraceBugConfig` (defaults to `https://tracebug.netlify.app`)
- [src/index.ts](../src/index.ts) — export `TraceBug.shareReport()`, `TraceBug.signIn()`, `TraceBug.signOut()`, `TraceBug.getCurrentUser()`
- [src/ui/quick-bug.ts:414](../src/ui/quick-bug.ts#L414) — add "🔗 Share link" button next to "📦 Export .html"
- [src/ui/quick-bug.ts:687](../src/ui/quick-bug.ts#L687) — add Share button handler

### Untouched
- [src/exporters/html-replay.ts](../src/exporters/html-replay.ts) — reused as-is; the blob it produces is what we upload
- [src/exporters/html-template.ts](../src/exporters/html-template.ts) — reused as-is
- All capture/recording/replay code

### Public SDK API
```ts
// Authentication
await TraceBug.signIn();                    // opens magic-link flow
await TraceBug.signOut();
TraceBug.getCurrentUser();                  // { id, email } | null
TraceBug.getQuotas();                       // { video: {used:2, limit:5}, screenshot: {used:7, limit:10} }

// Sharing
const { shareUrl, id } = await TraceBug.shareReport({
  includeVideo: true,                       // default: include if recorded
  // If report has >5 screenshots, the SDK auto-opens the trim picker before upload
});
```

---

## 8. Chrome Extension Changes

- New "Sign in" button in extension popup → opens `tracebug.netlify.app/auth?source=extension` in a new tab
- After auth, the extension calls `/api/me` with `credentials: 'include'` and shows the signed-in user + quota
- Existing extension functionality unchanged
- Manifest update: add `host_permissions` for `https://tracebug.netlify.app/*`
- Extension already has `chrome.storage.local`; no token storage needed there since cookies do the work

---

## 9. Sanitization Layer (security-critical)

Before any HTML blob hits R2, run a sanitization pass:

| What | Strip / Mask |
|---|---|
| Network request headers `Authorization`, `Cookie`, `X-Auth-*`, `X-Api-Key` | Replace value with `[redacted]` |
| Request bodies with field names matching `password`, `secret`, `token`, `apiKey`, `authorization` | Replace with `[redacted]` |
| Console output matching common token patterns (`Bearer eyJ...`, `sk-...`, `ghp_...`) | Mask middle, show first/last 4 chars |
| Input events on `type="password"` or `autocomplete="current-password"` | Replace recorded value with `••••••••` |
| Cookies in DOM screenshots | Out of scope for MVP (screenshots are pre-rendered) |
| Custom `TraceBug.context()` keys flagged as `_sensitive` | Replace with `[redacted]` (new convention) |

Implementation: new file [src/sanitize/cloud-upload.ts](../src/sanitize/cloud-upload.ts), runs on the `BugReport` object before it's serialized into the HTML template.

---

## 10. Dashboard Page

**Route:** [website/app/dashboard/page.tsx](../website/app/dashboard/page.tsx)

**Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│ TraceBug Dashboard                       prashant@example.com │
├──────────────────────────────────────────────────────────────┤
│  Video shares      ████████░░  4 / 5                          │
│  Screenshot shares ██████░░░░  6 / 10                         │
├──────────────────────────────────────────────────────────────┤
│ My Shares (10)                                                │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 🎥 Login flow broken on Safari       2 days ago     45MB │ │
│ │    Expires in 12 days                                     │ │
│ │    https://tracebug.netlify.app/share/x7k2pq             │ │
│ │    [Copy] [View] [Extend +14d] [Delete]                   │ │
│ ├──────────────────────────────────────────────────────────┤ │
│ │ 📸 Checkout button missing on iPad   4 days ago    0.8MB │ │
│ │    Expires in 10 days · extended 1×                       │ │
│ │    https://tracebug.netlify.app/share/m4n8wr             │ │
│ │    [Copy] [View] [Extend +14d] [Delete]                   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Expiry warnings:
- When `expires_at < NOW() + INTERVAL '3 days'`, the row shows in **amber**: *"Expires in 2 days — Extend?"*
- When `expires_at < NOW() + INTERVAL '1 day'`, **red**: *"Expires in 18 hours"*
- After deletion (manual or by cron), the share disappears from the dashboard and `/share/[token]` returns 404

- Server-rendered (SSR) — fetches user's sessions via Supabase with RLS auto-filtering
- Delete = soft-delete (`deleted_at = now()`); background job actually purges Supabase Storage objects on a separate schedule
- Empty state: "No shares yet — capture a bug from the SDK and click Share"

---

## 11. Public Viewer Page

**Route:** [website/app/share/[token]/page.tsx](../website/app/share/[token]/page.tsx)

- No login required
- SSR: fetch metadata from API → mint signed Storage GET URL (5-min TTL) via `supabase.storage.from('reports').createSignedUrl(path, 300)`
- Render: `<iframe srcdoc={...}>` containing the report HTML, sandboxed: `sandbox="allow-scripts allow-same-origin"`
- OG tags via `generateMetadata`:
  - `og:title` = report title
  - `og:description` = "Bug report shared via TraceBug · X screenshots · Y min video"
  - `og:image` = call to existing [website/app/api/og/route.tsx](../website/app/api/og/route.tsx)
- 404 page if token doesn't exist, `expires_at < NOW()`, or `deleted_at IS NOT NULL`

---

## 12. Files Changed / Created

### New files (backend / Next.js)
- `website/app/api/auth/magic-link/route.ts`
- `website/app/api/auth/callback/route.ts`
- `website/app/api/auth/signout/route.ts`
- `website/app/api/me/route.ts`
- `website/app/api/upload/init/route.ts`
- `website/app/api/upload/complete/route.ts`
- `website/app/api/sessions/route.ts`
- `website/app/api/sessions/[id]/route.ts`
- `website/app/api/share/[token]/route.ts`
- `website/app/auth/page.tsx` — login page
- `website/app/auth/popup/page.tsx` — OAuth popup landing
- `website/app/auth/callback/page.tsx` — magic-link redirect target
- `website/app/dashboard/page.tsx`
- `website/app/share/[token]/page.tsx`
- `website/app/sdk-bridge/page.tsx` — the iframe target
- `website/lib/supabase-server.ts` — Supabase server client (uses service role for public viewer route only)
- `website/lib/supabase-browser.ts` — Supabase client for browser
- `website/lib/storage.ts` — Supabase Storage helpers (signed upload, signed download, delete)
- `website/lib/cleanup.ts` — purges Storage objects for soft-deleted sessions
- `website/app/api/cron/purge-expired/route.ts` — Netlify scheduled function (hourly) → calls cleanup
- `website/supabase/migrations/0001_initial.sql` — sessions table + RLS policies + Storage RLS + pg_cron job

### New files (SDK)
- `src/exporters/share-link.ts`
- `src/auth/iframe-bridge.ts`
- `src/ui/share-modal.ts` — login + trim picker + quota-reached
- `src/sanitize/cloud-upload.ts`

### Modified files (SDK)
- [src/types.ts](../src/types.ts) — add `cloudEndpoint?: string`
- [src/index.ts](../src/index.ts) — export new public methods
- [src/ui/quick-bug.ts:414](../src/ui/quick-bug.ts#L414) — add Share button
- [src/ui/quick-bug.ts:687](../src/ui/quick-bug.ts#L687) — add handler

### Modified files (extension)
- `tracebug-extension/manifest.json` — add `host_permissions` for `https://tracebug.netlify.app/*`
- `tracebug-extension/popup.html` + `popup.js` — add Sign in / Signed in as ... section

### Modified files (docs)
- [docs/api-reference.md](../docs/api-reference.md) — document new public methods
- [docs/freemium.md](../docs/freemium.md) — rewrite around new quota model
- [README.md](../README.md) — feature list update
- [CHANGELOG.md](../CHANGELOG.md) — version bump entry

### Untouched
- [src/exporters/html-replay.ts](../src/exporters/html-replay.ts) — reused as-is
- [src/exporters/html-template.ts](../src/exporters/html-template.ts) — reused as-is
- All capture / collectors / replay / video / screenshot code

---

## 13. Effort Estimate

| Phase | Effort |
|---|---|
| Supabase project setup, auth providers, schema migration, RLS policies | ~1 day |
| Next.js API routes (auth, upload, sessions, share) + R2 presign helpers | ~1 day |
| Sanitization layer (test cases for headers, bodies, console patterns) | ~0.5 day |
| SDK iframe bridge + postMessage protocol + origin-check | ~1 day |
| SDK Share button + screenshot-trim modal + quota-reached UX | ~1 day |
| Chrome extension login UI + manifest update | ~0.5 day |
| Dashboard page with quota indicators + delete | ~1 day |
| Public viewer page + OG tags + signed-URL fetch | ~0.5 day |
| Auth pages (login, callback, popup, signed-in landing) | ~0.5 day |
| Sign-in entry from `tracebug.netlify.app` + extension landing | ~0.25 day |
| Smoke tests, Storage cleanup config, deployment | ~0.5 day |
| Docs (rewrite freemium.md, api-reference.md, README, CHANGELOG) | ~0.25 day |
| **Total** | **~8 days** |

This is realistic. Cutting corners on auth/security would save 1–2 days but is not worth the long-term cost.

---

## 14. End-to-End Verification

1. **Local dev:** run `npm run dev` in `website/`; Supabase project pointed at dev environment
2. **Signup:** visit `localhost:3001/auth` → enter email → click magic link → land on dashboard, empty state shows
3. **Quota empty:** `GET /api/me` returns `{ quotas: { video: {used:0,limit:5}, screenshot: {used:0,limit:10} } }`
4. **First share (screenshot-only):** trigger a bug in test app → click Share → iframe loads → upload completes → URL copied → open in incognito → report renders correctly
5. **Share with video:** same flow, with video recorded → `has_video=true` in DB, video plays in viewer
6. **Screenshot trim:** generate report with 8 screenshots → click Share → modal opens with 8 checkboxes → user selects 5 → upload proceeds with only those 5
7. **Quota cap (screenshots):** create 10 screenshot shares → 11th attempt → modal shows "Delete one to share another" with list
8. **Quota cap (video):** create 5 video shares → 6th attempt → same modal for video shares
9. **Dashboard:** all 15 active shares visible with size, type, link, delete button
10. **Delete:** click Delete → row disappears from dashboard → public link returns 404 → `/api/me` quota count decremented
11. **Sanitization:** capture a report with `Authorization: Bearer xyz` in network panel → upload → fetch from Storage → confirm `Authorization: [redacted]`
12. **Iframe origin safety:** open browser devtools on customer.com → confirm no Supabase tokens in localStorage or any global
13. **Auth persistence:** sign in on website → open extension → confirm signed-in state inherited; reload extension after 7 days → still signed in
14. **Public viewer with bad token:** GET `/share/nonsense` → 404
15. **Expired share:** manually set `expires_at` to past → GET `/share/[token]` → 404
16. **Hard caps:** call `/api/upload/init` with `sizeBytes: 100_000_000` → 413; with `videoDurationS: 180` → 400; with `screenshotCount: 8` → 400
17. **RLS (DB):** in Supabase SQL editor, set `auth.uid()` to user A → `SELECT * FROM sessions` returns only A's rows; switch to user B → only B's rows
18. **RLS (Storage):** as user A, try to upload to path `<user_b_id>/x.html` → blocked by Storage RLS
19. **Extend:** click "Extend +14d" → `expires_at` jumps 14 days forward, `extended_count` increments

---

## 15. Out of Scope for MVP

Designed-for in schema/API where reasonable, but **NOT built yet**:

- ❌ Paid tiers (Pro, Team, Enterprise)
- ❌ Stripe / billing
- ❌ Teams / workspaces / member invites
- ❌ Comments on shares
- ❌ Replay annotations / time-anchored discussion
- ❌ Issue assignment
- ❌ Slack / Jira / GitHub auto-sync integrations
- ❌ Realtime collaboration
- ❌ AI summaries
- ❌ Search across my reports
- ❌ View analytics (who opened, when)
- ❌ Private / password-protected shares (only `visibility='public'` supported)
- ❌ MFA / SSO / SAML / audit logs (enterprise stuff)
- ❌ Self-hosted version
- ❌ Background job system (no Trigger.dev / Inngest)
- ❌ Per-IP rate limiting infra (Upstash)
- ❌ Analytics infra (PostHog)
- ❌ Custom domains per workspace
- ❌ msgpack / lz4 / progressive replay streaming (premature)

---

## 16. Security Checklist (must all be ✅ before launch)

- [ ] Supabase RLS enabled on `sessions` table; policies tested as authenticated and anon roles
- [ ] Supabase Storage RLS on `storage.objects` for `reports` bucket (insert/select/delete scoped to `auth.uid()`-prefixed paths)
- [ ] `reports` bucket has `Public: OFF`, `File size limit: 50 MB`, `Allowed MIME types: text/html`
- [ ] All reads of stored files go through signed URLs (5-min TTL) minted server-side
- [ ] Service role key only used in server-side code; never shipped to browser; only in Netlify env vars
- [ ] Auth cookies: `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned`
- [ ] Iframe `postMessage` handlers validate `event.origin` against allowlist
- [ ] All `POST`/`DELETE` API routes verify Supabase session before acting
- [ ] Sanitization runs **before** upload; unit tests cover Authorization headers, password fields, common token patterns
- [ ] Size cap (50 MB) and screenshot cap (5) and video duration cap (120 s) enforced server-side in `/api/upload/init`, not only client-side
- [ ] CSRF: SameSite=None means CSRF risk exists for cross-site form posts → all mutating API routes require `Content-Type: application/json` and check `Origin` header against allowlist
- [ ] Magic-link tokens use Supabase defaults (60-min TTL, single-use)
- [ ] `share_token` is generated with `crypto.randomBytes(12).toString('base64url')` → 96 bits entropy → unguessable
- [ ] Recorded session is sanitized once on upload; subsequent downloads of the same blob are immutable

---

## 17. Cost — Honest Breakdown

### Monthly recurring cost: **$0**

Everything in the MVP stack runs on a permanent free tier. No paid subscriptions.

### What's free (and limits to watch)

| Resource | Free tier | Our usage at MVP |
|---|---|---|
| **Netlify** (frontend + functions) | 100 GB bandwidth · 125K function invocations · 300 build min / month | Each upload = 2 function calls (init + complete); viewer = 1 call. **Plenty of headroom.** |
| **Supabase Postgres** | 500 MB DB · 2 GB transfer / month | ~1 KB per session row → ~500K rows fit. **Effectively never an issue.** |
| **Supabase Auth (MAU)** | 50,000 monthly active users | **Way more than we'll have.** |
| **Supabase email sender** | **30 emails/hour** (built-in SMTP) | First real bottleneck. If 31 users sign up in the same hour, the 31st email fails. *Mitigation: plug Resend (free, 3K/month) into Supabase Auth SMTP settings before any marketing push.* |
| **Supabase Storage** | **1 GB storage · 2 GB egress / month · 50 MB per file** | At avg ~30 MB per video share + ~500 KB per screenshot share, full-quota user = ~155 MB. 1 GB ÷ 155 MB ≈ **6 active power users.** 14-day expiry helps keep this bounded. Egress: each video viewed ~12 times exhausts the monthly limit. **This is the tightest constraint in the whole stack.** |

### The Supabase Storage limits are real — what they mean

- **1 GB storage cap** = ~6 power users at full quota. First constraint we'll hit.
- **2 GB egress / month** = ~67 video share views per month before throttling. Bad if a single share goes viral.
- **50 MB per file** = hard ceiling on any single upload; drives the 2-min video cap.

When we get close to these, the plan is to migrate Storage layer to **Cloudflare R2** (10 GB free + zero egress forever). The abstraction in `website/lib/storage.ts` means it's a 1-day swap — no API changes downstream. By that point you'll need a debit/virtual card (Wise, Revolut, etc.) for Cloudflare.

### Hidden gotchas (worth knowing up-front)

| Gotcha | Impact | Mitigation |
|---|---|---|
| **Supabase pauses your project after 7 days of inactivity** on free tier | Project resumes on first request but takes ~10 seconds (bad first-request UX) | Netlify scheduled function pings Supabase every 6 days to keep it warm |
| **Supabase email sender = 30/hour cap** | If you tweet TraceBug and 100 people sign up at once, 70 emails fail | Switch to Resend SMTP (free 3K/month) before any marketing push |
| **Supabase Storage 1 GB cap** | First real ceiling — ~6 power users | Migrate to R2 when hit |
| **Supabase Storage 2 GB egress/month** | Viral share could throttle | Migrate to R2 when hit |
| **50 MB per upload** | Caps video at 2 min, total share at 50 MB | Built into product design; not a workaround |
| **Netlify functions cold start** | First request after idle = ~1–2s slower | Acceptable for MVP |
| **`tracebug.netlify.app` is the free Netlify subdomain** | OK but not branded | Custom domain (e.g. `tracebug.dev`) = **~$12/year** — NOT included in $0 |

### When you'd start paying

| Trigger | Lowest-cost upgrade |
|---|---|
| Supabase Storage > 1 GB or > 2 GB egress / month | **Migrate Storage layer to Cloudflare R2** (10 GB free, zero egress, needs CC). 1-day code change. |
| Supabase Postgres > 500 MB DB | Supabase Pro = **$25/month** (also: no inactivity pause + custom SMTP + 100 GB storage + 250 GB egress) |
| Email > 3K/month after Resend | Resend paid = **$20/month for 50K emails** |
| Netlify functions > 125K/month | Netlify Pro = **$19/month** (1M invocations) |

**Realistic projection:** $0/month until you have ~5–10 active power users uploading regularly. The first real expansion is migrating Storage to Cloudflare R2 (still free, just needs a card). The first paid bill is likely Resend ($20/mo) or Supabase Pro ($25/mo) when you cross the inactivity-pause threshold.

### Bottom line

✅ **Backend: 100% free** (Netlify + Supabase — no credit card needed anywhere in the MVP stack)
✅ **Storage: free** but **tight** (1 GB / 2 GB egress / 50 MB per file — these drive the product caps)
⚠️ **Email sender: 30/hour cap** — recommend Resend (also free up to 3K/month) before launch
⚠️ **Domain: NOT included** if you want a custom one (~$12/year)
ℹ️ **R2 deferred to Phase 2** when Supabase Storage limits bite — by then you can also pay for a virtual debit card

No vendor in this stack will charge you a cent for the MVP. The first real cost is migration to R2 (still free) or Supabase Pro ($25/mo) — and by then you should have signal that it's worth the spend.

---

## 18. Phase 2 Roadmap (after MVP ships and we have real users)

In likely build order:
1. **Inactivity-based cleanup** — delete shares from users who haven't logged in for 90 days
2. **Pro plan** — Stripe + raised quotas + 90-day video + Jira API integration + custom branding
3. **Teams** — workspaces, member invites, shared library
4. **Comments on shares** — `comments` table, time-anchored
5. **Google / GitHub OAuth** — broaden sign-in options
6. **Private shares** — login-required viewer mode
7. **Slack / Jira / Linear deep integrations** — auto-create tickets on upload
8. **View analytics** — "this share was opened 12 times"

---

## 19. Decisions Locked In (for the record)

| Decision | Choice |
|---|---|
| Hosting stack | **Netlify + Supabase** (2 vendors) |
| API runtime | Next.js Route Handlers (deployed as Netlify Functions) |
| Database | Supabase Postgres with RLS |
| Auth | Supabase Auth, **email magic link only** at launch |
| **Storage** | **Supabase Storage** (`reports` bucket, private, signed URLs). Phase 2 migrate to Cloudflare R2. |
| **Storage per-file cap** | **50 MB** (Supabase free-tier hard ceiling) |
| Pricing | **Free tier only**; paid deferred to Phase 2 |
| Quota: video shares | **5 active per user** |
| Quota: screenshot shares | **10 active per user** |
| Quota: screenshots per share | **5 max** (trim picker before upload) |
| **Quota: video duration** | **2 min max** for cloud share; recorder auto-stops at 2:00 with warning at 1:30 (local recording stays unlimited) |
| Local capture | **Unlimited, no login** — current behavior preserved |
| Share retention | **14 days auto-delete** · user can click "Extend +14d" in dashboard (unlimited extensions) |
| Share visibility | **Public only** at MVP (unguessable token) |
| Viewer auth | **Public** — no login required to view |
| Quota-reached UX | **Soft block** with one-click delete of old share |
| Over-cap screenshots UX | **Trim picker** — user manually chooses which 5 to keep |
| SDK auth | **Hidden iframe bridge** — cookies never exposed to customer.com |
| Extension auth | **New-tab login** on `tracebug.netlify.app` → cookies shared |
| Session persistence | Supabase refresh token, 30-day rolling |
| Replay generation | **Stays 100% client-side** — backend never processes raw sessions |
| Git branch | `feature/cloud-sharing` (created from `main`) |
| Supabase bucket | `reports` (private, 50 MB cap, `text/html` only) |

---

## 20. What I Need From You Before Building

1. ✅ **Supabase account** — confirmed; project created
2. ✅ **Supabase `reports` bucket** — confirmed; 50 MB limit set, MIME `text/html` only
3. ⏳ **Branch `feature/cloud-sharing` created from `main`** and checked out
4. ⏳ **Approval on this doc** as the single source of truth — once you say go, I start with the Supabase migration SQL

Implementation will pause for your review at each milestone:
- After Supabase migration SQL (you run it against your project)
- After `/api/upload/init` + `/api/upload/complete` work end-to-end
- After SDK iframe bridge integrates with the API
- After dashboard renders real data
- After public viewer renders a real share
