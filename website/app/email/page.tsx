import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TraceBug email updates",
  // Only reached from a confirm or unsubscribe link (/api/confirm, /api/unsubscribe).
  robots: { index: false, follow: false },
  // The confirm/unsubscribe step URLs carry a token; never send it on as a referrer.
  referrer: "no-referrer",
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "You're confirmed",
    body: "You'll get at most one email a month about new TraceBug features and early access. Every email has a one-click unsubscribe link.",
  },
  unsubscribed: {
    title: "You're unsubscribed",
    body: "TraceBug won't email this address again. Changed your mind? You can sign up again anytime from the extension or this site.",
  },
  invalid: {
    title: "That link doesn't work",
    body: "It may have been cut off when it was copied. Try clicking it straight from the email.",
  },
  error: {
    title: "Something went wrong on our side",
    body: "Nothing was changed. Please try the link again in a minute.",
  },
};

// Steps that need one click: opening the link changes nothing (mail scanners open links
// on their own), the button below does it.
const STEPS: Record<string, { title: string; body: string; action: string; button: string; page?: boolean }> = {
  confirm: {
    title: "Confirm your email",
    body: "One click and you're on the list: at most one email a month about new TraceBug features and early access.",
    action: "/api/confirm",
    button: "Confirm my email",
  },
  unsubscribe: {
    title: "Unsubscribe from TraceBug emails?",
    body: "One click and this address gets no more emails from us.",
    action: "/api/unsubscribe",
    button: "Unsubscribe",
    page: true,
  },
};

const TOKEN_RE = /^[a-f0-9]{64}$/;

export default function EmailStatusPage({ searchParams }: { searchParams: { s?: string; token?: string } }) {
  const s = searchParams.s ?? "";
  const token = searchParams.token ?? "";
  const step = STEPS[s] && TOKEN_RE.test(token) ? STEPS[s] : null;
  const msg = step ? null : MESSAGES[s] ?? MESSAGES.invalid;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[560px] rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-text-primary mb-2">{step ? step.title : msg!.title}</h1>
        <p className="text-sm text-text-muted leading-relaxed">{step ? step.body : msg!.body}</p>
        {step && (
          <form method="post" action={step.action} className="mt-5">
            <input type="hidden" name="token" value={token} />
            {step.page && <input type="hidden" name="from" value="page" />}
            <button
              type="submit"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90"
            >
              {step.button}
            </button>
          </form>
        )}
        <p className="mt-4 text-sm">
          <Link href="/" className="text-primary hover:underline">tracebug.dev</Link>
        </p>
      </div>
    </main>
  );
}
