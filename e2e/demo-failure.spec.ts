// Intentionally failing test — a live demo of the TraceBug reporter.
// The page fires a PUT that we mock to a 500, logs a TypeError, and never
// shows the success toast the assertion waits for. The resulting report in
// e2e/bug-reports/ carries all three signals plus the failure screenshot.
import { test, expect } from "./fixtures";

const PAGE = `<!DOCTYPE html>
<html><body>
  <h1>Vendor editor (demo)</h1>
  <button id="save">Save</button>
  <div id="toast"></div>
  <script>
    document.getElementById("save").addEventListener("click", async () => {
      const res = await fetch("/api/vendors/42", { method: "PUT" });
      if (!res.ok) {
        console.error("TypeError: cannot read properties of undefined (reading 'id')");
        document.getElementById("toast").textContent = "Error";
        return;
      }
      document.getElementById("toast").textContent = "Saved";
    });
  </script>
</body></html>`;

test("vendor save shows success toast (intentional failure — demos the reporter)", async ({ page }) => {
  // Fully mocked site: the document and its API live behind page.route,
  // so the demo needs no server and no network.
  await page.route("**/api/vendors/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"ValidationError: taxId is required"}',
    }),
  );
  await page.route("**/vendors/42/edit", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: PAGE }),
  );

  await page.goto("https://demo.tracebug.test/vendors/42/edit");

  await test.step("save the vendor", async () => {
    await page.click("#save");
  });

  await expect(page.locator("#toast")).toHaveText("Saved", { timeout: 2_000 });
});
