import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import FrameworkMarquee from "@/components/FrameworkMarquee";
import DemoVideo from "@/components/DemoVideo";
import Solution from "@/components/Solution";
import RootCauseHighlight from "@/components/RootCauseHighlight";
import Features from "@/components/Features";
import BugReportPreview from "@/components/BugReportPreview";
import HowItWorks from "@/components/HowItWorks";
import Comparison from "@/components/Comparison";
import Installation from "@/components/Installation";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

// Narrative: hook → proof it works (demo) → the one-file promise → the
// differentiator (root cause) → full capability surface → a real report →
// how/why → install → close. Each section has a distinct job; nothing is
// restated, which is what keeps a long page from feeling machine-stamped.
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <FrameworkMarquee />
      <Reveal><DemoVideo /></Reveal>
      <Reveal><Solution /></Reveal>
      <Reveal><RootCauseHighlight /></Reveal>
      <Reveal><Features /></Reveal>
      <Reveal><BugReportPreview /></Reveal>
      <Reveal><HowItWorks /></Reveal>
      <Reveal><Comparison /></Reveal>
      <Reveal><Installation /></Reveal>
      <Reveal><FinalCTA /></Reveal>
      <Footer />
    </main>
  );
}
