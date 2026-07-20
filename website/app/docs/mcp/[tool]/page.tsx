import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Terminal, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

// One dynamic route renders the setup guide for each MCP client. Each page
// targets its own long-tail search ("cursor mcp bug reports", "windsurf mcp
// setup") and every one funnels to /proof — show the outcome, then the steps.

const MCP_JSON = `{
  "mcpServers": {
    "tracebug": {
      "command": "npx",
      "args": ["-y", "tracebug", "mcp"]
    }
  }
}`;

type ToolGuide = {
  name: string;
  metaTitle: string;
  metaDescription: string;
  intro: string;
  steps: { title: string; body: string; code?: string; codeLabel?: string }[];
  verify: string;
  troubleshooting: { problem: string; fix: string }[];
};

const TOOLS: Record<string, ToolGuide> = {
  "claude-code": {
    name: "Claude Code",
    metaTitle: "Claude Code MCP setup: debug browser bugs from real evidence — TraceBug",
    metaDescription:
      "Connect Claude Code to TraceBug bug reports with one command. The local MCP server gives Claude the session replay, console errors, network log, and repro steps — 100% on your machine.",
    intro:
      "Claude Code registers MCP servers with a single CLI command — this is the fastest setup of any tool. One line, and Claude can read every TraceBug export on your machine.",
    steps: [
      {
        title: "Add the server",
        body: "Run this once, anywhere. The --scope user flag makes it available in every project; drop it to register for the current project only.",
        code: "claude mcp add tracebug --scope user -- npx -y tracebug mcp",
        codeLabel: "Terminal",
      },
      {
        title: "Capture a bug",
        body: "Use the TraceBug extension (or SDK) to capture a bug and click Export .html. The server auto-discovers exports in your Downloads and Desktop folders — no paths to configure. To pin a project folder instead, add --dir ./bug-reports to the command above.",
      },
      {
        title: "Ask Claude to investigate",
        body: "Start a Claude Code session and say: \"List my bug reports and investigate the newest one.\" Claude calls list_bug_reports, pulls the evidence, and starts from the actual failing line. There's also a built-in prompt: /tracebug:debug_bug_report.",
      },
    ],
    verify:
      "Run `claude mcp list` — tracebug should appear with a ✓. In a session, ask \"what MCP tools do you have?\" and look for list_bug_reports.",
    troubleshooting: [
      { problem: "claude mcp list shows tracebug as failed", fix: "The server needs Node 18+. Check node --version, then remove and re-add the server." },
      { problem: "Claude says it has no bug-report tools", fix: "MCP servers load at session start — exit and start a new session after adding the server." },
      { problem: "list_bug_reports returns nothing", fix: "The export has to exist first: capture a bug and Export .html, or pass --dir pointing at the folder that holds your exports." },
    ],
  },
  cursor: {
    name: "Cursor",
    metaTitle: "Cursor MCP setup: give the agent real bug evidence — TraceBug",
    metaDescription:
      "Connect Cursor to TraceBug bug reports with one JSON file. The local MCP server gives Cursor's agent the session replay, console errors, network log, and repro steps — 100% on your machine.",
    intro:
      "Cursor reads MCP servers from a JSON config file — project-level or global. One small file, and the agent can read every TraceBug export on your machine.",
    steps: [
      {
        title: "Create the config file",
        body: "For one project, create .cursor/mcp.json in the project root. To make it available everywhere, put the same content in ~/.cursor/mcp.json instead.",
        code: MCP_JSON,
        codeLabel: ".cursor/mcp.json",
      },
      {
        title: "Enable it",
        body: "Open Cursor Settings → MCP. The tracebug server should be listed — enable it if it isn't already, and check for the green status dot. Cursor may ask you to approve the server the first time the agent calls a tool.",
      },
      {
        title: "Capture a bug and ask",
        body: "Export a bug with the TraceBug extension, then tell Cursor's agent: \"List my bug reports and investigate the newest one.\" The server auto-discovers exports in Downloads and Desktop; add \"--dir\", \"./bug-reports\" to the args array to pin a project folder.",
      },
    ],
    verify:
      "Settings → MCP shows tracebug with a green dot and six tools. In agent chat, ask \"what MCP tools do you have?\" and look for list_bug_reports.",
    troubleshooting: [
      { problem: "Server shows a red/yellow status", fix: "Cursor launches the server with your shell's PATH — make sure npx (Node 18+) resolves. On Windows, fully restart Cursor after creating the file." },
      { problem: "Agent ignores the tools", fix: "MCP tools are used by the Agent mode, not plain chat — make sure you're in agent/composer mode." },
      { problem: "list_bug_reports returns nothing", fix: "Capture and Export .html first, or point --dir at the folder holding your exports." },
    ],
  },
  windsurf: {
    name: "Windsurf",
    metaTitle: "Windsurf MCP setup: give Cascade real bug evidence — TraceBug",
    metaDescription:
      "Connect Windsurf's Cascade to TraceBug bug reports with one JSON file. The local MCP server gives it the session replay, console errors, network log, and repro steps — 100% on your machine.",
    intro:
      "Windsurf's Cascade agent reads MCP servers from a global config file. One small file, and Cascade can read every TraceBug export on your machine.",
    steps: [
      {
        title: "Create the config file",
        body: "Add the tracebug entry to ~/.codeium/windsurf/mcp_config.json (create the file if it doesn't exist). You can also reach this file from Windsurf: Settings → Cascade → MCP → Configure.",
        code: MCP_JSON,
        codeLabel: "~/.codeium/windsurf/mcp_config.json",
      },
      {
        title: "Refresh the servers",
        body: "In the Cascade panel, open the MCP toolbar and hit Refresh (or restart Windsurf). tracebug should appear in the server list with its six tools.",
      },
      {
        title: "Capture a bug and ask",
        body: "Export a bug with the TraceBug extension, then tell Cascade: \"List my bug reports and investigate the newest one.\" The server auto-discovers exports in Downloads and Desktop; add \"--dir\", \"./bug-reports\" to the args array to pin a project folder.",
      },
    ],
    verify:
      "The Cascade MCP list shows tracebug as running. Ask Cascade \"what MCP tools do you have?\" and look for list_bug_reports.",
    troubleshooting: [
      { problem: "Server never appears after refresh", fix: "Validate the JSON (a trailing comma is the usual culprit) and make sure npx (Node 18+) is on your PATH, then restart Windsurf." },
      { problem: "Tools error on first call", fix: "Windsurf may require you to approve the server's tools once — check the Cascade panel for a pending approval." },
      { problem: "list_bug_reports returns nothing", fix: "Capture and Export .html first, or point --dir at the folder holding your exports." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(TOOLS).map((tool) => ({ tool }));
}

export function generateMetadata({ params }: { params: { tool: string } }): Metadata {
  const guide = TOOLS[params.tool];
  if (!guide) return {};
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: `/docs/mcp/${params.tool}` },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url: `https://tracebug.dev/docs/mcp/${params.tool}`,
      images: [{ url: "/api/og/proof", width: 1200, height: 630 }],
    },
  };
}

