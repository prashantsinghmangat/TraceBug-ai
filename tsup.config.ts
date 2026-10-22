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

// Same treatment for rrweb: the extension will record DOM in the page context
// via its own path (not this content-script bundle), so inlining rrweb's
// recorder here is dead weight. rrweb-recorder.ts's loadRrweb() sees a null
// `record` export and returns false → DOM capture no-ops and screen recording
// takes over. No feature loss in the extension.
const stubRrweb = {
  name: "stub-rrweb",
  setup(build: { onResolve: Function; onLoad: Function }) {
    build.onResolve({ filter: /^rrweb$/ }, () => ({
      path: "rrweb",
      namespace: "tb-stub-rrweb",
    }));
    build.onLoad({ filter: /.*/, namespace: "tb-stub-rrweb" }, () => ({
      contents: "export const record = null; export default { record: null };",
      loader: "js",
    }));
  },
};

// The ~137 KB inlined rrweb-player runtime is only needed to *generate* a
// DOM-replay .html. IIFE can't code-split, so without this it would inline into
// the content-script bundle as dead weight (the extension never produces rrweb
// exports — the recorder above is stubbed). Empty it out; buildReplayHtml() then
// sees no player JS and keeps the video/screenshot path.
const stubRrwebRuntime = {
  name: "stub-rrweb-runtime",
  setup(build: { onLoad: Function }) {
    build.onLoad({ filter: /rrweb-runtime\.generated\.ts$/ }, () => ({
      contents: "export const RRWEB_JS = ''; export const RRWEB_CSS = '';",
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
  // ── Playwright reporter (Node-side, subpath export ./playwright) ──────
  {
    entry: { playwright: "src/reporters/playwright.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: false,
    splitting: false,
    sourcemap: false,
    outDir: "dist",
    platform: "node",
    target: "node18",
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
  // ── Provider API bundle for the extension's background worker ─────────
  // Phase 2b moved every provider call into the service worker, which cannot
  // import the page SDK. Rather than hand-duplicate ~200 lines of fetch and
  // parse logic (model ids, API-version headers, error mapping) in plain JS,
  // the shared layer in src/providers/api.ts is bundled here as an IIFE that
  // publishes `TraceBugProviderAPI`. background.js loads it with
  // importScripts() on Chrome and as a background script on Firefox.
  //
  // src/providers/api.ts must stay free of DOM, window and localStorage for
  // this to run in a worker — see the header comment in that file.
  {
    entry: { "tracebug-provider-api": "src/providers/api.ts" },
    format: ["iife"],
    globalName: "TraceBugProviderAPI",
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    outDir: "tracebug-extension",
    outExtension: () => ({ js: ".js" }),
  },
  // ── IIFE build, page mode (window.TraceBug) ───────────────────────────
  // IIFE can't split chunks, so esbuild inlines every dynamic import. We stub
  // html2canvas (unused in the extension — see stubHtml2Canvas above) to drop
  // ~600KB. axe-core stays: it powers the a11y auto-scanner, an actual feature.
  //
  // rrweb (recorder) and the inlined replay runtime are NOT stubbed here: the
  // extension records DOM in the page context and embeds the same DOM-replay in
  // its .html exports as the npm SDK. This adds rrweb to the content-script
  // bundle (~0.5 MB); a future optimization can lazy-load it from a packaged
  // web-accessible resource instead of inlining. (stubRrweb / stubRrwebRuntime
  // remain defined above so this is a one-line revert if needed.)
  //
  // Despite living in tracebug-extension/, this file is NOT what the extension
  // injects into a page (see the tracebug-sdk-ext entry below) — it's the
  // npm/page-mode build, published under window.TraceBug. `npm run build:ext`
  // also copies it to website/public/tracebug-sdk.js for the website's own
  // opt-in in-page demo. Kept unchanged by Bug 0's fix on purpose: any real
  // app embedding this as a plain <script> tag keeps working exactly as
  // before. See docs/launch/sdk-isolation-1.11.2.md.
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
        // Expose TraceBug on window for page-mode use (only once)
        if (typeof window !== 'undefined' && typeof TraceBugModule !== 'undefined' && !window.__TRACEBUG_LOADED__) {
          window.__TRACEBUG_LOADED__ = true;
          window.TraceBug = TraceBugModule.default || TraceBugModule;
          window.TraceBugSDK = TraceBugModule;
        }
      `,
    },
  },
  // ── IIFE build, extension mode (window.__TraceBugExtension) ───────────
  // The SAME source (src/index.ts), built again under its own global so the
  // extension's injected copy can never collide with a host page's own
  // window.TraceBug (Bug 0 — docs/launch/sdk-isolation-1.11.2.md). Whichever
  // copy's footer runs first used to win window.TraceBug for the rest of the
  // page's life, silently dropping the extension's init({transport:
  // "extension"}) call when a page embedded its own SDK first. This build is
  // what background.js's injectPageWorld() actually injects — the entry
  // above is never used for that. tracebug-init.js talks ONLY to this global.
  {
    entry: { "tracebug-sdk-ext": "src/index.ts" },
    format: ["iife"],
    globalName: "TraceBugExtensionModule",
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    esbuildPlugins: [stubHtml2Canvas],
    outDir: "tracebug-extension",
    outExtension: () => ({ js: ".js" }),
    footer: {
      js: `
        // Expose under a name no page script could collide with by accident —
        // entirely independent of window.__TRACEBUG_LOADED__ above.
        if (typeof window !== 'undefined' && typeof TraceBugExtensionModule !== 'undefined' && !window.__TRACEBUG_EXT_LOADED__) {
          window.__TRACEBUG_EXT_LOADED__ = true;
          window.__TraceBugExtension = TraceBugExtensionModule.default || TraceBugExtensionModule;
          window.__TraceBugExtensionSDK = TraceBugExtensionModule;
        }
      `,
    },
  },
]);
