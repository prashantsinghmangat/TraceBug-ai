import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import DemoVideo from "@/components/DemoVideo";
import HowItWorks from "@/components/HowItWorks";
import FeatureTabs from "@/components/FeatureTabs";
import ReportShowcase from "@/components/ReportShowcase";
import Integrations from "@/components/Integrations";
import AgentHandoff from "@/components/AgentHandoff";
import Comparison from "@/components/Comparison";
import FAQ from "@/components/FAQ";
import { FAQ_ITEMS } from "@/components/faq-data";
import UpdatesSignup from "@/components/UpdatesSignup";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";

// Eight sections, one message each: the question (hero) → see it working
// (demo) → capture, share, fix → one report with all the evidence → hand it
// to your AI agent (MCP, the dark section) → why not monitoring tools →
// feedback + FAQ → updates signup (#updates) → install. Demonstrate first, explain second.
export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <DemoVideo />
      <HowItWorks />
      <FeatureTabs />
      <ReportShowcase />
      <Integrations />
      <AgentHandoff />
      <Comparison />
      <FAQ />
      <UpdatesSignup />
      <FinalCTA />
      <Footer />
      {/* FAQPage rich-result schema — built from the same array the FAQ renders */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ_ITEMS.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
    </main>
  );
}
