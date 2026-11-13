# ADR 009 — A free account for Site Audit after 3 audits

**Status:** Accepted 2026-11-13 (owner). Amends ADR 001 for Site Audit only. Plan: `docs/launch/sign-in-gate-plan.md`.

## Context

ADR 001 says "no accounts, no quotas". It still holds for capture: the session data, reports and exports never
leave the machine. But TraceBug has no way to reach the people who use it: no telemetry by design, and the optional
email ask (`email-capture-plan.md`) is one click to dismiss. The owner needs verified addresses of active users to
learn the user journey and to offer Pro later (`monetization-plan.md`). Site Audit is the newest feature and was
never promised account-free on `/pricing`, which promises *local capture*.

## Decision

- **Site Audit needs a free account after 3 audits** (3 in total, per browser profile). Sign-in is email + a 6-digit
  code (Supabase Auth OTP), in the extension popup or an extension page — never in a form on the audited site.
- **Nothing else is gated:** capture, screenshots, recording, exports, tickets, MCP, the npm SDK and the CLI stay
  account-free. Results already run are never locked; only a *new* scan asks.
- **The account stores only:** email, user id, created/last-sign-in time (Supabase Auth), and a marketing-consent
  flag from a **separate, unticked** box. Audit results, page content, URLs and counts are never sent.
- **Fail open:** if sign-in can't be reached (offline, server down, email limit), the audit runs.
- The count lives in `chrome.storage.local`. It is a speed bump for honest users, not enforcement; we don't harden it.

## Consequences

- "No account" is no longer true for the whole product: store listings, README, website and posts must say
  "no account for capture; a free account for Site Audit after 3 audits".
- tracebug.dev and Supabase become part of the audit's path. Uptime matters → the free keep-alive Action, and fail-open.
- New store disclosures (CWS: personally identifiable info, authentication info) and an account-deletion path.
- The npm SDK's audit stays ungated (MIT); the gate lives in the extension only.
