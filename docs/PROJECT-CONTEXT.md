# TraceBug — Project Context

> Single source of truth for any agent or contributor picking up this project cold.
> **Last updated:** 2026-05-18 (after cloud-sharing portal milestone)
>
> ⚠️ **2026-07-02 update:** the cloud-sharing UI described in §2 is **built but disabled** for the Phase 1 offline release (`PHASE2-CLOUD` markers in `src/ui/quick-bug.ts` and the extension popup). For the current verified state, the Phase 1 / Phase 2 split, launch blockers, and the July 2026 hardening pass, read **[PROJECT-STATUS.md](PROJECT-STATUS.md)** first.

---

## 1. TL;DR

**TraceBug** is a developer-facing bug-reporting tool that captures user sessions (clicks, network, console, screenshots, optional video) and produces self-contained HTML bug reports.

Historically it was **zero-backend** — everything ran in the browser. As of May 2026 it grew an optional **cloud sharing portal**: signed-in users can upload a report to TraceBug's backend and share a public URL. Local capture is still 100% client-side.

**Stack:** Netlify + Supabase + Cloudflare-R2-deferred + Chrome extension + npm SDK.

**Product positioning:** *Local-first replay debugging with optional cloud sharing.*

---

## 2. What's built (May 2026)

### Local SDK (zero-backend, unchanged from v1.x)
- Capture clicks / inputs / route changes / API calls / console errors / network failures
- Screen recording (in-page MediaRecorder OR Chrome offscreen worker)
- Smart screenshot with click-target highlighting
- Element annotation + draw mode + voice notes
- Bug report builder with root-cause hint, severity, action chips
- Self-contained HTML replay export (offline-viewable)
- GitHub / Linear / Slack / Jira / PDF export
- Free / Premium plan flag (local toggle, no real paywall)

### Cloud sharing portal (NEW)
- Sign-in via Supabase Auth (email magic link)
- Upload bug report to Supabase Storage via signed PUT URL
- 14-day default retention, user-extendable (+14d per click)
- Per-user quotas: **5 video shares + 10 screenshot shares** active at a time
- Screenshot trim modal when report has >5 screenshots
- 2-min video auto-stop with warnings at 1:30 / 1:55
- Public viewer at `/share/[token]`
- Jam.dev-style dashboard with thumbnail previews
- Chrome extension popup with cloud account UI
- Server-side sanitization (strips `Authorization` headers, tokens, password fields)
- RLS on `sessions` + Storage objects
- Nightly pg_cron expiry sweep + hourly Netlify cron Storage purge

---

## 3. Architecture

```
┌─────────────────────────────┐
│  Customer's web app         │
│  TraceBug SDK (npm or ext)  │
│  ├─ Local: capture + export │
│  └─ Cloud share:            │
│     └─ hidden iframe ───────┼──┐
└─────────────────────────────┘  │ postMessage
                                 ▼
                  ┌────────────────────────────────────┐
                  │  Next.js on Netlify                │
                  │   tracebug.netlify.app             │
                  │                                    │
                  │  Pages:                            │
                  │   /auth, /dashboard, /share/:t,    │
                  │   /sdk-bridge (iframe target)      │
                  │                                    │
                  │  API routes (also via middleware): │
                  │   /api/me, /api/sessions/...,      │
                  │   /api/upload/init+complete,       │
                  │   /api/share/[token],              │
                  │   /api/auth/*, /api/cron/*         │
                  └─────────────┬──────────────────────┘
                                │
                                ▼
                  ┌──────────────────────────────────────┐
                  │  Supabase (single vendor)            │
                  │   ┌──────────────────────────────┐   │
                  │   │  Postgres + RLS              │   │
                  │   │  - sessions table            │   │
                  │   │  - pg_cron expiry job        │   │
                  │   └──────────────────────────────┘   │
                  │   ┌──────────────────────────────┐   │
                  │   │  Auth (email magic link)     │   │
                  │   └──────────────────────────────┘   │
                  │   ┌──────────────────────────────┐   │
                  │   │  Storage bucket `reports`    │   │
                  │   │  - <user_id>/<id>.html       │   │
                  │   │  - private, signed URLs only │   │
                  │   └──────────────────────────────┘   │
                  └──────────────────────────────────────┘
```

**Why this stack:** 2 vendors (Netlify + Supabase) — no Cloudflare R2 yet because R2 requires a credit card on file. R2 migration is a deferred Phase-2 task (storage layer in `website/lib/storage.ts` is abstracted to make the swap a 1-day job).

