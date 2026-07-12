"use client";

import { useState } from "react";
import SectionHeading from "@/components/SectionHeading";
import { ChromeIcon, NpmIcon, GitHubIcon, TerminalIcon } from "@/components/ui/brand-icons";
import { Check, Copy, Sparkles } from "lucide-react";
import { SDK_VERSION } from "@/lib/version";

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

type TabKey = "chrome" | "mcp" | "npm" | "cli" | "github";

// Extension first (anyone, no code), then the AI-agent/MCP hand-off — the two
// primary paths. The SDK is the developer option, not the default.
const TABS: { key: TabKey; label: string; Icon: any }[] = [
  { key: "chrome", label: "Chrome extension", Icon: ChromeIcon },
  { key: "mcp", label: "AI agents (MCP)", Icon: Sparkles },
  { key: "npm", label: "npm (SDK)", Icon: NpmIcon },
  { key: "cli", label: "CLI setup", Icon: TerminalIcon },
  { key: "github", label: "GitHub", Icon: GitHubIcon },
];

export default function Installation() {
  const [activeTab, setActiveTab] = useState<TabKey>("chrome");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <section id="install" className="py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Get started"
          title="One click to capture. One command to debug with AI."
          subtitle={
            <>
              Install the Chrome extension and capture a bug on any site — no code. Hand the exported
              report to your AI coding agent through the local MCP server to fix it. Embedding in your
              own app instead? The SDK is two lines.
            </>
          }
          className="mb-10"
        />

        {/* The two priorities: capture with the extension, debug with an AI agent.
            The SDK is still here — as a tab, not a headline. */}
        <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-10">
          <div className="rounded-2xl border border-border bg-background p-5 shadow-xs">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/[0.08] text-primary">
                <ChromeIcon size={17} />
              </span>
              <span className="text-[15px] font-semibold text-text-primary">Chrome extension</span>
            </div>
            <p className="text-[13.5px] text-text-muted leading-relaxed">
              For QA, designers, PMs — anyone who reports bugs. Capture on any site, nothing to add to
              the codebase.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-background p-5 shadow-xs">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-accent/[0.10] text-accent">
                <Sparkles size={17} />
              </span>
              <span className="text-[15px] font-semibold text-text-primary">AI coding agents</span>
            </div>
            <p className="text-[13.5px] text-text-muted leading-relaxed">
              Hand the report to Claude Code, Cursor, or any MCP client — it debugs from the real
              console, network, and repro data.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-medium border transition-all ${
                activeTab === key
                  ? "bg-primary text-white border-transparent shadow-glow-sm"
                  : "bg-background text-text-muted border-border hover:border-border-strong hover:text-text-primary"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-background shadow-card p-6 sm:p-8">
          {activeTab === "mcp" && (
            <div className="space-y-6">
              <Step n={1} title="Connect it to Claude Code (one command)">
                <CodeBlock
                  id="mcp-add"
                  copied={copied}
                  onCopy={copy}
                  code="claude mcp add tracebug -- npx -y tracebug mcp"
                />
              </Step>
              <Step n={2} title="…or add it to any MCP client — Cursor, Windsurf, VS Code">
                <CodeBlock
                  id="mcp-json"
                  copied={copied}
                  onCopy={copy}
                  code={`{
  "mcpServers": {
    "tracebug": { "command": "npx", "args": ["-y", "tracebug", "mcp"] }
  }
}`}
                />
              </Step>
              <Note>
                Export a bug as <code className="font-mono text-text-primary">.html</code>, then paste the
                auto-copied prompt (or run <code className="font-mono text-text-primary">/tracebug:debug_bug_report</code>{" "}
                in Claude Code). The agent reads the console, network, repro steps, and screenshots — and
                fixes it in your code. <b className="text-text-primary">Fully local; nothing uploaded.</b> No{" "}
                <code className="font-mono text-text-primary">--dir</code> needed — it auto-finds reports in
                your Downloads.{" "}
                <a href="/docs/mcp" className="text-primary hover:underline">Read the MCP docs →</a>
              </Note>
            </div>
          )}

          {activeTab === "npm" && (
            <div className="space-y-6">
              <Step n={1} title="Install">
                <CodeBlock id="npm-install" copied={copied} onCopy={copy} code="npm install tracebug-sdk" />
              </Step>
              <Step n={2} title="Initialize">
                <CodeBlock
                  id="npm-init"
                  copied={copied}
                  onCopy={copy}
                  code={`import TraceBug from "tracebug-sdk";

// Add this to your app entry point
TraceBug.init({
  projectId: "my-app",
  enabled: "auto",    // dev + staging only
});`}
                />
              </Step>
              <Note>
                That&apos;s it. A floating 🐛 button appears in the corner of your app — click it to
                open the dashboard, view sessions, and generate bug reports.
              </Note>
            </div>
          )}

          {activeTab === "cli" && (
            <div className="space-y-5">
              <CodeBlock
                id="cli"
                copied={copied}
                onCopy={copy}
                code={`$ npx tracebug init

TraceBug — the exact setup for your framework

  Detected framework: nextjs

  ⚠ Heads up (nextjs): App Router components run on the
  server by default, but TraceBug is browser-only — it must
  live in a Client Component ("use client") + useEffect.

  // app/tracebug.tsx
  "use client";
  import { useEffect } from "react";
  export default function TraceBugInit() {
    useEffect(() => {
      import("tracebug-sdk").then(({ default: TraceBug }) =>
        TraceBug.init({ projectId: "my-app", enabled: "auto" })
      );
    }, []);
    return null;
  }
  // then mount <TraceBugInit /> in app/layout.tsx`}
              />
              <Note>
                Detects your framework from <code className="font-mono">package.json</code> and prints the
                <b className="text-text-primary"> correct integration</b> — including the non-obvious bits for{" "}
                <b className="text-text-primary">Next.js, Nuxt, and Svelte</b> (SSR-safe mounting) plus the{" "}
                <code className="font-mono">enabled: &quot;auto&quot;</code> dev-only flag. It prints the snippet;
                you paste it.
              </Note>
            </div>
          )}

          {activeTab === "chrome" && (
            <div className="space-y-6">
              <a
                href={CHROME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-white font-medium shadow-glow-sm hover:shadow-glow-primary hover:brightness-110 transition-all"
              >
                <ChromeIcon size={18} colored /> Install from Chrome Web Store
              </a>
              <div className="rounded-xl border border-border overflow-hidden text-[13px]">
                {[
                  ["Google Chrome", "Install from Chrome Web Store", true],
                  ["Microsoft Edge", "Chrome extensions work natively", true],
                  ["Brave", "Chrome extensions work natively", true],
                  ["Opera", "Add “Install Chrome Extensions” first", true],
                  ["Firefox", "Not supported yet — use the npm SDK", false],
                  ["Safari", "Not supported — use the npm SDK", false],
                ].map(([browser, note, ok], i) => (
                  <div
                    key={browser as string}
                    className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-border" : ""}`}
                  >
                    {ok ? (
                      <Check size={15} className="text-success flex-shrink-0" strokeWidth={3} />
                    ) : (
                      <span className="text-text-subtle flex-shrink-0">—</span>
                    )}
                    <span className="font-medium text-text-primary w-32 flex-shrink-0">{browser}</span>
                    <span className="text-text-muted">{note}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "github" && (
            <div className="space-y-6">
              <Step n={1} title="Install directly from GitHub">
                <CodeBlock
                  id="gh-install"
                  copied={copied}
                  onCopy={copy}
                  code="npm install github:prashantsinghmangat/tracebug-ai"
                />
              </Step>
              <Step n={2} title="…or build a .tgz offline">
                <CodeBlock
                  id="gh-tgz"
                  copied={copied}
                  onCopy={copy}
                  code={`$ cd tracebug-ai
$ npm pack     # creates tracebug-sdk-${SDK_VERSION}.tgz
$ npm install ./tracebug-sdk-${SDK_VERSION}.tgz`}
                />
              </Step>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-[12px] font-semibold">
          {n}
        </span>
        <span className="text-[14px] font-semibold text-text-primary">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-[13.5px] text-text-muted leading-relaxed">
      {children}
    </p>
  );
}

function CodeBlock({
  id, code, copied, onCopy,
}: {
  id: string;
  code: string;
  copied: string | null;
  onCopy: (id: string, text: string) => void;
}) {
  return (
    <div className="relative group">
      <pre className="code-block overflow-x-auto p-4 pr-12 text-text-primary">
        <code>{code}</code>
      </pre>
      <button
        onClick={() => onCopy(id, code)}
        aria-label="Copy code"
        className="absolute top-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-text-subtle hover:text-primary hover:border-primary/40 transition-colors"
      >
        {copied === id ? <Check size={14} className="text-success" /> : <Copy size={14} />}
      </button>
    </div>
  );
}
