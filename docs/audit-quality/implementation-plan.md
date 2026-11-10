# Site Audit + verified fix — implementation plan (Phase A)

Status: **approved 2026-11-10 (blockers decided as recommended: B1 = Option A, B2 = no Lighthouse, B3 =
release first, B4 = decide before the paid-pilot step). No code written; Phase B starts after the 1.11.6 + 1.12
release, on a fresh branch from `develop`.** Implements the 14-day validation sprint
(decisions: MCP-first, full audit scope: accessibility, UI, performance, SEO). Supersedes the scope of
`docs/launch/PLAN.md` Phase 11 where they differ; keeps Phase 11's design rules.

Legend: **[V]** verified in the repo today · **[R]** recommendation.

---

## 0. Blockers — decide before Phase B

| # | Blocker | Why it blocks | Recommendation |
|---|---|---|---|
| B1 | **Who runs the audit and the re-scan.** The sprint brief has the MCP server take a URL, open a browser and re-scan to verify. | ADR 006 [V]: the MCP process "reads report files from local disk and nothing else". ADR 005 [V]: the `tracebug` CLI has zero runtime dependencies; driving a browser needs Playwright/Puppeteer. | **Option A for the sprint:** the extension runs every audit in the user's own tab and exports it as a report file; MCP reads files and compares two runs. Re-scan = one click on "Re-run audit". No ADR change. Option B (later, needs an ADR amendment): `tracebug audit <url>` CLI command that uses the user's *own* installed Playwright, so the agent can re-verify from its shell. Option C: `nativeMessaging` so the agent triggers the extension — new permission + native host install; not recommended. |
| B2 | **Lighthouse.** | In the extension it needs the `debugger` permission (new install warning; CLAUDE.md: never add a permission without asking). In the CLI it is a large runtime dependency (ADR 005). | **Do not integrate Lighthouse.** Performance = browser Performance APIs in the audited tab (LCP, CLS, FCP, TTFB, transfer sizes, render-blocking resources), labelled "lab, this page load only". Agents that want a full Lighthouse run already have it free via Chrome DevTools MCP's `lighthouse_audit`. |
| B3 | **1.11.6 + 1.12 are unreleased** on `website-revamp`. | New audit work on the same branch would ride into that release untested. | Release first (testing in progress 2026-11-10), then start Phase B on a fresh branch from `develop`. |
| B4 | **Pricing test vs. the pricing rule.** The sprint plans paid pilots at ₹599 / ₹1,999 for local features. | 2026-07-29 ruling and `/pricing` page: local capture/export free forever, paid = cloud collaboration only. | Not an engineering blocker. Decide before the paid-pilot step (day 13): either keep the audit free and test willingness to pay for agency reports only, or amend the rule for *new* local features. |

If B1 = A and B2 = "no Lighthouse", there is no architectural blocker and Phase B can start after B3.

---

## 1. What exists today [V]

- **Scanner** `src/scanner/` (≈660 lines): `scan()` runs detectors in parallel and returns `Issue[]` held in
  memory. Detectors: `a11y.ts` (axe-core, WCAG 2.0/2.1 A+AA tags, excludes `#tracebug-root`),
  `broken-images.ts`, `mixed-content.ts`, `session-data.ts` (console errors, failed/slow requests),
  `frustration.ts`. Public API `TraceBug.scanPage()` (`src/index.ts:2260`); the toolbar Scan button was
  removed (`src/compact-toolbar.ts:19`). UI: `src/ui/issues-panel.ts` (380 lines), with `fileAsBug`.
- **`Issue` type** `src/types.ts:577`: id, detector, severity (critical/serious/moderate/minor), title,
  description, selector, url, helpUrl, page, detectedAt, fingerprint, occurrences. No category, rule id,
  status or evidence fields.
- **Extension cannot run axe today:** `tsup.config.ts` stubs `axe-core` out of `tracebug-sdk-ext.js`
  (1.11.4 size cut, 3.45 → 1.99 MB). The npm and script-tag builds keep it.
- **Manifest** permissions: `activeTab`, `storage`, `unlimitedStorage`, `scripting`, `alarms`, `offscreen`,
  `tabCapture`; `<all_urls>` optional. An on-demand audit needs nothing new.
