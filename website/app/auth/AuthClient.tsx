"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function AuthClient() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("sending");
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard` },
    });

    if (err) {
      setStatus("error");
      setError(err.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background text-text-primary">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface shadow-card p-8">
        <h1 className="text-2xl font-semibold mb-2 text-text-primary">Sign in to TraceBug</h1>
        <p className="text-sm text-text-muted mb-8">
          Enter your email and we&apos;ll send you a magic link. No password needed.
        </p>

        {status === "sent" ? (
          <div className="rounded-md border border-success/30 bg-success/10 p-4 text-sm text-text-primary">
            ✓ Magic link sent to <strong>{email}</strong>. Check your inbox.
            <p className="mt-2 text-text-muted">
              The link is valid for 60 minutes. You can close this tab.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "sending"}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={status === "sending" || !email}
              className="w-full rounded-md bg-primary text-white px-4 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <p className="text-sm text-error">Error: {error}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
