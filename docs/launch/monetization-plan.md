# Monetization plan — grow first, validate one paid feature, license later

Status: **approved working strategy, 2026-11-13.** No code, no licensing work, no Pro infrastructure until the
evidence justifies it — monetization planning must not become an engineering project. The $29 Founder offer is an experiment.
Resolves audit plan B4 for now: no paid pilots on local features until the validation below passes.
Companion: `email-capture-plan.md` (optional email ask + opt-in usage snapshot).

## Decisions (owner, 2026-11-13)

| Area | Decision |
|---|---|
| Existing features | Free **for now**. No blanket "free forever" promise; review feature by feature later. Never move one behind a paywall without announcing it first. |
| New advanced features | Possible Pro, only after validation |
| Account | None. The no-account, local-first experience stays the product's advantage |
| Licensing, payments, enforcement | **Deferred.** No licence keys, payment checks or paid gating until one paid feature is validated |

Consequence for `/pricing`: keep today's page (it doesn't promise "forever"); don't add a forever list.
Wording to use when asked: "The current TraceBug core is free today. If we introduce paid capabilities or change what's
included, we'll communicate those changes clearly in advance."

## Free now

Chrome + Firefox extension; bug capture and offline `.html` reports; console, network, screenshots, recording;
SDK, CLI, MCP (12 tools); Site Audit as shipped (checks, scores, findings, exports); Copy for AI, Fix with AI.

## Pro candidates (validate the top 1–2 only)

| # | Feature | Value |
|---|---|---|
| 1 | Visual Comparison (pixel + DOM diff) | Shows exactly what changed |
| 2 | Multi-page audit | Whole site, not one page |
| 3 | Audit history and trends | Is the site improving or regressing? |
| 4 | Design Tokens + Components extraction | Finds design inconsistencies |
| 5 | Branded / white-label reports | Freelancers and agencies |
| Later | CI audit | Runs a browser outside the extension — needs an architecture review (ADR 001/006) first |

## Next 60 days

| Weeks | Work | Evidence |
|---|---|---|
| 1–2 | Distribution and discovery (playbook loop 1) | Store weekly users, npm downloads |
| 3–4 | Ship the optional email ask (`email-capture-plan.md`), double opt-in | Confirmed subscribers by source |
| 5–6 | Interview 10–15 active users (devs, freelancers, agencies) | Repeated pain points |
| 7–8 | Test a Founder offer for **one** feature | Pre-orders or clear intent |

Rules: the email ask never blocks anything. The usage snapshot is a separate, unticked box. Reports, screenshots,
recordings, network logs and page contents are never sent.

## Validation

Interviews: show the Visual Comparison and Multi-page Audit concepts; ask what problem they solve today, how often,
and with what tool.

Founder offer (a hypothesis to test): **~$29 lifetime**, small first cohort, exact contents and delivery date stated,
refund if not delivered by that date. Before taking money: confirm the payment provider's onboarding and India payouts
(Lemon Squeezy / Paddle / Razorpay).

| Pre-orders | Decision |
|---|---|
| 30+ | Build the first Pro feature |
| 10–29 | Talk to the buyers, refine the offer |
| < 10 | Don't build the bundle; revisit the candidate list |

Pre-orders prove willingness to pay, not retention.

## Sequence

1. **Now:** grow active users, opt-in emails, learn usage.
2. **After validation:** Founder offer for one feature.
3. **After a pass:** build that feature.
4. **Later — a separate decision:** licensing; choose lifetime vs. yearly (~$59/yr is a hypothesis).
   An offline-verified key keeps "no account" true but is **not strong enforcement** — a client-side check can be
   bypassed. Evaluate then: how keys are issued and signed, how offline verification works, what happens when a key
   is shared, how updates and refunds affect a licence, and whether it's worth its maintenance cost.
5. **Much later:** hosted collaboration, only if users ask for it — needs an ADR.

## Measuring it (without telemetry)

ADR 001 rules out automatic per-user tracking. What we can actually measure:

| Metric | Source |
|---|---|
| Installs, weekly users | Chrome and Firefox store dashboards |
| npm adoption | npm downloads (not unique users) |
| Email conversion | Confirmed signups attributed to the feature used just before the ask (`source`) |
| Repeat usage | Optional, explicitly submitted usage snapshots |
| User problems | Interview notes in `METRICS.md` |
| Willingness to pay | Actual pre-orders, not survey answers |

**These are proxies — label them so.** Signups from the success-#2 ask are not a measured first → second use
conversion rate; we never see the users who reach success #2 and don't sign up.

First milestone: evidence of repeat use and one clear paid problem — not revenue.
Review weekly in `METRICS.md` (loop 1); decide on the Founder test at the week-6 review.
