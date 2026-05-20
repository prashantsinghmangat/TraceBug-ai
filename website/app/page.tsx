import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import DemoVideo from "@/components/DemoVideo";
import Solution from "@/components/Solution";
import HowItWorks from "@/components/HowItWorks";
import Comparison from "@/components/Comparison";
import Installation from "@/components/Installation";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

// Intentionally short: 7 content sections, not 12. Repeated themes
// (Problem, RootCauseHighlight, Features, BugReportPreview, UseCases)
// were removed because the Hero terminal preview + Solution grid already
// demonstrate them, and stacking restatements is the #1 "feels AI" tell.
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Reveal>
        <DemoVideo />
      </Reveal>
      <Reveal>
        <Solution />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Comparison />
      </Reveal>
      <Reveal>
        <Installation />
      </Reveal>
      <Reveal>
        <FinalCTA />
      </Reveal>
      <Footer />
    </main>
  );
}
