import type { Metadata } from "next";
import Link from "next/link";
import EmailAction, { GoHome } from "./EmailAction";
import { RESULTS } from "./messages";

export const metadata: Metadata = {
  title: "TraceBug email updates",
  // Only reached from a confirm or unsubscribe link (/api/confirm, /api/unsubscribe).
  robots: { index: false, follow: false },
  // The confirm/unsubscribe step URLs carry a token; never send it on as a referrer.
  referrer: "no-referrer",
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
  const msg = step ? null : RESULTS[s] ?? RESULTS.invalid;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-5 flex items-center gap-2.5 text-text-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/email/tracebug-logo.png" width={28} height={28} alt="" className="rounded-md" />
        <span className="text-base font-bold">TraceBug</span>
      </Link>
      <div className="w-full max-w-[520px] rounded-xl border border-border bg-surface p-6">
        {step ? (
          <EmailAction {...step} token={token} />
        ) : (
          <>
            <h1 className="text-lg font-semibold text-text-primary mb-2">{msg!.title}</h1>
            <p className="text-sm text-text-muted leading-relaxed">{msg!.body}</p>
            {s === "confirmed" && <GoHome />}
          </>
        )}
      </div>
      <p className="mt-5 text-xs text-text-muted">
        <Link href="/" className="hover:underline">tracebug.dev</Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" className="hover:underline">Privacy</Link>
      </p>
    </main>
  );
}
