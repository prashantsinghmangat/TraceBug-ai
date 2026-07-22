# ADR 001 — Local-first, zero backend

**Status:** Accepted (founding decision)

## Context

Every incumbent bug-reporting tool (Jam, LogRocket, Sentry replay, BirdEatsBug)
is cloud-first: the session data must live on their servers before anyone can
view it. That creates an account wall, a retention policy, a compliance
conversation, and a trust problem — captured sessions contain console output,
network bodies, and storage values.

## Decision

TraceBug has **no backend at all**. Capture, storage (`localStorage` +
in-memory), report building, redaction, and export all run in the user's
browser. Sharing is a file handed over by the user; AI debugging is a local
stdio MCP server reading that file from disk.

## Consequences

- The one positioning cloud tools structurally cannot copy: "your session
  data never leaves your machine." This is the product's moat, not a
  cost-saving compromise — PRs adding a required server component are
  rejected on principle (see CONTRIBUTING "Architecture Rules").
- No accounts, no quotas, no uptime obligations; the whole product is
  MIT-licensed files.
- Costs we accept: no cross-device sync, no hosted share links (a gated
  optional portal exists behind `PHASE2-CLOUD` but is not the product), and
  virality depends on files being passed around rather than links.
- Redaction must happen **at capture time** — once data is in the report
  object there is no server-side second chance (see the capture-time token
  scrub and `redact` rules).
