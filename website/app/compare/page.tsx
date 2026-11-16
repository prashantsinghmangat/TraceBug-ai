import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FinalCTA from "@/components/FinalCTA";
import InstallButtons from "@/components/InstallButtons";
import { social } from "@/lib/social";
import { comparisons } from "@/lib/comparisons";

// The hub for /compare/* (it was a 404). One honest paragraph on where
// TraceBug fits, then every comparison with its one-line difference.

const TITLE = "TraceBug compared: Jam, Sentry, LogRocket, BetterBugs and more";
const DESCRIPTION =
  "How TraceBug compares with bug-reporting, session-replay and feedback tools. TraceBug captures a browser bug into one local file your AI coding agent reads over MCP: no account, no cloud, no capture limit.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/compare" },
  ...social(TITLE, DESCRIPTION, { url: "https://tracebug.dev/compare" }),
};

const FIT = [
  ["Pick TraceBug", "you want the bug's evidence in your AI coding agent, you can't upload customer pages to a SaaS tool, or you don't want a capture limit."],
  ["Pick a cloud reporter (Jam, BetterBugs, Marker.io)", "your team wants shared links, a dashboard and comments more than local files."],
  ["Pick monitoring (Sentry, LogRocket)", "you need to see errors from real users in production, not a bug you can reproduce now."],
] as const;

export default function CompareHub() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 font-mono text-[13px] text-text-subtle">
            <span className="h-2 w-2 rounded-full bg-accent"></span>
            Comparisons
          </div>
          <h1 className="mb-4 text-h2 font-medium text-text-primary">How TraceBug compares</h1>
          <p className="mb-8 text-xl text-text-muted">
            TraceBug captures a browser bug (replay, console, network, your steps) into one file on your machine, and
            your AI coding agent reads it over a local MCP server. Free, open source, no account to capture.
          </p>

          <div className="mb-12 space-y-3">
            {FIT.map(([who, when]) => (
              <p key={who} className="text-text-muted">
                <b className="font-medium text-text-primary">{who}</b> if {when}
              </p>
            ))}
          </div>

          <div className="mb-12 grid gap-4 sm:grid-cols-2">
            {Object.entries(comparisons).map(([slug, c]) => (
              <a
                key={slug}
                href={`/compare/${slug}`}
                className="block rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
              >
                <h2 className="mb-2 text-[18px] font-medium text-text-primary">{c.title}</h2>
                <p className="text-[15px] leading-[1.55] text-text-muted">{c.tagline}</p>
              </a>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <InstallButtons />
          </div>
        </div>
      </div>
      <FinalCTA />
      <Footer />
    </main>
  );
}
