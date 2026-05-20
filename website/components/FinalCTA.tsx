import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChromeIcon, NpmIcon } from "@/components/ui/brand-icons";
import { ArrowRight } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="relative py-28 overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-25" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] rounded-full bg-primary/[0.06] blur-[140px] pointer-events-none" />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Badge tone="primary" className="mb-6">
          <span>▸</span><span>Free · No account</span>
        </Badge>

        <h2 className="text-[36px] sm:text-[52px] font-semibold text-text-primary leading-[1.05] tracking-[-0.03em] mb-5">
          Ship better bug reports{" "}
          <span className="gradient-text">today</span>
        </h2>

        <p className="text-text-muted text-base sm:text-[17px] max-w-[460px] mx-auto mb-9 leading-[1.6]">
          Install in 30 seconds. Works in any frontend framework.
        </p>

        <div className="flex flex-col sm:flex-row gap-2.5 justify-center items-center">
          <Button asChild size="lg">
            <a
              href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ChromeIcon size={14} />
              Install extension
              <ArrowRight size={14} />
            </a>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href="#install">
              <NpmIcon size={14} />
              npm install tracebug-sdk
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
