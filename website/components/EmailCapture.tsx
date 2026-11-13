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
  source: "pricing-pro" | "pricing-team" | "viewer-footer" | "blog" | "home";
  tier?: "pro" | "team";
  heading: string;
  sub?: string;
}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "already" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy" || state === "done" || state === "already") return;
    setState("busy");
    try {
      const res = await fetch("/api/notify-me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source, tier }),
      });
      if (!res.ok) return setState("error");
      const data = await res.json().catch(() => ({}));
      setState(data?.status === "subscribed" ? "already" : "done");
    } catch {
      setState("error");
    }
  };

  if (state === "done" || state === "already") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/[0.06] px-5 py-4 text-sm text-text-primary">
        {state === "already"
          ? "✓ You’re already on the list. Thanks!"
          : "✓ Almost done: check your inbox for a link to confirm."}
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
          className="rounded-lg bg-cta px-5 py-2.5 text-sm font-medium text-on-cta transition-colors hover:bg-cta/85 disabled:opacity-60"
        >
          {state === "busy" ? "Adding…" : "Notify me"}
        </button>
      </div>
      <p className="mt-2.5 text-[12px] text-text-subtle">
        At most one email a month. We&apos;ll send a link to confirm first; unsubscribe in one click.
        {state === "error" && (
          <span className="text-error"> Something went wrong — try again?</span>
        )}
      </p>
    </form>
  );
}
