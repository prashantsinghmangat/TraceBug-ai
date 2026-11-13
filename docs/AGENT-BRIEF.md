# TraceBug — brief for agents

Hand this file to any AI agent (coding, docs, marketing, support or QA) that
works on or with TraceBug. It covers what the product does today, including
the 1.12.0 Site Audit, how it helps remove front-end issues, and where
everything lives. Details are in the linked docs; this page is the map.

Last updated: 2026-11-12 (version 1.12.0).

---

## 1. What TraceBug is

A local-first tool that turns front-end problems into evidence an AI coding
agent can fix from. No account, no backend, no telemetry, nothing uploaded.
MIT licence.

Three surfaces, one code base:

| Surface | Who uses it | Package / location |
| --- | --- | --- |
| Browser extension (MV3) | QA, PMs, designers, support, developers, on any site | Chrome Web Store and Firefox Add-ons (Firefox 128+); source `tracebug-extension/` |
| npm SDK | Developers who want the toolbar inside their own dev/staging app | `tracebug-sdk` (`src/`) |
| MCP server (stdio) | The coding agent (Claude Code, Cursor, Windsurf, VS Code) | `npx -y tracebug mcp` (`cli/`, published as `tracebug`) |

Site: https://tracebug.dev · Repo: https://github.com/prashantsinghmangat/tracebug-ai

## 2. How it removes front-end issues

TraceBug covers two jobs: **find** problems (Site Audit) and **capture** a
bug someone hit (Capture Bug). Both end the same way: one self-contained
`.html` file that an agent reads over MCP and fixes from.

```
FIND        Audit this page  ──► score + findings (where, why, how to fix)
CAPTURE     Capture Bug       ──► replay + console + network + repro steps
                    │
                    ▼
HAND OFF    Export .html  /  Copy for AI  /  file a GitHub, Linear, Slack, Jira issue
                    │
                    ▼
FIX         agent: list_bug_reports → get_bug_report / get_audit → … → edits code
                    │
                    ▼
VERIFY      bug: run the generated failing Playwright test (red → green)
            audit: re-run the audit, compare_audits (fixed / still there / new / regressed)
```

## 3. Site Audit (new in 1.12.0)

Popup's first and largest card, **Audit this page**, or the on-page toolbar's
**Audit** button. Read-only: nothing is clicked or changed. Full guide:
[site-audit.md](site-audit.md).

**Scans:** All checks · Auto Review (layout, phone width, errors) ·
Accessibility Audit · Performance & SEO.

**Categories and what they check**

| Category | Checks |
| --- | --- |
| Accessibility | axe-core 4.11.4, WCAG 2.0–2.2 A/AA; label-in-name (2.5.3); keyboard: focus outline removed, focus hidden by a sticky header (2.4.11), positive tabindex, focusable but invisible. Contrast findings suggest a passing colour. |
| Layout (`ui`) | horizontal overflow, off-screen, controls covering controls, clipped text, broken images, images without dimensions |
| Phone width (`mobile`) | the layout checks in a hidden 390×844 same-site frame, plus scrolling boxes a keyboard can't reach |
| Performance | LCP (names the element; late render vs slow image), FCP, TTFB, main-thread blocking (TBT, Chromium only), CLS (worst burst), render-blocking files, page weight > 3 MB, files > 500 KB, oversized images (≥ 4× pixels), JPEG/PNG ≥ 100 KB |
| SEO | title, description, canonical, one h1, viewport, noindex, Open Graph, Twitter card, JSON-LD validity, robots.txt blocking, sitemap |
| Runtime | console errors, failed requests, mixed content, rage and dead clicks on this page |

**Score:** 0–100 per category and overall. Starts at 100; each distinct
problem takes a share of what is left (critical 20%, serious 12%, moderate
6%, minor 2%; more elements raise it, up to double). Overall pools every
problem, so it is never above the weakest category. Bands: 90+ good, 50–89
fair, under 50 poor. Not a WCAG conformance claim. Code: `src/audit/score.ts`.

**Panel:** docked right/left or dragged free by its header (remembered);
findings grouped by rule with WCAG criterion, Found vs Required, fix, and each
element with **Locate** and **Copy selector**; **Needs a person to check**
(axe "incomplete", not scored); **Fix with AI** (downloads the audit + copies a one-line prompt for an MCP agent); **Copy for AI** (ticked findings → prompt, no MCP needed);
**Export report** (`.html`); re-run shows what changed.

**Trust rules the audit follows** (keep them in any change):
- A check that did not run says so and is left out; it is never a pass.
- Each category states its limits (window size, theme, dev server, unreadable stylesheets).
- Noise is filtered: visually hidden content, really-covered controls only, `:focus-visible` styles respected, CSS-sized images, retina density.
- Page text in exports and MCP output is marked untrusted.

## 4. Capture and reports (existing features)

- **Capture Bug** (popup): events-only capture across page loads — clicks,
  inputs, navigation, console, network, DOM replay (rrweb). Optional video
  and voice. Floating HUD with Screenshot, Draw, Blur, Stop.
- **Capture Screenshot** / region screenshot, plus a capture shortcut
  (default Alt+B in the extension; Ctrl+Shift+B opens the ticket in the SDK).
- **Ticket review**: auto title, summary, repro steps, root-cause hint with
  confidence, annotations, draw, click-to-blur redaction.
