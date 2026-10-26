// ── Harness fixture: an extension copy with site access already granted ─────
// Phase 1 moved `<all_urls>` from `host_permissions` to
// `optional_host_permissions`, so a fresh install has NO site access until the
// user grants it from the popup. That is the point of the change — and it
// breaks every harness here, for a reason worth writing down:
//
//   * In production, injection starts with a real toolbar click, and that click
//     is what grants `activeTab`. These harnesses skip the click and drive
//     `chrome.scripting.executeScript` from the service worker instead, so they
//     have no access at all: "Extension manifest must request permission to
//     access the respective host".
//   * Chrome auto-grants *declared* `host_permissions` to an unpacked
//     extension, but an OPTIONAL permission needs `permissions.request()` from
//     a foreground extension page, which raises a native dialog. Playwright
//     cannot click a native dialog, and the service worker cannot call
//     `permissions.request()` at all.
//
// So the harness asks for the state it actually wants to test: a user who has
// granted site access (which is also what every existing user is after the
// upgrade). This writes a COPY to a temp directory and re-declares `<all_urls>`
// as required there. The shipped build is never modified, and nothing about the
// install warning is affected — that is a property of the real manifest, which
// these suites do not assert.
//
// The *withheld*-access path is deliberately not covered here: it needs the
// permission dialog a human has to click. It is the manual script in
// docs/testing/upgrade-host-permission.md.

import { cpSync, readFileSync, writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Copy a built extension directory and declare `<all_urls>` as a required host
 * permission in the copy.
 *
 * @param {string} extDir  directory holding the manifest to copy
 * @param {string} [label] short name, used in the temp directory name
 * @returns {string} path to the copy — pass this to --load-extension
 */
export function withGrantedHostAccess(extDir, label = "ext") {
  const manifestPath = join(extDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no manifest.json in ${extDir} — run: npm run build (or build:ext)`);
  }

  const dest = join(mkdtempSync(join(tmpdir(), `tb-granted-${label}-`)), "extension");
  cpSync(extDir, dest, { recursive: true });

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  // Idempotent: a 1.10.x build already declares this, and re-declaring is a
  // no-op rather than an error, which keeps the upgrade harness simple.
  manifest.host_permissions = ["<all_urls>"];
  // Leave optional_host_permissions alone. A pattern can appear in both keys,
  // and the per-provider origins are still requested the way they are shipped.
  writeFileSync(join(dest, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  return dest;
}

/**
 * Same idea as withGrantedHostAccess, for the `tabCapture` optional
 * permission (1.11.3's no-picker Tab record mode). The real grant flow is
 * `chrome.permissions.request()` from a popup click — a native dialog
 * Playwright cannot click, same limitation as `<all_urls>` above. Also
 * grants `<all_urls>` host access, since Tab-mode e2e needs the same
 * content-script injection access the video suite already relies on.
 *
 * @param {string} extDir
 * @param {string} [label]
 * @returns {string} path to the copy — pass this to --load-extension
 */
export function withGrantedTabCapture(extDir, label = "ext") {
  const dest = withGrantedHostAccess(extDir, label);
  const manifestPath = join(dest, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const optional = Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : [];
  manifest.optional_permissions = optional.filter((p) => p !== "tabCapture");
  manifest.permissions = [...new Set([...(manifest.permissions || []), "tabCapture"])];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return dest;
}
