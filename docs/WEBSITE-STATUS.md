# TraceBug Website — Full Context & Status

> **Purpose:** the current, verified state of the marketing site + cloud portal in `website/` — structure, messaging, what's live vs. disabled, deploy requirements. Written for agents/reviewers cross-verifying the site against the code.
>
> **Last updated:** 2026-07-04 · branch `feature/cloud-sharing` · builds clean (tsc + `next build`, all routes compile)
>
> Companion docs: [PROJECT-STATUS.md](PROJECT-STATUS.md) (product-wide Phase 1/2 split), [SHARE-PORTAL-PLAN.md](SHARE-PORTAL-PLAN.md) (cloud portal design), [CHROME-WEB-STORE-LISTING.md](CHROME-WEB-STORE-LISTING.md) (store listing copy).

---

## 1. What the website is

A single Next.js (App Router) app at `website/` serving **two products in one deploy**:

1. **The marketing site** (live for Phase 1 launch): landing page, pricing, docs, compare pages, privacy policy.
2. **The cloud portal** (Phase 2, built but disabled in the shipping SDK/extension): auth, dashboard, public share viewer, SDK auth bridge, API routes.

**Stack:** Next.js 14 App Router · TypeScript · Tailwind (custom design tokens: `text-primary`, `surface`, `border`, `aurora` effects) · lucide-react icons · Supabase (Phase 2 only) · deploys to Netlify at `https://tracebug.netlify.app`.

**Verified state:** `npx tsc --noEmit` clean; `npm run build` succeeds; static routes prerender, Phase-2 routes (`/dashboard`, `/share/[token]`) are dynamic (ƒ).

## 2. Route map

| Route | Type | Phase | Status |
|---|---|---|---|
| `/` | static | 1 | Landing page — 11 sections (see §3) |
| `/pricing` | static | 1 | 4 tiers; Free = live features only; Pro/Team/Enterprise honestly labeled "Coming soon" |
| `/docs` | static | 1 | 10-section docs (getting started → API reference) |
| `/compare/[slug]` | SSG | 1 | 4 SEO pages: sentry-alternative, logrocket-alternative, bugsnag-alternative, frontend-bug-reporting-tool |
| `/privacy` | static | 1 | **Live privacy policy — required for Chrome Web Store submission.** Accurately describes the local-only data model; needs an update when Phase 2 ships |
| `/robots.txt`, `/sitemap.xml` | static | 1 | Present |
| `/auth` | dynamic | 2 | Supabase magic-link sign-in. **Not linked from anywhere on the site** (navbar links removed) |
| `/dashboard` | dynamic | 2 | Jam-style saved-shares dashboard (quotas, thumbnails, extend/delete) |
| `/share/[token]` | dynamic | 2 | Public share viewer — sandboxed `<iframe srcdoc>`, OG tags |
| `/sdk-bridge` | static | 2 | Hidden-iframe postMessage bridge for the SDK; **fails closed** when `NEXT_PUBLIC_SDK_ALLOWED_ORIGINS` is empty |
| `/api/*` | dynamic | 2 | Upload init/complete, quotas, cron purge; CORS middleware allows extension origins |

## 3. Landing page — section-by-section (in order)

Composition lives in `app/page.tsx`; each section is one component in `components/`.

