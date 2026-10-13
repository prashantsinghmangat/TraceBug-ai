import { defineConfig } from "@playwright/test";

// E2E setup that dogfoods the TraceBug reporter (src/reporters/playwright.ts).
// `npx playwright test` runs e2e/demo-failure.spec.ts, which fails ON PURPOSE
// so the reporter writes a real bug-report .html to e2e/bug-reports/ — open it
// in a browser, or point the MCP server at it:
//   npx -y tracebug mcp --dir e2e/bug-reports
//
// User projects reference the published package instead:
//   reporter: [["list"], ["tracebug-sdk/playwright", { outputDir: "bug-reports" }]]
export default defineConfig({
  testDir: "./e2e",
  timeout: 15_000,
  use: {
    channel: "chrome", // system Chrome — no `playwright install` needed
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: [
    ["list"],
    ["./src/reporters/playwright.ts", { outputDir: "e2e/bug-reports" }],
  ],
  projects: [
    {
      // The dogfooding default: demo-failure.spec.ts fails ON PURPOSE so the
      // TraceBug reporter has something to write. Everything that is supposed
      // to pass has to live outside this project.
      name: "demo",
      testMatch: /demo-failure\.spec\.ts/,
    },
    {
      // Phase 8's smoke test. Its own project because the defaults above are
      // wrong for it in three ways:
      //  • `channel: "chrome"` — branded Chrome 137+ silently IGNORES
      //    --load-extension, so an extension test there passes by testing
      //    nothing. Bundled Chromium, always.
      //  • the TraceBug reporter would write a bug report for a real failure,
      //    which is noise on top of a failing smoke test.
      //  • 15s is not enough to launch a persistent context, register a
      //    service worker and run a capture.
      name: "extension-smoke",
      testMatch: /extension-smoke\.spec\.ts/,
      timeout: 90_000,
      use: {
        channel: "chromium",
        // Extensions need a persistent context, which the spec launches
        // itself; this only keeps Playwright from opening a second browser.
        headless: true,
      },
    },
  ],
});
