import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

// Deliberately one tier. Paid cloud plans (Pro/Team/Enterprise) were removed
// pre-launch: selling an Enterprise plan before having an Enterprise customer
// reads as aspiration dressed as maturity. When cloud workflows are real,
// they come back as concrete tiers — until then, one honest promise.
const FREE_FEATURES = [
  "Unlimited local bug reports",
  "Unlimited offline .html exports",
  "All capture (clicks, network, console, screenshots, video, voice)",
  "Root-cause hints in every report",
  "GitHub / Linear / Slack / PDF export",
  "Chrome extension + npm SDK",
  "Local MCP server for AI coding agents",
  "Open source (MIT)",
];

export default function PricingClient() {
  return (
    <main className="min-h-screen bg-background text-text-primary">
      <Navbar />
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.03em] leading-tight mb-5">
            Free for local capture.<br />
            <span className="gradient-text">That&apos;s the whole pricing page.</span>
          </h1>
          <p className="text-text-muted text-lg leading-relaxed max-w-2xl mx-auto">
            Capturing bugs and exporting offline .html reports is free for everyone.
            There&apos;s no infrastructure to pay for — reports live on your machine.
          </p>
        </div>
      </section>

      <section className="pb-24 px-4">
        <div className="max-w-md mx-auto">
          <div className="relative rounded-2xl border border-primary/60 bg-primary/5 shadow-glow-primary p-6 flex flex-col">
            <h2 className="text-xl font-bold mb-1">Free</h2>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className="text-3xl font-bold">$0</span>
              <span className="text-xs text-text-muted">forever</span>
            </div>
            <p className="text-sm text-text-muted mb-5">Local-first bug capture. Yours forever.</p>

            <ul className="space-y-2 mb-6 flex-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-success flex-shrink-0 mt-0.5"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="leading-snug">{f}</span>
                </li>
              ))}
            </ul>

            <a
              href="/#install"
              className="w-full rounded-md bg-primary hover:bg-primary/90 text-white px-4 py-2 text-sm font-semibold text-center"
            >
              Get started
            </a>
          </div>

          <div className="mt-8 rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-sm font-bold uppercase tracking-wider text-text-muted mb-2">
              Future cloud workflows
            </h3>
            <p className="text-sm text-text-muted leading-relaxed">
              Optional cloud features (shared links, team workspaces) may be introduced
              later as paid add-ons. If they are, local capture and export will remain
              free — that promise is{" "}
              <a
                href="https://github.com/prashantsinghmangat/tracebug-ai"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                on GitHub
              </a>{" "}
              and won&apos;t change. Want to shape what gets built?{" "}
              <a href="/feedback" className="text-primary hover:underline">
                Tell us what your team needs.
              </a>
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
