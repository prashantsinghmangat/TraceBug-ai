# TraceBug — Adoption Metrics

**North-star question: does a user capture a SECOND bug within 7 days?**
That one behavior implies install → it worked → it helped → they remembered.
It can't be measured remotely (local-first, no telemetry) — it's answered by
watching TTFS sessions, asking the one question, and reading what users say
in issues/reviews. Every roadmap debate should route back to: "does this make
the second capture more likely?"

**Next milestone is not a version number.** It is: five observed users, five
TTFS records, ten verbatim user quotes, and the first recurring complaint.
Once those exist, the next product decision makes itself.

**This file is the roadmap.** Engineering work happens only when a number here
(or a user complaint below) demands it. Update weekly — a five-minute Monday
ritual. No telemetry is collected from users; every source below is external
or user-volunteered, consistent with the local-first promise.

## How to collect each metric

| Metric | Source |
|---|---|
| Chrome installs | Chrome Web Store developer dashboard |
| Firefox installs | addons.mozilla.org statistics page |
| GitHub stars | repo page / `gh api repos/{owner}/{repo} --jq .stargazers_count` |
| npm downloads (SDK + CLI) | npmjs.com package pages or `npm-stat.com` (tracebug-sdk, tracebug) |
| MCP installs | proxy: `tracebug` CLI npm downloads (the MCP server ships in it) |
| Weekly actives | proxy: CWS "weekly users" stat (no client telemetry exists, by design) |
| Reports generated | proxy: feedback-chip volume + `?ref=` landing hits (see next) |
| Export→install conversion | server logs of tracebug.dev landings by `?ref=replay/github-issue/jira/pdf/playwright-test/ai-report`, vs store installs that week |
| 7-day return | proxy: CWS weekly-users trend vs cumulative installs |
| Top complaints | GitHub issues + store reviews + tracebug.dev/feedback submissions |

## Confidence milestones (check these on low-confidence days — not feelings)

- [ ] 20–50 extension installs from strangers
- [ ] 5 observed user sessions (TTFS table below)
- [ ] 3 independent people saying the same positive thing
- [ ] 1 person captures a SECOND bug (the north star, witnessed once)
- [ ] 1 developer: "I used this in a real project"
- [ ] 1 person asks how to share a report with their team (= first paid-tier evidence)
- [ ] 1 public recommendation not prompted by you
- [ ] 10 emails on the Pro waitlist

Judge the product only after this list has real checkmarks. Silence before
the launch posts go out is not data.

## Weekly log

| Week of | Chrome | Firefox | Stars | npm sdk | npm cli | CWS weekly users | ?ref= hits (top source) | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-07-29 (launch baseline) | in review | in review | | | | — | — | v1.10.1: npm live (sdk+cli), GitHub release live, AMO + CWS submitted, website deployed |
| 2026-08-03 | 12 | 2 | 2 | 28 | 37 | 12 | not checked | Both stores now LIVE (CWS approved; AMO approved ~08-01). npm week = 8/1–8/7 (last 2 days lag); launch-day spike (121/129 on 7/29) is mostly registry-mirror bots. 0 reviews, 0 external issues, 0 quotes — launch posts not out yet, so silence isn't data yet. |

## Top 10 user complaints (ranked, refreshed weekly)

1. —
2. —

*(When this list has real entries, it outranks every audit finding ever filed.)*

## User quotes (verbatim fragments — one-liners count)

Developers won't write big feedback, and they don't need to. A five-word store
review, a GitHub issue *title*, a Reddit comment, an overheard "wait, I had to
click Record?" — each one goes here verbatim. Ten fragments beat one essay.

**Week of ______**
- " "
- " "

