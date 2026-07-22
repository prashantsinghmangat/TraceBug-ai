# ADR 006 — The MCP server is stdio-only

**Status:** Accepted (v1.5)

## Context

MCP servers can speak stdio (spawned by the client) or HTTP/SSE (a listening
port). An HTTP server would allow remote/hosted setups — and would also mean
an open port, an auth story, CORS, and a truthful asterisk on "opens zero
network connections."

## Decision

stdio only. The agent's client spawns `npx -y tracebug mcp` as a child
process; newline-delimited JSON-RPC over stdin/stdout; the process reads
report files from local disk and nothing else.

## Consequences

- The privacy claim is absolute and checkable: no sockets, no listener, no
  auth surface. This is the line quoted in every launch post.
- Zero-config for the supported clients (Claude Code, Cursor, Windsurf) —
  they all spawn stdio servers natively.
- No hosted/remote MCP story — deliberate; a hosted reader would require the
  reports to be uploaded somewhere, which contradicts ADR 001.
- The hand-rolled loop (ADR 005) stays tiny because stdio needs only five
  JSON-RPC methods; an HTTP transport would have pulled in a server
  framework.
