import { ArrowRight, Sparkles, Terminal, CheckCircle2, ShieldCheck, FileCode } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";

// Shared template for the per-tool exact-match landing pages
// (/claude-code-bug-reports, /cursor-bug-reports). Each page supplies genuinely
// tool-specific data — its real MCP setup, its agent-mode note, its docs link —
// so the pages are substantive and distinct, not thin duplicates. The setup
// block (one-command vs JSON config) is the biggest content difference and the
// thing a searcher for "<tool> bug reports" actually wants.

export interface ToolBugReportData {
  /** e.g. "Claude Code" */
  tool: string;
  /** URL slug base, e.g. "claude-code" */
  slug: string;
  /** How the MCP server is registered — the tool-specific setup. */
  setup: {
    kind: "command" | "json";
    label: string;
    code: string;
  };
  /** One-liner unique to how this tool uses the report. */
  agentNote: string;
  /** Path to the full setup guide in docs. */
  setupDocPath: string;
}

export function ToolBugReportPage({ data }: { data: ToolBugReportData }) {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-muted">
              <Sparkles size={13} className="text-primary" />
              {data.tool} + TraceBug (MCP)
            </div>
            <h1 className="mb-4 text-4xl sm:text-5xl font-bold tracking-[-0.02em] text-text-primary">
              {data.tool} bug reports:
              <br />
              capture it, let {data.tool} fix it
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-text-muted">
              {data.tool} can fix a bug it can actually see. TraceBug captures the browser
              session — replay, console errors, the failed request, the exact repro steps —
              into one file {data.tool} reads over a local{" "}
              <a href="/docs/mcp" className="text-primary hover:underline">MCP server</a>, then
              reproduces and fixes it. Nothing is uploaded.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gradient">
                <a href="/proof">
                  <Sparkles size={15} /> Watch AI fix a real bug <ArrowRight size={14} />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={data.setupDocPath}>
                  {data.tool} setup guide <ArrowRight size={14} />
                </a>
              </Button>
            </div>
          </div>

          {/* Setup — the tool-specific part */}
          <h2 className="mb-4 mt-14 text-2xl font-semibold text-text-primary">
            Connect TraceBug to {data.tool}
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            {data.agentNote}
          </p>
          <div className="mb-3 flex items-center gap-2 text-[13px] font-medium text-text-muted">
            <FileCode size={14} className="text-primary" /> {data.setup.label}
          </div>
          <pre className="code-block mb-4 overflow-x-auto rounded-lg p-4 font-mono text-[13px] text-text-primary whitespace-pre-wrap">
{data.setup.code}
          </pre>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            Full walkthrough with troubleshooting:{" "}
            <a href={data.setupDocPath} className="text-primary hover:underline">
              the {data.tool} MCP setup guide
            </a>
            .
          </p>

          {/* What the agent reads */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            What {data.tool} reads from the report
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            The local server gives {data.tool} read-tools over the captured evidence —
            console errors with stack traces, the failing network request and its response
            body, the millisecond repro timeline, and screenshots. It starts from the actual
            failing line instead of guessing from a description.
          </p>

          {/* Fix loop */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            From root cause to a verified fix
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            Every report also embeds a generated failing test that replays the session and
            asserts the failure is gone. {data.tool} runs it (red), patches the code, and
            re-runs until green — so the fix is verified, not just proposed.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-[14px] text-text-primary">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            Capture → {data.tool} reads the evidence → fix → the test goes green.
          </div>

          {/* Privacy */}
          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface/50 p-5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-[13.5px] leading-relaxed text-text-muted">
              <strong className="text-text-primary">Local, not cloud.</strong> The MCP server
              runs on your machine over stdio with zero network connections; the report is one
              offline file and secrets are masked at capture. Your bug data and your code never
              leave your machine. MIT open source.
            </p>
          </div>

          {/* Closer */}
          <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/50 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-text-primary">
                <Terminal size={16} className="text-primary" />
                See {data.tool} fix a real bug
              </div>
              <div className="mt-1 text-[13.5px] text-text-muted">
                Unedited transcript: crash → root cause → verified fix.
              </div>
            </div>
            <Button asChild variant="gradient">
              <a href="/proof">
                Watch the proof <ArrowRight size={14} />
              </a>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
