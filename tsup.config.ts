import { defineConfig } from "tsup";

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
  // NOTE: This bundle is ~2.5MB because IIFE format cannot split chunks, so
  // esbuild inlines every dynamic import — html2canvas AND axe-core — into the
  // single content-script file. Marking them `external` is a no-op for IIFE
  // (there's no runtime loader to resolve the import). Shrinking this requires
  // stubbing those modules via an esbuild plugin, which also drops a11y
  // scanning from the extension — a product call, tracked separately.
  {
    entry: { "tracebug-sdk": "src/index.ts" },
    format: ["iife"],
    globalName: "TraceBugModule",
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
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
