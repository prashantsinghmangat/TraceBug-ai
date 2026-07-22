# Architecture Decision Records

Short records of the decisions that shaped TraceBug, so future contributors
understand *why* — not just *what*. Format: context → decision → consequences.
New ADRs: copy the pattern, number sequentially, keep it under a page.

| # | Decision |
|---|----------|
| [001](001-local-first-no-backend.md) | Local-first, zero backend |
| [002](002-single-file-html-export.md) | The export is one self-contained `.html` file |
| [003](003-rrweb-dom-replay.md) | rrweb DOM replay instead of video-by-default |
| [004](004-manifest-v3.md) | Chrome extension on Manifest V3 |
| [005](005-zero-dependency-policy.md) | Zero runtime dependencies (hand-rolled MCP/ZIP/source-map) |
| [006](006-stdio-only-mcp.md) | MCP server is stdio-only |
