import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import InstallButtons from "@/components/InstallButtons";
import Shortcut from "@/components/Keycap";
import { LINKS, MCP } from "@/lib/site";

export const metadata: Metadata = {
  title: "Documentation — TraceBug",
  description:
    "Install TraceBug for Chrome or Firefox, capture your first bug, hand the report to Claude Code, Cursor or Windsurf over MCP, or add the SDK to your app.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "TraceBug Documentation",
    description:
      "Install, capture a bug, hand it to your AI agent. Extension, MCP server and SDK guides.",
  },
};

// The docs hub. Extension first (most readers never touch code), then the AI
// hand-off, then the SDK. The table of contents is built from SECTIONS, so its
// order always matches the page. Full references stay in the repo's docs/
// folder — this page links to them instead of keeping a second copy that drifts.

const REPO_DOCS = `${LINKS.repo}/blob/main/docs`;

const SECTIONS = [
  { id: "install", label: "Install the extension" },
  { id: "capture", label: "Capture your first bug" },
  { id: "report", label: "What's in a report" },
  { id: "share", label: "Share or file it" },
  { id: "ai-agents", label: "Debug it with an AI agent" },
  { id: "firefox", label: "Chrome and Firefox differences" },
  { id: "privacy", label: "Privacy and redaction" },
  { id: "sdk", label: "Add the SDK to your app" },
  { id: "api", label: "SDK quick reference" },
  { id: "guides", label: "More guides" },
] as const;

const PATHS = [
  {
    href: "#install",
    title: "Use the extension",
    desc: "QA, PMs, support and developers. Capture a bug on any site, no code.",
  },
  {
    href: "#ai-agents",
    title: "Hand it to your AI agent",
    desc: "Claude Code, Cursor, Windsurf or VS Code reads the report over a local MCP server.",
  },
  {
    href: "#sdk",
    title: "Add the SDK to your app",
    desc: "A capture toolbar inside your own dev and staging builds. Works with any framework.",
  },
];

const BROWSERS: [string, string][] = [
  ["Chrome, Edge, Brave", "Chrome Web Store"],
  ["Opera", "Chrome Web Store, after Opera's “Install Chrome Extensions” add-on"],
  ["Firefox 128 and later", "Firefox Add-ons"],
  ["Safari", "Not supported. Use the npm SDK in your app instead."],
];

const CAPTURE_STEPS: ReactNode[] = [
  <>Open the page with the bug, click the TraceBug icon and choose <b>Capture Bug</b>. No screen-share dialog opens.</>,
  <>Reproduce the bug: click, type, navigate. TraceBug records your clicks, console, network and a replay of the page, across page loads.</>,
  <>Click <b>Stop</b> in the floating bar. The ticket opens with a title, summary, repro steps and a root-cause hint already filled in.</>,
  <>Click <b>Export replay (.html)</b> and send the file, or <b>Fix with AI</b> to copy a ready prompt for your agent.</>,
];

const REPORT_PARTS: [string, string][] = [
  ["Repro steps", "Numbered steps generated from your clicks, typing and navigation."],
  ["Console", "Errors with stack traces, plus the warnings and logs around them."],
  ["Network", "Every request with method, status and timing; failed responses keep their body."],
  ["Replay", "An interactive DOM replay of the page. Optional screen video."],
  ["Screenshots", "Visible area or a cropped region, with drawings and blur."],
  ["Environment", "Browser, OS, viewport and device."],
  ["Root-cause hint", "Which action came before the first failure, and what failed."],
  ["AI tab", "A copy-ready prompt so whoever opens the file can hand it to an agent."],
];

const SHARE_ROWS: [string, string][] = [
  ["Export replay (.html)", "One self-contained file: replay, console, network, steps. Opens offline in any browser and is what the MCP server reads."],
  ["Fix with AI", "Copies a prompt that points your agent at the report."],
  ["GitHub, Linear, Slack", "Files a real issue or message with your own token, sent straight from your browser. Without a token it opens a prefilled issue or copies the text."],
  ["Jira", "Copies Jira-formatted ticket text to paste."],
  ["More", "AI report (small text-only .html for chat), Markdown, HAR."],
];

const FIREFOX_NOTES: ReactNode[] = [
  <>Site access is opt-in in Firefox, so the first capture on a site asks for it.</>,
  <>Screen video uses the browser&apos;s share picker. Chrome can also record the current tab with no picker.</>,
  <>Firefox can&apos;t record tab audio. Turn on the microphone if you want narration.</>,
  <>Failed requests from <i>before</i> you started capturing aren&apos;t listed in Firefox (it doesn&apos;t expose their status). Everything during the capture is.</>,
];

const API: [string, string][] = [
  ["TraceBug.init(config)", "Start TraceBug. Call once at app startup."],
  ["TraceBug.quickCapture()", "Open the ticket for the current session."],
  ["TraceBug.takeScreenshot()", "Capture the visible page."],
  ["TraceBug.generateReport()", "The full report as an object."],
  ["TraceBug.getGitHubIssue()", "The report as GitHub issue Markdown."],
  ["TraceBug.setUser({ id, email, name })", "Attach who reported it."],
  ["TraceBug.use(plugin)", "Filter events or change reports and exports (onEvent, onReport, onExport)."],
  ["TraceBug.on(event, handler)", "Subscribe to lifecycle events such as error:captured."],
  ["TraceBug.destroy()", "Remove TraceBug from the page."],
];

