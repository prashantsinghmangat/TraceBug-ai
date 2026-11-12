"use client";

import { useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
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
    <section id="demo" className="border-t border-border bg-surface/60 py-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          align="left"
          eyebrow="Demo · 0:57"
          title="A real capture and a real fix"
          subtitle="A coupon crashes checkout. TraceBug captures the console error, stack trace and replay in one report. Claude Code reads it, finds the cause and fixes it."
          className="mb-12"
        />

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
              aria-label="Play demo (0:57): TraceBug capturing a bug that Claude Code then fixes"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/tracebug-demo-video-poster.jpg"
                alt="A checkout coupon bug before, and fixed by Claude Code after"
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <span className="absolute inset-0 bg-black/0 transition-colors duration-150 group-hover:bg-black/10" />
              <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-[#11131A] px-5 py-3 text-[14px] font-medium text-white shadow-float transition-transform duration-150 group-active:scale-[0.98]">
                <Play size={14} fill="currentColor" />
                Play demo
                <span className="font-mono text-[13px] text-white/60">0:57</span>
              </span>
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-text-subtle">
            The real extension and a real Claude Code fix. Plays from YouTube in privacy-enhanced mode, only after
            you click.{" "}
            <a href={DEMO_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text-primary">
              Open on YouTube
            </a>
          </p>
          <a
            href="/try.html"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex min-h-[28px] shrink-0 items-center gap-1.5 text-[14px] font-medium text-primary"
          >
            Try it on a sandbox with real bugs
            <ArrowUpRight size={16} strokeWidth={1.5} className="transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