---

## 4. Folder structure

```
TraceBug-ai/
├── src/                            # The SDK (npm + extension shared source)
│   ├── index.ts                    # Public API surface
│   ├── types.ts                    # TraceBugConfig, BugReport, etc.
│   ├── storage.ts                  # localStorage session persistence
│   ├── collectors.ts               # Click/input/network/console capture
│   ├── environment.ts              # OS/browser/viewport detection
│   ├── screenshot.ts               # html2canvas wrapper
│   ├── region-screenshot.ts        # Snipping-tool screenshot
│   ├── video-recorder.ts           # MediaRecorder + offscreen IPC + 2-min cap
│   ├── report-builder.ts           # Build BugReport from session events
│   ├── repro-generator.ts          # Plain-English repro steps
│   ├── title-generator.ts          # Auto bug title
│   ├── timeline-builder.ts         # Timeline + markers
│   ├── github-issue.ts             # GitHub markdown export
│   ├── linear-issue.ts             # Linear URL export
│   ├── jira-issue.ts               # Jira markup export (premium)
│   ├── slack-export.ts             # Slack post format
│   ├── pdf-generator.ts            # PDF export (premium)
│   ├── plan.ts                     # Free/Premium plan flag (local)
│   ├── dashboard.ts                # Floating in-page dashboard
│   ├── compact-toolbar.ts          # Floating toolbar (record/screenshot)
│   ├── annotation-store.ts         # Element annotations + draw regions
│   ├── element-annotate.ts         # Click-element annotation mode
│   ├── draw-mode.ts                # Free-draw markup mode
│   ├── voice-recorder.ts           # Web Speech API note taking
│   ├── scanner.ts + patterns/*     # Auto-detect issues (a11y, network, etc.)
│   ├── plugin-system.ts            # Plugin hooks
│   ├── theme.ts                    # Theme tokens + injection
│   ├── dev-api.ts                  # TraceBug.mark / .assert / .context
│   │
│   ├── auth/                       # ── NEW: Cloud share auth ──
│   │   └── iframe-bridge.ts        # postMessage protocol to /sdk-bridge
│   │
│   ├── sanitize/                   # ── NEW: Pre-upload scrubbing ──
│   │   └── cloud-upload.ts         # Regex-based secret redaction
│   │
│   ├── exporters/
│   │   ├── html-template.ts        # Inlined HTML viewer template (no deps)
│   │   ├── html-replay.ts          # Build .html + trigger download / blob
│   │   ├── share-link.ts           # ── NEW: orchestrate cloud upload ──
│   │   └── thumbnail.ts            # ── NEW: 320x180 JPEG card preview ──
│   │
│   ├── ui/
│   │   ├── quick-bug.ts            # The Bug Ticket Review modal (Share button here)
│   │   ├── screenshot-trim-modal.ts # ── NEW: picker for >5 screenshots ──
│   │   ├── replay-scrubber.ts      # Timeline scrubber
│   │   ├── recording-hud.ts        # Floating "REC" overlay
│   │   ├── toast.ts                # In-page toast helper
│   │   ├── upgrade-modal.ts        # Premium upsell modal
│   │   ├── live-bug-card.ts        # In-page error notification
│   │   ├── issues-panel.ts         # Auto-detected issues panel
│   │   └── helpers.ts              # escapeHtml + DOM utils
│   │
│   └── ...
│
├── tracebug-extension/             # Chrome MV3 extension
│   ├── manifest.json
│   ├── background.js               # Service worker
│   ├── content-script.js           # Injects SDK into pages
│   ├── tracebug-init.js
│   ├── tracebug-sdk.js             # ──── BUILT ARTIFACT (IIFE bundle of src/)
│   ├── offscreen.html + offscreen.js # Offscreen recording worker
│   ├── popup.html                  # MODIFIED: account block added
│   ├── popup.js                    # MODIFIED: refreshAccount() etc.
│   ├── styles.css                  # MODIFIED: .account styles added
│   ├── icons/
│   └── generate-*.html             # Asset generators
│
├── website/                        # Next.js 14 App Router on Netlify
│   ├── app/
│   │   ├── page.tsx                # Marketing home
│   │   ├── docs/page.tsx           # Docs landing
│   │   ├── privacy/page.tsx
│   │   ├── compare/[slug]/page.tsx
│   │   ├── layout.tsx              # Root layout + metadata
│   │   ├── globals.css
│   │   ├── sitemap.ts + robots.ts
│   │   │
│   │   ├── auth/                   # ── NEW ──
│   │   │   ├── page.tsx            # Server-side auth-redirect wrapper
│   │   │   ├── AuthClient.tsx      # Magic-link form (client)
│   │   │   └── callback/route.ts   # Supabase code → session exchange
│   │   │
│   │   ├── dashboard/              # ── NEW ──
│   │   │   ├── page.tsx            # Server-side auth check
│   │   │   └── DashboardClient.tsx # Sidebar + grid of share cards
│   │   │
│   │   ├── share/[token]/page.tsx  # ── NEW: public viewer ──
│   │   ├── sdk-bridge/page.tsx     # ── NEW: SDK iframe target ──
│   │   │
│   │   └── api/                    # ── NEW ──
│   │       ├── og/route.tsx        # Pre-existing OG image generator
│   │       ├── me/route.ts
│   │       ├── upload/init/route.ts
│   │       ├── upload/complete/route.ts
│   │       ├── sessions/route.ts
│   │       ├── sessions/[id]/route.ts
│   │       ├── sessions/[id]/extend/route.ts
│   │       ├── share/[token]/route.ts
│   │       ├── auth/signout/route.ts
│   │       └── cron/purge-expired/route.ts
│   │
│   ├── components/                 # Marketing components (Navbar, Hero, etc.)
│   │   └── Navbar.tsx              # MODIFIED: "Sign in" link added
│   │
│   ├── lib/                        # ── NEW ──
│   │   ├── supabase-server.ts      # Server + admin clients
│   │   ├── supabase-browser.ts     # Browser client
│   │   ├── storage.ts              # Storage helpers (abstracted for R2 swap)
│   │   ├── quotas.ts               # Quota constants + snapshot
│   │   ├── share-token.ts          # Random URL slug
│   │   └── types.ts                # Shared types
│   │
│   ├── supabase/migrations/        # ── NEW ──
│   │   ├── 0001_initial.sql        # sessions table + RLS + pg_cron
│   │   └── 0002_thumbnails.sql     # thumbnail column
│   │
│   ├── middleware.ts               # ── NEW: CORS for chrome-extension origin ──
│   ├── next.config.js              # MODIFIED: /sdk-bridge frame-ancestors *
│   ├── netlify.toml
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.local                  # GITIGNORED — Supabase keys + site URL
│   └── .env.example
│
├── example-app/                    # Next.js demo app for testing the SDK
│   ├── app/tracebug-init.tsx       # MODIFIED: cloudEndpoint = localhost:3001
│   └── ...
│
├── docs/
│   ├── PROJECT-CONTEXT.md          # ← THIS FILE
│   ├── SHARE-PORTAL-PLAN.md        # Original plan for cloud sharing (still the spec)
│   ├── api-reference.md
│   ├── architecture.md             # SDK architecture (pre-cloud)
│   ├── bug-reporting.md
│   ├── chrome-extension.md
│   ├── configuration.md
│   ├── freemium.md
│   ├── getting-started.md
│   ├── ticket-flow.md
│   ├── annotate-and-draw.md
│   └── CHROME-WEB-STORE-LISTING.md
│
├── cli/                            # `tracebug` CLI (validate config etc.)
├── tests/                          # Vitest unit tests
├── dist/                           # ──── BUILT ARTIFACT (ESM + CJS + DTS)
├── package.json                    # SDK root
├── tsup.config.ts                  # SDK bundler config
├── tsconfig.json                   # SDK TS config
├── vitest.config.ts
├── ARCHITECTURE.md
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## 5. Technology stack

| Layer | Tech | Why |
|---|---|---|
| SDK | TypeScript + tsup | ESM + CJS + IIFE bundles, zero deps in IIFE |
| Marketing + portal | Next.js 14 App Router | Already-deployed Netlify site, reuse |
| Hosting | Netlify | Existing deploy, generous free tier |
| Auth + DB + Storage | Supabase (free tier) | 3-in-1, no credit card needed |
| Object storage | Supabase Storage (Phase 2 → Cloudflare R2) | Free 1 GB now; R2 swap when egress bites |
| Browser extension | Chrome MV3 | Service worker + offscreen for tab capture |
| Test app | Next.js | Standalone for testing SDK |
| Testing | Vitest | Unit tests for SDK |

---

## 6. Environment setup

### Prerequisites
- Node.js 20+
- npm 10+
- A Supabase project with the `0001` + `0002` migrations applied
- A `.env.local` in `website/` (see `website/.env.example`)

### `.env.local` (gitignored)
```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<safe-to-ship>
SUPABASE_SERVICE_ROLE_KEY=<SECRET-server-only>
NEXT_PUBLIC_SITE_URL=http://localhost:3001
CRON_SECRET=<random-string-for-cron-protection>
```

### One-time Supabase setup
1. Enable `pg_cron` extension (Database → Extensions)
2. Run `website/supabase/migrations/0001_initial.sql` in SQL Editor
3. Run `website/supabase/migrations/0002_thumbnails.sql` in SQL Editor
4. Storage → New bucket → name `reports`, private, 50 MB file limit, MIME `text/html`
5. Authentication → URL Configuration → add `http://localhost:3001/auth/callback` to redirect URLs

