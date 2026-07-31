import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { notFound } from "next/navigation";

// Programmatic SEO: generates pages like /compare/sentry-alternative, /compare/logrocket-alternative
const comparisons: Record<string, {
  title: string;
  metaTitle: string;
  metaDescription: string;
  competitor: string;
  tagline: string;
  advantages: string[];
  disadvantages: string[];
}> = {
  "sentry-alternative": {
    title: "TraceBug vs Sentry",
    metaTitle: "TraceBug: Free Sentry Alternative for Frontend Bugs Your AI Can Fix",
    metaDescription: "Compare TraceBug to Sentry. Sentry alerts you that an error happened in production. TraceBug captures the full browser context — replay, console, network, repro steps — into one local file your AI coding agent reads and fixes.",
    competitor: "Sentry",
    tagline: "Sentry tells you an error happened. TraceBug gives your AI everything it needs to fix it.",
    advantages: [
      "Full context, not a stack trace — DOM replay, repro timeline, console, and network around the failure, in one file",
      "AI-agent ready — the report is machine-readable over a local MCP server; Claude Code or Cursor investigates it directly",
      "Generated failing Playwright test per report — your agent (or CI) verifies the fix",
      "Zero backend, zero DSN, zero event quota — works in 2 minutes with no per-event pricing",
      "Privacy-first — nothing is uploaded anywhere; Sentry ships every error to their cloud",
      "QA-friendly — testers capture with the extension, no code access needed",
    ],
    disadvantages: [
      "Sentry monitors production passively at scale — TraceBug captures bugs deliberately, one at a time",
      "Sentry has server-side error tracking (Python, Ruby, Java, etc.), alerting, and PagerDuty/Slack integrations",
      "Sentry has performance monitoring, tracing, and release-health dashboards",
    ],
  },
  "logrocket-alternative": {
    title: "TraceBug vs LogRocket",
    metaTitle: "TraceBug: Free LogRocket Alternative — DOM Replay Without the Cloud",
    metaDescription: "Compare TraceBug to LogRocket. DOM session replay, console, and network in one local .html your AI coding agent reads over MCP — no per-session cloud pricing, no data leaving the browser. Free and open source.",
    competitor: "LogRocket",
    tagline: "LogRocket streams sessions to their cloud. TraceBug hands one bug — replay included — to your AI agent.",
    advantages: [
      "DOM session replay (rrweb) inside a single offline .html — no per-session cloud pricing, no retention limits",
      "AI-agent ready — Claude Code or Cursor reads the report over a local MCP server and starts fixing; LogRocket's replay is built for human eyes",
      "Nothing leaves the browser — LogRocket streams every session to their servers; TraceBug captures only the bug you choose to export",
      "Every report embeds a generated failing Playwright test — red until the bug is fixed",
      "Instant setup — npm install + 2 lines, or just the extension. No account",
      "Free and open source (MIT) — no per-seat, per-session, or retention pricing",
    ],
    disadvantages: [
      "LogRocket records EVERY user's session passively — TraceBug captures deliberately, when you or your tester hit Record",
      "LogRocket has product analytics (funnels, heatmaps, frustration signals) across all users",
      "LogRocket has team dashboards with cross-session search and Redux/Vuex store inspection",
    ],
  },
  "bugsnag-alternative": {
    title: "TraceBug vs Bugsnag",
    metaTitle: "TraceBug: Free Bugsnag Alternative — Bug Context for AI Coding Agents",
    metaDescription: "Compare TraceBug to Bugsnag. Bugsnag aggregates production errors in a cloud dashboard. TraceBug captures one bug's complete browser context into a local file that Claude Code or Cursor reads over MCP and fixes.",
    competitor: "Bugsnag",
    tagline: "Bugsnag groups errors in a dashboard. TraceBug hands one reproducible bug to your AI agent.",
    advantages: [
      "Complete evidence per bug — DOM replay, repro steps, console, network, screenshots in one offline .html",
      "AI-agent ready — machine-readable over a local MCP server, plus a generated failing Playwright test to verify the fix",
      "Zero infrastructure and zero event quotas — no API key, no server, no per-event billing",
      "Deliberate capture — you record the bug that matters instead of triaging thousands of grouped events",
      "Privacy-first — nothing leaves the browser; captured secrets are auto-masked",
      "QA-friendly — testers capture with the extension (Chrome, Edge, Firefox), no code access needed",
    ],
    disadvantages: [
      "Bugsnag monitors production passively at scale with error grouping and stability scores",
      "Bugsnag has server-side SDKs (Node.js, Ruby, Python, Go, etc.)",
      "Bugsnag has release tracking and deployment correlation",
    ],
  },
  "jam-alternative": {
    title: "TraceBug vs Jam",
    metaTitle: "TraceBug: Free, Local-First Jam Alternative (AI-agent ready)",
    metaDescription: "Compare TraceBug to Jam.dev. TraceBug captures the bug into one offline .html file your AI coding agent reads over MCP and fixes — no cloud, no account, no backend. Free and open source.",
    competitor: "Jam",
    tagline: "Jam sends the bug to a dashboard. TraceBug sends it to your AI agent.",
    advantages: [
      "AI-agent ready — a local MCP server hands the report to Claude Code, Cursor, or Windsurf to fix; Jam is built for a human dashboard",
      "Every report embeds a generated failing test the agent runs to verify the fix",
      "Local-first, zero backend — the report is one self-contained .html file, nothing is uploaded",
      "Free and open source (MIT) — Jam is a paid cloud product",
      "Works offline — open the report file with no network, no login",
      "Secrets auto-masked at capture (JWTs, API keys) before they ever enter the file",
    ],
    disadvantages: [
      "Jam has a hosted team dashboard with shared links out of the box",
      "Jam offers cloud storage and cross-device history",
      "Jam's onboarding needs no local MCP setup for the AI step",
    ],
  },
  "betterbugs-alternative": {
    title: "TraceBug vs BetterBugs",
    metaTitle: "TraceBug: Free, Open-Source BetterBugs Alternative (AI-agent ready)",
    metaDescription: "Compare TraceBug to BetterBugs. Both capture console, network, and replay from the browser — TraceBug keeps it all local in one .html file your AI coding agent reads over MCP, free and open source, no account.",
    competitor: "BetterBugs",
    tagline: "Same evidence capture — but local-first, open source, and built for your AI agent, not a cloud dashboard.",
    advantages: [
      "Local-first — the report is one self-contained offline .html; BetterBugs uploads captures to their cloud workspace",
      "AI-agent ready — a local MCP server hands the report to Claude Code, Cursor, or Windsurf; plus a generated failing Playwright test",
      "No account, ever — capture and export without signing up; BetterBugs requires an account to share",
      "Free and open source (MIT) — inspect exactly what's captured; no per-seat plans for core capture",
      "Secrets auto-masked at capture (tokens, keys) before they ever enter the file",
      "SDK + extension + MCP + CLI in one project — the whole workflow, not just the capture step",
    ],
    disadvantages: [
      "BetterBugs has a hosted team workspace with shared links and comments out of the box",
      "BetterBugs offers cloud history across devices and teammates",
      "BetterBugs's Slack/Jira integrations are configured once per team, not per user",
    ],
  },
  "marker-io-alternative": {
    title: "TraceBug vs Marker.io",
    metaTitle: "TraceBug: Free Marker.io Alternative for Developer-First Bug Capture",
    metaDescription: "Compare TraceBug to Marker.io. Marker.io routes visual website feedback into project tools for agencies. TraceBug captures deep technical evidence — replay, console, network — into a local file AI coding agents can debug.",
    competitor: "Marker.io",
    tagline: "Marker.io collects client feedback. TraceBug captures the technical evidence that gets bugs fixed.",
    advantages: [
      "Deep technical capture — DOM replay, console errors, network requests, and a repro timeline, not just an annotated screenshot",
      "AI-agent ready — the report is machine-readable over a local MCP server; a failing Playwright test verifies the fix",
      "Free and open source — Marker.io is a paid per-seat product",
      "No account and no widget snippet approval process — install the extension and capture on any site",
      "Local-first — evidence stays on your machine until you choose where it goes",
      "Exports everywhere Marker.io sends feedback (GitHub, Jira, Linear) — plus PDF, HAR, zip, and AI-ready formats",
    ],
    disadvantages: [
      "Marker.io is built for CLIENT feedback — non-technical reporters annotating a live site into your PM tool with zero setup on their side",
      "Marker.io has two-way sync with project tools (status updates flow back to the reporter)",
      "Marker.io has team routing, forms, and SLA-style workflows agencies rely on",
    ],
  },
  "bird-eats-bug-alternative": {
    title: "TraceBug vs Bird Eats Bug",
    metaTitle: "TraceBug: Free, Local-First Bird Eats Bug Alternative",
    metaDescription: "Compare TraceBug to Bird Eats Bug. Both record the screen with console and network attached — TraceBug keeps the whole report in one offline .html your AI agent reads over MCP. Free, open source, no account.",
    competitor: "Bird Eats Bug",
    tagline: "Same instant-replay idea — minus the cloud, plus an AI agent that can actually fix the bug.",
    advantages: [
      "Local-first — recordings and evidence live in one offline .html on your machine; Bird uploads sessions to their cloud",
      "AI-agent ready — Claude Code or Cursor reads the report directly over a local MCP server and starts debugging",
      "Generated failing Playwright test per report — the fix is verifiable, not just describable",
      "Free and open source (MIT) — no per-seat pricing for capture, replay, or exports",
      "DOM replay alongside video — inspect the actual elements, not just pixels",
      "Secrets auto-masked at capture; blur sensitive page regions before recording",
    ],
    disadvantages: [
      "Bird Eats Bug has hosted sharing — a link teammates open without receiving a file",
      "Bird has team workspaces with comments and status tracking",
      "Bird's browser support and mobile SDKs cover platforms TraceBug doesn't yet",
    ],
  },
  "bugherd-alternative": {
    title: "TraceBug vs BugHerd",
    metaTitle: "TraceBug: Free BugHerd Alternative — Technical Bug Capture, Not Sticky Notes",
    metaDescription: "Compare TraceBug to BugHerd. BugHerd pins visual feedback to page elements for agencies and clients. TraceBug captures the underlying technical evidence — replay, console, network — for developers and their AI agents.",
    competitor: "BugHerd",
    tagline: "BugHerd pins feedback on the page. TraceBug captures what actually broke underneath it.",
    advantages: [
      "Technical evidence, not annotations — console errors, failed requests, DOM replay, and repro steps captured automatically",
      "AI-agent ready — reports are machine-readable over a local MCP server, with a generated failing test",
      "Free and open source — BugHerd is a paid per-seat product",
      "Works on any site immediately — no project setup, no embed script, no client invitations",
      "Local-first and private — nothing uploads unless you export it somewhere",
      "Built for the fix, not the task board — the report contains what a developer (or agent) needs to reproduce and resolve",
    ],
    disadvantages: [
      "BugHerd's kanban task board and client-feedback workflow are the product — TraceBug has no task management",
      "BugHerd lets non-technical clients report by clicking the page element, with zero installs on their side",
      "BugHerd has agency features: guest reporters, project-per-client, feedback triage",
    ],
  },
  "userback-alternative": {
    title: "TraceBug vs Userback",
    metaTitle: "TraceBug: Free Userback Alternative for Bug Evidence (Not Just Feedback)",
    metaDescription: "Compare TraceBug to Userback. Userback collects user feedback and feature requests with screenshots. TraceBug captures complete technical bug context — replay, console, network — that AI coding agents can debug directly.",
    competitor: "Userback",
    tagline: "Userback hears what users feel. TraceBug captures what the browser did.",
    advantages: [
      "Full technical capture — DOM replay, console, network, environment, and a repro timeline in one offline .html",
      "AI-agent ready — a local MCP server + generated failing Playwright test turn the report into a fix workflow",
      "Free and open source — Userback is a paid per-seat feedback platform",
      "No account, no widget deployment — the extension captures on any site today",
      "Local-first — bug evidence never touches a third-party cloud",
      "Developer-grade exports — GitHub, Jira, Linear, HAR, PDF, zip, chat-safe AI report",
    ],
    disadvantages: [
      "Userback is a full feedback platform — surveys, feature requests, roadmaps, and user sentiment, not just bugs",
      "Userback has hosted portals where end users submit and track feedback",
      "Userback's session replay spans general user journeys, not just captured bug moments",
    ],
  },
  "replay-io-alternative": {
    title: "TraceBug vs Replay.io",
    metaTitle: "TraceBug: Lightweight Replay.io Alternative for Everyday Bug Capture",
    metaDescription: "Compare TraceBug to Replay.io. Replay.io is a time-travel debugger with full runtime recording. TraceBug is the lightweight everyday capture: replay, console, network in one local .html your AI agent debugs over MCP.",
    competitor: "Replay.io",
    tagline: "Replay.io records the runtime for deep debugging sessions. TraceBug captures the everyday bug in 20 seconds.",
    advantages: [
      "Instant, everyday capture — one shortcut on any site, no special recording browser required",
      "One portable artifact — a self-contained .html any teammate opens offline; no cloud viewer needed",
      "AI-agent ready — machine-readable over a local MCP server, with a generated failing Playwright test",
      "QA-friendly — testers capture with a normal extension; developers or agents debug from the file",
      "Free and open source, local-first — recordings never leave the machine",
      "Captures the reporting context too — annotated screenshots, voice notes, repro steps, priority",
    ],
    disadvantages: [
      "Replay.io records the entire JS runtime — you can inspect any variable at any moment after the fact (true time-travel debugging TraceBug doesn't attempt)",
      "Replay.io's browser DevTools-style investigation is deeper for gnarly, non-reproducible runtime bugs",
      "Replay.io has hosted collaboration around a shared recording",
    ],
  },
  "frontend-bug-reporting-tool": {
    title: "Automated Frontend Bug Reporting",
    metaTitle: "Automated Frontend Bug Reporting — TraceBug (Free, Open Source)",
    metaDescription: "TraceBug replaces hand-written bug reports with captured browser evidence: session recording, reproduction steps, console and network logs in one local .html file a human can open or an AI agent can investigate.",
    competitor: "manual bug reporting",
    tagline: "Browser evidence a human can open — or an AI coding agent can investigate. No more twenty-minute write-ups.",
    advantages: [
      "Auto-captures every click, input, API call, and error",
      "Generates reproduction steps automatically — no more 'it works on my machine'",
      "Screenshots with annotation editor (highlights, arrows, text)",
      "Voice-to-text bug descriptions using browser speech recognition",
      "One-click export to GitHub Issues, Jira Tickets, or PDF",
      "Works with React, Vue, Angular, Svelte, Next.js, and plain HTML",
    ],
    disadvantages: [
      "Backend-only bugs never reach the browser — server logs and APM tools are still the right evidence there",
      "The extension ships for Chrome (plus Edge, Brave, Opera); the Firefox build is in final testing ahead of its AMO listing",
      "There's no hosted team dashboard — reports are local files you share yourself",
      "The AI-agent step needs a one-time local MCP setup",
    ],
  },
};

