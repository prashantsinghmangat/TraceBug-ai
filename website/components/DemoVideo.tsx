"use client";

import { useState } from "react";
import { Clock, Check, MousePointerClick, ArrowUpRight, Play } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";
import { DEMO_VIDEO_ID, DEMO_VIDEO_URL } from "@/lib/links";

// The 57-second demo: a bug is captured, Claude Code reads the report and
// fixes it. Hosted on YouTube (the Chrome Web Store promo field needs a
// YouTube URL anyway); source and rebuild steps in marketing/demo-video/.
//
// Click-to-play facade: until the visitor clicks, the page shows only our own
// self-hosted poster, so nothing loads from YouTube and no YouTube cookies are
// set. The click swaps in the privacy-enhanced (youtube-nocookie.com) player.
export default function DemoVideo() {
  const [playing, setPlaying] = useState(false);

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
              Real capture, real fix
            </>
          }
          title="See it in action"
          subtitle="A coupon crashes checkout. TraceBug captures the console error, stack trace and replay in one report, Claude Code reads it, finds the real cause and fixes it."
          className="mb-10 lg:mb-12"
        />

        <div className="relative mx-auto max-w-5xl">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/12 via-transparent to-accent/12 blur-2xl" />
          <div
            className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-card"
            style={{ aspectRatio: "16 / 9" }}
          >
            {playing ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${DEMO_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
                title="TraceBug demo: capture a bug, Claude Code fixes it"
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            ) : (
              <button
                type="button"
                onClick={() => setPlaying(true)}
                className="group absolute inset-0 block h-full w-full cursor-pointer"
                aria-label="Play the 57-second TraceBug demo video"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/tracebug-demo-video-poster.jpg"
                  alt="A checkout coupon bug before, and fixed by Claude Code after"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                  loading="lazy"
                  decoding="async"
                />
                <span className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/25" />
                <span className="absolute left-1/2 top-[58%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 sm:gap-3 whitespace-nowrap rounded-full bg-primary px-4 py-2 sm:px-6 sm:py-3.5 text-[13px] sm:text-[15px] font-semibold text-white shadow-[0_12px_40px_rgba(79,70,229,.55)] transition-transform group-hover:scale-105">
                  <Play size={16} fill="currentColor" />
                  Watch the demo · 0:57
                </span>
              </button>
            )}
          </div>
          <p className="mt-3 text-center text-[12px] text-text-muted">
            Plays from YouTube in privacy-enhanced mode, only after you click.{" "}
            <a href={DEMO_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
              Open on YouTube
            </a>
          </p>
        </div>

        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 text-sm text-text-muted">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-primary" />
            <span className="text-text-primary font-medium">57 seconds</span> — bug to AI fix
          </div>
          <span className="hidden sm:block h-1 w-1 rounded-full bg-border-strong" />
          <div className="flex items-center gap-2">
            <Check size={15} className="text-success" strokeWidth={2.5} />
            The real extension and a real Claude Code fix
          </div>
        </div>

        {/* The dogfood moment: a sandbox with real bugs to capture. */}
        <div className="mt-8 flex justify-center">
          <a
            href="/try.html"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/[0.06] px-5 py-3 text-[14px] font-semibold text-primary shadow-xs transition-colors hover:bg-primary/10 hover:border-primary/50"
          >
            <MousePointerClick size={16} />
            Now you try: a sandbox with real bugs
            <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
