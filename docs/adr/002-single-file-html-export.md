# ADR 002 — The export is one self-contained `.html` file

**Status:** Accepted

## Context

With no backend (ADR 001), the report must travel as an artifact. Options
considered: a JSON file + hosted viewer (needs a backend or a "go install
the viewer" step), a directory of assets (unsendable over chat), a PDF
(static, loses the replay), or one HTML file embedding data + viewer.

## Decision

One `.html` file containing the viewer UI, the report JSON (in a `tb-data`
script tag), screenshots as data URLs, the gzipped rrweb stream, and the
inlined replayer runtime. It opens offline in any browser with **zero
network requests**.

## Consequences

- Survives every transport a team already uses: Slack, email, tickets, USB,
  a folder for three years. Nothing to host, nothing to expire.
- The same file is machine-readable: the MCP server parses the embedded
  JSON, so one artifact serves humans and agents (no separate "agent
  format" to keep in sync).
- File size is the tax — paid down by gzipping the rrweb stream via
  `CompressionStream` (8–12×) and defaulting to DOM replay instead of video.
- One gotcha discovered post-launch: GitHub issues reject `.html`
  attachments — hence the `.zip` wrap export rather than abandoning the
  format.
