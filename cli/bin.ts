// ── TraceBug CLI ─────────────────────────────────────────────────────────
// Usage: npx tracebug init

const args = process.argv.slice(2)
const command = args[0]

const BOLD = '\x1b[1m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

async function main() {
  if (!command || command === 'help') {
    printHelp()
    return
  }

  if (command === 'init') {
    await initProject()
    return
  }

  console.log(`Unknown command: ${command}. Run ${CYAN}npx tracebug help${RESET}`)
}

function printHelp() {
  console.log(`
${BOLD}TraceBug CLI${RESET} — Debug bugs in seconds, not hours

${BOLD}Commands:${RESET}
  ${CYAN}init${RESET}    Set up TraceBug in your project
  ${CYAN}help${RESET}    Show this help message

${BOLD}Quick Start:${RESET}
  ${DIM}$${RESET} npx tracebug init
  ${DIM}$${RESET} npm run dev

${BOLD}Docs:${RESET} https://tracebug.dev/docs
`)
}

async function initProject() {
  console.log(`\n${BOLD}${CYAN}TraceBug${RESET} — Setting up bug reporting\n`)

  // Detect framework
  const fs = await import('fs')
  const path = await import('path')
  const cwd = process.cwd()

  let framework = 'vanilla'
  const pkgPath = path.join(cwd, 'package.json')

  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) framework = 'nextjs'
      else if (deps['nuxt']) framework = 'nuxt'
      else if (deps['vue']) framework = 'vue'
      else if (deps['@angular/core']) framework = 'angular'
      else if (deps['svelte']) framework = 'svelte'
      else if (deps['react']) framework = 'react'
    } catch {}
  }

  console.log(`  Detected framework: ${GREEN}${framework}${RESET}`)

  // Print setup instructions
  const snippets: Record<string, string> = {
    nextjs: `// app/tracebug.tsx (create this file)
"use client";
import { useEffect } from "react";

export default function TraceBugInit() {
  useEffect(() => {
    import("tracebug-sdk").then(({ default: TraceBug }) => {
      TraceBug.init({ projectId: "${path.basename(cwd)}" });
    });
  }, []);
  return null;
}

// Then add <TraceBugInit /> to your root layout.tsx`,

    react: `// src/main.tsx (add to your entry file)
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "${path.basename(cwd)}" });`,

    vue: `// main.ts (add to your entry file)
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "${path.basename(cwd)}" });`,

    svelte: `<!-- +layout.svelte (add to your root layout) -->
<script>
  import { onMount } from 'svelte';
  import TraceBug from 'tracebug-sdk';
  onMount(() => TraceBug.init({ projectId: "${path.basename(cwd)}" }));
</script>`,

    angular: `// app.component.ts (add to constructor or ngOnInit)
import TraceBug from "tracebug-sdk";
TraceBug.init({ projectId: "${path.basename(cwd)}" });`,

    vanilla: `<!-- Add before </body> -->
<script type="module">
  import TraceBug from "tracebug-sdk";
  TraceBug.init({ projectId: "${path.basename(cwd)}" });
</script>`,

    nuxt: `// plugins/tracebug.client.ts (create this file)
import TraceBug from "tracebug-sdk";
export default defineNuxtPlugin(() => {
  TraceBug.init({ projectId: "${path.basename(cwd)}" });
});`,
  }

  console.log(`\n${BOLD}Add this to your project:${RESET}\n`)
  console.log(`${DIM}───────────────────────────────────────${RESET}`)
  console.log(snippets[framework])
  console.log(`${DIM}───────────────────────────────────────${RESET}`)

  console.log(`
${BOLD}Next steps:${RESET}
  1. Install the SDK:  ${CYAN}npm install tracebug-sdk${RESET}
  2. Add the snippet above to your app
  3. Run your dev server and interact with your app
  4. Click the TraceBug toolbar to see captured sessions

${BOLD}Cloud mode${RESET} (optional — team dashboards):
  Add your API key:  ${CYAN}TraceBug.init({ projectId: "...", apiKey: "tb_live_..." })${RESET}

${GREEN}Done!${RESET} TraceBug is ready. Happy debugging.
`)
}

main().catch(console.error)
