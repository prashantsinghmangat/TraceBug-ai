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
    metaTitle: "TraceBug: Free Sentry Alternative for Frontend Bug Reporting",
    metaDescription: "Compare TraceBug to Sentry. TraceBug is a free, zero-backend bug reporting tool with automatic reproduction steps, screenshots, and session recording. No server setup required.",
    competitor: "Sentry",
    tagline: "All the bug detection power, none of the backend complexity",
    advantages: [
      "Zero backend setup — works in 2 minutes, not 2 hours",
      "Automatic reproduction steps — Sentry shows the error, TraceBug shows how to reproduce it",
      "Built-in screenshot annotation — mark up bugs visually",
      "One-click GitHub/Jira export — paste directly into your workflow",
      "Free forever — no per-event pricing that scales to $thousands",
      "Privacy-first — all data stays in the browser, no data sent to third-party servers",
    ],
    disadvantages: [
      "Sentry has server-side error tracking (Python, Ruby, Java, etc.)",
      "Sentry has alerting rules and integrations with PagerDuty/Slack",
      "Sentry has performance monitoring and tracing",
    ],
  },
  "logrocket-alternative": {
    title: "TraceBug vs LogRocket",
    metaTitle: "TraceBug: Free LogRocket Alternative — Session Recording Without the Price Tag",
    metaDescription: "Compare TraceBug to LogRocket. Get session recording, bug reports, and reproduction steps for free. No $99/month plans, no server dependencies.",
    competitor: "LogRocket",
    tagline: "Session recording and bug reports without the $99/month price tag",
    advantages: [
      "Completely free — LogRocket starts at $99/month for 10K sessions",
      "No data leaves the browser — LogRocket sends everything to their servers",
      "Instant setup — npm install + 2 lines of code. No account registration required",
      "Auto-generated bug reports — not just recordings, but actionable developer reports",
      "One-click Jira/GitHub export with screenshots attached",
      "Voice bug descriptions — describe bugs by speaking",
    ],
    disadvantages: [
      "LogRocket has pixel-perfect session replay (TraceBug captures events, not DOM mutations)",
      "LogRocket has team dashboards with search across all users",
      "LogRocket integrates with Redux/Vuex store inspection",
    ],
  },
  "bugsnag-alternative": {
    title: "TraceBug vs Bugsnag",
    metaTitle: "TraceBug: Free Bugsnag Alternative for Frontend Error Reporting",
    metaDescription: "Compare TraceBug to Bugsnag. Free frontend bug reporting with automatic reproduction steps, zero backend, and instant setup.",
    competitor: "Bugsnag",
    tagline: "Frontend error reporting that developers actually love using",
    advantages: [
      "Zero infrastructure — Bugsnag requires server setup, TraceBug works instantly",
      "Automatic reproduction steps — know exactly how users triggered the bug",
      "Visual bug reporting — annotate screenshots and draw on the live page",
      "Completely free — Bugsnag's free tier is limited to 7,500 events/month",
      "Works offline — all data in localStorage, no network dependency",
      "QA-friendly — non-developers can use the Chrome Extension on any site",
    ],
    disadvantages: [
      "Bugsnag has server-side SDKs (Node.js, Ruby, Python, Go, etc.)",
      "Bugsnag has release tracking and deployment correlation",
      "Bugsnag has error grouping with machine learning",
    ],
  },
  "frontend-bug-reporting-tool": {
    title: "Best Frontend Bug Reporting Tool in 2026",
    metaTitle: "Best Frontend Bug Reporting Tool — TraceBug (Free, Open Source)",
    metaDescription: "TraceBug is the best free frontend bug reporting tool. Automatic session recording, reproduction steps, screenshots, and one-click export to GitHub Issues and Jira.",
    competitor: "Manual Bug Reporting",
    tagline: "Stop wasting hours reproducing bugs. TraceBug does it automatically.",
    advantages: [
      "Auto-captures every click, input, API call, and error",
      "Generates reproduction steps automatically — no more 'it works on my machine'",
      "Screenshots with annotation editor (highlights, arrows, text)",
      "Voice-to-text bug descriptions using browser speech recognition",
      "One-click export to GitHub Issues, Jira Tickets, or PDF",
      "Works with React, Vue, Angular, Svelte, Next.js, and plain HTML",
    ],
    disadvantages: [],
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
            <div className="bg-[#0B0B0F] rounded-lg p-4 font-mono text-sm">
              <div className="text-text-muted">$ npm install tracebug-sdk</div>
              <div className="text-green-400 mt-2">
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
                  <span className="text-green-400 text-lg flex-shrink-0 mt-0.5">&#10003;</span>
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
          <div className="bg-gradient-to-r from-[#6C5CE7]/10 to-[#00D4FF]/10 border border-[#6C5CE7]/20 rounded-xl p-8 text-center">
            <h3 className="text-2xl font-bold text-text-primary mb-3">Ready to try TraceBug?</h3>
            <p className="text-text-muted mb-6">Free, open source, and takes under 2 minutes to set up.</p>
            <div className="flex gap-4 justify-center">
              <a href="/docs" className="px-6 py-3 bg-[#6C5CE7] text-white rounded-lg font-semibold hover:bg-[#5B4BD5] transition-colors">
                Get Started
              </a>
              <a href="https://github.com/prashantsinghmangat/tracebug-ai" className="px-6 py-3 bg-surface border border-border text-text-primary rounded-lg font-semibold hover:border-[#6C5CE7]/50 transition-colors">
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
