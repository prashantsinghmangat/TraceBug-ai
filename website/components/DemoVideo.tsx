"use client";

import { useEffect, useRef, useState } from "react";

export default function DemoVideo() {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Fallback for environments without IntersectionObserver
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
        {/* Header */}
        <div className="text-center mb-10 lg:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold tracking-wider mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            INTERACTIVE DEMO
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-text-primary mb-4">
            See it in{" "}
            <span className="gradient-text">action</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Watch TraceBug capture a bug, find the root cause, and create a
            GitHub issue &mdash; in seconds.
          </p>
        </div>

        {/* iframe wrapper with 3:2 aspect + glow */}
        <div
          ref={containerRef}
          className="relative max-w-5xl mx-auto rounded-2xl overflow-hidden border border-border"
          style={{
            boxShadow:
              "0 0 60px rgba(108, 92, 231, 0.15), 0 20px 60px rgba(0, 0, 0, 0.5)",
            aspectRatio: "3 / 2",
          }}
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

        {/* Hint row */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-text-primary font-medium">11-second</span> interactive walkthrough
          </div>
          <span className="hidden sm:block text-border">•</span>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Plays automatically &middot; no install needed
          </div>
        </div>
      </div>
    </section>
  );
}

/** Placeholder shown before the iframe scrolls into view. */
function Placeholder() {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0B0B0F]"
    >
      <svg width="56" height="56" viewBox="0 0 96 96" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ph-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9B7DFF" />
            <stop offset="50%" stopColor="#6C5CE7" />
            <stop offset="100%" stopColor="#00D4FF" />
          </linearGradient>
        </defs>
        <path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#ph-g)" opacity="0.18" />
        <path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#ph-g)" strokeWidth="2.5" />
        <circle cx="48" cy="41" r="5" fill="url(#ph-g)" />
        <circle cx="48" cy="41" r="2.2" fill="white" />
      </svg>
      <div className="text-text-muted text-sm">Loading interactive demo&hellip;</div>
    </div>
  );
}
