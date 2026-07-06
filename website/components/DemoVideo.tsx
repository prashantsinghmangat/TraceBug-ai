"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Check } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { LogoMark } from "@/components/Logo";

export default function DemoVideo() {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
              Interactive demo
            </>
          }
          title="See it in action"
          subtitle="Watch TraceBug capture a bug, find the root cause, and create a GitHub issue — in seconds."
          className="mb-10 lg:mb-12"
        />

        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/12 via-transparent to-accent/12 blur-2xl" />
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-card"
            style={{ aspectRatio: "3 / 2" }}
          >
            {isVisible ? (
              <iframe
                src="/demo.html"
                title="TraceBug — Interactive Product Demo"
                loading="lazy"
                sandbox="allow-scripts"
                className="absolute inset-0 w-full h-full border-0 block"
              />
            ) : (
              <Placeholder />
            )}
          </div>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <span className="text-text-primary font-medium">11-second</span> interactive walkthrough
          </div>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-border-strong" />
          <div className="flex items-center gap-2">
            <Check size={15} className="text-success" strokeWidth={2.5} />
            Plays automatically · no install needed
          </div>
        </div>
      </div>
    </section>
  );
}

function Placeholder() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-surface">
      <LogoMark size={56} idPrefix="demo" className="animate-float" />
      <div className="text-text-muted text-sm">Loading interactive demo…</div>
    </div>
  );
}