Sources that produce quotes WITHOUT asking for effort: store reviews ·
GitHub issue titles · comments on the announcement threads (HN/Reddit — people
give brutal, detailed feedback for free when it's public) · the 👍/👎 report
chips · tracebug.dev/feedback · anything said while watching someone use it.

**The one question to ask, when asking at all** (one question, never a survey):
> "What almost stopped you from using it?"

**The must-have sentence (one per week, verbatim only — never self-written):**
> "I keep using TraceBug because ______."

Copy the completion exactly from issues, store reviews, Reddit, Discord, DMs,
X replies. The friction question above says what to FIX; this one says what to
MARKET. After 30–50 entries the dominant completion IS the positioning — if it
names a different feature than the homepage does, the messaging is wrong, not
the users. Target answer shape: "I can't get my AI enough context without it"
(moat) — not "screenshots" or "recordings" (commodity).

## Time to First Success (TTFS) — the one UX metric

Measured by watching (not asking): install → first capture → replay generated
→ handed to an AI. **Target: ≤ 3 minutes, zero documentation.** If it takes
15 minutes or requires docs, the first hesitation point is the next fix —
ahead of everything else in this file.

| Date | Person (role) | TTFS | First hesitation | Fixed? |
|---|---|---|---|---|
| | | | | |

## Site Audit trust metrics (added 2026-11-13, 1.12)

Two numbers that say whether the audit is worth acting on. A higher finding
count is **not** better: false positives and duplicates destroy trust faster
than missed issues. **Neither is collected automatically**: TraceBug has no
telemetry and the audit never leaves the user's machine. Both come only from
sessions you watch, from users who share their before/after exports, or from
your own runs on real projects. No baseline exists yet; don't write one in
until the table below has rows.

**1. Finding agreement rate** = findings a person confirms are real problems ÷
findings that person reviewed.
- *Numerator:* findings the reviewer agrees are genuine (they would fix it, or
  it is a real defect they choose to accept). "Real but low priority" counts as
  agreed; "not a problem" or "wrong element" counts against.
- *Denominator:* findings the reviewer actually looked at, not the run's total.
  Count each finding group (one rule, many elements) once, plus any element
  inside it they reject separately.
- *Collect:* in a watched session, go down the panel's list with the user and
  tick agree / disagree / unsure; or ask a user to annotate an export. Log the
  page, scan and TraceBug version.
- *Limits:* small samples; reviewers differ (a designer and a developer judge
  contrast differently); "unsure" is left out of both numbers and counted
  separately; sites you choose yourself skew it upward.

**2. Verified fix rate** = attempted fixes that are gone on a fresh audit ÷ fixes attempted.
- *Numerator:* findings that `compare_audits` (or the panel's Re-scan diff)
  lists as **fixed** on a fresh audit of the same page and scan, with no new
  regression from that change.
- *Denominator:* findings the agent or developer changed code for (the approved
  change list), not every finding in the audit.
- *Collect:* the before export + the after export of a Fix with AI run (from your
  own projects or a user who shares both), then `compare_audits`.
- *Limits:* only same-page, same-scan comparisons count; a category that didn't
  run in both is excluded, not counted as fixed; a finding can disappear for the
  wrong reason (element removed, content changed, scrolled out of reach), so
  spot-check fixes before counting them; this measures "the check stopped
  failing", not that the page is accessible.

| Date | Source (who/what) | Page + scan | Reviewed | Agreed | Agreement | Fixes attempted | Verified fixed | Verified rate | Notes |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

## Evidence rules (in priority order — "feedback" is not the goal, evidence is)

1. **Watching someone use it** — outranks everything below.
2. **Repeated complaints** — the three-users rule: 1 report → investigate ·
   3 independent reports → prioritize · 10 → roadmap, immediately.
3. **Behavior** — the tables above (`?ref=` conversion, retention, exports used).
4. **Public launch threads** — brutal, free, honest. Reply to everything.
5. **Feature requests** — log the *pain*, distrust the proposed *solution*.
   Never build from one request. Before any weekend project: *did at least
   three real users ask for this?*

**Standing question for every idea:** does this help more people succeed at
the existing workflow (capture → replay → AI fix), or is it just another
feature? The former wins.

**Time allocation (next 90 days):** 70% distribution · 20% friction-fixing ·
10% new capability (only with 3+ user evidence).

**Launch-post footer (use verbatim):** "I'm the solo developer. If anything is
confusing — or you get stuck anywhere — tell me. I'll probably fix it the
same day."

**Weekly content cadence (the 70% — teaching, not marketing):** 2 X posts ·
2 LinkedIn posts · 1 Reddit post · 1 YouTube short · 1 blog/compare article ·
HN only when there's something substantial · reply to every issue and comment.
Post formula that spreads: show the before/after ("I gave Claude one TraceBug
report — fixed in 45 seconds"), never the announcement ("we launched").
Target personas in order: Cursor users → Claude Code users → Windsurf/Copilot
→ QA engineers using AI. The 8-second answer, verbatim: "TraceBug captures
everything your AI needs to debug browser bugs — video, console, network,
DOM replay, repro steps — and packages it into one HTML file."

## Evidence-gated feature candidates (build ONLY at 3+ independent asks)

- **"Open in Claude / Cursor" one-click** (deep-link handoff replacing the
  copy-prompt flow) — ingredients exist (hand-off card, MCP prompt).
  Trigger: three independent OBSERVATIONS of people manually moving a report
  from TraceBug into an AI assistant ("I paste the replay into Claude",
  "can I send this to Cursor?") — users describe friction, not solutions,
  so observations count as asks.
- **Identity v2 package** (ship as ONE commit): H1 → "Your AI can't fix bugs
  it can't see." · retire the old tagline across README/meta/OG · 8-second
  pitch → meta description · "context for AI coding agents" category language ·
  viewer "AI" tab renamed.
  Trigger: NOT store approval alone — the current headline ("Capture the bug.
  Let AI fix it.") gets real exposure first. Ship only if early interviews /
  TTFS sessions consistently show confusion about what "Let AI fix it" means,
  or the must-have-sentence completions converge on the "can't see" framing.
- **Interactive demo playground** (a page with an intentional checkout bug the
  visitor captures themselves: trigger bug → shortcut → report → Fix with AI).
  Distinct from /proof — /proof shows what happened; this lets a visitor DO
  the loop before installing anything.
  Trigger: TTFS sessions repeatedly show users stalling because they don't
  have a suitable bug to try it on. A hypothesis, not a roadmap commitment.

## Decision triggers (agreed in advance, so numbers — not moods — drive them)

- **Storage pressure** (`getStorageStats()` reports in issues) → start v2.0 IndexedDB.
- **"How do I share a link?"** recurring in complaints → un-gate cloud sharing as the first paid-tier boundary.
- **Export→install conversion near zero** despite report volume → footer CTA copy experiment, not more features.
- **Installs high, weekly users low** → onboarding problem: watch 5 users, fix the first confusion only.
