import { Button } from "@/components/ui/button";
import { ChromeIcon, NpmIcon } from "@/components/ui/brand-icons";
import { ArrowRight, Check } from "lucide-react";
import Mascot from "@/components/Mascot";

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

export default function FinalCTA() {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-background shadow-card">
          {/* aurora wash */}
          <div className="absolute inset-0 -z-0 grid-bg opacity-50 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
          <div className="aurora animate-aurora top-[-30%] left-[15%] h-[280px] w-[320px] bg-[#818CF8]/25" />
          <div className="aurora animate-aurora top-[10%] right-[10%] h-[240px] w-[280px] bg-[#4F46E5]/20" style={{ animationDelay: "-6s" }} />

          <div className="relative px-6 py-16 sm:px-12 sm:py-20 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-[11.5px] font-medium text-success mb-6">
              <Check size={13} strokeWidth={3} /> Free · No account
            </span>
            <h2 className="mx-auto max-w-2xl text-[32px] sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.08] text-text-primary">
              Ship better bug reports <span className="gradient-text-anim">today</span>
              {/* same blinking-bug signature as the hero headline */}
              <span className="brand-caret ml-2 inline-block w-[0.55em] align-middle" aria-hidden="true">
                <Mascot className="h-auto w-full" animated={false} />
              </span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-text-muted text-lg">
              Install in 30 seconds. Works in any front-end framework. Your data stays yours.
            </p>
            <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button asChild size="lg" variant="gradient" className="shimmer w-full sm:w-auto">
                <a href={CHROME_URL} target="_blank" rel="noopener noreferrer">
                  <ChromeIcon size={16} /> Add to Chrome — free <ArrowRight size={15} />
                </a>
              </Button>
              <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
                <a href="/#install">
                  <NpmIcon size={15} /> npm install tracebug-sdk
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
