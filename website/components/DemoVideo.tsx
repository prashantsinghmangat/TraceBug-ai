"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Check, MousePointerClick, ArrowUpRight } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { LogoMark } from "@/components/Logo";

// The real product, on film: a 15-second screen recording of TraceBug on the
// live sandbox — the crash happens, the live detector catches it, one click
// builds the ticket, export. Recorded with Playwright driving /try.html, so
// re-cutting it is a script run, not a studio session.
//
// The <video> mounts lazily (IntersectionObserver) so the ~1.2 MB file never
// loads for visitors who don't scroll here. Autoplay is muted+looped and
// disabled under prefers-reduced-motion (poster + controls instead). If the
// browser can't decode webm, we fall back to the poster with a sandbox link.
export default function DemoVideo() {
  const [isVisible, setIsVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="demo" className="py-20 lg:py-28 relative">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              </span>
              Real capture, on film
            </>
          }
          title="See it in action"
          subtitle="A crash happens, TraceBug catches it live, and one click builds the ticket — console error, failed request, and repro steps attached. Recorded on the live sandbox; nothing staged."
          className="mb-10 lg:mb-12"
        />

        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/12 via-transparent to-accent/12 blur-2xl" />
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-card"
            style={{ aspectRatio: "16 / 9" }}
          >
            {!isVisible ? (
              <Placeholder />
            ) : videoFailed ? (
              <a href="/try.html" target="_blank" rel="noopener noreferrer" className="group absolute inset-0 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/tracebug-demo-poster.png" alt="TraceBug capturing a bug ticket" className="h-full w-full object-cover" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-[15px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  Open the live sandbox instead →
                </span>
              </a>
            ) : (
              <video
                src="/tracebug-demo.webm"
                poster="/tracebug-demo-poster.png"
                className="absolute inset-0 h-full w-full object-cover"
                autoPlay={!reducedMotion}
                muted
                loop
                playsInline
                controls
                preload="metadata"
                onError={() => setVideoFailed(true)}
                aria-label="15-second demo: TraceBug catches a crash and builds the bug ticket"
              />
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <span className="text-text-primary font-medium">15 seconds</span> — bug to exported ticket
          </div>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-border-strong" />
          <div className="flex items-center gap-2">
            <Check size={15} className="text-success" strokeWidth={2.5} />
            The real widget, recorded live — no mockups
          </div>
        </div>

        {/* The dogfood moment: the same sandbox the video was recorded on. */}
        <div className="mt-8 flex justify-center">
          <a
            href="/try.html"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.06] px-5 py-3 text-[14px] font-semibold text-primary shadow-xs transition-colors hover:bg-primary/10 hover:border-primary/50"
          >
            <MousePointerClick size={16} />
            Now you try — same sandbox, same bugs
            <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Placeholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface">
      <LogoMark size={56} idPrefix="demo" className="animate-float" />
      <div className="text-text-muted text-sm">Loading demo…</div>
    </div>
  );
}
