import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import FrameworkMarquee from "@/components/FrameworkMarquee";
import Features from "@/components/Features";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";
import InstallButtons from "@/components/InstallButtons";

export const metadata: Metadata = {
  title: "Features — TraceBug",
  description:
    "TraceBug features: one-click bug capture, screenshots, console and network logs, replay, an MCP hand-off to your AI agent, and a Site Audit with fixes.",
  alternates: { canonical: "/features" },
};

// Dedicated feature/deep-dive page. The homepage tells the core story; the full
// capability surface (advanced + developer features) lives here so it doesn't
// dominate the landing flow. Reuses the existing homepage section components.
export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28">
        <header className="mx-auto max-w-6xl px-4 pb-12 sm:px-6 lg:px-8 lg:pb-16">
          <h1 className="max-w-3xl text-h2 font-medium text-text-primary">Everything in one bug report</h1>
          <p className="mt-4 max-w-2xl text-lead text-text-muted">
            Capture, annotate and redact a bug, then file it or hand it to your AI agent. Free, local-first, any
            front-end framework.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <InstallButtons />
          </div>
        </header>
        <FrameworkMarquee />
        <Reveal><Features /></Reveal>
        <Reveal><FinalCTA /></Reveal>
      </div>
      <Footer />
    </main>
  );
}
