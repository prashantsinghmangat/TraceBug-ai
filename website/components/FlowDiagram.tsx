"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  MonitorPlay,
  TerminalSquare,
  ArrowLeftRight,
  MousePointerClick,
  Sparkles,
  MousePointer2,
  Wind,
  PlugZap,
  FileCode2,
} from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import Mascot from "@/components/Mascot";

// Userback-style "everything connects" diagram: capture sources on the left,
// the single .html report in the middle (with Trace, the mascot), AI agents on
// the right. Beams are real SVG beziers measured from the live card positions
// (ref + ResizeObserver) so they stay attached at every viewport width; the
// animated dash overlay is pure CSS (`.beam-flow`) and honors reduced motion.
// Beams only render ≥ lg — below that the columns stack and arrows would lie.

const SOURCES = [
  { icon: MonitorPlay, title: "Session replay", sub: "Pixel-accurate DOM recording" },
  { icon: TerminalSquare, title: "Console errors", sub: "Stack traces included" },
  { icon: ArrowLeftRight, title: "Network calls", sub: "Failing request + payload" },
  { icon: MousePointerClick, title: "Repro steps", sub: "Every click, typed & timed" },
];

const TARGETS = [
  { icon: Sparkles, title: "Claude Code", sub: "via MCP" },
  { icon: MousePointer2, title: "Cursor", sub: "via MCP" },
  { icon: Wind, title: "Windsurf", sub: "via MCP" },
  { icon: PlugZap, title: "Any MCP client", sub: "or paste the .html" },
];

export default function FlowDiagram() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hubRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const targetRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [paths, setPaths] = useState<string[]>([]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const hub = hubRef.current;
      if (!hub) return;
      // Beams are hidden below lg; skip the work when columns are stacked.
      if (!window.matchMedia("(min-width: 1024px)").matches) {
        setPaths([]);
        return;
      }
      const box = container.getBoundingClientRect();
      const h = hub.getBoundingClientRect();
      const hubL = { x: h.left - box.left, y: h.top - box.top + h.height / 2 };
      const hubR = { x: h.right - box.left, y: hubL.y };

      const curve = (from: { x: number; y: number }, to: { x: number; y: number }) => {
        const bend = (to.x - from.x) * 0.45;
        return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
      };

      const next: string[] = [];
      for (const el of sourceRefs.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next.push(curve({ x: r.right - box.left, y: r.top - box.top + r.height / 2 }, hubL));
      }
      for (const el of targetRefs.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next.push(curve(hubR, { x: r.left - box.left, y: r.top - box.top + r.height / 2 }));
      }
      setPaths(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="One report, everything connected"
          title="The whole bug flows into one file — and out to any AI"
          subtitle="Replay, console, network, and repro steps land in a single .html. From there, any MCP-connected agent reads it and starts fixing — no uploads, no accounts."
        />

        <div ref={containerRef} className="relative mt-14 lg:mt-16">
          {/* connection beams (≥ lg only) */}
          <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" aria-hidden="true">
            {paths.map((d, i) => (
              <g key={i}>
                <path d={d} className="stroke-border-strong" strokeWidth="1.5" fill="none" />
                <path
                  d={d}
                  className="beam-flow stroke-primary"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                  style={{ animationDelay: `${i * -0.55}s` }}
                />
              </g>
            ))}
          </svg>

          <div className="grid items-center gap-10 lg:grid-cols-[1fr_auto_1fr] lg:gap-16">
            {/* sources */}
            <div className="flex flex-col gap-3.5">
              {SOURCES.map((s, i) => (
                <div
                  key={s.title}
                  ref={(el) => { sourceRefs.current[i] = el; }}
                  className="spotlight card-rise flex items-center gap-3.5 rounded-2xl border border-border bg-background px-4 py-3.5 shadow-soft hover:shadow-card hover:border-primary/30"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon size={19} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-text-primary tracking-[-0.01em]">{s.title}</div>
                    <div className="text-[12px] text-text-muted">{s.sub}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* hub — the report, with Trace on top */}
            <div className="relative mx-auto">
              <div className="absolute -inset-8 -z-10 rounded-full bg-primary/10 blur-2xl" aria-hidden="true" />
              <div
                ref={hubRef}
                className="gradient-border relative w-[230px] rounded-3xl bg-background px-6 pb-6 pt-4 text-center shadow-card"
              >
                <div className="animate-float mx-auto -mt-14 w-fit text-text-primary">
                  <Mascot size={104} />
                </div>
                <div className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-text-primary">TraceBug report</div>
                <div className="mx-auto mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 font-mono text-[11.5px] text-text-primary">
                  <FileCode2 size={13} className="text-primary" />
                  checkout-500.html
                </div>
                <div className="mt-3 flex items-center justify-center gap-3 text-[10.5px] font-medium uppercase tracking-wider text-text-subtle">
                  <span>Self-contained</span>
                  <span className="h-0.5 w-0.5 rounded-full bg-border-strong" />
                  <span>Offline</span>
                </div>
              </div>
            </div>

            {/* targets */}
            <div className="flex flex-col gap-3.5">
              {TARGETS.map((t, i) => (
                <div
                  key={t.title}
                  ref={(el) => { targetRefs.current[i] = el; }}
                  className="spotlight card-rise flex items-center gap-3.5 rounded-2xl border border-border bg-background px-4 py-3.5 shadow-soft hover:shadow-card hover:border-primary/30"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text-primary">
                    <t.icon size={19} strokeWidth={1.8} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-text-primary tracking-[-0.01em]">{t.title}</div>
                    <div className="text-[12px] text-text-muted">{t.sub}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                    </span>
                    Ready
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
