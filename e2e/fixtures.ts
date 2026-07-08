// TraceBug capture fixture wiring — exactly what docs/playwright.md tells
// users to do, except we import from source instead of "tracebug-sdk/playwright".
import { test as base } from "@playwright/test";
import { traceBugPage } from "../src/reporters/playwright";

export const test = base.extend({
  // traceBugPage uses structural types (so the SDK builds without Playwright
  // installed); the casts reconcile them with Playwright's concrete types.
  page: async ({ page }, use, testInfo) => {
    await traceBugPage({ page: page as never }, use as never, testInfo as never);
  },
});
export { expect } from "@playwright/test";
