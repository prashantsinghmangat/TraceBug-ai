import SectionHeading from "@/components/SectionHeading";
import { Check, X } from "lucide-react";

// Honest matrix — Sentry and LogRocket are excellent at what they do, and they
// get their checkmarks. TraceBug wins on the rows that matter for filing a bug.
const MATRIX: { feature: string; tracebug: boolean; sentry: boolean; logrocket: boolean }[] = [
  { feature: "Session replay & console capture", tracebug: true, sentry: true, logrocket: true },
  { feature: "Network log with failed requests", tracebug: true, sentry: true, logrocket: true },
  { feature: "2-click capture by anyone on the team", tracebug: true, sentry: false, logrocket: false },
  { feature: "Root-cause hint in every report", tracebug: true, sentry: false, logrocket: false },
  { feature: "Works with zero backend or account", tracebug: true, sentry: false, logrocket: false },
  { feature: "Report is a single offline .html file", tracebug: true, sentry: false, logrocket: false },
  { feature: "One-click GitHub / Jira export", tracebug: true, sentry: false, logrocket: false },
  { feature: "Free and open source (MIT)", tracebug: true, sentry: false, logrocket: false },
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
          title="Monitoring platforms watch production. TraceBug files the bug."
          subtitle="Sentry and LogRocket are built for observability dashboards. TraceBug is built for the moment someone hits a bug and needs to hand it to a developer."
          className="mb-14"
        />

        <div className="max-w-3xl mx-auto rounded-2xl border border-border bg-background shadow-card overflow-hidden">
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

        <p className="mt-8 text-center text-[13.5px] text-text-muted max-w-xl mx-auto">
          Already running Sentry? Keep it — TraceBug lives in the browser and doesn&apos;t touch
          your monitoring stack.
        </p>
      </div>
    </section>
  );
}