const GUIDES = [
  { href: "/docs/mcp", title: "MCP server", desc: "Setup for Claude Code, Cursor, Windsurf and VS Code, and every tool the agent can call." },
  { href: "/docs/playwright", title: "Playwright reporter", desc: "Every failed test becomes a TraceBug report your agent can read." },
  { href: "/docs/ai-debugger", title: "AI debugger", desc: "Root-cause analysis with your own Anthropic, OpenAI or Ollama key, from the browser." },
  { href: "/docs/har-export", title: "HAR export", desc: "Network activity as a standard HAR 1.2 file for DevTools, Charles or Postman." },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border pt-10 pb-12 first:border-t-0 first:pt-0">
      <h2 className="mb-4 text-[26px] font-medium tracking-[-0.02em] text-text-primary">{title}</h2>
      <div className="space-y-4 text-[15px] leading-[1.7] text-text-muted">{children}</div>
    </section>
  );
}

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface-2">
      {label && (
        <div className="border-b border-border px-4 py-2 font-mono text-[12px] text-text-subtle">{label}</div>
      )}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-[1.7] text-text-primary">{children}</pre>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {rows.map(([term, desc]) => (
        <div key={term} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
          <dt className="text-[14px] font-medium text-text-primary">{term}</dt>
          <dd className="text-[14px] text-text-muted">{desc}</dd>
        </div>
      ))}
    </dl>
  );
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border-strong font-mono text-[13px] text-text-muted">
            {i + 1}
          </span>
          <span className="pt-0.5 [&_b]:font-medium [&_b]:text-text-primary">{item}</span>
        </li>
      ))}
    </ol>
  );
}