export default function McpToolPage({ params }: { params: { tool: string } }) {
  const guide = TOOLS[params.tool];
  if (!guide) notFound();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-muted">
              <Terminal size={13} className="text-primary" />
              Documentation · MCP · {guide.name}
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-[-0.02em] text-text-primary">
              Debug browser bugs in {guide.name} — from real evidence
            </h1>
            <p className="text-lg leading-relaxed text-text-muted">
              {guide.intro} Everything runs locally: the server is stdio-only,
              opens zero network connections, and reads report files from your
              disk. <a href="/proof" className="text-primary hover:underline">See the unedited transcript</a>{" "}
              of Claude going from crash to root cause in five tool calls.
            </p>
          </div>

          <ol className="space-y-8">
            {guide.steps.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-border bg-surface/50 p-6">
                <div className="mb-2 flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[13px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <h2 className="text-[17px] font-semibold text-text-primary">{step.title}</h2>
                </div>
                <p className="text-[14.5px] leading-relaxed text-text-muted">{step.body}</p>
                {step.code && (
                  <div className="code-block mt-4 rounded-xl p-4">
                    <div className="mb-2 text-[11px] uppercase tracking-wider text-text-subtle">{step.codeLabel}</div>
                    <pre className="overflow-x-auto font-mono text-[13px] text-text-primary">{step.code}</pre>
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-2xl border border-border bg-surface/50 p-6">
            <div className="mb-2 flex items-center gap-2 font-semibold text-text-primary">
              <CheckCircle2 size={16} className="text-emerald-500" /> Verify it worked
            </div>
            <p className="text-[14.5px] leading-relaxed text-text-muted">{guide.verify}</p>
          </div>

          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">Troubleshooting</h2>
          <div className="space-y-3">
            {guide.troubleshooting.map((t) => (
              <div key={t.problem} className="rounded-xl border border-border p-4">
                <div className="text-[14px] font-medium text-text-primary">{t.problem}</div>
                <div className="mt-1 text-[13.5px] text-text-muted">{t.fix}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/50 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="font-semibold text-text-primary">No bug handy? Make one.</div>
              <div className="mt-1 text-[13.5px] text-text-muted">
                The live sandbox has intentional bugs — capture one, export it, and hand it to {guide.name}.
              </div>
            </div>
            <Button asChild variant="gradient">
              <a href="/try.html" target="_blank" rel="noopener noreferrer">
                Open the sandbox <ArrowRight size={14} />
              </a>
            </Button>
          </div>

          <p className="mt-8 text-[13.5px] text-text-muted">
            Full MCP reference — all six tools, the report format, and the FAQ — lives at{" "}
            <a href="/docs/mcp" className="text-primary hover:underline">/docs/mcp</a>. Other tools:{" "}
            {Object.entries(TOOLS)
              .filter(([slug]) => slug !== params.tool)
              .map(([slug, t], i) => (
                <span key={slug}>
                  {i > 0 && " · "}
                  <a href={`/docs/mcp/${slug}`} className="text-primary hover:underline">{t.name}</a>
                </span>
              ))}
            .
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
}
