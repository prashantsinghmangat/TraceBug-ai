import type { Metadata } from "next";
import { ArrowRight, Sparkles, Terminal, CheckCircle2, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ChromeIcon } from "@/components/ui/brand-icons";

// Solution landing page for the winnable, low-competition, high-intent cluster:
// "ai bug fix", "fix bugs with AI", "AI debugging", "best MCP for bug fix",
// "Claude Code bug reports". Same honest-content play as /instant-bug-report
// and /compare/*. Distinct H2s cover the sub-intents so one strong page ranks
// for the cluster instead of thin pages cannibalizing each other.

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

export const metadata: Metadata = {
  title: "AI Bug Fix — capture a bug, let your AI agent fix it | TraceBug",
  description:
    "Fix bugs with AI: capture a browser bug into one file your coding agent reads over MCP — Claude Code, Cursor, Windsurf — then reproduces and fixes. Every report ships a failing test to verify the fix. Free, local-first.",
  alternates: { canonical: "/ai-bug-fix" },
  openGraph: {
    title: "AI Bug Fix — capture a bug, let your AI agent fix it",
    description:
      "Give your AI coding agent everything it needs to fix a browser bug: replay, console, network, repro timeline, and a generated failing test — over a local MCP server.",
    url: "https://tracebug.dev/ai-bug-fix",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

const STEPS = [
  { n: "1", label: "Capture", detail: "One shortcut records the session — replay, console errors, network, a repro timeline — into one offline .html file." },
  { n: "2", label: "Hand to your agent", detail: "A local MCP server exposes the report to Claude Code, Cursor, or Windsurf. No upload, no dashboard." },
  { n: "3", label: "AI fixes it", detail: "The agent reads the evidence, finds the root cause, and patches the code — using the failing test to know when it's done." },
];

export default function AiBugFixPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-muted">
              <Sparkles size={13} className="text-primary" />
              Capture the bug. Let AI fix it.
            </div>
            <h1 className="mb-4 text-4xl sm:text-5xl font-bold tracking-[-0.02em] text-text-primary">
              AI bug fix: give your agent
              <br />
              everything it needs to fix it
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-text-muted">
              AI can fix a bug it can actually see. TraceBug captures the browser session —
              replay, console errors, the failed request, the exact repro steps — into one
              file your coding agent reads over a local{" "}
              <a href="/docs/mcp" className="text-primary hover:underline">MCP server</a>. It
              then reproduces and fixes the bug, with a generated failing test to prove it.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gradient">
                <a href="/proof">
                  <Sparkles size={15} /> Watch AI fix a real bug <ArrowRight size={14} />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={CHROME_URL} target="_blank" rel="noopener noreferrer">
                  <ChromeIcon size={15} /> Add to Chrome — free
                </a>
              </Button>
            </div>
          </div>

          {/* The loop */}
          <h2 className="mb-5 mt-14 text-2xl font-semibold text-text-primary">
            How AI bug fixing works with TraceBug
          </h2>
          <div className="space-y-3">
            {STEPS.map((s) => (
              <div key={s.n} className="flex items-start gap-4 rounded-xl border border-border bg-surface/50 p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">
                  {s.n}
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-text-primary">{s.label}</div>
                  <div className="text-[13.5px] leading-relaxed text-text-muted">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Why screenshots aren't enough */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            Why pasting a screenshot into ChatGPT doesn&apos;t fix the bug
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            An AI agent can only reason about what it&apos;s given. A screenshot and
            &ldquo;it&apos;s broken&rdquo; forces it to guess. The evidence that actually
            explains a bug — the console stack trace, the 500 response body, the click that
            triggered it, the state at the moment it failed — exists at capture time and
            usually never reaches the model. TraceBug captures all of it and hands it over
            structured, so the agent debugs from facts instead of guessing.
          </p>

          {/* Best MCP for bug fixing */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            The best MCP setup for fixing bugs
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            TraceBug ships a local, stdio-only{" "}
            <a href="/docs/mcp" className="text-primary hover:underline">MCP server</a> — one
            command, zero network connections:
          </p>
          <div className="code-block mb-4 rounded-lg p-4 font-mono text-sm">
            <span className="text-text-muted">$ </span>
            <span className="text-text-primary">claude mcp add tracebug -- npx -y tracebug mcp --dir ./bug-reports</span>
          </div>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            It gives your agent read-tools over the report (console errors, network activity,
            repro steps, screenshots) plus a generated failing Playwright test the agent runs
            to reproduce the bug and verify its fix. Setup guides for{" "}
            <a href="/docs/mcp/claude-code" className="text-primary hover:underline">Claude Code</a>,{" "}
            <a href="/docs/mcp/cursor" className="text-primary hover:underline">Cursor</a>, and{" "}
            <a href="/docs/mcp/windsurf" className="text-primary hover:underline">Windsurf</a>.
          </p>

          {/* The fix loop */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            From root cause to a verified fix
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            Diagnosis isn&apos;t a fix. Every TraceBug report embeds a runnable failing test
            that replays the captured session and asserts the failure is gone — red while the
            bug exists, green once it&apos;s fixed. The agent runs it, patches, and re-runs
            until green: the report stops being evidence to read and becomes something to
            iterate against.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-[14px] text-text-primary">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            Run the generated test → red confirms the bug → fix → green proves it&apos;s gone.
          </div>

          {/* Privacy */}
          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface/50 p-5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-[13.5px] leading-relaxed text-text-muted">
              <strong className="text-text-primary">Local, not cloud.</strong> Capture runs in
              your browser, the MCP server runs on your machine over stdio with zero network
              connections, and secrets are masked at capture. Your bug data — and your code —
              never leave your machine. MIT open source.
            </p>
          </div>

          {/* Closer */}
          <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/50 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-text-primary">
                <Terminal size={16} className="text-primary" />
                See it fix a real bug
              </div>
              <div className="mt-1 text-[13.5px] text-text-muted">
                Unedited transcript of Claude going from crash to root cause, then a verified fix.
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
