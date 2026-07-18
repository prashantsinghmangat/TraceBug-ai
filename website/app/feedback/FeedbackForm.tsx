"use client";

import { useState } from "react";
import { Bug, Lightbulb, MessageCircle, Send, Check, ArrowUpRight } from "lucide-react";
import Mascot from "@/components/Mascot";
import SectionHeading from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { SDK_VERSION } from "@/lib/version";

const TYPES = [
  { key: "bug", label: "Bug", icon: Bug },
  { key: "idea", label: "Idea", icon: Lightbulb },
  { key: "other", label: "Other", icon: MessageCircle },
] as const;

const ISSUES_URL = "https://github.com/prashantsinghmangat/tracebug-ai/issues/new/choose";

export default function FeedbackForm() {
  const [type, setType] = useState<string>("bug");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const data = new FormData(e.currentTarget);
    data.set("type", type);
    data.set("version", `v${SDK_VERSION}`);
    try {
      // POST to the static detection file — Netlify intercepts and stores it.
      const res = await fetch("/__forms.html", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data as unknown as Record<string, string>).toString(),
      });
      setStatus(res.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-3xl border border-border bg-surface/50 px-8 py-14 text-center">
        <div className="mb-5 flex justify-center animate-float" aria-hidden="true">
          <Mascot size={88} />
        </div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Got it — thank you!
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[14.5px] leading-relaxed text-text-muted">
          Trace has filed your note. If you left an email, you&apos;ll hear back when
          it&apos;s picked up.
        </p>
        <div className="mt-7 inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3.5 py-1.5 text-[12px] font-medium text-success">
          <Check size={13} strokeWidth={3} /> Delivered — no account, no tracking
        </div>
      </div>
    );
  }

  return (
    <>
      <SectionHeading
        align="left"
        eyebrow="Feedback"
        title="Found a bug in the bug-catcher?"
        subtitle="Bugs, ideas, confusion — all welcome. No account needed; this goes straight to the maintainer."
        className="mb-8"
      />

      {/* dev fast-path */}
      <a
        href={ISSUES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-8 flex items-center gap-3 rounded-2xl border border-border bg-surface/50 px-4 py-3.5 transition-colors hover:border-primary/40"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Bug size={17} />
        </span>
        <span className="min-w-0 flex-1 text-[13.5px] text-text-muted">
          <strong className="text-text-primary">On GitHub?</strong> File an issue instead — public,
          trackable, and you can attach a TraceBug export.
        </span>
        <ArrowUpRight size={15} className="shrink-0 text-text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </a>

      <form onSubmit={onSubmit} className="space-y-5">
        {/* honeypot — must match public/__forms.html */}
        <input type="hidden" name="form-name" value="feedback" />
        <p className="hidden">
          <label>
            Don&apos;t fill this out: <input name="bot-field" />
          </label>
        </p>

        <div>
          <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle">
            What kind of feedback?
          </label>
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium transition-colors ${
                  type === t.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-background text-text-muted hover:border-border-strong"
                }`}
              >
                <t.icon size={15} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="message" className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle">
            What happened / what&apos;s the idea?
          </label>
          <textarea
            id="message"
            name="message"
            required
            rows={5}
            placeholder={
              type === "bug"
                ? "What did you do, what did you expect, what happened instead?"
                : "Tell us what you're thinking…"
            }
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] text-text-primary placeholder:text-text-subtle focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div>
          <label htmlFor="email" className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle">
            Email <span className="font-normal normal-case text-text-subtle">(optional — only if you want a reply)</span>
          </label>
          <input
            id="email"
            type="email"
            name="email"
            placeholder="you@example.com"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[14px] text-text-primary placeholder:text-text-subtle focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" size="lg" variant="gradient" disabled={status === "sending"}>
            <Send size={15} />
            {status === "sending" ? "Sending…" : "Send feedback"}
          </Button>
          {status === "error" && (
            <p className="text-[13px] text-error">
              Couldn&apos;t send — please{" "}
              <a href={ISSUES_URL} className="underline" target="_blank" rel="noopener noreferrer">
                file it on GitHub
              </a>{" "}
              instead.
            </p>
          )}
        </div>
        <p className="text-[12px] leading-relaxed text-text-subtle">
          Stored by our host (Netlify Forms) and read by a human. No analytics, no account, nothing
          else collected.
        </p>
      </form>
    </>
  );
}