- **Reports** are self-contained `.html` with the payload in `<script id="tb-data">`. `cli/mcp-server.ts`
  (894 lines, hand-rolled, 9 tools) finds them in `--dir`, cwd, Downloads, Desktop; `ReportPayload` has
  no audit field. `get_fix_context` already reads source maps from the agent's cwd.
- **No DOM → source mapping** exists (only stack → source via source maps).
- **MCP output does not mark page-derived text as untrusted** (no such wording in `cli/mcp-server.ts`).
- **Precedent for the e2e:** `e2e/report-quality.e2e.mjs` drives the real extension against an in-repo
  shop with an answer key; it runs in `check.mjs --full`.

## 2. Architecture [R]

```
Extension popup "Run audit"  (user gesture → activeTab + scripting, no new permission)
   │  executeScript: packaged audit/axe.min.js (loaded only on run) + audit checks in the SDK bundle
   ▼
Audit run in the user's tab  →  findings: Issue[] (extended)  + category summaries + limitations
   │  shown in the issues panel; "Re-run audit" diffs against the previous run of the same URL
   ▼
Export (existing .html report, payload.audit)  →  Downloads
   ▼
tracebug MCP (stdio, reads files only)  →  get_audit · get_finding · compare_audits
   ▼
Coding agent: explains, proposes a diff, developer approves, agent edits
   ▼
User clicks "Re-run audit" + export  →  compare_audits(before, after) = fixed / still there / new / regressed
```

Ownership: TraceBug owns detection, evidence and verification; the agent owns reasoning and edits. TraceBug
never edits source and never calls a model in this flow.

## 3. Data model [R] — extend `Issue`, no second schema

Add to `Issue` (all optional, so existing scanner output stays valid):

