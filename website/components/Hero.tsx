"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChromeIcon } from "@/components/ui/brand-icons";
import { ArrowRight, Check } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden noise">
      {/* Background: dot grid + a single restrained violet glow.
          Replaces the old two-bloom + grid combo — same depth, less candy. */}
      <div className="absolute inset-0 grid-bg opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-primary/[0.06] blur-[140px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <Badge className="mb-7">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
              </span>
              <span>Local-first</span>
              <span className="text-text-subtle">·</span>
              <span>v1.4</span>
            </Badge>

            {/* Headline */}
            <h1 className="text-[40px] sm:text-5xl lg:text-[64px] font-semibold text-text-primary leading-[1.05] tracking-[-0.03em] mb-6">
              Bug reports your dev can{" "}
              <span className="gradient-text">actually open</span>
            </h1>

            {/* Subheadline — one sentence, not three */}
            <p className="text-text-muted text-base sm:text-lg leading-[1.65] mb-9 max-w-[520px] mx-auto lg:mx-0">
              One click. One self-contained{" "}
              <code className="font-mono text-[0.92em] text-text-primary bg-surface border border-border rounded px-1.5 py-0.5">.html</code>{" "}
              file. Your dev opens it offline.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center lg:justify-start">
              <Button asChild size="lg">
                <a href="#install">
                  Get started — free
                  <ArrowRight size={14} />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a
                  href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ChromeIcon size={14} />
                  Chrome Extension
                </a>
              </Button>
            </div>

            {/* Trust line — 3 items, all use lucide Check */}
            <ul className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center lg:justify-start text-[13px] text-text-muted">
              <li className="flex items-center gap-1.5">
                <Check size={13} className="text-success" strokeWidth={2.5} />
                Stays on your machine
              </li>
              <li className="flex items-center gap-1.5">
                <Check size={13} className="text-success" strokeWidth={2.5} />
                No account
              </li>
              <li className="flex items-center gap-1.5">
                <Check size={13} className="text-success" strokeWidth={2.5} />
                Works offline
              </li>
            </ul>
          </div>

          {/* Right: Terminal-style bug-report preview */}
          <div className="relative">
            <div className="absolute -inset-2 bg-primary/5 blur-3xl rounded-3xl pointer-events-none" />
            <div className="relative rounded-xl overflow-hidden border border-border bg-[#0A0C10] shadow-2xl font-mono text-[12.5px] leading-[1.65]">
              {/* Terminal title bar */}
              <div className="flex items-center gap-1.5 px-3 py-2 bg-surface/60 border-b border-border">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]"></span>
                <span className="ml-3 text-[11px] text-text-muted tracking-tight">
                  ~/bugs/checkout-500.html
                </span>
                <div className="ml-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-text-subtle">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                  </span>
                  <span>offline</span>
                </div>
              </div>

              {/* Terminal body */}
              <div className="px-4 py-4 space-y-3">
                {/* Command prompt */}
                <div>
                  <span className="text-text-subtle">$ </span>
                  <span className="text-text-muted">tracebug</span>
                  <span className="text-text-primary"> capture</span>
                  <span className="text-text-subtle"> --auto-cause</span>
                </div>

                {/* Root cause (terminal-style) */}
                <div className="text-[12px]">
                  <div className="text-error">
                    <span className="text-text-subtle">[</span>
                    <span>cause</span>
                    <span className="text-text-subtle">]</span>
                    <span className="text-text-muted"> (high)</span>
                  </div>
                  <div className="text-text-primary pl-4">
                    <span className="text-text-subtle">▸ </span>
                    POST <span className="text-warning">/api/orders</span> →
                    <span className="text-error font-semibold"> 500</span>
                    {" "}after click{" "}
                    <span className="text-accent">&apos;Place Order&apos;</span>
                  </div>
                </div>

                <div className="border-t border-border/60" />

                {/* TL;DR */}
                <div className="text-[12px]">
                  <div className="text-primary">
                    <span className="text-text-subtle">[</span>
                    <span>tldr</span>
                    <span className="text-text-subtle">]</span>
                  </div>
                  <div className="text-text-primary pl-4">
                    <span className="text-text-subtle">▸ </span>
                    TypeError on <span className="text-accent">/checkout</span>
                    {" "}— Cannot read &apos;status&apos; of undefined
                  </div>
                </div>

                <div className="border-t border-border/60" />

                {/* Timeline */}
                <div className="text-[12px]">
                  <div className="text-text-muted mb-1">
                    <span className="text-text-subtle">[</span>
                    <span>timeline</span>
                    <span className="text-text-subtle">]</span>
                  </div>
                  {[
                    { t: "00:02", icon: "▸", color: "text-text-muted", label: 'click "Cart"' },
                    { t: "00:04", icon: "→", color: "text-accent", label: "nav → /checkout" },
                    { t: "00:09", icon: "▸", color: "text-text-muted", label: 'click "Place Order"' },
                    { t: "00:09", icon: "⨯", color: "text-error", label: "POST /api/orders → 500" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2 pl-4">
                      <span className="text-text-subtle text-[10px] tabular-nums">{step.t}</span>
                      <span className={`${step.color} w-3 flex-shrink-0`}>{step.icon}</span>
                      <span className="text-text-primary/90">{step.label}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border/60" />

                {/* Prompt cursor — implies more below */}
                <div className="text-text-subtle text-[11px]">
                  <span>$ </span>
                  <span className="inline-block w-2 h-3.5 bg-text-muted/70 align-middle animate-pulse" />
                </div>
              </div>
            </div>

            {/* Shortcut hint — mono only, restrained */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-mono text-text-subtle">
              <span>Capture anytime</span>
              <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-text-muted">Ctrl</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-text-muted">Shift</kbd>
              <span>+</span>
              <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] text-text-muted">B</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-muted animate-bounce">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </section>
  );
}
