import SectionHeading from "@/components/SectionHeading";
import { Search, MousePointerClick, FileCode } from "lucide-react";

const TIERS = [
  {
    label: "High confidence",
    tone: "error" as const,
    hint: "API POST /orders failed with 500 after clicking 'Place Order'",
    signal: "Network failure + click context",
  },
  {
    label: "Medium confidence",
    tone: "warning" as const,
    hint: "TypeError suggests undefined/null data — the response or upstream value was likely missing",
    signal: "Runtime error, no network failure",
  },
  {
    label: "Low confidence",
    tone: "muted" as const,
    hint: "Click on 'Submit' did not trigger any observable effect",
    signal: "Only a click, no downstream signal",
  },
];

const toneMap = {
  error: { dot: "bg-error", text: "text-error", border: "border-error/25", chip: "bg-error/10 text-error" },
  warning: { dot: "bg-warning", text: "text-warning", border: "border-warning/25", chip: "bg-warning/10 text-warning" },
  muted: { dot: "bg-text-subtle", text: "text-text-subtle", border: "border-border-strong", chip: "bg-surface-2 text-text-muted" },
};

export default function RootCauseHighlight() {
  return (
    <section className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow={<><Search size={13} /> The differentiator</>}
          title={<>Know the cause <span className="gradient-text">instantly</span></>}
          subtitle="No digging through logs. No guessing. TraceBug's root-cause engine reads the signals and tells you what likely went wrong — every time you capture a bug."
          className="mb-14"
        />

        {/* Hero example */}
        <div className="relative max-w-3xl mx-auto mb-16">
          <div className="absolute -inset-3 -z-10 rounded-3xl bg-gradient-to-tr from-primary/12 to-accent/10 blur-2xl" />
          <div className="rounded-2xl border border-border bg-background shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-surface flex items-center gap-2">
              <span className="text-base">🐛</span>
              <span className="text-[14px] font-semibold text-text-primary">
                Checkout: “Place Order” Fails — 500 Server Error
              </span>
            </div>
            <div className="p-6">
              <div className="rounded-xl border border-error/20 bg-error/[0.04] p-5 mb-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-error">
                    🔍 Possible cause
                  </span>
                  <span className="text-[10px] rounded-full bg-error/10 text-error px-2 py-0.5 font-medium">
                    high confidence
                  </span>
                </div>
                <p className="text-[15px] text-text-primary leading-relaxed">
                  API <code className="font-mono text-error">POST /orders</code> failed with{" "}
                  <code className="font-mono text-error font-semibold">500</code> after clicking{" "}
                  <span className="text-primary font-medium">‘Place Order’</span>
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { Icon: FileCode, k: "Endpoint", v: "POST /api/orders" },
                  { Icon: MousePointerClick, k: "User clicked", v: "‘Place Order’ button" },
                  { Icon: Search, k: "Page", v: "/checkout" },
                ].map(({ Icon, k, v }) => (
                  <div key={k} className="rounded-xl border border-border bg-surface p-3.5">
                    <div className="flex items-center gap-1.5 text-text-subtle text-[11px] uppercase tracking-wider mb-1.5">
                      <Icon size={12} /> {k}
                    </div>
                    <div className="font-mono text-[12.5px] text-text-primary">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-5 text-[13px] text-text-muted">
                Every bug report opens with this line. Developers know exactly where to look —
                no DevTools, no back-and-forth.
              </p>
            </div>
          </div>
        </div>

        {/* Confidence tiers */}
        <div className="grid md:grid-cols-3 gap-4">
          {TIERS.map((t) => {
            const c = toneMap[t.tone];
            return (
              <div key={t.label} className={`card-rise rounded-2xl border bg-background p-5 hover:shadow-card-hover ${c.border}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${c.text}`}>{t.label}</span>
                </div>
                <p className="text-[13.5px] text-text-primary leading-relaxed mb-3">{t.hint}</p>
                <p className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${c.chip}`}>{t.signal}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-12 text-center text-xl sm:text-2xl font-semibold tracking-tight text-text-muted">
          No digging through logs. No guessing.{" "}
          <span className="gradient-text">Just clarity.</span>
        </p>
      </div>
    </section>
  );
}