- **Inspect**: DevTools-style element inspection that attaches style
  evidence (typography, colours, box model, WCAG contrast).
- **Exports**: replay `.html` (offline, no remote loads), Export for AI
  `.html`, Markdown, `.zip`, HAR, generated failing Playwright test.
- **Issues**: real GitHub, Linear, Slack issues with the user's own token
  (sent from the browser); Jira text to paste.
- **AI debugger**: bring-your-own-key root-cause analysis (Anthropic, OpenAI, Ollama).
- **Playwright reporter**: failed tests become TraceBug reports.
- **Privacy**: passwords, hidden fields, tokens and cookie values masked at
  capture; custom redaction rules; saved tickets are never evicted.

## 5. MCP tools (12) and the prompt

Run `npx -y tracebug mcp` (native Windows: `cmd /c npx -y tracebug mcp`). It
finds exports in the project, Downloads and Desktop.

| Tool | Use |
| --- | --- |
| `list_bug_reports` | Start here: every export, with `kind` (bug or audit) |
| `get_bug_report` | Overview plus an investigation guide (which tools next) |
| `get_console_errors` | Console with stack traces |
| `get_network_activity` | Failed requests with response snippets (or all) |
| `get_repro_steps` | Steps, actions, frustration signals, timeline |
| `get_screenshot` | Screenshot as an image |
| `get_playwright_test` | Generated failing test: red now, green after the fix |
| `resolve_stack` | Minified frames → source files via local `.map` files |
| `get_fix_context` | One-call fix starter |
| `get_audit` | Audit: checks that ran and their limits, scores, findings, `needsReview` |
| `get_finding` | One finding: evidence, WCAG, fix, codebase search hints |
| `compare_audits` | Before/after: fixed, still present, new, regressed |

Prompts: `debug_bug_report` and `fix_site_audit` (`/tracebug:<name>` in Claude Code). The audit panel's
**Fix with AI** downloads the audit and copies "Fix the latest TraceBug site audit."; the agent then follows
`fix_site_audit`: evidence-based grouping, approval before edits, and verification only from a fresh audit.
Details: [mcp.md](mcp.md).

## 6. SDK quick reference

```typescript
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "my-app" });          // enabled: "auto" = localhost + staging
await TraceBug.runAudit({ scan: "full" });        // AuditRun with score, findings, review
await TraceBug.showAuditPanel("accessibility");   // run + show the panel
await TraceBug.exportAudit();                      // download .html for the MCP server
TraceBug.compareAudits(before, after);
TraceBug.quickCapture();                           // open the ticket
```

Full API: [api-reference.md](api-reference.md). Options: [configuration.md](configuration.md).

## 7. Hard rules (for agents changing the code)

- No backend, no telemetry, no remote loads in exported `.html` (ADR 001, 002).
- Zero runtime dependencies (ADR 005). MV3 only (ADR 004). MCP is stdio only (ADR 006).
- Never add a manifest permission without asking the owner.
- Keep Firefox 128+ working; use feature detection, not user-agent checks.
- The SDK runs in the page's main world: never store secrets in page `localStorage`.
- Never evict saved tickets; verify writes before showing "Saved" (`docs/ticket-flow.md`).
- `tracebug-extension/tracebug-sdk-ext.js`, `tracebug-provider-api.js` and
  `website/public/tracebug-sdk.js` are generated by `npm run build`. Never edit them.
- Don't commit or push unless the owner asks; never `git add -A` / `git add .`.
- Verify with `node scripts/check.mjs` (`--full` if extension files changed).

## 8. Where things are

| Need | Look at |
| --- | --- |
| Current status | `docs/launch/STATE.md` (read first), then `docs/launch/CODEMAP.md` |
| Site Audit code | `src/audit/` (`index.ts`, `run.ts`, `score.ts`, `detectors/`), panel `src/ui/audit-panel.ts` |
| MCP server | `cli/mcp-server.ts`, `cli/audit-tools.ts` |
| Extension | `tracebug-extension/` (`popup.*`, `background.js`, `content-script.js`) |
| Architecture | `ARCHITECTURE.md`, `docs/architecture.md`, `docs/adr/` |
| User docs | `docs/README.md` (index), `docs/site-audit.md`, `docs/chrome-extension.md` |
| Store text | `docs/STORE-LISTINGS.md` |
| Changes | `CHANGELOG.md` |
| Tests | `tests/` (Vitest), `e2e/` (Playwright: `site-audit.e2e.mjs`, `ext-site-audit.e2e.mjs`, noise study `audit-noise.mjs`) |
| Website | `website/` (Next.js; `public/llms.txt` for AI agents) |

## 9. Status and what's next

- 1.11.6: npm and MCP Registry live; Chrome Web Store and AMO uploads pending.
- 1.12.0 (Site Audit): built and gated on branch `site-audit`; ships after 1.11.6.
- Known limits: automated checks find only part of accessibility problems;
  performance figures come from one local page load, not field data; the
  score is TraceBug's own. Checked against Lighthouse 12.8 on ten sites:
  accessibility reads stricter on purpose (more failing elements cost more),
  performance reads higher on fast pages (real load vs simulated slow network).
- Next planned scans (after the owner's day-14 decision): Design Tokens →
  Components → Visual Comparison.
