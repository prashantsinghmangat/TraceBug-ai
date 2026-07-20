import type { Metadata } from "next";
import { ArrowRight, Zap, FileText, MousePointerClick, ShieldCheck } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { ChromeIcon } from "@/components/ui/brand-icons";

// Exact-match landing page for the primary keyword "instant bug report".
// Same programmatic-SEO play as /compare/* — real, honest content that
// answers the query, then funnels to sandbox → extension → /proof.

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

export const metadata: Metadata = {
  title: "Instant Bug Report — one click, one file, zero forms | TraceBug",
  description:
    "Create an instant bug report in two clicks: session replay, console errors, network requests, screenshots, and repro steps in one offline .html file. Free, no account, nothing uploaded.",
  alternates: { canonical: "/instant-bug-report" },
  openGraph: {
    title: "Instant Bug Report — one click, one file, zero forms",
    description:
      "Session replay, console errors, network requests, screenshots, and repro steps — captured instantly into one offline .html file. Free, no account.",
    url: "https://tracebug.dev/instant-bug-report",
    images: [{ url: "/api/og", width: 1200, height: 630 }],
  },
};

const CONTAINS = [
  { label: "Session replay", detail: "what the user actually did, replayable" },
  { label: "Console errors", detail: "full stack traces, copyable text" },
  { label: "Network log", detail: "the failed request, status, and timing" },
  { label: "Screenshots", detail: "captured at the moment it broke" },
  { label: "Repro timeline", detail: "every click and input, millisecond-stamped" },
  { label: "Environment", detail: "browser, OS, URL, viewport — auto-filled" },
];

export default function InstantBugReportPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 pb-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-12 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-sm text-text-muted">
              <Zap size={13} className="text-primary" />
              Two clicks. No forms. No account.
            </div>
            <h1 className="mb-4 text-4xl sm:text-5xl font-bold tracking-[-0.02em] text-text-primary">
              Instant bug report:
              <br />
              one click, one file, zero forms
            </h1>
            <p className="mx-auto max-w-2xl text-lg leading-relaxed text-text-muted">
              An instant bug report shouldn&apos;t mean a faster form. It means no form at
              all: TraceBug records what actually happened in the browser and packs the
              evidence into a single offline <code className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-text-primary">.html</code> file
              — free, open source, and nothing ever leaves your machine.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="gradient">
                <a href={CHROME_URL} target="_blank" rel="noopener noreferrer">
                  <ChromeIcon size={15} /> Add to Chrome — free <ArrowRight size={14} />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="/try.html" target="_blank" rel="noopener noreferrer">
                  Try it on a live bug <ArrowRight size={14} />
                </a>
              </Button>
            </div>
          </div>

          {/* What instant actually means */}
          <h2 className="mb-4 mt-14 text-2xl font-semibold text-text-primary">
            What &ldquo;instant&rdquo; actually means here
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            Most bug-reporting tools speed up the paperwork: a nicer form, an
            auto-filled field or two, then the same twenty minutes of describing what
            you saw. TraceBug removes the describing. It records the browser session
            itself — so when a bug happens, the report already exists. You click{" "}
            <strong className="text-text-primary">Capture Bug</strong>, then{" "}
            <strong className="text-text-primary">Export</strong>. That&apos;s the whole
            workflow: an instant bug report in two clicks, typically under a megabyte.
          </p>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            The exported file opens offline in any browser. Your developer doesn&apos;t
            need an account, a login, or your tool installed — they double-click the
            file and watch exactly what broke, with the console error and the failing
            network request lined up on the same timeline.
          </p>

          {/* What's inside */}
          <h2 className="mb-5 mt-12 text-2xl font-semibold text-text-primary">
            What&apos;s inside an instant report
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {CONTAINS.map((item) => (
              <div key={item.label} className="rounded-xl border border-border bg-surface/50 p-4">
                <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-text-primary">
                  <FileText size={14} className="text-primary" /> {item.label}
                </div>
                <div className="text-[13px] text-text-muted">{item.detail}</div>
              </div>
            ))}
          </div>

          {/* Instant vs manual */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            Instant vs. manual: where the twenty minutes go
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            A manual bug report is transcription: re-trigger the bug, screenshot it,
            copy the console, remember the steps, write it all up — and it still comes
            back with questions, because humans forget the double-click and crop the
            stack trace. The captured version can&apos;t forget: the evidence is recorded
            as it happens, not reconstructed afterwards. That&apos;s the difference between
            a report that gets fixed today and one that starts a comment thread. (If you
            do write reports by hand, we published{" "}
            <a href="/blog/how-to-write-a-bug-report-developers-actually-read" className="text-primary hover:underline">
              a template that works
            </a>
            .)
          </p>

          {/* AI angle */}
          <h2 className="mb-4 mt-12 text-2xl font-semibold text-text-primary">
            Instant for your AI agent, too
          </h2>
          <p className="mb-4 text-[15px] leading-[1.75] text-text-muted">
            The same report is machine-readable: a local MCP server (
            <code className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-text-primary">npx -y tracebug mcp</code>
            ) lets Claude Code, Cursor, or Windsurf read the evidence directly.{" "}
            <a href="/proof" className="text-primary hover:underline">
              Watch the unedited transcript
            </a>{" "}
            of Claude going from crash to root cause in five tool calls.
          </p>

          {/* Privacy strip */}
          <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-surface/50 p-5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" />
            <p className="text-[13.5px] leading-relaxed text-text-muted">
              <strong className="text-text-primary">Instant doesn&apos;t mean uploaded.</strong>{" "}
              The capture happens in your browser and the file lands on your disk — there
              is no backend, no account, and no telemetry. MIT-licensed open source;
              audit it.
            </p>
          </div>

          {/* Closer */}
          <div className="mt-12 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface/50 p-6 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="flex items-center gap-2 font-semibold text-text-primary">
                <MousePointerClick size={16} className="text-primary" />
                Get your first instant bug report in 60 seconds
              </div>
              <div className="mt-1 text-[13.5px] text-text-muted">
                The live sandbox has intentional bugs — trigger one, capture it, open the export.
              </div>
            </div>
            <Button asChild variant="gradient">
              <a href="/try.html" target="_blank" rel="noopener noreferrer">
                Open the sandbox <ArrowRight size={14} />
              </a>
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
