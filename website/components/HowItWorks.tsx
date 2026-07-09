import { MousePointerClick, FileCode2, Wrench, ArrowRight } from "lucide-react";
import SectionHeading from "@/components/SectionHeading";

// The one-line story of the product, told in three outcome-focused steps.
// Reuses the same card language as the capture grid so it reads as native.
const STEPS = [
  {
    Icon: MousePointerClick,
    label: "Capture",
    desc: "Hit the shortcut when a bug happens. The full session — replay, console, network, screenshot — is recorded automatically.",
  },
  {
    Icon: FileCode2,
    label: "Share",
    desc: "You get one self-contained report. Send it anywhere — no account, no upload, nothing to set up on the other end.",
  },
  {
    Icon: Wrench,
    label: "Fix",
    desc: "Your developer opens it offline, sees the root cause first, and knows exactly where to look before scrolling.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="From bug to fix in three steps"
          subtitle="No forms, no back-and-forth, no “cannot reproduce.” Just the bug, captured and handed off."
          className="mb-14"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {STEPS.map(({ Icon, label, desc }, i) => (
            <div key={label} className="relative">
              <div className="group card-rise h-full rounded-2xl border border-border bg-background p-6 hover:border-primary/30 hover:shadow-card-hover">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <Icon size={18} />
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text-subtle">
                    Step {i + 1}
                  </span>
                </div>
                <h3 className="text-[16px] font-semibold text-text-primary mb-1.5">{label}</h3>
                <p className="text-[13.5px] text-text-muted leading-relaxed">{desc}</p>
              </div>
              {i < STEPS.length - 1 && (
                <span className="hidden md:flex absolute top-1/2 -right-2.5 -translate-y-1/2 z-10 h-6 w-6 items-center justify-center rounded-full border border-border bg-background text-text-subtle">
                  <ArrowRight size={13} />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
