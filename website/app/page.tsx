import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FrameworkMarquee from "@/components/FrameworkMarquee";
import DemoVideo from "@/components/DemoVideo";
import Solution from "@/components/Solution";
import Features from "@/components/Features";
import BugReportPreview from "@/components/BugReportPreview";
import Comparison from "@/components/Comparison";
import Installation from "@/components/Installation";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

// Narrative: hook → proof it works (demo) → before/after → capability surface →
// a real report (opens with the root-cause line) → why not existing tools →
// install → close. Each section has one job; nothing is restated.
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <FrameworkMarquee />
      <Reveal><DemoVideo /></Reveal>
      <Reveal><Solution /></Reveal>
      <Reveal><Features /></Reveal>
      <Reveal><BugReportPreview /></Reveal>
      <Reveal><Comparison /></Reveal>
      <Reveal><Installation /></Reveal>
      <Reveal><FinalCTA /></Reveal>
      <Footer />
    </main>
  );
}