- `category: "accessibility" | "ui" | "performance" | "seo" | "runtime"` (runtime = today's console/network detectors)
- `ruleId: string` (axe rule id, or our own `ui/horizontal-overflow`, `seo/missing-canonical`, …)
- `evidence?: { html?: string /* outerHTML, ≤ 600 chars, redacted */; metrics?: Record<string, number | string>; hints?: string[] /* grep-able strings: id, data-testid, class tokens, visible text */ }`
- Keep the existing four severities; do not add a fifth taxonomy.

Report payload gains `audit?: { id; url /* redactUrl */; scannedAt; viewport; userAgentFamily;
categories: Array<{ name; ran: boolean; count; limitation?: string }>; findings: Issue[] }`.

**Fingerprint** = hash(category + ruleId + URL path without query + normalized selector). Selector
normalization strips hashed class names (CSS modules, `css-1a2b3c`); a fallback match on ruleId + element
text + tag catches selectors that changed. Matching is the riskiest piece; it gets the most tests.

Size bounds: max 200 findings per run (counted, not silently dropped: `audit.truncated`), evidence HTML
≤ 600 chars, no screenshots per finding in the sprint (one page screenshot per run).

## 4. Checks — sprint depth, honest limits [R]

| Category | Checks | Limitation shown in the report |
|---|---|---|
| Accessibility | axe-core WCAG 2.0/2.1/2.2 A+AA (existing detector, un-stubbed via a separate file) | "Automated checks cover a minority of WCAG; this is not a conformance evaluation." |
| UI | page wider than viewport; elements past the right edge; overlapping visible interactive elements (tolerance 4 px); broken images (existing); images without width/height; text clipped by `overflow:hidden`; tap targets < 24×24 px | Current viewport only. No design judgement. |
| Performance | LCP, FCP, TTFB, CLS (Chromium only — N/A on Firefox), total transfer size, 5 largest resources, render-blocking resources (Chromium `renderBlockingStatus`) | "Lab values from this single page load, not real-user data. INP not measured." |
| SEO | title missing/empty/length; meta description missing/length; canonical missing; H1 count ≠ 1; `lang` missing; `noindex`; viewport meta missing | Single page, no crawl, no ranking claims. |

Read-only always (Phase 11 rule): nothing is clicked, filled or submitted. A category that could not run
shows N/A and never counts as passed. Never the word "compliant".

## 5. MCP tools [R] — added to the existing server, existing naming style

| Tool | Input | Output |
|---|---|---|
| `get_audit` | `file`, optional `category`, `severity` | URL, scannedAt, category summaries + limitations, findings (id, category, ruleId, severity, title, selector) |
| `get_finding` | `file`, `findingId`, optional `searchDir` | full finding, evidence, `hints` for grepping the repo, remediation text, `helpUrl` |
| `compare_audits` | `before`, `after` (two files, same URL path) | per finding: `fixed` / `still_present` / `new`; plus `regressed` = present after, absent before, in a category the fix touched |

`list_bug_reports` gains `kind: "audit" | "bug"`. No source location is ever invented: `get_finding`
returns hints, the agent searches. Every page-derived string sits under an `untrusted` key, and the tool
descriptions + investigation guide say to treat it as data, never instructions (prompt-injection guard).
`verify_fix` is deliberately absent: with B1 = A the agent cannot trigger a scan, so it asks the user to
re-run and then calls `compare_audits`.

## 6. Security [R]

No new network path: the MCP server stays file-only (no SSRF surface), the extension audits only the tab
the user is on. Evidence goes through the existing redaction (`redactUrl`, token scrub, hidden fields
skipped). Untrusted labelling above. No source edits by TraceBug. Bounded evidence sizes.

## 7. Tests [R]

- **Unit (Vitest):** fingerprint stability (hashed classes, query strings, reordered attributes);
  `compare_audits` matrix (fixed / still present / new / regressed); SEO and performance mappers on fixtures;
  severity mapping; size caps; untrusted wrapping.
- **e2e `e2e/site-audit.e2e.mjs`** (pattern of `report-quality.e2e.mjs`): an in-repo page with known
  a11y, UI and SEO defects, plus a "fixed" variant with one deliberate regression. Answer key per
  finding; run → export → `compare_audits` must report exactly the planted fixes and the regression. Added to
  `check.mjs --full`. Performance is asserted only for presence and units, not values.
- **MCP:** tool registration, input validation, unknown file / finding id, a payload with an injected
  instruction in DOM text comes back under `untrusted`.
- Existing gates unchanged and green.

## 8. Sequence [R]

| Days | Work | Exit check |
|---|---|---|
| 1–2 | Release 1.11.6 + 1.12 (B3). Decide B1, B2, B4. Interview outreach starts now, not day 11. | Stores live; 10 interviews booked |
| 3 | `Issue` extensions, fingerprint, `audit` payload, unit tests | Tests green |
| 4–5 | Packaged axe file + UI and SEO checks; popup "Run audit"; issues panel shows categories | Fixture page shows all planted findings |
| 6 | Performance checks (feature-detected, Firefox N/A paths) | Chrome + Firefox both run |
| 7–8 | Export with `payload.audit`; MCP `get_audit`, `get_finding`, `compare_audits`; untrusted labelling | Claude Code fixes one planted issue from the file |
| 9 | "Re-run audit" in-panel diff; `e2e/site-audit.e2e.mjs` | e2e green in `check.mjs --full` |
| 10 | Demo on a real React app; docs page; `npm run ext:firefox` by hand | 3 verified fixes recorded |
| 11–14 | Demos with interviewees, paid-pilot ask (after B4), day-14 decision | Gate table in the sprint brief |

## 9. Risks and open questions

- **Selector drift** between runs makes "fixed" look like "fixed + new". Mitigated by the fallback match;
  measured in the e2e. If it stays noisy, verification is per-rule, not per-element.
- **Bundle size:** axe as a separate packaged file adds ~0.5 MB to the zip but nothing to the injected
  bundle until a run. Measure before release.
- **Manual re-scan friction** (B1 = A) may hurt the demo. That is a finding to bring back, and the trigger
  for Option B.
- **No DOM → component mapping.** Agents grep well from hints; a React dev-build fiber lookup is possible
  later but `_debugSource` is gone in React 19.
- **Scope:** four categories in ~8 build days for one maintainer is tight. If it slips, cut performance to
  LCP/CLS/transfer size and keep the verify loop whole — the loop is the product, the categories are not.
- **Not in this sprint:** hosted AI, autonomous edits, scheduled scans, crawling, multi-viewport runs,
  compliance claims, team features, Lighthouse.
