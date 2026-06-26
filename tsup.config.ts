import { defineConfig } from "tsup";

// Replace html2canvas with an empty stub in the Chrome-extension (IIFE) bundle.
// The extension captures screenshots via chrome.tabs.captureVisibleTab (full
// page) and captureVisibleTab+crop (region) — it NEVER loads html2canvas (that
// path runs only in plain-SDK context). So inlining its ~600KB into the
// content-script bundle is pure dead weight. loadHtml2Canvas() sees `default:
// null`, returns null, and the captureVisibleTab paths take over. No feature
// loss in the extension.
const stubHtml2Canvas = {
  name: "stub-html2canvas",
  setup(build: { onResolve: Function; onLoad: Function }) {
    build.onResolve({ filter: /^html2canvas$/ }, () => ({
      path: "html2canvas",
      namespace: "tb-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "tb-stub" }, () => ({
      contents: "export default null;",
      loader: "js",
    }));
  },
};

export default defineConfig([
  // ── Main SDK build (npm package) ──────────────────────────────────────
  // splitting: true so that `await import("html2canvas")` in screenshot.ts
  // becomes a separate chunk — loaded only when the user takes a screenshot,
  // not on every page that imports TraceBug. Applies to ESM only (tsup/esbuild
  // ignore it for CJS, which keeps CJS consumers' behaviour unchanged).
  // sourcemap: true so consumer apps can debug into SDK source during dev.
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: true,
    sourcemap: true,
    outDir: "dist",
  },
  // ── CLI build ─────────────────────────────────────────────────────────
  {
    entry: { bin: "cli/bin.ts" },
    format: ["esm"],
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    outDir: "dist",
    banner: { js: "#!/usr/bin/env node" },
    platform: "node",
    target: "node18",
    outExtension: () => ({ js: ".mjs" }),
  },
  // ── IIFE build for Chrome Extension ───────────────────────────────────
  // IIFE can't split chunks, so esbuild inlines every dynamic import. We stub
  // html2canvas (unused in the extension — see stubHtml2Canvas above) to drop
  // ~600KB. axe-core stays: it powers the a11y auto-scanner, an actual feature.
  {
    entry: { "tracebug-sdk": "src/index.ts" },
    format: ["iife"],
    globalName: "TraceBugModule",
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    esbuildPlugins: [stubHtml2Canvas],
    outDir: "tracebug-extension",
    outExtension: () => ({ js: ".js" }),
    footer: {
      js: `
        // Expose TraceBug on window for extension use (only once)
        if (typeof window !== 'undefined' && typeof TraceBugModule !== 'undefined' && !window.__TRACEBUG_LOADED__) {
          window.__TRACEBUG_LOADED__ = true;
          window.TraceBug = TraceBugModule.default || TraceBugModule;
          window.TraceBugSDK = TraceBugModule;
        }
      `,
    },
  },
]);
