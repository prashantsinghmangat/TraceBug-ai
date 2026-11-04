# TraceBug — Product + Growth Master Plan (Nov 2026)

**Positioning:** *Your AI can read your code. TraceBug lets it see your bugs.*
Capture what happened → understand why it failed → fix it → verify it.

TraceBug is not "the tool that captures the most". It is **the most accurate, AI-ready browser bug
report, with a direct path to a verified fix.** The standout feature is **Evidence Integrity**: every
report says what was captured, what wasn't, what was redacted and what was dropped, and keeps
evidence apart from inference.

Effort split for the next 30 days: **50% distribution · 30% capture accuracy · 15% onboarding · 5% new
features.** Engineering beyond the list below needs evidence from users (METRICS.md).

Sources: the code audit of 2026-11-04 (file:line refs below, re-checked for items 1–3), three
playground runs (`D:\tmp\tracebug-playground`, guide outside it), `minimum-click-workflow.md`.

---

## Part 1 — Where the product stands

Already fixed in 1.11.6 (uncommitted), each from a real playground run:

| Accuracy rule | Status |
|---|---|
| First error distinguished from later errors | ✅ title, summary and clicked element anchor to the first failure |
| Action before the error ≠ last action in the session | ✅ `lastUserActionBefore`, `firstFailureIndex` |
| Root-cause hints must not encourage shallow fixes | ✅ undefined-access hint says find the missing value first |
| AI explanation separate from captured evidence | ✅ no-failure reports say "No errors captured" instead of a guessed cause |
| Reporter's expected outcome reaches the AI | ✅ "Reporter's description" in Fix with AI |
| One workflow for every AI prompt (diagnose → explain → approve → test → verify) | ✅ `agent-workflow.ts` |
| Reliable MCP discovery | ✅ no `--dir` in setup; newest report first |
| No invented signals | ✅ dead click = real re-click; no duplicate request rows; typing collapsed |
| Network failures distinguished from successes | ⚠️ **status 0 rows from Resource Timing count as failures** (item 1) |
| Missing evidence explicitly identified | ❌ **nothing tells the AI what was dropped or not captured** (item 3) |
| Reliable timestamps and ordering | ⚠️ fetch stamped at completion, page-load rows at drain time, debounced input can sort after a click (item 2) |
| Screenshots/video correspond to the timeline | ⚠️ video silently cut at 120 s; DOM replay covers only the last page; a failed screenshot is stored as a placeholder image (item 3) |
| Never silently collect sensitive values | ⚠️ page URL query un-redacted locally, hidden form fields (CSRF) kept, **every cookie value of the host** included (item 5) |
| Stack traces preserved | ✅ 10k-char cap with an explicit `…[truncated]` marker |

## Part 2 — Evidence-integrity audit (summary)

What gets lost or misrepresented today. The full per-source table is at the end of this file.

1. **False network failures.** Any Resource Timing row with status 0 (every Firefox row; cross-origin
   rows without `Timing-Allow-Origin`; slow page-load rows) becomes "API … failed with Network Error" at
   **high** confidence (`report-builder.ts:262`, `collectors.ts:804`). Aborted and opaque fetches also become
   "Network Error" (`collectors.ts:620,644`). *Verified.*
2. **The lead-up gets evicted.** The session keeps the last **200 events** and drops older ones silently
   (`index.ts:313`, `storage.ts:424`). While recording, the Resource Timing observer adds every image and
   font, each request is recorded twice before dedupe, and `console.error` is uncapped — so the clicks that
   caused the bug can be the first thing thrown away. *Verified.*
3. **Silence looks like absence.** No capture metadata reaches the report, the AI prompt or the MCP output
   (`html-template.ts:12`). "No errors captured" is printed even when console capture was off, the console
   cap was hit, or the error was evicted. Request/response bodies (except 200-char failure snippets, kept in
   memory only), headers, iframes, canvas and HttpOnly cookies are never captured, and nothing says so.
4. **Stale inputs to the report.** Repro steps can be built from storage before the 1 s flush and miss the
   triggering click (`index.ts:2150`); storage is snapshotted when the report is built, not when the bug
   happened (`report-builder.ts:317`); the environment URL is the start page, not the bug page.
5. **Privacy leaks in local exports and the AI prompt.** Page URL query strings (`environment.ts:23`, *verified*),
   hidden form fields such as CSRF tokens (`collectors.ts:527`), and cookie values from every app on the
   host (seen in a playground export: Adobe, AEM, Datadog session id, a Jam key). Voice transcripts are not
   sanitized — and are also missing from the .html export, MCP and AI prompt.

## Part 3 — Top five improvements → 1.12 "Evidence Integrity"

Ranked by impact on a correct AI diagnosis per unit of work. Each is a small diff; no new UI screens.

