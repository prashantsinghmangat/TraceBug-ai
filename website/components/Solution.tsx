import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  MousePointerClick,
  Network,
  AlertOctagon,
  Camera,
  Compass,
  Monitor,
} from "lucide-react";

// Six captures only — the ones that actually differentiate. Form Inputs,
// Voice Descriptions, User Identity dropped because they overlap or read
// as filler.
const CAPTURES = [
  {
    icon: MousePointerClick,
    label: "Clicks",
    desc: "Tag, id, aria-label, role, data-testid",
  },
  {
    icon: Network,
    label: "Network",
    desc: "Method, URL, status, duration · failures flagged",
  },
  {
    icon: AlertOctagon,
    label: "Console",
    desc: "Errors, stack traces, source file, line",
  },
  {
    icon: Camera,
    label: "Screenshots",
    desc: "html2canvas · annotate · draw markup",
  },
  {
    icon: Compass,
    label: "Navigation",
    desc: "Every route, timestamp, time on page",
  },
  {
    icon: Monitor,
    label: "Environment",
    desc: "Browser, OS, viewport, device, connection",
  },
];

export default function Solution() {
  return (
    <section className="py-28 relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-14">
          <Badge tone="success" className="mb-5">
            <span>▸</span>
            <span>The Solution</span>
          </Badge>
          <h2 className="text-[32px] sm:text-[44px] font-semibold text-text-primary leading-[1.1] tracking-[-0.025em] mb-4">
            Everything your dev needs,{" "}
            <span className="gradient-text">in one file</span>
          </h2>
          <p className="text-text-muted text-base sm:text-[17px] leading-[1.6] max-w-[560px] mx-auto">
            Logs, network calls, screenshots, user actions — bundled into a
            single offline `.html` file. No accounts. No lock-in.
          </p>
        </div>

        {/* Before / After — slim, two terminal-style cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14">
          <Card className="p-5 border-error/20 bg-error/[0.03]">
            <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-wider text-error">
              <span>✗</span><span>Before</span>
            </div>
            <ul className="space-y-1.5 text-[13px] text-text-muted leading-relaxed">
              <li>“The page is broken”</li>
              <li>“I don&apos;t remember what I clicked”</li>
              <li>“There was a red error message”</li>
            </ul>
            <div className="mt-4 text-[11px] font-mono text-error/80">
              → 3+ days of back-and-forth
            </div>
          </Card>

          <Card className="p-5 border-success/20 bg-success/[0.03]">
            <div className="flex items-center gap-2 mb-3 text-[11px] font-mono uppercase tracking-wider text-success">
              <span>✓</span><span>After</span>
            </div>
            <ul className="space-y-1.5 text-[13px] text-text-primary leading-relaxed font-mono">
              <li>Click Edit → Select Inactive → Click Update</li>
              <li>TypeError: Cannot read 'status' · line 42</li>
              <li>POST /api/vendor → 500 · Chrome 121 · Win 11</li>
            </ul>
            <div className="mt-4 text-[11px] font-mono text-success/80">
              → Fixed in minutes
            </div>
          </Card>
        </div>

        {/* Capture grid — six tiles, single-line copy */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {CAPTURES.map(({ icon: Icon, label, desc }) => (
            <Card
              key={label}
              className="p-4 hover:border-border-strong transition-colors duration-150"
            >
              <Icon size={18} className="text-primary mb-3" strokeWidth={1.75} />
              <div className="text-[13px] font-semibold text-text-primary mb-1 tracking-tight">
                {label}
              </div>
              <div className="text-[12px] text-text-muted leading-snug">
                {desc}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
