// ── TraceBug CLI ─────────────────────────────────────────────────────────
// Usage: npx tracebug init

const args = process.argv.slice(2)
const command = args[0]

const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

const HELP_FLAGS = new Set(['help', '--help', '-h'])
const VERSION_FLAGS = new Set(['version', '--version', '-v'])

async function main() {
  if (!command || HELP_FLAGS.has(command)) {
    printHelp()
    return
  }

  if (VERSION_FLAGS.has(command)) {
    console.log(await readVersion())
    return
  }

  if (command === 'init') {
    await initProject()
    return
  }

  if (command === 'mcp') {
    // `mcp --help` used to start the server and sit waiting on stdin.
    if (args.slice(1).some((a) => HELP_FLAGS.has(a))) {
      printMcpHelp()
      return
    }
    await startMcpServer()
    return
  }

  console.error(`Unknown command: ${command}. Run ${CYAN}npx tracebug --help${RESET}`)
  process.exitCode = 1
}

// package.json lives one level up in the SDK layout (dist/bin.mjs) but is a
// sibling in the standalone `tracebug` CLI package (packages/tracebug/bin.mjs).
async function readVersion(): Promise<string> {
  const fs = await import('fs')
  for (const rel of ['./package.json', '../package.json']) {
    try {
      const pkg = JSON.parse(fs.readFileSync(new URL(rel, import.meta.url), 'utf8'))
      if (pkg.version) return pkg.version
    } catch { /* try next location */ }
  }
  return '0.0.0'
}

async function startMcpServer() {
  const { runMcpServer } = await import('./mcp-server')
  const path = await import('path')

  // --dir <path> selects where exported bug reports live (default: cwd).
  // Without an explicit --dir, the server also auto-discovers reports in the
  // user's Downloads/Desktop, so the copy-pasted hand-off prompt just works.
  const dirFlag = args.indexOf('--dir')
  const hasExplicitDir = dirFlag !== -1 && !!args[dirFlag + 1]
  const baseDir = hasExplicitDir ? path.resolve(args[dirFlag + 1]) : process.cwd()

  await runMcpServer(baseDir, await readVersion(), !hasExplicitDir)
}

function printHelp() {
  console.log(`
${BOLD}TraceBug CLI${RESET} — Debug bugs in seconds, not hours

${BOLD}Commands:${RESET}
  ${CYAN}init${RESET}    Print the exact TraceBug setup for your framework (incl. the gotcha)
  ${CYAN}mcp${RESET}     Start the MCP server so AI agents (Claude Code, Cursor, Windsurf,
          VS Code) can read exported bug reports and audits. ${DIM}tracebug mcp --help${RESET}
  ${CYAN}help${RESET}    Show this help message (also ${DIM}--help${RESET}, ${DIM}-h${RESET})
  ${CYAN}version${RESET} Print the version (also ${DIM}--version${RESET}, ${DIM}-v${RESET})

${BOLD}Quick Start:${RESET}
  ${DIM}$${RESET} npx tracebug init
  ${DIM}$${RESET} npm run dev

${BOLD}Docs:${RESET} https://tracebug.dev/docs
`)
}

function printMcpHelp() {
  console.log(`
${BOLD}tracebug mcp${RESET} — local MCP server (stdio) for TraceBug exports

Your AI agent starts it; you don't run it by hand. Add it once:
  ${DIM}Claude Code:${RESET}  claude mcp add -s user tracebug -- npx -y tracebug mcp
  ${DIM}  on Windows:${RESET} claude mcp add -s user tracebug -- cmd /c npx -y tracebug mcp
  ${DIM}Cursor, Windsurf, VS Code:${RESET} https://tracebug.dev/docs/mcp

${BOLD}Where it looks for reports${RESET}
  Without --dir: the current folder (3 levels deep) plus your Downloads and
  Desktop folders (files named tracebug-…). With ${DIM}--dir <path>${RESET}: only that folder.
  If your browser saves somewhere else, pass that folder with --dir.

Nothing is uploaded: the server reads files from disk and opens no connections.
`)
}