---

## 7. Local development workflow

### Three terminals
```bash
# Terminal 1 — website (port 3001)
cd website
npm install   # first time only
npm run dev

# Terminal 2 — example-app (port 3000)
cd example-app
npm install   # first time only
npm run dev

# Terminal 3 — SDK dev (re-bundles on save into example-app)
cd <repo root>
npm run dev   # tsup --watch
```

### Whenever SDK source changes
```bash
cd <repo root>
npm run build
cd example-app
npm install tracebug-sdk@file:.. --no-save
# Then restart example-app dev server
```

### Chrome extension dev
```bash
cd <repo root>
npm run build  # rebuilds tracebug-extension/tracebug-sdk.js
# Then in chrome://extensions: load unpacked → tracebug-extension/
# OR click reload button on existing TraceBug card after rebuild

# Point extension at local dev backend (one-time):
# - chrome://extensions → TraceBug → Inspect views: service worker
# - In its DevTools console:
chrome.storage.local.set({ tracebug_cloud_endpoint: "http://localhost:3001" })
```

---

## 8. Build commands

| Command | Where | What |
|---|---|---|
| `npm run build` | repo root | Bundle SDK (dist/ + tracebug-extension/tracebug-sdk.js + DTS) |
| `npm run dev` | repo root | Watch-rebuild SDK |
| `npm test` | repo root | Vitest |
| `npm run build` | `website/` | Next.js production build |
| `npm run dev` | `website/` | Next.js dev server (port 3001) |
| `npm run dev` | `example-app/` | Demo app dev server (port 3000) |

