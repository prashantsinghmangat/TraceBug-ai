import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import TrustBar from "@/components/TrustBar";
import HowItWorks from "@/components/HowItWorks";
import DemoVideo from "@/components/DemoVideo";
import Solution from "@/components/Solution";
import BugReportPreview from "@/components/BugReportPreview";
import Comparison from "@/components/Comparison";
import Installation from "@/components/Installation";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

// One story, top to bottom: hook → proof points → how it works (capture → share
// → fix) → see it (demo) → before/after → what's captured → a real report →
// why not existing tools → install → close. Each section has one job; the full
// feature surface lives on /features so it doesn't crowd the story.
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <TrustBar />
      <Reveal><HowItWorks /></Reveal>
      <Reveal><DemoVideo /></Reveal>
      <Reveal><Solution /></Reveal>
      <Reveal><BugReportPreview /></Reveal>
      <Reveal><Comparison /></Reveal>
      <Reveal><Installation /></Reveal>
      <Reveal><FinalCTA /></Reveal>
      <Footer />
    </main>
  );
}