async function initProject() {
  const fs = await import('fs')
  const path = await import('path')
  const cwd = process.cwd()
  const projectId = path.basename(cwd) || 'my-app'

  console.log(`\n${BOLD}${CYAN}TraceBug${RESET} — the exact setup for your framework`)
  console.log(`${DIM}(this prints the right snippet — it doesn't install or edit any files)${RESET}\n`)

  // Detect framework from package.json.
  let framework = 'vanilla'
  const pkgPath = path.join(cwd, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) framework = 'nextjs'
      else if (deps['nuxt']) framework = 'nuxt'
      else if (deps['@angular/core']) framework = 'angular'
      else if (deps['svelte']) framework = 'svelte'
      else if (deps['vue']) framework = 'vue'
      else if (deps['react']) framework = 'react'
    } catch {}
  }

  // Each guide leads with the snippet AND (for the tricky ones) the gotcha that
  // actually trips developers up — not just the two lines they could copy from
  // the docs. All snippets set `enabled: "auto"` (dev/staging only).
  const guides: Record<string, { snippet: string; gotcha?: string }> = {
    nextjs: {
      snippet: `// 1 — create app/tracebug.tsx
"use client";
import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) =>
      TraceBug.init({ projectId: "${projectId}", enabled: "auto" })
    );
  }, []);
  return null;
}

// 2 — mount it once inside <body> in app/layout.tsx:  <TraceBugInit />`,
      gotcha: `App Router components run on the server by default, but TraceBug is
  browser-only. It must live in a Client Component ("use client") and fire from
  useEffect — calling init() in a server component silently does nothing.`,
    },
    nuxt: {
      snippet: `// plugins/tracebug.client.ts   (the .client suffix is required)
import TraceBug from "tracebug-sdk";

export default defineNuxtPlugin(() => {
  TraceBug.init({ projectId: "${projectId}", enabled: "auto" });
});`,
      gotcha: `The ".client.ts" filename is what keeps TraceBug out of the SSR
  bundle — a plain tracebug.ts would try to run during server render and crash.`,
    },
    svelte: {
      snippet: `<!-- src/routes/+layout.svelte -->
<script>
  import { onMount } from "svelte";
  import TraceBug from "tracebug-sdk";
  onMount(() => TraceBug.init({ projectId: "${projectId}", enabled: "auto" }));
</script>`,
      gotcha: `Use onMount — it only runs in the browser, keeping TraceBug out of
  SvelteKit's SSR pass. A top-level init() call would break the server render.`,
    },
    react: {
      snippet: `// src/main.tsx  (your app entry file)
import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "${projectId}", enabled: "auto" });`,
    },
    vue: {
      snippet: `// src/main.ts  (your app entry file)
import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "${projectId}", enabled: "auto" });`,
    },
    angular: {
      snippet: `// src/main.ts  (before bootstrapApplication / bootstrapModule)
import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "${projectId}", enabled: "auto" });`,
    },
    vanilla: {
      snippet: `<!-- add before </body> -->
<script type="module">
  import TraceBug from "tracebug-sdk";
  TraceBug.init({ projectId: "${projectId}", enabled: "auto" });
</script>`,
    },
  }

  const guide = guides[framework]
  console.log(`  Detected framework: ${GREEN}${framework}${RESET}\n`)

  console.log(`${BOLD}1. Install the SDK${RESET}`)
  console.log(`   ${CYAN}npm install tracebug-sdk${RESET}\n`)

  console.log(`${BOLD}2. Add this yourself${RESET}`)
  console.log(`${DIM}───────────────────────────────────────────────────${RESET}`)
  console.log(guide.snippet)
  console.log(`${DIM}───────────────────────────────────────────────────${RESET}\n`)

  if (guide.gotcha) {
    console.log(`${YELLOW}${BOLD}⚠ Heads up (${framework}):${RESET}${YELLOW} ${guide.gotcha}${RESET}\n`)
  }

  console.log(`${DIM}  enabled: "auto" loads TraceBug in dev & staging only — it never ships
  to your production users. Set enabled: true to force it on.${RESET}\n`)

  console.log(`${BOLD}3. Run your app${RESET}, reproduce a bug, then click ${BOLD}Export .html${RESET} on the toolbar.\n`)

  console.log(`${DIM}Hand the exported report to your AI agent:${RESET}  ${CYAN}npx tracebug mcp${RESET}`)
  console.log(`${DIM}Full guide:${RESET}  https://tracebug.dev/docs/getting-started\n`)
}

main().catch(console.error)
