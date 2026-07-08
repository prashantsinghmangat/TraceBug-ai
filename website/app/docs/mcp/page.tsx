import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

const REPO = "https://github.com/prashantsinghmangat/tracebug-ai";

export const metadata: Metadata = {
  title: "MCP Server — Let AI Agents Debug Your Bug Reports — TraceBug",
  description:
    "TraceBug ships a local Model Context Protocol (MCP) server. Claude Code, Cursor, Windsurf, and VS Code read your exported bug reports — console errors, network failures, repro steps, screenshots — and propose the fix. Fully local, nothing uploaded.",
  openGraph: {
    title: "TraceBug MCP Server — AI Agents Debug Your Bug Reports",
    description:
      "The only bug-reporting MCP server that runs locally. Your coding agent reads the .html export from disk — no account, no cloud, no upload.",
  },
};

export default function McpDocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Page header */}
          <div className="mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Documentation · MCP Server
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">
              Let AI Agents Debug Your Bug Reports
            </h1>
            <p className="text-text-muted text-lg leading-relaxed">
              TraceBug ships a local{" "}
              <a
                href="https://modelcontextprotocol.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 transition-colors"
              >
                Model Context Protocol
              </a>{" "}
              server. It exposes your exported bug reports to AI coding agents —{" "}
              <strong className="text-text-primary">
                Claude Code, Cursor, Windsurf, VS Code
              </strong>
              , or any MCP client — so the agent can read the console errors,
              network failures, repro steps, and screenshots, find the offending
              code in your repo, and propose the fix.
            </p>
          </div>

          {/* Quick start */}
          <div className="code-block p-4 rounded-xl mb-6">
            <div className="flex items-center gap-2 mb-3 text-text-muted text-xs">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="ml-2">Terminal</span>
            </div>
            <pre className="text-text-primary font-mono text-sm">
              <span className="text-text-muted">$ </span>
              <span className="text-success">npx</span>
              <span className="text-text-primary"> tracebug mcp --dir ./bug-reports</span>
            </pre>
          </div>

          {/* The differentiator callout */}
          <div className="bg-surface border border-accent/30 rounded-xl p-6 mb-12">
            <h3 className="text-text-primary font-semibold mb-2">
              🔒 Everything stays on your machine
            </h3>
            <p className="text-text-muted text-sm leading-relaxed">
              The server reads the same self-contained{" "}
              <code className="text-primary bg-background px-1 rounded">.html</code>{" "}
              files TraceBug already exports — no account, no cloud, no upload.
              This is the difference from every other bug-reporting tool&apos;s
              MCP server: theirs are hosted services that require your bug data
              to live in their cloud first. TraceBug&apos;s runs locally over
              stdio and opens <strong className="text-text-primary">zero network connections</strong>.
            </p>
          </div>

          {/* Table of Contents */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-4">
              On this page
            </h2>
            <ul className="space-y-2">
              {[
                { href: "#workflow", label: "The Workflow" },
                { href: "#handoff-prompt", label: "The Hand-off Prompt" },
                { href: "#setup", label: "Setup (Claude Code, Cursor, VS Code)" },
                { href: "#tools", label: "Tools" },
                { href: "#files", label: "What Files Does It Read?" },
                { href: "#try-it", label: "Try It Right Now" },
                { href: "#privacy", label: "Privacy" },
                { href: "#troubleshooting", label: "Troubleshooting" },
              ].map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="text-accent hover:text-accent/80 transition-colors text-sm"
                  >
                    → {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Workflow */}
          <section id="workflow" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                1
              </span>
              The Workflow
            </h2>
            <div className="space-y-4">
              {[
                {
                  step: "1",
                  text: "A tester captures a bug and exports the report (Quick Bug → Export HTML). That one .html file contains everything: replay, console, network, user actions, screenshots, root-cause hint.",
                },
                {
                  step: "2",
                  text: "The tester hands the file to a developer (Slack, email, ticket attachment — it's just a file).",
                },
                {
                  step: "3",
                  text: "The developer drops it in a folder (e.g. bug-reports/ in the repo) and asks their coding agent: \"Use the tracebug tools to list my bug reports and debug the first one.\"",
                },
                {
                  step: "4",
                  text: "The agent reads the report, correlates the stack trace with the failed request, finds the actual source file, and proposes a fix — with full context a pasted screenshot could never carry.",
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex items-start gap-4 p-4 bg-surface border border-border rounded-lg"
                >
                  <span className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0 mt-0.5">
                    {item.step}
                  </span>
                  <p className="text-text-muted text-sm leading-relaxed">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Hand-off prompt */}
          <section id="handoff-prompt" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                2
              </span>
              The Hand-off Prompt
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              The fastest way to kick off an agent debugging session is to paste
              this into Claude Code / Cursor (opened in the codebase that owns
              the bug):
            </p>
            <div className="code-block p-5 rounded-xl overflow-x-auto mb-6">
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`This is a TraceBug bug report export: <report-file.html>

1. Call get_bug_report("<report-file.html>") to load the report
   overview and its investigation guide.
2. Follow the investigation guide to gather the relevant data
   (console errors, network failures, repro steps, screenshots).
3. Cross-reference the findings with this codebase to identify
   the root cause and propose a fix.`}
              </pre>
            </div>
            <p className="text-text-muted mb-4 leading-relaxed">
              You rarely have to type it yourself — TraceBug puts it in front of
              you at every hand-off point:
            </p>
            <div className="space-y-4">
              {[
                {
                  icon: "🧩",
                  title: "The extension shows it after every Export .html",
                  desc: "Already copied to your clipboard, so the tester can paste it straight into a Slack message next to the file.",
                },
                {
                  icon: "📄",
                  title: "The exported .html itself carries it",
                  desc: "The recipient opens the file, clicks the AI tab, and hits Copy prompt. The file is self-advertising: whoever receives it learns how to feed it to their agent.",
                },
                {
                  icon: "⚡",
                  title: "It's a first-class MCP prompt",
                  desc: "In Claude Code, type /tracebug:debug_bug_report (optionally passing a filename); any MCP client with a prompt picker will surface it. No copy-paste at all.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-4 bg-surface border border-border rounded-lg"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <div>
                      <h3 className="text-text-primary font-semibold text-sm mb-1">
                        {item.title}
                      </h3>
                      <p className="text-text-muted text-xs leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 mt-6">
              <p className="text-text-muted text-sm leading-relaxed">
                <span className="text-accent font-semibold">Investigation guide:</span>{" "}
                <code className="text-primary bg-background px-1 rounded">get_bug_report</code>{" "}
                responses include a prioritized list of next steps computed from
                what the report actually contains (e.g.{" "}
                <em>&quot;[HIGH] get_network_activity — 2 failed requests captured,
                with response-body snippets that often name the server-side
                error&quot;</em>). The agent spends its tool calls on the data that
                matters for that specific bug instead of guessing.
              </p>
            </div>
          </section>

          {/* Setup */}
          <section id="setup" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                3
              </span>
              Setup
            </h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Claude Code
                </h3>
                <p className="text-text-muted text-sm mb-3">
                  One-liner (global — works in every project):
                </p>
                <div className="code-block p-4 rounded-xl mb-4">
                  <pre className="text-text-primary font-mono text-sm">
                    <span className="text-text-muted">$ </span>
                    <span className="text-success">claude</span>
                    <span className="text-text-primary"> mcp add tracebug -- npx tracebug mcp --dir ./bug-reports</span>
                  </pre>
                </div>
                <p className="text-text-muted text-sm mb-3">
                  Or per-project via{" "}
                  <code className="text-primary bg-background px-1 rounded">.mcp.json</code>{" "}
                  in the repo root (committed, so the whole team gets it):
                </p>
                <div className="code-block p-5 rounded-xl overflow-x-auto">
                  <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`{
  "mcpServers": {
    "tracebug": {
      "command": "npx",
      "args": ["tracebug", "mcp", "--dir", "bug-reports"]
    }
  }
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Cursor
                </h3>
                <p className="text-text-muted text-sm mb-3">
                  Settings → MCP → <strong className="text-text-primary">Add new MCP server</strong>:
                </p>
                <div className="bg-surface border border-border rounded-xl p-4 mb-3">
                  <ul className="space-y-1 text-text-muted text-sm font-mono">
                    <li>
                      <span className="text-text-primary font-sans font-semibold">Command:</span>{" "}
                      npx
                    </li>
                    <li>
                      <span className="text-text-primary font-sans font-semibold">Args:</span>{" "}
                      tracebug mcp --dir ./bug-reports
                    </li>
                  </ul>
                </div>
                <p className="text-text-muted text-sm">
                  Or add the same{" "}
                  <code className="text-primary bg-background px-1 rounded">mcpServers</code>{" "}
                  block to{" "}
                  <code className="text-primary bg-background px-1 rounded">.cursor/mcp.json</code>.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  VS Code (GitHub Copilot agent mode)
                </h3>
                <p className="text-text-muted text-sm mb-3">
                  Add to{" "}
                  <code className="text-primary bg-background px-1 rounded">.vscode/mcp.json</code>:
                </p>
                <div className="code-block p-5 rounded-xl overflow-x-auto">
                  <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`{
  "servers": {
    "tracebug": {
      "type": "stdio",
      "command": "npx",
      "args": ["tracebug", "mcp", "--dir", "bug-reports"]
    }
  }
}`}
                  </pre>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-text-primary mb-3">
                  Any other MCP client
                </h3>
                <p className="text-text-muted text-sm mb-3">
                  The server speaks standard MCP over stdio. Point the client at:
                </p>
                <div className="code-block p-4 rounded-xl mb-3">
                  <pre className="text-text-primary font-mono text-sm">
                    <span className="text-text-muted">$ </span>
                    <span className="text-success">npx</span>
                    <span className="text-text-primary"> tracebug mcp [--dir &lt;path&gt;]</span>
                  </pre>
                </div>
                <p className="text-text-muted text-sm">
                  <code className="text-primary bg-background px-1 rounded">--dir</code>{" "}
                  sets where bug reports live (default: the current working
                  directory). The scanner searches up to 3 levels deep and skips{" "}
                  <code className="text-primary bg-background px-1 rounded text-xs">node_modules</code>,{" "}
                  <code className="text-primary bg-background px-1 rounded text-xs">.git</code>,
                  build output, and dot-directories.
                </p>
              </div>
            </div>
          </section>

          {/* Tools */}
          <section id="tools" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6 flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary text-sm font-bold">
                4
              </span>
              Tools
            </h2>
            <div className="space-y-2 mb-6">
              {[
                {
                  sig: "list_bug_reports",
                  desc: "Every TraceBug export under the directory: title, summary, severity, priority, root-cause hint, and counts of captured data. Agents start here.",
                },
                {
                  sig: "get_bug_report",
                  desc: "Overview of one report: environment, tester annotations, description, plus the investigation guide — a prioritized list of which tools to call next for this specific bug.",
                },
                {
                  sig: "get_console_errors",
                  desc: "Full console capture (errors / warnings / logs) with stack traces.",
                },
                {
                  sig: "get_network_activity",
                  desc: "Failed requests with response-body snippets by default; pass failuresOnly: false for every captured request.",
                },
                {
                  sig: "get_repro_steps",
                  desc: "Plain-English reproduction steps, structured user actions (including rage-click / dead-click frustration signals), and the full session timeline.",
                },
                {
                  sig: "get_screenshot",
                  desc: "A screenshot as real image content the agent can see. Screenshots are auto-named from the triggering action (01_click_save.png).",
                },
              ].map((tool) => (
                <div
                  key={tool.sig}
                  className="flex items-start gap-4 p-3 bg-surface border border-border rounded-lg"
                >
                  <code className="text-primary font-mono text-xs flex-shrink-0 mt-0.5">
                    {tool.sig}
                  </code>
                  <p className="text-text-muted text-xs leading-relaxed">{tool.desc}</p>
                </div>
              ))}
            </div>
            <div className="space-y-3 text-text-muted text-sm leading-relaxed">
              <p>
                Screenshots and video are deliberately excluded from the text
                tools (they&apos;re token-heavy);{" "}
                <code className="text-primary bg-background px-1 rounded">get_screenshot</code>{" "}
                delivers images on demand.
              </p>
              <p>
                Every tool&apos;s{" "}
                <code className="text-primary bg-background px-1 rounded">file</code>{" "}
                argument is forgiving: pass a path, a bare filename (found
                anywhere under the scan dir), or a case-insensitive fragment of
                the filename or report title —{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">
                  get_bug_report(&quot;vendor update&quot;)
                </code>{" "}
                works. Unresolvable names error with the list of available
                reports.
              </p>
              <p>
                The server also exposes one MCP{" "}
                <strong className="text-text-primary">prompt</strong>,{" "}
                <code className="text-primary bg-background px-1 rounded">debug_bug_report</code>{" "}
                (optional <code className="text-primary bg-background px-1 rounded text-xs">file</code>{" "}
                argument) — the same hand-off prompt above, invokable as{" "}
                <code className="text-primary bg-background px-1 rounded text-xs">/tracebug:debug_bug_report</code>{" "}
                in Claude Code or from any client&apos;s prompt picker.
              </p>
            </div>
          </section>

          {/* What files */}
          <section id="files" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              What Files Does It Read?
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">Any TraceBug export:</p>
            <div className="space-y-4">
              <div className="p-4 bg-surface border border-border rounded-lg">
                <h3 className="text-text-primary font-semibold text-sm mb-1">
                  .html replay exports{" "}
                  <span className="text-text-muted font-normal">(the primary artifact)</span>
                </h3>
                <p className="text-text-muted text-xs leading-relaxed">
                  The report JSON is embedded in the file, so the exact file a
                  tester shares is what the agent reads. The file still opens as
                  a full interactive replay in any browser.
                </p>
              </div>
              <div className="p-4 bg-surface border border-border rounded-lg">
                <h3 className="text-text-primary font-semibold text-sm mb-1">
                  .json report payloads
                </h3>
                <p className="text-text-muted text-xs leading-relaxed">
                  With the same structure as the embedded payload.
                </p>
              </div>
            </div>
            <p className="text-text-muted text-sm mt-4 leading-relaxed">
              Files that aren&apos;t TraceBug exports are ignored — you can point{" "}
              <code className="text-primary bg-background px-1 rounded">--dir</code>{" "}
              at your Downloads folder and it will only pick up real reports.
            </p>
          </section>

          {/* Try it */}
          <section id="try-it" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Try It Right Now
            </h2>
            <p className="text-text-muted mb-4 leading-relaxed">
              The repo ships a demo report:
            </p>
            <div className="code-block p-5 rounded-xl overflow-x-auto mb-4">
              <pre className="text-sm font-mono text-text-primary leading-relaxed">
{`git clone https://github.com/prashantsinghmangat/tracebug-ai
cd tracebug-ai && npm install && npm run build
npx @modelcontextprotocol/inspector node dist/bin.mjs mcp --dir demo-bug-reports`}
              </pre>
            </div>
            <p className="text-text-muted text-sm leading-relaxed">
              The Inspector opens a browser UI where you can call each tool
              against{" "}
              <a
                href={`${REPO}/blob/main/demo-bug-reports/sample-report.html`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 transition-colors"
              >
                demo-bug-reports/sample-report.html
              </a>{" "}
              — a critical vendor-save bug with a 500 response, client-side
              TypeError, and a rage-click signal. Or open the repo in Claude Code
              (the included{" "}
              <a
                href={`${REPO}/blob/main/.mcp.json`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-accent/80 transition-colors"
              >
                .mcp.json
              </a>{" "}
              registers the server automatically) and ask it to debug the report.
            </p>
          </section>

          {/* Privacy */}
          <section id="privacy" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">Privacy</h2>
            <ul className="space-y-3">
              {[
                <>
                  The server binds to{" "}
                  <strong className="text-text-primary">stdio only</strong> — it
                  opens no network ports and makes no network requests.
                </>,
                <>It reads files from the directory you point it at, nothing else.</>,
                <>
                  What the agent sees is exactly what&apos;s in the export —
                  which already went through TraceBug&apos;s capture-time
                  redaction (sensitive storage keys, URL params, and token shapes
                  are scrubbed before the report is built).
                </>,
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-text-muted text-sm leading-relaxed">
                  <span className="text-success flex-shrink-0 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Troubleshooting */}
          <section id="troubleshooting" className="mb-16">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Troubleshooting
            </h2>
            <div className="space-y-2">
              {[
                {
                  symptom: "list_bug_reports returns count: 0",
                  fix: "Check --dir points at the folder with the .html exports; the scanner only goes 3 levels deep.",
                },
                {
                  symptom: "Client says the server won't start",
                  fix: "Requires Node ≥ 18. Test manually: npx tracebug mcp --dir . should print \"TraceBug MCP server — reading bug reports from …\" to stderr and then wait for input.",
                },
                {
                  symptom: "Report file not recognized",
                  fix: "Only files exported by TraceBug (containing the embedded report payload) are picked up — a screenshot or PDF export is not readable by the MCP server; use Export HTML.",
                },
              ].map((row) => (
                <div
                  key={row.symptom}
                  className="flex flex-col sm:flex-row items-start gap-2 sm:gap-4 p-4 bg-surface border border-border rounded-lg"
                >
                  <code className="text-warning font-mono text-xs flex-shrink-0 sm:w-64 mt-0.5">
                    {row.symptom}
                  </code>
                  <p className="text-text-muted text-xs leading-relaxed">{row.fix}</p>
                </div>
              ))}
            </div>
          </section>

          {/* CTA */}
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <h2 className="text-xl font-bold text-text-primary mb-2">
              Bug report → fix, without your data leaving the machine
            </h2>
            <p className="text-text-muted text-sm mb-6">
              One command connects your coding agent to every TraceBug export on disk.
            </p>
            <div className="code-block p-4 rounded-xl inline-block text-left">
              <pre className="text-text-primary font-mono text-sm">
                <span className="text-text-muted">$ </span>
                <span className="text-success">claude</span>
                <span className="text-text-primary"> mcp add tracebug -- npx tracebug mcp --dir ./bug-reports</span>
              </pre>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
