import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TraceBug email updates",
  // Only reached from a confirm or unsubscribe link (/api/confirm, /api/unsubscribe).
  robots: { index: false, follow: false },
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

export default function EmailStatusPage({ searchParams }: { searchParams: { s?: string } }) {
  const msg = MESSAGES[searchParams.s ?? ""] ?? MESSAGES.invalid;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[560px] rounded-xl border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-text-primary mb-2">{msg.title}</h1>
        <p className="text-sm text-text-muted leading-relaxed">{msg.body}</p>
        <p className="mt-4 text-sm">
          <Link href="/" className="text-primary hover:underline">tracebug.dev</Link>
        </p>
      </div>
    </main>
  );
}
