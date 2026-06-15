import SectionHeading from "@/components/SectionHeading";
import { Download, Keyboard, Share2 } from "lucide-react";

const STEPS = [
  {
    n: "01", Icon: Download, title: "Install",
    cmd: "npm install tracebug-sdk",
    alt: "…or add the Chrome extension — no code at all.",
  },
  {
    n: "02", Icon: Keyboard, title: "Capture",
    cmd: "Ctrl + Shift + B",
    alt: "…or click the toolbar. The modal opens pre-filled.",
  },
  {
    n: "03", Icon: Share2, title: "Share",
    cmd: ".html file or share-link URL",
    alt: "Your dev opens it offline — everything's inside.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title={<>Three steps. <span className="gradient-text">No setup.</span></>}
          className="mb-14"
        />

        <div className="relative grid md:grid-cols-3 gap-5">
          {/* connector line */}
          <div className="hidden md:block absolute top-[42px] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-border-strong to-transparent" />

          {STEPS.map(({ n, Icon, title, cmd, alt }) => (
            <div key={n} className="relative text-center md:text-left">
              <div className="flex md:block items-center gap-4">
                <div className="relative inline-flex h-[84px] w-[84px] mx-auto md:mx-0 items-center justify-center">
                  <div className="absolute inset-0 rounded-2xl bg-primary/[0.06]" />
                  <div className="absolute inset-0 rounded-2xl border border-primary/15" />
                  <Icon size={26} className="relative text-primary" />
                  <span className="absolute -top-2 -right-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background border border-border text-[11px] font-mono font-semibold text-text-subtle shadow-xs">
                    {n}
                  </span>
                </div>
              </div>
              <h3 className="mt-5 text-lg font-semibold text-text-primary">{title}</h3>
              <code className="mt-2 inline-block rounded-lg bg-surface-2 border border-border px-3 py-1.5 font-mono text-[13px] text-text-primary">
                {cmd}
              </code>
              <p className="mt-3 text-[13.5px] text-text-muted leading-relaxed max-w-xs mx-auto md:mx-0">{alt}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