---

## 9. Database schema

### Single table: `sessions`
```sql
CREATE TABLE public.sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token       TEXT NOT NULL UNIQUE,             -- 96-bit random URL slug
  title             TEXT,
  storage_key       TEXT NOT NULL,                    -- <user_id>/<id>.html
  size_bytes        BIGINT NOT NULL CHECK (size_bytes <= 52428800),   -- 50 MB
  has_video         BOOLEAN NOT NULL DEFAULT FALSE,
  video_duration_s  INTEGER CHECK (video_duration_s <= 120),          -- 2 min
  screenshot_count  INTEGER NOT NULL DEFAULT 0 CHECK (screenshot_count <= 5),
  visibility        TEXT NOT NULL DEFAULT 'public',
  uploaded          BOOLEAN NOT NULL DEFAULT FALSE,   -- flipped by /api/upload/complete
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  extended_count    INTEGER NOT NULL DEFAULT 0,
  deleted_at        TIMESTAMPTZ,                      -- soft delete
  thumbnail         TEXT                              -- data:image/jpeg;base64,...  ~6KB
);
```

### RLS — 4 policies on `sessions`
- `sessions_select_own` — `auth.uid() = user_id`
- `sessions_insert_own` — `auth.uid() = user_id`
- `sessions_update_own` — `auth.uid() = user_id`
- `sessions_delete_own` — `auth.uid() = user_id`

Public viewer at `/share/[token]` uses the **service-role client** (bypasses RLS) to fetch a single row by `share_token`.

### Storage RLS — 3 policies on `storage.objects` (bucket = `reports`)
Path convention: `<user_id>/<session_id>.html`
- INSERT / SELECT / DELETE all gated to `auth.uid()::text = (storage.foldername(name))[1]`

### pg_cron job
- `tracebug-expire-shares` runs daily at 03:00 UTC → soft-deletes rows where `expires_at < NOW()`

---

## 10. API surface

