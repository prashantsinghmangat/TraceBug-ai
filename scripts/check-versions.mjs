// Release gate: fail if any public surface disagrees with package.json's version.
// Run via `npm run check:versions` (also wired into `zip:ext` so a store zip can
// never be built with a stale manifest again — the exact drift that shipped
// v1.7/v1.8/v1.9 to three different surfaces at once).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");

const VERSION = JSON.parse(read("package.json")).version;
const MINOR_TAG = "v" + VERSION.split(".").slice(0, 2).join(".");

const checks = [
  {
    file: "tracebug-extension/manifest.json",
    actual: () => JSON.parse(read("tracebug-extension/manifest.json")).version,
    expected: VERSION,
  },
  {
    file: "packages/tracebug/package.json",
    actual: () => JSON.parse(read("packages/tracebug/package.json")).version,
    expected: VERSION,
  },
  {
    file: "packages/tracebug/server.json (top-level version)",
    actual: () => JSON.parse(read("packages/tracebug/server.json")).version,
    expected: VERSION,
  },
  {
    file: "packages/tracebug/server.json (npm package version)",
    actual: () => JSON.parse(read("packages/tracebug/server.json")).packages[0].version,
    expected: VERSION,
  },
  {
    file: "website/lib/version.ts (SDK_VERSION)",
    actual: () => read("website/lib/version.ts").match(/SDK_VERSION\s*=\s*"([^"]+)"/)?.[1],
    expected: VERSION,
  },
  {
    file: "website/lib/version.ts (SDK_VERSION_TAG)",
    actual: () => read("website/lib/version.ts").match(/SDK_VERSION_TAG\s*=\s*"([^"]+)"/)?.[1],
    expected: MINOR_TAG,
  },
  {
    file: "CHANGELOG.md (latest entry)",
    actual: () => read("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+)\]/m)?.[1],
    expected: VERSION,
  },
  {
    file: "docs/getting-started.md (offline .tgz example)",
    actual: () => read("docs/getting-started.md").match(/tracebug-sdk-(\d+\.\d+\.\d+)\.tgz/)?.[1],
    expected: VERSION,
  },
  // Identity drift guard: the store zip is built from build/manifest.base.json,
  // while tracebug-extension/manifest.json is the load-unpacked dev copy.
  // Editing one and not the other is how the store shipped a different product
  // name than the site — keep name + description in lockstep.
  {
    file: "tracebug-extension/build/manifest.base.json (name vs dev manifest)",
    actual: () => JSON.parse(read("tracebug-extension/build/manifest.base.json")).name,
    expected: JSON.parse(read("tracebug-extension/manifest.json")).name,
  },
  {
    file: "tracebug-extension/build/manifest.base.json (description vs dev manifest)",
    actual: () => JSON.parse(read("tracebug-extension/build/manifest.base.json")).description,
    expected: JSON.parse(read("tracebug-extension/manifest.json")).description,
  },
];

let failed = false;
for (const c of checks) {
  let actual;
  try {
    actual = c.actual();
  } catch (err) {
    actual = `<error: ${err.message}>`;
  }
  if (actual !== c.expected) {
    failed = true;
    console.error(`[FAIL] ${c.file}: expected ${c.expected}, found ${actual ?? "<not found>"}`);
  }
}

if (failed) {
  console.error(`\nVersion drift detected against package.json (${VERSION}). Fix before releasing.`);
  process.exit(1);
}
console.log(`[OK] all surfaces agree on ${VERSION}`);
