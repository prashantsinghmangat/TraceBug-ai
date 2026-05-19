# TraceBug — Monetization Plan

> Source of truth for what's gated where. Read this before changing any
> capability flag, quota, or pricing copy.
>
> **Last updated:** 2026-05-18 · **Status:** Pricing not yet live; tiers
> documented here as launch intent. SDK still ships everything free during
> beta. Pricing page is up with "Notify me" email capture.

---

## Core philosophy

> **Local-first stays free forever. Cloud collaboration is what people pay for.**

This is the Obsidian / Excalidraw / GitHub Desktop model. Two reasons it works:

1. The free local product builds trust and viral adoption — a developer who
   sends a `.html` bug report is implicitly advertising TraceBug to a second
   developer who receives it. That's a marketing channel we never pay for.
2. The paid layer is **additive**, never subtractive. Going Pro adds
   collaboration; it doesn't restore something we artificially removed.

If a proposed paid feature would make the *local* product worse, that's the
wrong feature to gate. Always ask: "would a solo developer using TraceBug
locally and never paying us notice this change?" If yes, it's the wrong gate.

---

## The four tiers

### Free — forever
**Promise:** everything you need to capture and ship a complete bug report.

- Unlimited local bug reports
- Unlimited `.html` exports (download or email)
- All capture surfaces (clicks, network, console, screenshots, video, voice)
- All integrations that don't require server state (GitHub issue URL,
  Linear URL, Slack copy, plain-text)
- Chrome extension + npm SDK
- **20 active cloud share links** (any mix of video / screenshot)
- **14-day retention** on cloud shares
- **30-second video** cap on cloud uploads (local recording uncapped)
- Small "Captured with TraceBug" badge on the public viewer chrome
  (not on the report itself)

### Pro — $9/user/month
**Promise:** unlimited cloud sharing, longer retention, no attribution.

Launch target: **week 1 after public launch**, even if the only differentiator
is unlimited shares. Reason: charging early teaches you about willingness-to-pay
and anchors the value of the free tier.

- Everything in Free, plus:
- Unlimited active cloud shares
- 90-day retention by default, extendable
- 5-minute video cap on cloud uploads
- "Captured with TraceBug" attribution hidden
- Custom company branding (`companyName` config) shown in reports
- Real Jira API integration (currently markdown-paste only)
- Priority email support

### Team — $19/user/month, min 3 seats
**Promise:** shared workspace + integrations.

Launch target: **Q3 2026**. Schema groundwork already partially laid (RLS
makes future tenancy easier).

- Everything in Pro, plus:
- Shared workspace — all team members see all shares
- Member invites + roles
- Real-time activity feed
- Slack / Jira / Linear auto-sync on upload (not just copy-to-clipboard)
- Team-wide dashboard
- SSO via Google
- Per-workspace retention overrides

### Enterprise — custom (starts ~$1,000/month)
**Promise:** self-hosting + compliance.

