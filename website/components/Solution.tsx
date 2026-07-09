import {
  MousePointerClick, Network, AlertOctagon, Camera, Compass, Monitor, X, Check,
} from "lucide-react";
import SectionHeading from "@/components/SectionHeading";

const CAPTURES = [
  { Icon: MousePointerClick, label: "Clicks", desc: "Tag, id, aria-label, role, data-testid" },
  { Icon: Network, label: "Network", desc: "Method, URL, status, duration — failures flagged" },
  { Icon: AlertOctagon, label: "Console", desc: "Errors, stack traces, source file, line" },
  { Icon: Camera, label: "Screenshots", desc: "Full-page or region · annotate · draw markup" },
  { Icon: Compass, label: "Navigation", desc: "Every route, timestamp, time on page" },
  { Icon: Monitor, label: "Environment", desc: "Browser, OS, viewport, device, connection" },
];

export default function Solution() {
  return (
    <section id="solution" className="py-20 lg:py-28 bg-surface/50 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Before / after"
          title="From “it's broken” to a fixable ticket"
          subtitle="Vague reports cost days of back-and-forth. TraceBug records what actually happened — down to the button that was clicked and the request that failed."
          className="mb-14"
        />

        {/* Before / After */}
        <div className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto mb-16">
          <div className="rounded-2xl border border-error/20 bg-error/[0.03] p-6">
            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-error/10 text-error">
                <X size={14} strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold text-text-primary">Before — a typical bug report</span>
            </div>
            <ul className="space-y-3 text-[14px] text-text-muted">
              {["“The page is broken”", "“I don't remember what I clicked”", "“There was a red error message”"].map((t) => (
                <li key={t} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-error/50 flex-shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 pt-4 border-t border-error/15 text-[13px] font-medium text-error">
              → 3+ days of back-and-forth
            </p>
          </div>

          <div className="rounded-2xl border border-success/25 bg-success/[0.04] p-6 shadow-card">
            <div className="flex items-center gap-2 mb-5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-success/10 text-success">
                <Check size={14} strokeWidth={2.5} />
              </span>
              <span className="text-sm font-semibold text-text-primary">After — a TraceBug report</span>
            </div>
            <ul className="space-y-3 text-[13px] font-mono text-text-muted">
              <li className="flex gap-2.5"><span className="text-success">›</span> Click Edit → Select Inactive → Click Update</li>
              <li className="flex gap-2.5"><span className="text-error">✕</span> TypeError: Cannot read 'status' · line 42</li>
              <li className="flex gap-2.5"><span className="text-warning">⟳</span> POST /api/vendor → 500 · Chrome 121 · Win 11</li>
            </ul>
            <p className="mt-6 pt-4 border-t border-success/20 text-[13px] font-medium text-success">
              → Fixed in minutes
            </p>
          </div>
        </div>

        {/* Capture grid */}
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-text-subtle mb-6">
          Captured automatically, every session
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPTURES.map(({ Icon, label, desc }) => (
            <div
              key={label}
              className="group card-rise rounded-2xl border border-border bg-background p-5 hover:border-primary/30 hover:shadow-card-hover"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/[0.08] text-primary mb-4 transition-colors group-hover:bg-primary group-hover:text-white">
                <Icon size={18} />
              </div>
              <h3 className="text-[15px] font-semibold text-text-primary mb-1">{label}</h3>
              <p className="text-[13.5px] text-text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