All routes under `website/app/api/`. Auth via Supabase session cookie unless noted.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/upload/init` | required | Quota check + mint signed Storage upload URL + create pending row |
| `POST` | `/api/upload/complete` | required | Flip `uploaded=true`, return share URL |
| `GET` | `/api/me` | required | `{ id, email, quotas: { video, screenshot } }` |
| `GET` | `/api/sessions` | required | List user's active shares (used by dashboard) |
| `DELETE` | `/api/sessions/[id]` | required | Soft-delete + remove from Storage |
| `POST` | `/api/sessions/[id]/extend` | required | +14 days to `expires_at` |
| `GET` | `/api/share/[token]` | public | Metadata + 5-min signed download URL (service role) |
| `GET` | `/auth/callback` | public | Supabase magic-link code exchange |
| `POST` | `/api/auth/signout` | required | Clear Supabase session |
| `POST` | `/api/cron/purge-expired` | `X-Cron-Secret` | Purge Storage objects for soft-deleted rows |

**Middleware** (`website/middleware.ts`) — echoes CORS headers for `chrome-extension://` and `moz-extension://` origins on all `/api/*` routes.

---

## 11. SDK public API

```ts
import TraceBug from "tracebug-sdk";

// Local — unchanged from v1.x
TraceBug.init({ projectId: "my-app", cloudEndpoint: "https://tracebug.netlify.app" });
TraceBug.startVideoRecording();
TraceBug.stopVideoRecording();
TraceBug.takeScreenshot();
TraceBug.generateReport();
TraceBug.getGitHubIssue();
TraceBug.getJiraTicket();
TraceBug.downloadPdf();
TraceBug.context({ userId: "123", page: "/checkout" });

// Cloud sharing — NEW
await TraceBug.signIn();              // Opens magic-link flow via iframe popup
await TraceBug.signOut();
await TraceBug.getCurrentUser();      // { id, email } | null
await TraceBug.getCloudQuotas();      // { video: {used,limit}, screenshot: {used,limit} }
await TraceBug.shareReport({          // Upload + return shareable URL
  includeVideo: true,                 // Defaults to true if video recorded
});
```

---

## 12. Quotas (Free plan)

| Quota | Value | Where enforced |
|---|---|---|
| Active video shares per user | **5** | Server-side in `/api/upload/init` |
| Active screenshot shares per user | **10** | Server-side in `/api/upload/init` |
| Screenshots per share | **5** | Client trims via modal, server rejects > 5 |
| Video duration | **2 min** | Client auto-stops at 2:00 with warnings at 1:30 / 1:55 |
| Upload size | **50 MB** | Server + Supabase Storage bucket policy |
| Retention | **14 days**, extendable +14d | `pg_cron` nightly sweep |
| Local capture | unlimited | Browser-only, no quota |

---

## 13. Deployment

### Netlify (already deployed)
- Auto-deploys from `main` branch
- Env vars set in Netlify dashboard:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (mark as secret)
  - `NEXT_PUBLIC_SITE_URL=https://tracebug.netlify.app`
  - `CRON_SECRET=<random>`
- Build command: `npm run build` (from `website/`)
- Publish dir: `.next`
- Plugin: `@netlify/plugin-nextjs`

### Supabase
- Magic-link redirect URL: add production `https://tracebug.netlify.app/auth/callback`
- Email sender: built-in (30/hour cap) — swap to Resend (free 3K/month) before launch
- Storage bucket `reports` exists with policies

### Chrome extension
- Build: `npm run build` (rebuilds `tracebug-extension/tracebug-sdk.js`)
- Package: zip the `tracebug-extension/` folder
- Upload to Chrome Web Store
- After publish, users get an auto-update; their extension will start pointing at the prod cloud endpoint by default

### Scheduled jobs
- Set up a Netlify scheduled function OR external cron (cron-job.org, GitHub Actions) to POST hourly to `/api/cron/purge-expired` with header `X-Cron-Secret: <CRON_SECRET>`

---

## 14. What's NOT built (Phase 2+)

Designed-for in schema/API where reasonable, but **NOT implemented**:

- ❌ Paid tiers (Stripe + raised quotas + Pro/Team)
- ❌ Teams / workspaces / member invites
- ❌ Comments on shares (time-anchored)
- ❌ Google / GitHub OAuth (only magic link)
- ❌ Private / password-protected shares
- ❌ View analytics
- ❌ Slack / Jira / Linear auto-sync on upload (only existing copy-to-clipboard flows)
- ❌ Search across shares
- ❌ Cloudflare R2 migration (deferred until Supabase Storage 1 GB / 2 GB egress bites)
- ❌ Folder organization in dashboard (placeholder shown)
- ❌ Inactivity-based cleanup
- ❌ Custom domains per workspace
- ❌ Real-time collaboration
- ❌ AI root-cause summaries
- ❌ Self-hosting docs