| # | Change | Fixes | Size |
|---|---|---|---|
| **1** | **Only real failures are failures.** Status 0 from Resource Timing = "unknown", never a failure; tag aborted fetches `aborted`, skip opaque responses. One shared `isFailedRequest()` used by report-builder, title, timeline, AI prompt, MCP. | Audit 1 | ½ day |
| **2** | **Never lose the lead-up.** Don't push asset/page-load Resource Timing rows into the session buffer after the page has loaded; raise `maxEvents` to 500; count evictions on the session (`droppedEvents`); flush pending input on click/stop/pagehide, stamped at the last keystroke; use `_ts` for page-load rows. | Audit 2, 4 | 1 day |
| **3** | **The Evidence Integrity block** — the standout feature. Every report carries a short, factual section: **Captured** (actions, N errors, N requests, replay of page X, video Ns) · **Not captured** (request/response bodies, headers, iframes/canvas, earlier pages' replay) · **Redacted** (counts from redaction-summary) · **Dropped** (N old events, console cap hit, video cut at 120 s, placeholder screenshot). Shown in the ticket, the .html, the AI prompt and `get_bug_report`. "No errors captured" becomes conditional on capture having been complete. | Audit 3 | 1–2 days |
| **4** | **Build from fresh, durable evidence.** Repro steps always regenerated from in-memory events; failure response snippets attached to the persisted request event (survive reload and saved tickets); storage snapshot taken at stop/first error. | Audit 4 | 1 day |
| **5** | **Privacy by default, provably.** Redact the page URL query everywhere (not only the cloud path); skip hidden fields and token-scrub form values; **cookies as names only** by default (values opt-in); sanitize voice transcripts. Redaction counts feed item 3. | Audit 5 | ½ day |

**Acceptance gate — the report-quality benchmark (do with item 3).** An e2e script drives the real
extension through the playground's scenarios and checks each report against an answer key:

| Scenario | Must be true |
|---|---|
| Coupon TypeError, then a later click | Title names "Apply coupon"; stack points at `applyCoupon`; hint says find the missing value |
| Order 422 after changing quantity | Failure = `POST /api/orders 422` with the body snippet; no favicon or status-0 row as a failure |
| Wrong total, no error | "No errors captured"; reporter description in the prompt; no invented cause |
| Track unknown order | Unhandled rejection after `GET /api/orders/9999 → 404`, in that order |
| Clean session | "No errors captured:" title; no dead clicks; each request once; typing collapsed |
| All | Evidence block present and correct; AI prompt under N tokens; no cookie values; URL query redacted |

Runs in `check.mjs --full`. This is what makes "most accurate bug report" a claim we can prove (and a
number for the launch post). It also closes PLAN.md Phase 8's "golden-report check".

Later, only with evidence (P1/P2): voice notes in the .html/MCP; `addEventListener("error")` instead of
assigning `window.onerror`, with "cross-origin script" annotated; console counts as occurrences not
unique messages; fix-verification history; team sharing (the paid tier, per the July pricing decision).

**Not now:** cloud dashboard, more AI features, more integrations, redesigns, paid team features before
repeat use, ads.

---

## Part 4 — 30-day distribution plan (Nov 4 – Dec 4)

**Audience:** frontend developers who use Claude Code, Cursor or Windsurf and debug browser apps.
Not "all developers", not QA teams first (they come second, through developers).

**Message, everywhere:** *Your AI can read your code. TraceBug lets it see your bugs.* Lead with a real
bug, never with a feature list.

### Assets (most already exist)

| Asset | State |
|---|---|
| 57-s demo, 16:9 + Short | ✅ YouTube `-U64GIPfeiQ`, Short `Q1toEvFVW0c`, on tracebug.dev |
| Playground: 4 real bugs + a clean case | ✅ local (`D:\tmp\tracebug-playground`) → **publish as a public repo** with a 2-minute README |
| Post kits | ✅ `docs-internal/marketing/content-assets.md`, `posts-1.11.5.md` (subreddit-rule-aware) |
| Benchmark numbers | after item 3 |
| Five short videos (20–45 s), recorded from real playground runs | to record (below) |

**The video library** — each one real, unedited output:

1. *"Your last click isn't the bug."* — the wrong-click title, before vs after 1.11.6.
2. *"Claude can read your code. Can it see the browser?"* — same bug, screenshot-only vs TraceBug report.
3. *"One crash, two bugs."* — Claude finds the quantity bug while fixing the coupon.
4. *"Stop pasting console logs."* — capture → MCP → diagnosis, no copy-paste.
5. *"A proposed fix isn't a verified fix."* — red test → fix → green.

### Calendar

| Days | Product (30%) | Distribution (50%) | Onboarding (15%) |
|---|---|---|---|
| **1–5** (Nov 4–8) | Commit + release **1.11.6**. Start item 1 | Fill METRICS.md weekly log with current numbers (last entry is Aug 3). Publish the playground repo | Playground link on the welcome page and README |
| **6–10** (Nov 9–13; Diwali ≈ Nov 8, go light) | Items 1–2 | Record videos 1, 3, 4. LinkedIn + X: video 1. r/ClaudeAI or r/cursor: video 4 (MCP angle) | Landing hero = the positioning line + the 57-s video + "try the playground" |
| **11–17** | Item 3 + benchmark | Videos 2 and 5. dev.to/blog: "4 bugs, 2 ways" with benchmark numbers. **Show HN** on a Tuesday once 1.11.6 is live in both stores | First-run: welcome page → playground → first capture ≤ 3 min (TTFS) |
| **18–24** | Items 4–5 → **1.12** | **5–10 personal messages a day** to developers who post about Claude Code/Cursor debugging: "Try it on one real bug; can I watch?" MCP directories (awesome-mcp-servers PR, Glama, mcp.so, PulseMCP, Smithery, cursor.directory) | Fix only what blocks the first capture or the hand-off, seen in a watched session |
| **25–30** | Release 1.12 | Follow up everyone who captured a bug: second capture? The one question: *"What almost stopped you?"* Ask repeat users about paying for team sharing | Retro: rewrite next 30 days from the numbers |

Channel rules: one post per channel per week, adapted to that community; reply to every comment;
no identical cross-posts; Product Hunt only after real users and the benchmark exist.

### Outreach message (personal, short)

> Saw your post about debugging [X] with Claude Code. I built a free, local-only extension that captures
> the browser side of a bug (console, network, the click that caused it) and hands it to Claude Code over
> MCP. Would you try it on one real bug this week? 10 minutes; I'd love to watch, or just hear what broke.

### Metrics (weekly, in METRICS.md)

| Metric | 30-day target |
|---|---|
| Relevant developer conversations | 30 |
| Independent installs | 20+ |
| Real bugs captured (reported/observed) | 15 |
| Useful AI diagnoses | 10 |
| Repeat users within 7 days (**north star**) | 5 |
| Willing to pay (team sharing) | 2 |

Triggers: installs up but no second capture → activation/value problem (watch sessions, fix the first
hesitation); love but no payment → wrong buyer or offer; nobody gets why → positioning (rewrite from the
"I keep using TraceBug because ___" quotes).

---

## Decisions needed

1. **Cookies:** names only by default, values opt-in? (recommended: yes)
2. **`maxEvents`:** raise 200 → 500? (storage cost is small next to the replay)
3. **Publish the playground** as a public repo? (recommended: yes; it's the best onboarding and demo)
4. **Release 1.11.6** now (all gates green, playground-verified), then start 1.12?

---

## Appendix — per-source evidence map (2026-11-04)

Every event is stamped `Date.now()` at emit (`index.ts:457`).

| Source | Captured | Caps → what happens | Redaction | Not captured |
|---|---|---|---|---|
| Clicks | tag, text (120), id, class, href, aria, role, testId, form, selector, bbox, click-context fields (≤5) | 200-event buffer, oldest dropped silently | context fields skip password/email/tel/hidden/cc; token-scrubbed | — |
| Inputs | name, type, value (200), valueLength, selector; stamped 300 ms after the last keystroke | pending input lost on navigation/stop | `[REDACTED]` for sensitive names/types; no token scrub on value | — |
| Select / form / route | select value/text/options; form named fields; route pathname | — | form keeps hidden fields (CSRF); select never redacted | query/hash route changes |
| Uncaught errors / rejections | message, stack (10k), source, line, col | — | token scrub | `window.onerror` assigned (an app can overwrite it); "Script error." unexplained; non-Error rejection → "[object Object]" |
| Console | error: all; warn/info/log: 50 each | silent after cap | token scrub | format specifiers not substituted |
| fetch / XHR | url (500, query-redacted), method, status, duration; stamped at completion | 2 buffer slots per request before dedupe | sensitive query params | bodies, headers; abort/opaque → "Network Error" |
| Resource Timing | url, duration, initiator, startedAt | every asset while recording | query redaction | status 0 when unknown (Firefox, cross-origin) |
| Failure snippets | 200 chars | 10, in memory only; lost on reload/saved ticket | token scrub | success bodies |
| Screenshots | image, time | 50 in memory, 5 persisted, silent | none (pixels unmasked) | failed capture stored as placeholder |
| Video | WebM, duration | auto-stops at 120 s, unmarked | none | — |
| DOM replay (rrweb) | DOM events | trimmed >30k, cap 60k, silent; last page only | masks inputs, sensitive editables, `.tb-mask` | canvas, iframes, CSS backgrounds |
| Environment | UA, OS, viewport, URL at session start | — | URL query not redacted locally | bug-page URL |
| Storage | local/session storage, cookies (50/area, 300 chars) | "+N more" shown | key/value regex, partial mask | HttpOnly cookies, IndexedDB; snapshot at build time |
| Voice | transcript | — | not sanitized | missing from .html, MCP, AI prompt |
