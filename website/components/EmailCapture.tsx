"use client";

import { useState } from "react";

/**
 * Email capture — the one owned distribution channel. Posts to /api/notify-me
 * (source-tagged, stored in Supabase email_signups). The PRODUCT stays
 * account-free and telemetry-free; this lives only on the website, opt-in.
 */
export default function EmailCapture({
  source,
  tier,
  heading,
  sub,
}: {
  /** Must be in the API route's ALLOWED_SOURCES. */
  source: "pricing-pro" | "pricing-team" | "viewer-footer" | "blog";
  tier?: "pro" | "team";
  heading: string;
  sub?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy" || state === "done") return;
    setState("busy");
    try {
      const res = await fetch("/api/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, tier }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/[0.06] px-5 py-4 text-sm text-text-primary">
        ✓ You&apos;re on the list. One email when it ships — that&apos;s the whole deal.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-5">
      <p className="text-sm font-semibold text-text-primary mb-1">{heading}</p>
      {sub && <p className="text-[13px] text-text-muted mb-3 leading-relaxed">{sub}</p>}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-subtle focus:outline-none focus:border-primary/50"
          aria-label="Email address"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition disabled:opacity-60"
        >
          {state === "busy" ? "Adding…" : "Notify me"}
        </button>
      </div>
      <p className="mt-2.5 text-[12px] text-text-subtle">
        No newsletter, no spam — only launch-sized updates. Unsubscribe anytime.
        {state === "error" && (
          <span className="text-error"> Something went wrong — try again?</span>
        )}
      </p>
    </form>
  );
}
