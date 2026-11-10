// ─────────────────────────────────────────────────────────────────
// Site config: every link and repeated product string in one place.
// Change a value here and every component that uses it follows.
//
// Look and feel lives elsewhere, also in one place each:
//   - colours, fonts, type sizes, section spacing → app/globals.css (:root / .dark)
//   - how those tokens map to Tailwind classes   → tailwind.config.ts
// ─────────────────────────────────────────────────────────────────

export const SITE = {
  name: "TraceBug",
  domain: "tracebug.dev",
  shortcut: ["Alt", "B"] as const,
  demoLength: "57-second",
} as const;

export const LINKS = {
  chrome: "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj",
  firefox: "https://addons.mozilla.org/firefox/addon/tracebug-bug-reports-for-ai/",
  repo: "https://github.com/prashantsinghmangat/tracebug-ai",
  npm: "https://www.npmjs.com/package/tracebug-sdk",
  productHuntPostId: "1201128",
  docs: "/docs",
  mcpAnchor: "#mcp",
  demoAnchor: "#demo",
} as const;

export const MCP = {
  claudeCode: "claude mcp add -s user tracebug -- npx -y tracebug mcp",
  npmInstall: "npm i tracebug-sdk",
} as const;
