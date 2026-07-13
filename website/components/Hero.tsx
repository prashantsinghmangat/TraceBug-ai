"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChromeIcon } from "@/components/ui/brand-icons";
import { ArrowRight, ChevronRight, Sparkles } from "lucide-react";
import Mascot from "@/components/Mascot";
import { SDK_VERSION_TAG } from "@/lib/version";

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

// One full pass of the report-assembly story (stagger in → hold), then the
// key change remounts the grid and the sequence replays from a clean slate.
const BUILD_CYCLE_MS = 10500;

export default function Hero() {
  const [buildCycle, setBuildCycle] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBuildCycle((c) => c + 1), BUILD_CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative overflow-hidden pt-28 pb-16 lg:pt-36 lg:pb-24">
      {/* Aurora field + grid — the futuristic light behind the fold */}
      <div className="absolute inset-0 -z-10 grid-bg opacity-60 [mask-image:radial-gradient(ellipse_75%_55%_at_50%_0%,black,transparent)]" />
      <div className="aurora animate-aurora -z-10 top-[-10%] left-[10%] h-[420px] w-[460px] bg-[#818CF8]/25" />
      <div className="aurora animate-aurora -z-10 top-[5%] right-[5%] h-[380px] w-[420px] bg-[#4F46E5]/20" style={{ animationDelay: "-6s" }} />
      <div className="aurora animate-aurora -z-10 top-[30%] left-[40%] h-[300px] w-[360px] bg-[#6366F1]/15" style={{ animationDelay: "-12s" }} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Eyebrow */}
        <div className="flex justify-center mb-6">
          <a
            href="#how"
            className="group inline-flex items-center gap-2 rounded-full border border-border bg-background/70 backdrop-blur px-3 py-1.5 text-[12.5px] text-text-muted shadow-xs hover:border-border-strong transition-colors"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            <span className="font-medium text-text-primary">{SDK_VERSION_TAG}</span>
            <span className="text-border-strong">·</span>
            <span>Root-cause hints in every report</span>
            <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-4xl text-center text-[42px] sm:text-6xl lg:text-[76px] font-semibold leading-[1.04] tracking-[-0.035em] text-text-primary">
          Bug reports your dev can{" "}
          <span className="gradient-text-anim">actually open</span>
          {/* Trace IS the terminal caret — the bug blinks at the end of the
              line instead of the cursor block */}
          <span className="brand-caret ml-2.5 inline-block w-[0.55em] align-middle" aria-hidden="true">
            <Mascot className="h-auto w-full" animated={false} />
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-center text-text-muted text-lg sm:text-xl leading-relaxed">
          One shortcut captures the bug — replay, console errors, network calls, and
          screenshots — into a single{" "}
          <code className="font-mono text-[0.86em] text-text-primary bg-surface-2 border border-border rounded px-1.5 py-0.5">
            .html
          </code>{" "}
          file. Your dev opens it offline and sees exactly what broke.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" variant="gradient" className="shimmer w-full sm:w-auto">
            <a href={CHROME_URL} target="_blank" rel="noopener noreferrer">
              <ChromeIcon size={16} />
              Add to Chrome — free
              <ArrowRight size={15} />
            </a>
          </Button>
          <a
            href="#mcp"
            className="group inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-border-strong bg-background px-5 h-12 text-[14px] font-medium text-text-primary shadow-xs hover:border-primary/40 transition-colors"
          >
            <Sparkles size={15} className="text-primary" />
            See it debug with AI
            <ArrowRight size={15} className="text-text-subtle transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>

        {/* Product visual — light browser frame with the auto-generated report */}
        <div className="relative mx-auto mt-16 max-w-4xl">
          <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-[#818CF8]/15 via-transparent to-[#4F46E5]/15 blur-2xl" />

          {/* Floating accent chips */}
          <div className="hidden md:block absolute -left-10 top-16 z-20 animate-float">
            <FloatChip tone="error" label="POST /api/orders" value="500" />
          </div>
          <div className="hidden md:block absolute -right-10 top-40 z-20 animate-float" style={{ animationDelay: "-3s" }}>
            <FloatChip tone="success" label="Report ready" value="2 clicks" />
          </div>

          <div className="relative rounded-2xl border border-border bg-background shadow-card overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
              <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
              <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
              <span className="h-3 w-3 rounded-full bg-[#28C840]" />
              <div className="ml-3 flex-1 max-w-sm">
                <div className="flex items-center gap-2 rounded-md bg-background border border-border px-2.5 py-1 text-[11px] text-text-subtle font-mono">
                  <ChevronRight size={12} strokeWidth={2.5} className="text-primary" />
                  bugs/checkout-500.html
                </div>
              </div>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                offline
              </span>
            </div>

            {/* Report body — key remount restarts the assembly loop in sync */}
            <div key={buildCycle} className="p-5 sm:p-7 grid sm:grid-cols-5 gap-6">
              {/* Left: root cause + tldr */}
              <div className="sm:col-span-3 space-y-4">
                <div className="relative">
                  {/* skeleton shown while events stream in — "analyzing…" */}
                  <div
                    className="skel-seq pointer-events-none absolute inset-0 rounded-xl border border-border bg-surface p-4"
                    style={{ "--seq": 6 } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="skel-bar h-2.5 w-24" />
                      <span className="skel-bar h-2.5 w-16" />
                    </div>
                    <span className="skel-bar block h-3 w-full" />
                    <span className="skel-bar mt-2 block h-3 w-3/4" />
                  </div>
                  <div className="build-seq rounded-xl border border-error/20 bg-error/[0.04] p-4" style={{ "--seq": 6 } as React.CSSProperties}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-error">
                      Possible cause
                    </span>
                    <span className="text-[10px] rounded-full bg-error/10 text-error px-2 py-0.5 font-medium">
                      high confidence
                    </span>
                  </div>
                  <p className="text-[14px] text-text-primary leading-relaxed">
                    API <span className="font-mono text-error">POST /api/orders</span> failed
                    with <span className="font-mono text-error font-semibold">500</span> after
                    clicking <span className="text-primary font-medium">&apos;Place Order&apos;</span>
                  </p>
                  </div>
                </div>

                <div className="relative">
                  <div
                    className="skel-seq pointer-events-none absolute inset-0 rounded-xl border border-border bg-surface p-4"
                    style={{ "--seq": 7.5 } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    <span className="skel-bar mb-3 block h-2.5 w-12" />
                    <span className="skel-bar block h-3 w-5/6" />
                  </div>
                  <div className="build-seq rounded-xl border border-border bg-surface p-4" style={{ "--seq": 7.5 } as React.CSSProperties}>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
                      TL;DR
                    </div>
                    <p className="text-[13.5px] text-text-muted leading-relaxed">
                      TypeError on <span className="font-mono text-text-primary">/checkout</span> — Cannot
                      read &apos;status&apos; of undefined.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right: timeline */}
              <div className="sm:col-span-2 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text-subtle mb-3">
                  <span className="rec-dot h-1.5 w-1.5 rounded-full bg-error" aria-hidden="true" />
                  Session timeline
                </div>
                <ul className="space-y-2.5 font-mono text-[12px]">
                  {[
                    { t: "00:02", label: 'click "Cart"', c: "text-text-muted" },
                    { t: "00:04", label: "nav → /checkout", c: "text-accent" },
                    { t: "00:09", label: 'click "Place Order"', c: "text-text-muted" },
                    { t: "00:09", label: "POST /api/orders → 500", c: "text-error" },
                  ].map((s, i) => (
                    <li key={i} className="build-seq flex items-center gap-2.5" style={{ "--seq": i } as React.CSSProperties}>
                      <span className="text-text-subtle tabular-nums text-[11px]">{s.t}</span>
                      <span className={`dot-pop h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.c === "text-error" ? "bg-error" : s.c === "text-accent" ? "bg-accent" : "bg-border-strong"}`} />
                      <span className={s.c}>{s.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatChip({
  tone,
  label,
  value,
}: {
  tone: "error" | "success";
  label: string;
  value: string;
}) {
  const dot = tone === "error" ? "bg-error" : "bg-success";
  const val = tone === "error" ? "text-error" : "text-success";
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-background/90 backdrop-blur px-3 py-2 shadow-card">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="text-[12px] font-mono text-text-muted">{label}</span>
      <span className={`text-[12px] font-mono font-semibold ${val}`}>{value}</span>
    </div>
  );
}
