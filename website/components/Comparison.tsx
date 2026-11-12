import { Check, Minus } from "lucide-react";

// Honest matrix — Sentry and LogRocket are excellent at what they do, and they
// get their checkmarks. TraceBug wins on the rows that matter for filing a bug.
// Only rows that hold up: Sentry and LogRocket also have feedback widgets,
// Jira integrations and AI root-cause features, so those rows were removed.
const MATRIX: { feature: string; tracebug: boolean; sentry: boolean; logrocket: boolean }[] = [
  { feature: "Session replay and console capture", tracebug: true, sentry: true, logrocket: true },
  { feature: "Network log with failed requests", tracebug: true, sentry: true, logrocket: true },
  { feature: "Works with no backend or account", tracebug: true, sentry: false, logrocket: false },
  { feature: "Report is one offline .html file", tracebug: true, sentry: false, logrocket: false },
  { feature: "Free and open source (MIT)", tracebug: true, sentry: false, logrocket: false },
];

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check size={16} strokeWidth={2} className="text-text-primary" aria-label="Yes" />
  ) : (
    <Minus size={16} strokeWidth={1.5} className="text-text-subtle" aria-label="No" />
  );
}

export default function Comparison() {
  return (
    <section className="border-t border-border py-section">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-16 lg:px-8">
        <div className="min-w-0 lg:col-span-5">
          <span className="mb-4 inline-flex font-mono text-[13px] text-text-subtle">Comparison</span>
          <h2 className="text-h3 font-medium text-text-primary">
            Monitoring platforms watch production. TraceBug files the bug.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-text-muted">
            TraceBug isn&apos;t trying to replace your monitoring platform. It turns a browser bug into evidence
            your developer or AI agent can actually investigate. Already running Sentry or LogRocket? Keep them.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-7">
          <div tabIndex={0} role="region" aria-label="TraceBug compared with Sentry and LogRocket" className="overflow-x-auto rounded-2xl border border-border bg-background">
          <div className="grid min-w-[520px] grid-cols-[1fr_100px_100px_100px]">
            <div className="px-6 py-4 text-[13px] text-text-subtle border-b border-border">Filing a bug</div>
            <div className="px-4 py-4 text-center border-b border-border bg-surface">
              <span className="text-[14px] font-medium text-text-primary">TraceBug</span>
            </div>
            <div className="px-4 py-4 text-center text-[14px] text-text-muted border-b border-border">Sentry</div>
            <div className="px-4 py-4 text-center text-[14px] text-text-muted border-b border-border">LogRocket</div>

            {MATRIX.map((row, i) => (
              <div key={row.feature} className="contents">
                <div className={`px-6 py-4 text-[14px] text-text-primary ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  {row.feature}
                </div>
                <div className={`px-4 py-4 flex justify-center bg-surface ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.tracebug} />
                </div>
                <div className={`px-4 py-4 flex justify-center ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.sentry} />
                </div>
                <div className={`px-4 py-4 flex justify-center ${i < MATRIX.length - 1 ? "border-b border-border" : ""}`}>
                  <Cell on={row.logrocket} />
                </div>
              </div>
            ))}
          </div>
          </div>
        </div>
      </div>
    </section>
  );
}
