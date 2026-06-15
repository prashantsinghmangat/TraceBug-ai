import SectionHeading from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { ChromeIcon } from "@/components/ui/brand-icons";
import { Check, X, ArrowRight } from "lucide-react";

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

// true = has it, false = doesn't
const MATRIX: { feature: string; tracebug: boolean; sentry: boolean; logrocket: boolean }[] = [
  { feature: "Instant 2-click bug capture", tracebug: true, sentry: false, logrocket: false },
  { feature: "Automatic root-cause hint", tracebug: true, sentry: false, logrocket: false },
  { feature: "Works with no setup", tracebug: true, sentry: false, logrocket: false },
  { feature: "Free, no account", tracebug: true, sentry: false, logrocket: false },
  { feature: "Data stays in the browser", tracebug: true, sentry: false, logrocket: false },
  { feature: "One-click GitHub / Jira export", tracebug: true, sentry: false, logrocket: false },
];

const MANUAL = [
  { k: "Time to create a report", manual: "30–60 min of back-and-forth", tb: "Under 60 seconds" },
  { k: "Reproduction steps", manual: "Written by hand, often wrong", tb: "Auto-generated with selectors" },
  { k: "Console + network", manual: "Usually missing", tb: "Captured in full, automatically" },
  { k: "Dev time to reproduce", manual: "3+ days average", tb: "Minutes — it's all in the report" },
  { k: "Cost", manual: "$80–200/hr of wasted time", tb: "Free, open source" },
];

function Cell({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/12 text-success">
      <Check size={14} strokeWidth={3} />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-text-subtle">
      <X size={14} strokeWidth={2.5} />
    </span>
  );
}

export default function Comparison() {
  return (
    <section className="py-20 lg:py-28 bg-surface/50 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Comparison"
          title={<>Why not just use <span className="gradient-text">existing tools?</span></>}
          subtitle="Built for speed, not dashboards. See how TraceBug compares to the heavyweight monitoring platforms — and to filing bugs by hand."
          className="mb-14"
        />

        {/* Competitor matrix */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-background shadow-card overflow-hidden mb-12">
          <div className="grid grid-cols-[1fr_auto_auto_auto]">
            <div className="px-5 py-3.5 text-[12px] font-semibold uppercase tracking-wider text-text-subtle border-b border-border" />
            <div className="px-4 py-3.5 text-center border-b border-border bg-primary/[0.05]">
              <span className="text-[13px] font-semibold text-primary">TraceBug</span>
            </div>
            <div className="px-4 py-3.5 text-center text-[13px] font-medium text-text-muted border-b border-border">Sentry</div>
            <div className="px-4 py-3.5 text-center text-[13px] font-medium text-text-muted border-b border-border">LogRocket</div>

            {MATRIX.map((row, i) => (
              <div key={row.feature} className="contents">
                <div className={`px-5 py-3.5 text-[13.5px] text-text-primary ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  {row.feature}
                </div>
                <div className={`px-4 py-3.5 flex justify-center bg-primary/[0.05] ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.tracebug} />
                </div>
                <div className={`px-4 py-3.5 flex justify-center ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.sentry} />
                </div>
                <div className={`px-4 py-3.5 flex justify-center ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.logrocket} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Manual vs TraceBug */}
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-px rounded-2xl border border-border overflow-hidden bg-border">
          <div className="bg-surface px-6 py-4 text-[13px] font-semibold uppercase tracking-wider text-text-subtle">Manual bug reporting</div>
          <div className="bg-background px-6 py-4 text-[13px] font-semibold uppercase tracking-wider text-primary">With TraceBug</div>
          {MANUAL.map((row) => (
            <div key={row.k} className="contents">
              <div className="bg-surface px-6 py-4">
                <div className="text-[11px] uppercase tracking-wider text-text-subtle mb-1">{row.k}</div>
                <div className="text-[13.5px] text-text-muted flex items-start gap-2">
                  <X size={14} className="text-error mt-0.5 flex-shrink-0" /> {row.manual}
                </div>
              </div>
              <div className="bg-background px-6 py-4">
                <div className="text-[11px] uppercase tracking-wider text-text-subtle mb-1 sm:opacity-0">{row.k}</div>
                <div className="text-[13.5px] text-text-primary flex items-start gap-2">
                  <Check size={14} className="text-success mt-0.5 flex-shrink-0" strokeWidth={3} /> {row.tb}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <p className="text-2xl font-semibold tracking-tight text-text-muted mb-6">
            Built for speed. <span className="gradient-text">Not dashboards.</span>
          </p>
          <Button asChild size="lg" variant="gradient" className="shimmer">
            <a href={CHROME_URL} target="_blank" rel="noopener noreferrer">
              <ChromeIcon size={16} /> Start using TraceBug — free <ArrowRight size={15} />
            </a>
          </Button>
          <p className="mt-3 text-[13px] text-text-subtle">No account needed · No API keys · Works in 2 minutes</p>
        </div>
      </div>
    </section>
  );
}
