# Playwright Reporter — Bug Reports From Failed Tests

Every failed Playwright test becomes a self-contained TraceBug `.html` bug report — the same artifact the Chrome extension exports, readable by the same [MCP server](mcp.md). Upload the folder as a CI artifact and any developer can hand the failure straight to their coding agent.

**No cloud viewer, no account, no upload.** The report opens as a full interactive replay in any browser, and `npx -y tracebug mcp` serves it to Claude Code / Cursor. Nobody else captures bugs from test runs this way — cloud-based tools can't attach their viewer to a CI artifact.

## Setup (two lines)

```ts
// playwright.config.ts
export default defineConfig({
  reporter: [
    ["list"],
    ["tracebug-sdk/playwright", { outputDir: "bug-reports" }],
  ],
});
```

Install the SDK as a dev dependency if you haven't:

```bash
npm i -D tracebug-sdk
```

That's it. Reporter-only mode already captures: the assertion error with stack + code snippet, the test step timeline (as repro steps), Playwright's failure screenshot (enable `screenshot: "only-on-failure"` in `use`), project/browser metadata, and a root-cause hint.

## Richer reports: page console + network (optional, one more line)

Wire the capture fixture so reports also include everything the page did — console output, page errors, network requests with failed-response bodies, and navigations:

```ts
// tests/fixtures.ts
import { test as base } from "@playwright/test";
import { traceBugPage } from "tracebug-sdk/playwright";

export const test = base.extend({ page: traceBugPage });
export { expect } from "@playwright/test";
```

Then import `test`/`expect` from `./fixtures` instead of `@playwright/test` in your specs. The fixture attaches its capture only on failure — passing runs stay artifact-free — and caps each list at 500 entries so a chatty app can't bloat the artifact.

## CI: upload the reports as artifacts

```yaml
# .github/workflows/e2e.yml
- name: Run Playwright tests
  run: npx playwright test

- name: Upload TraceBug reports
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: tracebug-reports
    path: bug-reports/
```

## Debug a failure with your coding agent

Download the artifact into your repo and:

```bash
claude mcp add tracebug -- npx -y tracebug mcp --dir ./bug-reports   # once
```

Then in Claude Code: **`/tracebug:debug_bug_report`** — the agent reads the failure's console errors, the 500 that preceded it, the step timeline, and the screenshot, then cross-references your code and proposes the fix. Or just open the `.html` in a browser and use the **AI tab → Copy prompt**.

The reporter prints this hand-off at the end of every failing run:

```
[TraceBug] 1 bug report written:
  → bug-reports/tracebug-test-vendor-can-be-saved-2026-07-08T17-01-12.html
  Debug with your coding agent: claude mcp add tracebug -- npx -y tracebug mcp --dir bug-reports
  then /tracebug:debug_bug_report — or open the .html in a browser.
```

## What ends up in the report

| Section | Source |
|---|---|
| Title / summary | Test title + first assertion error line |
| Description | Full error message + Playwright code snippet + test file:line |
| Repro steps & timeline | `test.step()` hierarchy and `pw:api` calls, errors flagged |
| Console | Page `console.*` + uncaught page errors (fixture) + runner errors |
| Network | Every request; failures keep a 500-char response-body snippet (fixture) |
| Screenshots | Any image attachment — Playwright's screenshot-on-failure just works |
| Root-cause hint | Local heuristic: 5xx → high confidence, 4xx/page error → medium, assertion-only → low |

## Options

| Option | Default | Description |
|---|---|---|
| `outputDir` | `"bug-reports"` | Where the `.html` reports are written |

Behavior notes: reports are written only for the **final retry** of a failing test (no duplicates), `skipped`/`interrupted` tests are ignored, and a reporter error can never fail your test run.

## Cypress?

On the roadmap — the artifact format is runner-agnostic, so a Cypress plugin only needs to assemble the same payload. Open an issue if you want it prioritized.
