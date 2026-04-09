import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Problem from "@/components/Problem";
import Solution from "@/components/Solution";
import Features from "@/components/Features";
import HowItWorks from "@/components/HowItWorks";
import Installation from "@/components/Installation";
import BugReportPreview from "@/components/BugReportPreview";
import Comparison from "@/components/Comparison";
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
        <Features />
      </Reveal>
      <Reveal delay={100}>
        <HowItWorks />
      </Reveal>
      <Reveal>
        <Installation />
      </Reveal>
      <Reveal delay={100}>
        <BugReportPreview />
      </Reveal>
      <Reveal>
        <Comparison />
      </Reveal>
      <Footer />
    </main>
  );
}