---

## 15. Known issues / debt

- **Pre-existing unused imports** in `compact-toolbar.ts`, `dashboard.ts`, `draw-mode.ts` — not from cloud-sharing work, low priority
- **Server Component data fetch in dashboard** was broken in dev (silent empty result) — worked around by switching dashboard to client-side `fetch('/api/sessions')`. Root cause not understood; may revisit
- **Email sender 30/hour cap** on Supabase free tier will throttle during signup spikes. Plan: configure Resend SMTP before any marketing push
- **Browser third-party cookie partitioning** may break iframe auth across cross-port localhost in some Chrome configs. Production deploy on a single domain avoids this
- **Chrome extension `tracebug_cloud_endpoint`** defaults to prod. Local dev requires the manual `chrome.storage.local.set(...)` setup step (see §7)
- **Thumbnail generation** uses canvas + JPEG encode at client side; takes ~50ms. Fine for one-off upload, would be expensive in bulk
- **No backfill** for thumbnails on shares created before the thumbnail feature — they show gradient placeholders

---

## 16. Where to look for what

| If you're touching... | Open these files |
|---|---|
| Bug capture pipeline | `src/collectors.ts`, `src/report-builder.ts` |
| Video recording | `src/video-recorder.ts` |
| Modal UI / Share button | `src/ui/quick-bug.ts` |
| HTML export format | `src/exporters/html-replay.ts`, `html-template.ts` |
| Cloud upload flow | `src/exporters/share-link.ts`, `src/auth/iframe-bridge.ts` |
| Sanitization | `src/sanitize/cloud-upload.ts` |
| Thumbnail | `src/exporters/thumbnail.ts` |
| Screenshot trim | `src/ui/screenshot-trim-modal.ts` |
| Dashboard UI | `website/app/dashboard/DashboardClient.tsx` |
| Public viewer | `website/app/share/[token]/page.tsx` |
| iframe bridge target | `website/app/sdk-bridge/page.tsx` |
| Database schema | `website/supabase/migrations/*.sql` |
| API routes | `website/app/api/**/route.ts` |
| RLS policies | `website/supabase/migrations/0001_initial.sql` |
| Chrome extension popup | `tracebug-extension/popup.{html,js}`, `styles.css` |
| Extension manifest | `tracebug-extension/manifest.json` |
| Quotas | `website/lib/quotas.ts` + `src/exporters/share-link.ts` |
| Marketing copy | `website/components/*.tsx`, `website/app/page.tsx` |
| Sign-in flow | `website/app/auth/AuthClient.tsx`, `website/app/auth/callback/route.ts` |

---

## 17. Related docs

- [SHARE-PORTAL-PLAN.md](SHARE-PORTAL-PLAN.md) — the full design spec for the cloud sharing portal (still the load-bearing reference for product decisions)
- [api-reference.md](api-reference.md) — SDK public API reference (may not yet document `signIn` / `shareReport`)
- [architecture.md](architecture.md) — SDK architecture (pre-cloud)
- [freemium.md](freemium.md) — free vs premium gating model (pre-cloud)
- [getting-started.md](getting-started.md) — SDK install + init
- [chrome-extension.md](chrome-extension.md) — extension install + usage
- [../ARCHITECTURE.md](../ARCHITECTURE.md) — top-level architecture overview
- [../CHANGELOG.md](../CHANGELOG.md) — release notes
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — contribution guide

---

## 18. Verification checklist for new agents

Before making changes, confirm you can:

1. `npm run build` from repo root completes cleanly (SDK + extension bundle)
2. `cd website && npm run build` completes cleanly (Next.js production build)
3. `cd website && npx tsc --noEmit` is clean (TS strict mode)
4. `cd website && npm run dev` starts on port 3001
5. `cd example-app && npm run dev` starts on port 3000
6. `localhost:3001/api/me` returns 401 unauthenticated
7. Signing in via `localhost:3001/auth` lands you on `/dashboard`
8. Triggering a bug in example-app shows the Bug Ticket modal with both "Export .html" and "🔗 Share link" buttons
9. Clicking Share link uploads + opens the public viewer at `/share/[token]` in a new tab
10. The dashboard card shows a real thumbnail for new shares (gradient fallback for old)

If any of these fail, fix that before adding new features.
