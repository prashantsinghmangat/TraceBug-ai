"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// Seven reasons, and every one of them is a thing that can actually be fixed or
// learned from. No "I don't like it" catch-all masquerading as a reason, and
// nothing that reads as an accusation. "I only needed it once" is a legitimate
// success, not a failure — which is why it is on the list.
const REASONS = [
  "It didn't work on the site I tested",
  "Capturing or exporting broke",
  "It was hard to figure out",
  "I was worried about permissions or privacy",
  "I switched to a different tool",
  "I only needed it once",
  "Something else",
] as const;

const ISSUES_URL = "https://github.com/prashantsinghmangat/tracebug-ai/issues/new/choose";
const STORE_URL =
  "https://chromewebstore.google.com/detail/tracebug-capture-the-bug/?utm_source=bye";

export default function ByeForm() {
  // The extension appends ?v=<version>, and that is the ONLY thing it sends.
  // Validated rather than trusted: this value is rendered and submitted, and it
  // arrives from a URL anyone can edit.
  const raw = useSearchParams().get("v") ?? "";
  const version = /^v?\d+\.\d+\.\d+$/.test(raw) ? raw.replace(/^v/, "") : "";

  const [reason, setReason] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    const data = new FormData(e.currentTarget);
    data.set("reason", reason);
    data.set("version", version ? `v${version}` : "unknown");
    try {
      // Same no-backend path as /feedback: POST to the static detection file,
      // which Netlify intercepts. Declared in public/__forms.html.
      await fetch("/__forms.html", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(data as unknown as Record<string, string>).toString(),
      });
    } catch {
      // Swallowed on purpose. This person has already uninstalled; showing them
      // a retry dialog for our analytics would be the wrong way round. The
      // thank-you state is shown either way.
    }
    setStatus("done");
  }

  if (status === "done") {
    return (
      <div className="rounded-3xl border border-border bg-surface/50 px-7 py-12 text-center sm:px-10">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
          Thanks, that helps.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[14.5px] leading-relaxed text-text-muted">
          If you hit a bug, a GitHub issue gets it fixed fastest.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href={ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-[13.5px] font-medium text-text-primary transition-colors hover:border-border-strong"
          >
            Open a GitHub issue
            <ArrowUpRight size={14} className="text-text-subtle" />
          </a>
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[13.5px] font-medium text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
          >
            Reinstall TraceBug
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-surface/50 px-7 py-9 sm:px-10">
      <Link href="/" className="mb-7 inline-flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0B0B10]">
          <svg width="16" height="16" viewBox="0 0 96 96" fill="none" aria-hidden="true">
            <path
              d="M30 33 L47 48 L30 63"
              fill="none"
              stroke="#EAECF3"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="52" y="41" width="14" height="14" rx="4" fill="#6366F1" />
          </svg>
        </span>
        <span className="text-[14px] font-semibold text-text-primary">TraceBug</span>
      </Link>

      <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
        TraceBug is uninstalled
      </h1>
      <p className="mt-2.5 text-[14.5px] leading-relaxed text-text-muted">
        Sorry it didn&apos;t work out. One question helps us fix what went wrong. It&apos;s optional
        and anonymous.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        {/* Must match public/__forms.html exactly. */}
        <input type="hidden" name="form-name" value="uninstall" />
        <p className="hidden">
          <label>
            Don&apos;t fill this out: <input name="bot-field" />
          </label>
        </p>

        <fieldset>
          <legend className="mb-2.5 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle">
            Why did you uninstall?
          </legend>
          <div className="space-y-2">
            {REASONS.map((r) => {
              const selected = reason === r;
              return (
                <label
                  key={r}
                  className={`flex h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 text-[13.5px] transition-colors ${
                    selected
                      ? "border-primary/50 bg-primary/10 text-text-primary"
                      : "border-border bg-background text-text-muted hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason-choice"
                    value={r}
                    checked={selected}
                    onChange={() => setReason(r)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                      selected ? "border-primary bg-primary text-white" : "border-border-strong"
                    }`}
                  >
                    {selected && <Check size={10} strokeWidth={3.5} />}
                  </span>
                  <span className="min-w-0">{r}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <label
            htmlFor="bye-message"
            className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle"
          >
            Anything else? (optional)
          </label>
          <textarea
            id="bye-message"
            name="message"
            rows={3}
            placeholder="What happened, or what would have made you stay?"
            className="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-subtle focus:border-primary/50 focus:outline-none"
          />
        </div>

        <div>
          <label
            htmlFor="bye-email"
            className="mb-2 block text-[12px] font-semibold uppercase tracking-wider text-text-subtle"
          >
            Email, only if you&apos;d like a reply (optional)
          </label>
          <input
            id="bye-email"
            type="email"
            name="email"
            autoComplete="email"
            className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-subtle focus:border-primary/50 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={status === "sending"}>
            {status === "sending" ? "Sending…" : "Send"}
          </Button>
          {/* As easy as Send, on purpose. Skip still reaches the thank-you
              state so the page never dead-ends on a blank screen. */}
          <button
            type="button"
            onClick={() => setStatus("done")}
            className="text-[13.5px] font-medium text-text-muted underline-offset-4 hover:text-text-primary hover:underline"
          >
            Skip
          </button>
        </div>

        <p className="pt-1 text-[13px] leading-relaxed text-text-subtle">
          We only receive the version number
          {version ? ` (v${version})` : ""} and what you choose to send. No tracking on this page.
        </p>
      </form>
    </div>
  );
}
