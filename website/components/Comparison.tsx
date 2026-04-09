export default function Comparison() {
  const rows = [
    {
      feature: "Steps to reproduce",
      manual: "Written manually, often incomplete or inaccurate",
      tracebug: "Auto-generated from session timeline with exact element selectors",
    },
    {
      feature: "Console errors",
      manual: "Manually copied (if the tester even opened DevTools)",
      tracebug: "Auto-captured — full message, stack trace, source file, line number",
    },
    {
      feature: "Network logs",
      manual: "Almost always missing — developers have to guess which API failed",
      tracebug: "Full API log — URL, method, status code, duration, timestamp",
    },
    {
      feature: "Screenshots",
      manual: "Manually taken with OS screenshot tool, often without context",
      tracebug: "Auto-captured via html2canvas with smart naming and annotation support",
    },
    {
      feature: "Browser & OS info",
      manual: "Usually missing or just \"Chrome on Windows\"",
      tracebug: "Auto-captured — browser version, OS, viewport, device, connection type",
    },
    {
      feature: "Time to create report",
      manual: "30–60 minutes of back-and-forth",
      tracebug: "Under 60 seconds from bug found to report ready",
    },
    {
      feature: "Developer time to reproduce",
      manual: "3+ days average, often closed as \"cannot reproduce\"",
      tracebug: "Minutes — everything needed is in the report",
    },
    {
      feature: "Voice description",
      manual: "Not possible — requires typing everything",
      tracebug: "One-click voice recording, transcript auto-saved to report",
    },
    {
      feature: "Framework compatibility",
      manual: "N/A — manual process regardless of framework",
      tracebug: "React, Vue, Angular, Next.js, Svelte, Nuxt, Remix, Astro, plain HTML",
    },
    {
      feature: "Privacy / data storage",
      manual: "Data sent to external bug tracker (Jira, Linear, etc.)",
      tracebug: "All data stays in localStorage — zero backend, no server calls",
    },
    {
      feature: "Cost",
      manual: "Dev time @ $80–200/hr × hours of back-and-forth",
      tracebug: "Free — open source, zero API keys, no subscriptions",
    },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/>
            </svg>
            Comparison
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            TraceBug vs.{" "}
            <span className="text-text-muted">Manual Bug Reporting</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            See exactly what you get with TraceBug versus the traditional
            tester-writes-a-Slack-message workflow.
          </p>
        </div>

        {/* Mobile: card layout */}
        <div className="md:hidden space-y-3">
          {rows.map((row) => (
            <div key={row.feature} className="bg-surface border border-border rounded-xl p-4">
              <div className="font-semibold text-text-primary text-sm mb-3">{row.feature}</div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400 flex-shrink-0 mt-0.5">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                  </svg>
                  <span className="text-text-muted text-sm">{row.manual}</span>
                </div>
                <div className="flex items-start gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400 flex-shrink-0 mt-0.5">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="text-text-primary text-sm">{row.tracebug}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: table layout */}
        <div className="hidden md:block bg-surface border border-border rounded-2xl overflow-hidden shadow-xl">
          {/* Table header */}
          <div className="grid grid-cols-[2fr_3fr_3fr] border-b border-border">
            <div className="px-6 py-4 text-text-muted text-sm font-semibold uppercase tracking-wider">
              Feature
            </div>
            <div className="px-6 py-4 border-l border-border">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="text-red-400 font-semibold text-sm">Manual Reporting</span>
              </div>
            </div>
            <div className="px-6 py-4 border-l border-border bg-primary/5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <span className="text-green-400 font-semibold text-sm">TraceBug</span>
                <span className="ml-1 text-xs px-1.5 py-0.5 bg-primary/20 border border-primary/30 text-primary rounded">
                  Recommended
                </span>
              </div>
            </div>
          </div>

          {/* Table rows */}
          {rows.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-[2fr_3fr_3fr] border-b border-border/50 hover:bg-background/30 transition-colors ${
                i === rows.length - 1 ? "border-b-0" : ""
              }`}
            >
              <div className="px-6 py-4 text-text-primary text-sm font-medium flex items-start">
                {row.feature}
              </div>

              {/* Manual */}
              <div className="px-6 py-4 border-l border-border/50">
                <div className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-red-400 flex-shrink-0 mt-0.5"
                  >
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                  </svg>
                  <span className="text-text-muted text-sm leading-relaxed">{row.manual}</span>
                </div>
              </div>

              {/* TraceBug */}
              <div className="px-6 py-4 border-l border-border/50 bg-primary/[0.03]">
                <div className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    className="text-green-400 flex-shrink-0 mt-0.5"
                  >
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="text-text-primary text-sm leading-relaxed">{row.tracebug}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA below table */}
        <div className="mt-12 text-center">
          <div className="inline-flex flex-col sm:flex-row items-center gap-4">
            <a
              href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all duration-200 shadow-glow-primary hover:shadow-glow-primary text-base"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              Start Using TraceBug — Free
            </a>
            <div className="text-text-muted text-sm">
              No account needed &bull; No API keys &bull; Works in 2 minutes
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