const ic = "rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-text-primary";
const a = "text-primary underline-offset-4 hover:underline";

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 pt-28 pb-section sm:px-6 lg:px-8">
        {/* Header */}
        <header className="max-w-3xl">
          <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">Documentation</span>
          <h1 className="text-h2 font-medium text-text-primary">Capture a bug. Hand it to AI.</h1>
          <p className="mt-4 text-lead text-text-muted">
            Install the extension, capture your first bug in under a minute, and give the report to your
            coding agent. Everything runs on your machine.
          </p>
        </header>

        {/* Three ways in */}
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {PATHS.map((p) => (
            <a
              key={p.href}
              href={p.href}
              className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center justify-between text-[15px] font-medium text-text-primary">
                {p.title}
                <ArrowRight size={15} strokeWidth={1.5} className="text-text-subtle transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-2 text-[14px] leading-[1.6] text-text-muted">{p.desc}</p>
            </a>
          ))}
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
          {/* Table of contents */}
          <nav aria-label="On this page" className="hidden lg:block">
            <div className="sticky top-24">
              <p className="mb-3 font-mono text-[12px] text-text-subtle">On this page</p>
              <ul className="space-y-1 border-l border-border">
                {SECTIONS.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="-ml-px block border-l border-transparent py-1 pl-4 text-[14px] text-text-muted transition-colors hover:border-text-primary hover:text-text-primary"
                    >
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="min-w-0 max-w-3xl">
            <Section id="install" title="Install the extension">
              <p>Free, no account. One extension for Chrome and Firefox.</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <InstallButtons />
              </div>
              <Rows rows={BROWSERS} />
              <p>
                After installing, pin TraceBug to the toolbar so it&apos;s one click away. <Shortcut /> takes an
                instant screenshot ticket on any tab; change it at <code className={ic}>chrome://extensions/shortcuts</code> in Chrome or{" "}
                <b className="font-medium text-text-primary">Manage Extension Shortcuts</b> in Firefox&apos;s add-ons page.
              </p>
            </Section>

            <Section id="capture" title="Capture your first bug">
              <Steps items={CAPTURE_STEPS} />
              <p>
                Need pixels too? Open the popup&apos;s capture options and turn on <b className="font-medium text-text-primary">Events + Video</b>.
                For a single frame, use <b className="font-medium text-text-primary">Screenshot</b> or press <Shortcut />; it
                opens the ticket with a fresh screenshot attached.
              </p>
            </Section>

            <Section id="report" title="What's in a report">
              <p>Every report is one file with all of this, filled in for you:</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {REPORT_PARTS.map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-border bg-surface p-4">
                    <h3 className="text-[14px] font-medium text-text-primary">{t}</h3>
                    <p className="mt-1 text-[14px] leading-[1.6] text-text-muted">{d}</p>
                  </div>
                ))}
              </div>
            </Section>

            <Section id="share" title="Share or file it">
              <Rows rows={SHARE_ROWS} />
              <p>
                Tokens are set once under <b className="font-medium text-text-primary">More → Configure integrations</b> in the
                ticket. They stay in your browser; no TraceBug server is involved.{" "}
                <a href={`${REPO_DOCS}/integrations.md`} target="_blank" rel="noopener noreferrer" className={a}>
                  Integration details
                </a>
              </p>
            </Section>

            <Section id="ai-agents" title="Debug it with an AI agent">
              <p>
                The TraceBug MCP server lets your coding agent open the report and read the console, network, steps and
                screenshots, then find the fix in your code. It runs locally over stdio and finds reports in your project,
                Downloads and Desktop, so you don&apos;t pass a path.
              </p>
              <Code label="Claude Code">{MCP.claudeCode}</Code>
              <p>
                On native Windows, wrap the command: <code className={ic}>-- cmd /c npx -y tracebug mcp</code>. Restart your
                agent, then ask it to <i>debug the latest TraceBug report</i>, or type{" "}
                <code className={ic}>/tracebug:debug_bug_report</code> in Claude Code.
              </p>
              <Link href="/docs/mcp" className={`inline-flex items-center gap-1 font-medium ${a}`}>
                Cursor, Windsurf and VS Code setup <ArrowRight size={14} />
              </Link>
            </Section>

            <Section id="firefox" title="Chrome and Firefox differences">
              <p>Capture, reports, export and MCP work the same in both. Firefox differs by platform design in a few places:</p>
              <ul className="list-disc space-y-2 pl-5 marker:text-text-subtle">
                {FIREFOX_NOTES.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </Section>

            <Section id="privacy" title="Privacy and redaction">
              <p>
                Nothing is uploaded to TraceBug. Reports stay on your machine until you share them. Passwords, hidden
                fields, tokens and cookie values are masked when captured.
              </p>
              <p>
                For your app&apos;s own sensitive fields, open the extension&apos;s options and add field names or regex
                patterns under <b className="font-medium text-text-primary">Redaction rules</b>. Use <b className="font-medium text-text-primary">Blur</b>{" "}
                during a capture to hide an element in the replay and video.{" "}
                <Link href="/privacy" className={a}>Privacy policy</Link>
              </p>
            </Section>

            <Section id="sdk" title="Add the SDK to your app">
              <p>
                The SDK puts the capture toolbar inside your own app, so testers on your dev or staging build don&apos;t
                need the extension. It has no runtime dependencies.
              </p>
              <Code label="Terminal">{MCP.npmInstall}</Code>
              <Code label="App entry (main.ts, App.tsx, layout.tsx)">{`import TraceBug from "tracebug-sdk";

TraceBug.init({ projectId: "my-app" });`}</Code>
              <p>
                A toolbar appears on the right edge. Click <b className="font-medium text-text-primary">Track session</b>, reproduce
                the bug, then press <code className={ic}>Ctrl+Shift+B</code> to open the ticket.
              </p>
              <Rows
                rows={[
                  ["enabled", "\"auto\" (default) runs on localhost and staging hosts only. Also \"development\", \"staging\", \"all\", \"off\" or a list of hostnames."],
                  ["theme", "\"light\" (default), \"dark\" or \"auto\"."],
                  ["toolbarPosition", "\"right\" (default), \"left\", \"bottom-right\" or \"bottom-left\"."],
                  ["captureConsole", "\"all\", \"warnings\", \"errors\" or \"none\"."],
                  ["redact", "Extra field names and patterns to mask."],
                ]}
              />
              <p>
                <a href={`${REPO_DOCS}/configuration.md`} target="_blank" rel="noopener noreferrer" className={a}>
                  All configuration options
                </a>
                {" · "}
                <a href={LINKS.npm} target="_blank" rel="noopener noreferrer" className={a}>
                  tracebug-sdk on npm
                </a>
              </p>
            </Section>

            <Section id="api" title="SDK quick reference">
              <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                {API.map(([sig, desc]) => (
                  <div key={sig} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,300px)_1fr] sm:gap-4">
                    <dt className="break-words font-mono text-[13px] text-text-primary">{sig}</dt>
                    <dd className="text-[14px] text-text-muted">{desc}</dd>
                  </div>
                ))}
              </dl>
              <a href={`${REPO_DOCS}/api-reference.md`} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 font-medium ${a}`}>
                Full API reference <ArrowRight size={14} />
              </a>
            </Section>

            <Section id="guides" title="More guides">
              <div className="grid gap-3 sm:grid-cols-2">
                {GUIDES.map((g) => (
                  <Link
                    key={g.href}
                    href={g.href}
                    className="group rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-center justify-between text-[15px] font-medium text-text-primary">
                      {g.title}
                      <ArrowRight size={15} strokeWidth={1.5} className="text-text-subtle transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-2 text-[14px] leading-[1.6] text-text-muted">{g.desc}</p>
                  </Link>
                ))}
              </div>
              <p>
                Stuck?{" "}
                <a href={`${LINKS.repo}/issues/new`} target="_blank" rel="noopener noreferrer" className={a}>
                  Open an issue
                </a>{" "}
                or <Link href="/feedback" className={a}>send feedback</Link>.
              </p>
            </Section>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
