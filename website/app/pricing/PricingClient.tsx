"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface Tier {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: string;
  ctaSource: "pricing-pro" | "pricing-team" | null;
  features: string[];
  highlight?: boolean;
  status?: string;
}

const TIERS: Tier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Local-first bug capture. Yours forever.",
    cta: "Get started",
    ctaSource: null,
    features: [
      "Unlimited local bug reports",
      "Unlimited offline .html exports",
      "All capture (clicks, network, console, screenshots, video, voice)",
      "GitHub / Linear / Slack / PDF export",
      "Chrome extension + npm SDK",
      "20 active cloud share links",
      "14-day cloud retention",
      "30-second video cap on cloud uploads",
    ],
  },
  {
    name: "Pro",
    price: "$9",
    cadence: "per user / month",
    tagline: "Unlimited cloud sharing for individual devs and small teams.",
    cta: "Notify me when it launches",
    ctaSource: "pricing-pro",
    highlight: true,
    status: "Coming soon",
    features: [
      "Everything in Free",
      "Unlimited active cloud shares",
      "90-day default retention",
      "5-minute video cap on cloud uploads",
      "“Captured with TraceBug” attribution hidden",
      "Custom company branding in exports",
      "Real Jira API integration",
      "AI root-cause analysis (50/mo)",
      "Priority email support",
    ],
  },
  {
    name: "Team",
    price: "$19",
    cadence: "per user / month · min 3 seats",
    tagline: "Shared workspaces + auto-sync to your bug tracker.",
    cta: "Notify me when it launches",
    ctaSource: "pricing-team",
    status: "Coming soon · Q3 2026",
    features: [
      "Everything in Pro",
      "Shared workspace for the team",
      "Member invites + roles",
      "Real-time activity feed",
      "Slack / Jira / Linear auto-sync on upload",
      "Team dashboard with quotas + analytics",
      "Google SSO",
      "Per-workspace retention controls",
    ],
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "starting ~$1k/mo",
    tagline: "Self-hosted, compliance-ready, fully under your control.",
    cta: "Contact sales",
    ctaSource: null,
    features: [
      "Everything in Team",
      "Self-hosting (Docker Compose)",
      "SAML SSO",
      "Audit logs",
      "SOC2 Type II",
      "Custom retention (forever, if needed)",
      "Dedicated Slack channel + named contact",
    ],
  },
];

export default function PricingClient() {
  return (
    <main className="min-h-screen bg-background text-text-primary">
      <Navbar />
      <section className="pt-32 pb-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-sm text-text-muted mb-6">
            <span className="text-success">●</span>
            Local-first, forever free
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-5">
            Local stays free.<br />
            <span className="gradient-text">Pay for collaboration when you need it.</span>
          </h1>
          <p className="text-text-muted text-lg leading-relaxed max-w-2xl mx-auto">
            Capturing bugs and exporting offline `.html` reports is free for everyone, forever.
            Upgrade only when your team wants shareable URLs, integrations, or self-hosting.
          </p>
        </div>
      </section>

      <section className="pb-24 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((t) => (
            <TierCard key={t.name} tier={t} />
          ))}
        </div>

        <div className="max-w-3xl mx-auto mt-16 text-center text-sm text-text-muted">
          <p className="mb-2">
            Currently in <strong className="text-text-primary">public beta</strong> —
            the SDK ships everything free while we validate. Pro launches first.
          </p>
          <p>
            Local capture + `.html` export will always remain free. That promise is
            <a href="https://github.com/prashantsinghmangat/tracebug-ai" target="_blank" rel="noreferrer" className="text-primary hover:underline mx-1">
              on GitHub
            </a>
            and won&apos;t change.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tier.ctaSource || status === "sending") return;
    setStatus("sending");
    try {
      const res = await fetch("/api/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          source: tier.ctaSource,
          tier: tier.name.toLowerCase(),
        }),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div
      className={`relative rounded-2xl border p-6 flex flex-col ${
        tier.highlight
          ? "border-primary/60 bg-primary/5 shadow-glow-primary"
          : "border-border bg-surface"
      }`}
    >
      {tier.highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
          Recommended
        </div>
      )}
      {tier.status && (
        <div className="text-[10px] uppercase tracking-wider font-bold text-warning mb-2">
          {tier.status}
        </div>
      )}
      <h3 className="text-xl font-bold mb-1">{tier.name}</h3>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="text-3xl font-bold">{tier.price}</span>
        <span className="text-xs text-text-muted">{tier.cadence}</span>
      </div>
      <p className="text-sm text-text-muted mb-5">{tier.tagline}</p>

      <ul className="space-y-2 mb-6 flex-1">
        {tier.features.map((f) => (
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

      {tier.ctaSource ? (
        status === "sent" ? (
          <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs text-success text-center">
            ✓ We&apos;ll email <strong>{email}</strong> when {tier.name} launches.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-2">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!email || status === "sending"}
              className={`w-full rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 ${
                tier.highlight
                  ? "bg-primary hover:bg-primary/90 text-white"
                  : "bg-surface border border-border hover:border-primary/50 text-text-primary"
              }`}
            >
              {status === "sending" ? "Sending…" : tier.cta}
            </button>
            {status === "error" && (
              <p className="text-xs text-error text-center">
                Couldn&apos;t save — try again in a moment.
              </p>
            )}
          </form>
        )
      ) : tier.name === "Enterprise" ? (
        <a
          href="mailto:safeguarddevtz@taazaa.com?subject=TraceBug%20Enterprise%20inquiry"
          className="w-full rounded-md border border-border bg-surface hover:border-primary/50 text-text-primary px-4 py-2 text-sm font-semibold text-center"
        >
          {tier.cta}
        </a>
      ) : (
        <a
          href="/#install"
          className="w-full rounded-md bg-primary hover:bg-primary/90 text-white px-4 py-2 text-sm font-semibold text-center"
        >
          {tier.cta}
        </a>
      )}
    </div>
  );
}
