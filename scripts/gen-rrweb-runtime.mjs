// Codegen: bake rrweb's core Replayer bundle + CSS into a TS module the HTML
// exporter inlines into each .html replay. Run when bumping rrweb:
//   node scripts/gen-rrweb-runtime.mjs   (or: npm run gen:rrweb)
//
// We use rrweb's *core* Replayer (window.rrweb.Replayer) rather than
// rrweb-player — the latter's Svelte shell mounts but fails to build its inner
// replayer in the offline file:// context. The export supplies its own small
// control bar around the core Replayer.
//
// The runtime is inlined (not CDN) so exports stay self-contained and offline,
// and it's imported *lazily* by html-replay.ts, so this ~266 KB only loads when
// a DOM-replay export is actually generated — the core SDK bundle is unaffected.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const js = readFileSync(resolve(root, "node_modules/rrweb/dist/rrweb.umd.min.cjs"), "utf8");
const css = readFileSync(resolve(root, "node_modules/rrweb/dist/style.min.css"), "utf8");

const out = `// ⚠️ GENERATED — do not edit. Regenerate with: node scripts/gen-rrweb-runtime.mjs
// rrweb's core Replayer bundle + CSS, inlined into DOM-replay .html exports.
// Lazy-imported by html-replay.ts so it never weighs down the core SDK bundle.
/* eslint-disable */
export const RRWEB_JS = ${JSON.stringify(js)};
export const RRWEB_CSS = ${JSON.stringify(css)};
`;

const target = resolve(root, "src/exporters/rrweb-runtime.generated.ts");
writeFileSync(target, out, "utf8");
console.log(`[OK] wrote ${target} (js ${(js.length / 1024).toFixed(0)} KB, css ${(css.length / 1024).toFixed(1)} KB)`);