Launch target: **opportunistic** — sell when asked, don't build until then.
TraceBug's local-first architecture makes self-hosting genuinely simple
(it's already a Docker-friendly Next.js + Supabase stack), so the
incremental work is small.

- Everything in Team, plus:
- Self-hosting (Docker Compose deploy)
- SAML SSO
- Audit logs
- SOC2 Type II (when revenue justifies the audit)
- Custom retention (forever, if needed)
- Dedicated Slack channel + named contact

---

## What's gated where (clean table)

| Capability | Free | Pro | Team | Enterprise |
|---|:---:|:---:|:---:|:---:|
| **Local capture** (clicks, network, console, screenshots, video) | ✅ | ✅ | ✅ | ✅ |
| **.html export** (offline, self-contained) | ✅ | ✅ | ✅ | ✅ |
| **GitHub / Linear / Slack copy** | ✅ | ✅ | ✅ | ✅ |
| **PDF export** | ✅ | ✅ | ✅ | ✅ |
| **Chrome extension + npm SDK** | ✅ | ✅ | ✅ | ✅ |
| **Cloud share links — active** | 20 | unlimited | unlimited | unlimited |
| **Cloud retention** | 14 days | 90 days | configurable | configurable |
| **Cloud video duration cap** | 30s | 5 min | 10 min | configurable |
| **"Captured with TraceBug" badge** | shown | hidden | hidden | hidden |
| **`companyName` custom branding** | ❌ | ✅ | ✅ | ✅ |
| **Real Jira API integration** | ❌ | ✅ | ✅ | ✅ |
| **AI root-cause analysis** *(future)* | ❌ | 50/mo | unlimited | unlimited |
| **Shared workspace** | ❌ | ❌ | ✅ | ✅ |
| **Member invites / roles** | ❌ | ❌ | ✅ | ✅ |
| **Slack / Jira / Linear auto-sync** | ❌ | ❌ | ✅ | ✅ |
| **Team dashboard** | ❌ | ❌ | ✅ | ✅ |
| **Google SSO** | ❌ | ❌ | ✅ | ✅ |
| **Self-hosting** | ❌ | ❌ | ❌ | ✅ |
| **SAML SSO** | ❌ | ❌ | ❌ | ✅ |
| **Audit logs** | ❌ | ❌ | ❌ | ✅ |
| **SOC2 Type II compliance** | ❌ | ❌ | ❌ | ✅ |

---

## What's NOT gated (deliberately)

These would be easy levers to monetize, but gating them would hurt adoption
more than it would gain revenue. They stay free:

- ❌ Number of screenshots per local report (was: 2 for free, unlimited for premium — we're removing this gate)
- ❌ Console errors / network errors in local exports (was gated; that contradicted our "free Sentry alternative" pitch)
- ❌ Voice notes
- ❌ Element annotations / draw mode
- ❌ Local video duration
- ❌ Number of local bug reports kept in localStorage

The product's promise to a solo developer is "everything works, nothing
nags you, no account required." Don't dilute that.

---

## Unit economics

### What costs us money per share

| Per share | At cost |
|---|---|
| Supabase Storage (HTML blob) | Free up to 1 GB; then ~$0.021/GB-month |
| Supabase egress (viewer downloads) | Free up to 2 GB/month; then $0.09/GB |
| Supabase Postgres row | Negligible — millions fit in 500 MB |
| Thumbnail (inline JPEG) | Negligible — ~6 KB |
| AI analysis (future, Claude Sonnet) | ~$0.02 per ~5K-token report |

### Break-even math

A Pro user at $9/month covers:
- ~430 GB of Supabase egress, OR
- ~430 GB-months of storage, OR
- ~450 AI analyses

So even at the worst case (one user generating 100 cloud shares × 50 MB
each, all watched 10 times each → 50 GB egress), Pro at $9/mo is still
~3× profitable.

The real cost driver is **video bytes × view count**. Migrate Storage to
Cloudflare R2 (zero egress) in Phase 2 to make Pro economics dominant.

---

## Phasing

### Phase 1 — Launch week (NOW)
- Public marketing site live with `/pricing` page
- Pro tier marked "Coming Soon · Notify me" — email capture only
- Free tier serves the entire local experience without restriction
- Goal: 1,000 SDK installs / 500 extension installs in 30 days
- Revenue target: $0 (intentional — validate adoption first)

### Phase 2 — Pro launch (within 30 days of measurable adoption)
- Stripe integration
- Pro at $9/mo: unlimited cloud shares + 90-day retention + branding off
- Convert the "Notify me" list — they're warm leads
- Goal: 10 paying users in 30 days. At $9/mo MRR = $90, but the learning
  is the asset, not the dollars.

### Phase 3 — AI + Team (Q3 2026)
- AI root-cause analysis on Pro (50/mo) and Team (unlimited)
- Team workspaces + Slack/Jira auto-sync
- Goal: 5 paying teams of 5+ seats = ~$475 MRR

### Phase 4 — Enterprise (opportunistic)
- Self-hosting Docker package
- SAML, audit logs
- Goal: 1 enterprise deal ≥ $1,000/mo

---

## What I'll measure

| Metric | Why it matters |
|---|---|
| SDK / extension installs | Top-of-funnel volume |
| Cloud shares created | Engagement proxy — paid sees only this column |
| Free → Pro conversion rate | The lever Phase 2 optimizes |
| Active shares per user | Are users hitting the free cap? |
| Viewer-page visits / shares received | Virality coefficient |
| Pro Pro-user MRR | The number that justifies the work |

Don't measure GitHub stars as a primary signal. They feel good and predict
nothing.

---

## Common founder mistakes I'm avoiding

1. **"Build everything for free until you have 10K users"** → never starts
   charging. Avoided: Pro launches in Phase 2, week 30, not year 2.
2. **Flat-tier Team pricing** → leaves money on the table at every company
   over 10 people. Avoided: per-seat Team at $19.
3. **Gating local capabilities behind paid** → kills trust. Avoided:
   local stays untouched, Pro is purely additive.
4. **Building enterprise features without enterprise customers** → vanity
   roadmap. Avoided: Phase 4 is "opportunistic, sell when asked".
5. **Free tier with no cost ceiling** → bottomless support burden. Avoided:
   14-day retention + 20 share cap + 30s video keep free-tier cost bounded.

---

## Where the code lives

| Concern | File |
|---|---|
| Pricing page | [website/app/pricing/page.tsx](../website/app/pricing/page.tsx) |
| "Notify me" capture | [website/app/api/notify-me/route.ts](../website/app/api/notify-me/route.ts) |
| Email signups table | [website/supabase/migrations/0003_email_signups.sql](../website/supabase/migrations/0003_email_signups.sql) |
| Quota constants (server) | [website/lib/quotas.ts](../website/lib/quotas.ts) |
| Quota constants (client) | [src/exporters/share-link.ts](../src/exporters/share-link.ts) |
| "Captured with TraceBug" viewer badge | [website/app/share/[token]/page.tsx](../website/app/share/[token]/page.tsx) |
| Local SDK plan flag (still legacy free/premium) | [src/plan.ts](../src/plan.ts) |
| Existing freemium doc (NOTE: stale, see §"What's gated where" above) | [docs/freemium.md](freemium.md) |

When the time comes to flip Pro live, the only code that changes is:
- `src/plan.ts` gets new tier values
- `website/lib/quotas.ts` gets per-tier quota tables
- API routes check tier before returning quotas / minting upload URLs
- New Stripe webhook + checkout pages

Everything else — RLS, schema, UI — is tier-agnostic on purpose.
