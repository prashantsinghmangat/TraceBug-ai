import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import FrameworkMarquee from "@/components/FrameworkMarquee";
import Features from "@/components/Features";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Features — TraceBug",
  description:
    "The full TraceBug feature surface: instant 2-click capture, rolling video buffer, auto-scanner, screenshots & annotation, voice descriptions, one-click GitHub & Jira export, plugins & hooks, and a local-first privacy model. Works with every major front-end framework.",
  alternates: { canonical: "/features" },
};

// Dedicated feature/deep-dive page. The homepage tells the core story; the full
// capability surface (advanced + developer features) lives here so it doesn't
// dominate the landing flow. Reuses the existing homepage section components.
export default function FeaturesPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20">
        <FrameworkMarquee />
        <Reveal><Features /></Reveal>
        <Reveal><FinalCTA /></Reveal>
      </div>
      <Footer />
    </main>
  );
}
