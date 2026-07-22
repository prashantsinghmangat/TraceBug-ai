# ADR 004 — Chrome extension on Manifest V3

**Status:** Accepted

## Context

MV2 is deprecated and the Chrome Web Store no longer accepts new MV2
extensions — so for a new extension MV3 wasn't really a choice. The design
question was how to live well inside MV3's constraints: service-worker
background (no DOM, can be killed anytime) and no remote code.

## Decision

MV3 with: a service-worker background that persists its state
(`chrome.storage`) and rehydrates on wake; an **offscreen document** owning
`MediaRecorder` so a page reload doesn't kill an in-flight recording; SDK
injection via `chrome.scripting.executeScript` into the MAIN world
(per-tab, user-triggered — no blanket content-script world); and a single
shared codebase emitting Chrome + Firefox targets from `manifest.base.json`
(`build-ext.mjs`).

## Consequences

- Store-compliant now and for the foreseeable future; the per-tab opt-in
  injection model doubles as the privacy story (nothing runs until the user
  clicks).
- The offscreen recording pattern is Chrome-only API surface — the Firefox
  port (paused) uses an event-page background instead; recording parity is
  the hard part of that port.
- Every popup→page interaction is a 4-hop pipeline (popup → background →
  content script → page world), which costs boilerplate per feature but
  keeps each hop auditable.