export async function generateStaticParams() {
  return Object.keys(comparisons).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = comparisons[params.slug];
  if (!data) return {};
  return {
    title: data.metaTitle,
    description: data.metaDescription,
    openGraph: { title: data.metaTitle, description: data.metaDescription },
  };
}

export default function ComparePage({ params }: { params: { slug: string } }) {
  const data = comparisons[params.slug];
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-text-muted text-sm mb-4">
              <span className="w-2 h-2 rounded-full bg-accent"></span>
              Comparison
            </div>
            <h1 className="text-4xl font-bold text-text-primary mb-4">{data.title}</h1>
            <p className="text-xl text-text-muted">{data.tagline}</p>
          </div>

          {/* Quick install CTA */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-12">
            <p className="text-text-muted text-sm mb-3">Try TraceBug in 30 seconds:</p>
            <div className="code-block p-4 rounded-lg font-mono text-sm">
              <div className="text-text-muted">$ npm install tracebug-sdk</div>
              <div className="text-success mt-2">
                {`import TraceBug from "tracebug-sdk";`}
                <br />
                {`TraceBug.init({ projectId: "my-app" });`}
              </div>
            </div>
          </div>

          {/* Advantages */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-text-primary mb-6">
              Why developers choose TraceBug over {data.competitor}
            </h2>
            <div className="space-y-4">
              {data.advantages.map((adv, i) => (
                <div key={i} className="flex items-start gap-3 bg-surface border border-border rounded-lg p-4">
                  <span className="text-success text-lg flex-shrink-0 mt-0.5">&#10003;</span>
                  <span className="text-text-primary">{adv}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Honest disadvantages */}
          {data.disadvantages.length > 0 && (
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-text-primary mb-6">
                When {data.competitor} might be a better fit
              </h2>
              <div className="space-y-3">
                {data.disadvantages.map((dis, i) => (
                  <div key={i} className="flex items-start gap-3 text-text-muted">
                    <span className="text-text-muted flex-shrink-0 mt-0.5">&bull;</span>
                    <span>{dis}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Final CTA */}
          <div className="bg-gradient-to-r from-primary/10 to-accent/10 border border-primary/20 rounded-xl p-8 text-center">
            <h3 className="text-2xl font-bold text-text-primary mb-3">Ready to try TraceBug?</h3>
            <p className="text-text-muted mb-6">Free, open source, and takes under 2 minutes to set up.</p>
            <div className="flex gap-4 justify-center">
              <a href="/docs" className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:brightness-110 transition-colors">
                Get Started
              </a>
              <a href="https://github.com/prashantsinghmangat/tracebug-ai" className="px-6 py-3 bg-surface border border-border text-text-primary rounded-lg font-semibold hover:border-primary/50 transition-colors">
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
}
