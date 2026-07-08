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
});
