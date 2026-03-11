import { defineConfig } from "tsup";

export default defineConfig([
  // ── Main SDK build (npm package) ──────────────────────────────────────
  {
    entry: ["src/index.ts"],
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: false,
    outDir: "dist",
  },
  // ── IIFE build for Chrome Extension ───────────────────────────────────
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
