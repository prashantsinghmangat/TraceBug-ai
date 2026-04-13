import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import Solution from "@/components/Solution";
import RootCauseHighlight from "@/components/RootCauseHighlight";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Installation from "@/components/Installation";
import BugReportPreview from "@/components/BugReportPreview";
import Comparison from "@/components/Comparison";
import UseCases from "@/components/UseCases";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Reveal from "@/components/Reveal";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <Reveal>
        <Problem />
      </Reveal>
      <Reveal delay={100}>
        <Solution />
      </Reveal>
      <Reveal>
        <RootCauseHighlight />
      </Reveal>
      <Reveal delay={100}>
        <Features />
      </Reveal>
      <Reveal>
        <HowItWorks />
      </Reveal>
      <Reveal delay={100}>
        <Installation />
      </Reveal>
      <Reveal>
        <BugReportPreview />
      </Reveal>
      <Reveal delay={100}>
        <Comparison />
      </Reveal>
      <Reveal>
        <UseCases />
      </Reveal>
      <Reveal delay={100}>
        <FinalCTA />
      </Reveal>
      <Footer />
    </main>
  );
}
