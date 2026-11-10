import { LINKS } from "@/lib/site";
import { Check } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import EmailCapture from "@/components/EmailCapture";
import PageMascot from "@/components/PageMascot";
import InstallButtons from "@/components/InstallButtons";


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
  "Chrome and Firefox extension + npm SDK",
  "Local MCP server for AI coding agents",
  "Open source (MIT)",
];

export default function PricingClient() {
  return (
    <main className="min-h-screen bg-background text-text-primary">
      <Navbar />

      <section className="pt-32 pb-24 lg:pt-40">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
          <div className="min-w-0 lg:col-span-6">
            <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">Pricing</span>
            <h1 className="text-h2 font-medium">
              Free for local capture.
              <br />
              <span className="text-text-subtle">That&apos;s the whole pricing page.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[18px] leading-[1.6] text-text-muted">
              Capturing bugs and exporting offline .html reports is free for everyone. There&apos;s no
              infrastructure to pay for: reports live on your machine.
            </p>
            <PageMascot size={180} pose="fixed" className="mt-10 hidden lg:block" />
          </div>

          <div className="min-w-0 lg:col-span-6">
            <div className="rounded-2xl border border-border-strong bg-background p-8 shadow-card">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[20px] font-medium">Free</h2>
                <span className="font-mono text-[13px] text-text-subtle">forever</span>
              </div>
              <div className="mt-3 text-[48px] font-medium leading-none tracking-[-0.02em] tabular-nums">$0</div>
              <p className="mt-3 text-[15px] text-text-muted">Local-first bug capture. Yours forever.</p>

              <ul className="mt-8 space-y-3 border-t border-border pt-6">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex gap-3 text-[15px] leading-[1.5]">
                    <Check size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-text-primary" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <InstallButtons itemClassName="sm:flex-1" />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-8">
              <h3 className="text-[16px] font-medium">Future cloud workflows</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-text-muted">
                Optional cloud features (shared links, team workspaces) may be introduced later as paid
                add-ons. If they are, local capture and export will remain free. That promise is{" "}
                <a
                  href={LINKS.repo}
                  target="_blank"
                  rel="noreferrer"
                  className="text-text-primary underline underline-offset-2"
                >
                  on GitHub
                </a>{" "}
                and won&apos;t change. Want to shape what gets built?{" "}
                <a href="/feedback" className="text-text-primary underline underline-offset-2">
                  Tell us what your team needs
                </a>
                .
              </p>
              <div className="mt-6">
                <EmailCapture
                  source="pricing-pro"
                  tier="pro"
                  heading="Get one email when cloud sharing ships"
                  sub="Shareable links, team workspaces, report history — the future paid tier. Joining this list is also how we measure whether to build it."
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
