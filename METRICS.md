# TraceBug — Adoption Metrics

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

## Weekly log

| Week of | Chrome | Firefox | Stars | npm sdk | npm cli | CWS weekly users | ?ref= hits (top source) | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-07-29 (pre-launch baseline) | — | — | | | | — | — | v1.10.1 built; stores not yet submitted |

## Top 10 user complaints (ranked, refreshed weekly)

1. —
2. —

*(When this list has real entries, it outranks every audit finding ever filed.)*

## Decision triggers (agreed in advance, so numbers — not moods — drive them)

- **Storage pressure** (`getStorageStats()` reports in issues) → start v2.0 IndexedDB.
- **"How do I share a link?"** recurring in complaints → un-gate cloud sharing as the first paid-tier boundary.
- **Export→install conversion near zero** despite report volume → footer CTA copy experiment, not more features.
- **Installs high, weekly users low** → onboarding problem: watch 5 users, fix the first confusion only.
