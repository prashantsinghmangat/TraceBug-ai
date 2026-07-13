import Link from "next/link";
import { ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Mascot from "@/components/Mascot";
import { GitHubIcon } from "@/components/ui/brand-icons";

const ISSUES_URL = "https://github.com/prashantsinghmangat/tracebug-ai/issues/new";

// 404 — the one bug TraceBug can't capture. Trace gets the spotlight.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <section className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 pt-28 pb-20 text-center">
        <div className="absolute inset-0 -z-10 grid-bg opacity-50 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,black,transparent)]" />
        <div className="aurora animate-aurora -z-10 top-[15%] left-[25%] h-[300px] w-[340px] bg-[#818CF8]/20" />
        <div className="aurora animate-aurora -z-10 top-[30%] right-[22%] h-[260px] w-[300px] bg-[#4F46E5]/15" style={{ animationDelay: "-7s" }} />

        <div className="animate-float text-text-primary" aria-hidden="true">
          <Mascot size={140} />
        </div>

        <p className="mt-6 font-mono text-[13px] font-semibold uppercase tracking-[0.2em] text-primary">
          Error 404
        </p>
        <h1 className="mt-3 max-w-xl text-4xl sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.08] text-text-primary">
          Trace looked everywhere. This page doesn&apos;t exist.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-text-muted text-lg leading-relaxed">
          No console errors, no failed requests — the URL is just wrong. That&apos;s
          the one bug we can&apos;t capture.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild size="lg" variant="gradient" className="w-full sm:w-auto">
            <Link href="/">
              <Home size={15} /> Back to safety <ArrowRight size={15} />
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
            <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer">
              <GitHubIcon size={15} /> Think it&apos;s our bug? Tell us
            </a>
          </Button>
        </div>
      </section>
      <Footer />
    </main>
  );
}
