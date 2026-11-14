import { Suspense } from "react";
import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FeedbackForm from "./FeedbackForm";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Feedback — TraceBug",
  description: "Found a bug in the bug-catcher? Have an idea? Tell us — no account needed.",
};

// No-backend feedback: submissions go to Netlify Forms (declared statically in
// public/__forms.html, collected in the Netlify dashboard). GitHub-comfortable
// users are pointed at Issues instead — better for public tracking.
export default function FeedbackPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <section className="pt-32 pb-24">
        <div className="mx-auto max-w-xl px-4 sm:px-6">
          {/* Suspense required for useSearchParams (prefill deep-links) */}
          <Suspense fallback={null}>
            <FeedbackForm />
          </Suspense>
          <p className="mt-6 text-sm text-text-muted">
            Prefer email? Write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
              {CONTACT_EMAIL}
            </a>{" "}
            for help, questions about teams or pricing, or anything else.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
}