| # | Component | One job it does | Key copy |
|---|---|---|---|
| — | `Navbar` | Nav: Demo · Features · Pricing · Docs · GitHub · theme toggle · "Install free" CTA. **"Sign in" removed** (PHASE2-CLOUD markers show where it returns) | v1.4 badge |
| 1 | `Hero` | The hook + product mock + CTAs | H1: **"Bug reports your dev can actually open"** · sub: "One click captures the bug — replay, console errors, network calls, and screenshots — into a single `.html` file. Your dev opens it offline and sees exactly what broke." · eyebrow: "v1.4 · Root-cause hints in every report" · trust line: stays on your machine / no account / works offline / MIT |
| 2 | `FrameworkMarquee` | Compatibility strip | "Drops into any front-end — 2 lines" (React → plain HTML, 12 logos) |
| 3 | `DemoVideo` | Proof | 11-second **interactive** walkthrough (`public/demo.html` in an iframe — not a video file) |
| 4 | `Solution` | What's inside the file | "Everything your dev needs, in one file"; before/after (3 days of back-and-forth → minutes) |
| 5 | `RootCauseHighlight` | The differentiator | "Know the cause instantly" — root-cause engine with confidence tiers |
| 6 | `Features` | Capability grid (9 cards) | capture, Sentry mode, auto-scanner, screenshots/annotation, voice, GitHub/Jira, user-ID API, plugins, privacy ("nothing leaves your machine") |
| 7 | `BugReportPreview` | A real report, rendered | environment, repro steps, console, network, timeline, export buttons |
| 8 | `HowItWorks` | 3 steps | Install → `Ctrl+Shift+B` → "one offline `.html` file" |
| 9 | `Comparison` | Positioning | vs Sentry/LogRocket/Bugsnag matrix + manual-vs-TraceBug (30–60 min → under 60 s) |
| 10 | `Installation` | Deep install tabs | npm / `npx tracebug init` / Chrome extension / GitHub |
| 11 | `FinalCTA` | Close | "Ship better bug reports today" · Free · No account |
| — | `Footer` | Sitemap, resources, community, legal (Privacy, MIT) | No dead links |

**Design system:** light/dark theme toggle; aurora gradient fields + grid background in the hero; scroll-reveal animations (`Reveal.tsx`); floating stat chips; browser-chrome frames around product mocks; `gradient-text-anim` on the headline. Unused component: `Problem.tsx` (not imported — candidate for deletion, harmless).

## 4. Messaging rules (enforced 2026-07-04)

The site now makes **zero claims about the disabled cloud feature**. Fixed in the July 4 content pass:

1. Hero eyebrow: ~~"Cloud sharing is here"~~ → "Root-cause hints in every report"
2. HowItWorks step 3: ~~"`.html` file or share-link URL"~~ → "one offline `.html` file"
3. Features privacy card: ~~"Cloud sharing is opt-in"~~ → "nothing leaves your machine"
4. Pricing Free tier: removed ~~20 cloud share links / 14-day retention / video cap~~; added "Root-cause hints in every report". Cloud features appear only under "Coming soon" Pro/Team/Enterprise tiers with an honest beta disclaimer ("SDK ships everything free while we validate")
5. Navbar: removed "Sign in" → `/auth` (desktop + mobile), marked with `PHASE2-CLOUD` comments for restoration

**Rule for future edits:** any copy describing sign-in, share links, dashboards, retention, or paid gating must stay behind "Coming soon" labeling until the `PHASE2-CLOUD` flags in the SDK are removed.

## 5. Deploy requirements & launch chain

- **Deploying this site is the last Chrome Web Store prerequisite** — the store listing declares `https://tracebug.netlify.app/privacy`, which must resolve. Chain: deploy site → privacy URL live → submit extension.
- **Env vars:** the marketing pages need none. Phase-2 routes reference Supabase env (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SDK_ALLOWED_ORIGINS`, `ANTHROPIC_API_KEY` for AI diagnose). They are unlinked and fail gracefully/closed, so Phase 1 can deploy without them — but **do not** set the old Supabase keys: they were exposed in git history and **must be rotated first** (see PROJECT-STATUS.md §5).
- `website/.env.local` is untracked (gitignored); `website/.env.example` documents every variable.

## 6. Known gaps / post-launch

- `Problem.tsx` is dead code (unimported).
- `/privacy` must gain a cloud-data section when Phase 2 ships.
- Phase-2 routes deploy but error if visited directly without env vars — acceptable (unlinked); optionally guard with a "coming soon" redirect later.
- Pricing "Notify me" CTAs — verify the notify endpoint/source actually records interest before relying on it.
- No analytics on the site (consistent with the no-tracking positioning; revisit deliberately if funnel data is ever wanted).

## 7. How to verify this document

```bash
cd website
npx tsc --noEmit               # expect: clean
npm run build                  # expect: all routes compile; /privacy static
grep -rn "Cloud sharing is here\|share-link URL\|cloud share links" components/ app/   # expect: no matches
grep -rn "PHASE2-CLOUD" components/Navbar.tsx                                          # the two removed Sign-in sites
```
