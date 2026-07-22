# ADR 005 — Zero runtime dependencies; hand-roll the small protocols

**Status:** Accepted, repeatedly re-affirmed

## Context

A tool that pitches "auditable, local, nothing phones home" is undermined by
a deep `node_modules` tree — every dependency is supply-chain surface and
audit burden. Several needs looked like "just add a library": an MCP server
(official SDK exists), ZIP writing (jszip), source-map decoding
(`source-map` package), HAR building, PDF generation.

## Decision

The published packages carry **zero runtime dependencies**. Where a
protocol is small enough to own, we hand-roll it: the MCP stdio JSON-RPC
loop (~5 methods), the ZIP container (~150 lines, STORE +
`CompressionStream` deflate), the source-map VLQ decoder (~150 lines), HAR
1.2 assembly. The three heavyweights the SDK genuinely needs — `rrweb`,
`html2canvas`, `axe-core` — are build-time/lazy-loaded, never runtime deps
of the published CLI, and additions must be justified in review.

## Consequences

- `npx -y tracebug mcp` installs one ~24 KB package with nothing else — the
  security review is "read this one file."
- Browser-native APIs do the heavy lifting (`CompressionStream`,
  `DecompressionStream`), with graceful fallbacks where they're missing.
- We own protocol edge cases ourselves (ZIP header/CRC layout, source-map
  VLQ continuation bits) — paid in tests rather than in dependencies.
- `html2canvas` specifically: lazy `import()` with a `window.html2canvas`
  UMD fallback for script-tag consumers, so even it never blocks the core.
