import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Terminal, CheckCircle2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionHeading from "@/components/SectionHeading";
import Mascot from "@/components/Mascot";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Real transcript: Claude reads a TraceBug report — TraceBug",
  description:
    "Unedited transcript of an AI coding agent diagnosing a bug from a TraceBug export via MCP: five tool calls from crash to root cause, no human explanation needed.",
  alternates: { canonical: "/proof" },
  // /proof is the share target for every community post — it gets its own
  // transcript-styled card instead of the generic homepage one.
  openGraph: {
    title: "Watch Claude debug a real bug — unedited transcript",
    description:
      "Five MCP tool calls from crash to root cause, reading a TraceBug report. 100% local — nothing uploaded.",
    url: "https://tracebug.dev/proof",
    type: "article",
    images: [{ url: "/api/og/proof", width: 1200, height: 630, alt: "Real transcript: Claude debugging a bug from a TraceBug report" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Watch Claude debug a real bug — unedited transcript",
    description: "Five MCP tool calls from crash to root cause. 100% local.",
    images: ["/api/og/proof"],
  },
};

// This page is the proof artifact for the AI-agent story. Everything in the
// transcript blocks below is REAL output, captured 2026-07-19: a bug was
// triggered on /try.html, captured and exported with the actual widget, and
// Claude read the export through `npx -y tracebug mcp`. Only trimmed for
// length (env details, SVG icon strings) — never reworded.

const CALLS: { tool: string; note: string; output: string }[] = [
  {
    tool: "list_bug_reports()",
    note: "The agent starts blind — it only knows a report exists somewhere.",
    output: `{
  "reports": [{
    "file": "tracebug-replay-93e6615d-2026-07-19T08-07-00.html",
    "title": "Try.html Page: \\"Place order\\" Action Fails — TypeError",
    "summary": "API POST /api/orders failed with 404 when clicking
                'Place order' button on /try.html",
    "severity": "critical",
    "rootCause": {
      "hint": "API POST /api/orders failed with 404 after clicking 'Place order'",
      "confidence": "high"
    },
    "counts": { "consoleErrors": 1, "networkFailures": 2, "userActions": 6 }
  }],
  "nextStep": "Call get_bug_report on a file for the full overview..."
}`,
  },
  {
    tool: 'get_bug_report("tracebug-replay-93e6615d")',
    note: "The report answers with an investigation guide — it tells the agent what to look at, in priority order.",
    output: `{
  "title": "Try.html Page: \\"Place order\\" Action Fails — TypeError",
  "environment": "Chrome 150.0.0.0 · Windows 10/11 · 1280x800",
  "sessionDurationMs": 463,
  "investigationGuide": [
    "[HIGH] get_network_activity — 2 failed requests captured...",
    "[HIGH] get_console_errors — 1 console error captured; stack traces
            point at the failing file and function.",
    "[MEDIUM] get_repro_steps — the plain-English steps and session
            timeline show what the user did leading up to the bug.",
    "Finally: cross-reference the findings with the codebase..."
  ]
}`,
  },
  {
    tool: 'get_console_errors("tracebug-replay-93e6615d")',
    note: "The stack trace names the exact file and line.",
    output: `{
  "count": 1,
  "entries": [{
    "level": "error",
    "message": "Uncaught TypeError: Cannot read properties of undefined
                (reading 'discount')",
    "stack": "TypeError: Cannot read properties of undefined (reading 'discount')
    at http://localhost:3799/try.html:140:31"
  }]
}`,
  },
  {
    tool: 'get_network_activity("tracebug-replay-93e6615d")',
    note: "The second failure, with method, status, and timing.",
    output: `{
  "failureCount": 2,
  "requests": [
    { "method": "POST", "url": "/api/orders", "status": 404, "durationMs": 12 },
    { "method": "GET",  "url": "http://localhost:3799/api/orders", "status": 404 }
  ]
}`,
  },
  {
    tool: 'get_repro_steps("tracebug-replay-93e6615d")',
    note: "A millisecond-resolution timeline of what the user actually did.",
    output: `"timeline": [
  { "elapsed": "00:00.00", "description": "click \\"Apply coupon\\"" },
  { "elapsed": "00:00.06", "description": "Uncaught TypeError: Cannot read
                            properties of undefined (reading 'discount')" },
  { "elapsed": "00:00.27", "description": "input \\"coupon\\" = \\"SAVE20\\"" },
  { "elapsed": "00:00.44", "description": "click \\"Place order\\"" },
  { "elapsed": "00:00.46", "description": "POST /api/orders → 404 (12ms)" }
]`,
  },
];

export default function ProofPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <article className="pt-32 pb-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <SectionHeading
            align="left"
            eyebrow="Real transcript · nothing staged"
            title="We gave Claude a TraceBug report. Here's exactly what happened."
            subtitle="A bug was triggered on our live sandbox, captured with the real widget, exported to one .html file — and an AI coding agent read it through TraceBug's MCP server. Five tool calls from crash to root cause. The outputs below are unedited (trimmed for length only)."
            className="mb-12"
          />

          {/* the setup */}
          <div className="mb-10 rounded-2xl border border-border bg-surface/50 p-5 text-[14px] leading-relaxed text-text-muted">
            <strong className="text-text-primary">The setup.</strong> The{" "}
            <a href="/try.html" className="text-primary hover:underline">live sandbox</a> has two
            intentional bugs: applying the coupon <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[12.5px] text-text-primary">SAVE20</code> throws
            a TypeError, and placing the order calls an endpoint that doesn&apos;t exist. We captured
            both with two clicks, exported the report, and registered the MCP server:
            <pre className="code-block mt-3 overflow-x-auto p-3 text-text-primary">claude mcp add tracebug -- npx -y tracebug mcp</pre>
            Then we asked the agent to investigate. No other context was given.
          </div>

          {/* the transcript */}
          <div className="space-y-6">
            {CALLS.map((c, i) => (
              <div key={c.tool}>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 font-mono text-[11px] font-bold text-primary">
                    {i + 1}
                  </span>
                  <code className="font-mono text-[13.5px] font-semibold text-text-primary">
                    <Terminal size={13} className="mr-1.5 inline text-primary" />
                    {c.tool}
                  </code>
                </div>
                <p className="mb-2 pl-[34px] text-[13px] text-text-muted">{c.note}</p>
                <pre className="code-block ml-[34px] overflow-x-auto p-4 text-[12px] leading-relaxed text-text-muted">
                  {c.output}
                </pre>
              </div>
            ))}
          </div>

          {/* the diagnosis */}
          <div className="mt-12 rounded-2xl border border-success/25 bg-success/[0.04] p-6">
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-success">
              <CheckCircle2 size={16} /> The agent&apos;s diagnosis — from the report alone
            </div>
            <div className="space-y-4 text-[14.5px] leading-relaxed text-text-primary">
              <p>
                <strong>Bug 1 — the TypeError.</strong> The stack trace points at{" "}
                <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">try.html:140</code>.
                That line reads <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">coupons[code].discount</code> —
                but the coupon map only defines <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">WELCOME10</code>,
                so entering <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">SAVE20</code> reads{" "}
                <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">.discount</code> off{" "}
                <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">undefined</code>. Fix: guard unknown codes before the read.
              </p>
              <p>
                <strong>Bug 2 — the failed order.</strong>{" "}
                <code className="rounded border border-border bg-surface-2 px-1 font-mono text-[13px]">POST /api/orders → 404</code> in
                12ms: the endpoint doesn&apos;t exist on this host. The timeline proves the order in
                which the user hit both bugs — 463 milliseconds, fully reconstructed.
              </p>
              <p className="text-text-muted">
                Total investigation: <strong className="text-text-primary">5 tool calls</strong>. Nobody
                explained the bug, shared a screen, or answered &quot;what were you doing when it broke?&quot;
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="mt-12 flex flex-col items-center gap-5 rounded-3xl border border-border bg-surface/50 px-6 py-10 text-center">
            <Mascot size={64} />
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
              Run this exact experiment yourself
            </h2>
            <p className="max-w-md text-[14.5px] text-text-muted">
              The sandbox, the bugs, and the MCP server are all public. Capture, export, and hand the
              report to your own agent — it takes about two minutes.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gradient">
                <a href="/try.html" target="_blank" rel="noopener noreferrer">
                  Open the live sandbox <ArrowRight size={15} />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/docs/mcp">MCP setup guide</Link>
              </Button>
            </div>
          </div>

          <p className="mt-8 text-center text-[12px] text-text-subtle">
            Transcript generated 2026-07-19 by Claude reading a real TraceBug export via{" "}
            <code className="font-mono">npx -y tracebug mcp</code>. Outputs trimmed for length, never reworded.
          </p>
        </div>
      </article>
      <Footer />
    </main>
  );
}
