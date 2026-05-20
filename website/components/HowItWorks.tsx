import { Badge } from "@/components/ui/badge";

// Three steps. Each line is mono / terminal-style. No icons, no glow boxes,
// no per-step gradients — those were the AI tell.
const STEPS = [
  { n: "01", title: "Install", line: "npm install tracebug-sdk", or: "or add Chrome extension" },
  { n: "02", title: "Capture", line: "Ctrl + Shift + B", or: "or click the toolbar" },
  { n: "03", title: "Share", line: ".html file or share-link URL", or: "your dev opens it" },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 relative overflow-hidden">
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <Badge tone="primary" className="mb-5">
            <span>▸</span><span>How it works</span>
          </Badge>
          <h2 className="text-[32px] sm:text-[44px] font-semibold text-text-primary leading-[1.1] tracking-[-0.025em]">
            Three steps. <span className="gradient-text">No setup.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border rounded-xl overflow-hidden border border-border">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="bg-background p-7 sm:p-8 flex flex-col"
            >
              <div className="flex items-center gap-2 mb-5 text-[11px] font-mono uppercase tracking-wider text-text-subtle">
                <span>{s.n}</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <h3 className="text-[18px] font-semibold text-text-primary tracking-tight mb-3">
                {s.title}
              </h3>
              <code className="block font-mono text-[12.5px] text-accent bg-surface/60 border border-border rounded px-2.5 py-1.5 mb-2">
                {s.line}
              </code>
              <p className="text-[12px] text-text-muted leading-relaxed">{s.or}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
