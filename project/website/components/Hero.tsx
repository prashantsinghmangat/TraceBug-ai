"use client";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center pt-16 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-28">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Left: Copy */}
          <div className="text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border text-sm text-text-muted mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
              </span>
              Zero Backend &bull; Browser Only &bull; Free
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-text-primary leading-tight mb-6">
              Debug Bugs in{" "}
              <span className="gradient-text">Seconds</span>
              <br />
              Not Hours
            </h1>

            {/* Subheadline */}
            <p className="text-text-muted text-lg sm:text-xl leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              TraceBug records user actions, console errors, network calls, and
              screenshots to generate{" "}
              <span className="text-text-primary font-medium">
                developer-ready bug reports
              </span>{" "}
              automatically. No backend needed.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <a
                href="#install"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-200 shadow-glow-primary hover:shadow-glow-primary text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round"/>
                  <path d="M8 12l4 4 4-4M12 8v8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Install Chrome Extension
              </a>
              <a
                href="https://github.com/prashantsinghmangat/tracebug-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-text-primary border border-border hover:border-primary/50 hover:bg-surface font-semibold rounded-xl transition-all duration-200 text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                View on GitHub
              </a>
            </div>

            {/* Social proof */}
            <div className="mt-8 flex flex-wrap items-center gap-4 justify-center lg:justify-start text-sm text-text-muted">
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Works with React, Vue, Angular, Next.js
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Zero runtime dependencies
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Privacy-first, data stays in browser
              </div>
            </div>
          </div>

          {/* Right: Terminal preview */}
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-3xl" />
            <div className="relative code-block rounded-2xl overflow-hidden border border-border shadow-2xl">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="ml-3 text-xs text-text-muted font-mono">
                  TraceBug — Session #tb_20260312_142301
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                  </span>
                  <span className="text-xs text-green-400">Recording</span>
                </div>
              </div>

              {/* Timeline events */}
              <div className="p-4 space-y-2 font-mono text-xs">
                <div className="text-text-muted text-[11px] mb-3">
                  ── Session Timeline ──────────────────────
                </div>

                {[
                  { time: "+0.0s", type: "NAV", color: "text-cyan-400", icon: "→", event: "navigate", detail: "/vendor" },
                  { time: "+1.2s", type: "CLK", color: "text-blue-400", icon: "●", event: "click", detail: '"Edit" button [role=button]' },
                  { time: "+2.1s", type: "SEL", color: "text-purple-400", icon: "◆", event: "select", detail: 'Status: "Active" → "Inactive"' },
                  { time: "+3.4s", type: "CLK", color: "text-blue-400", icon: "●", event: "click", detail: '"Update" button [type=submit]' },
                  { time: "+3.5s", type: "API", color: "text-yellow-400", icon: "⟳", event: "fetch", detail: "POST /api/vendor/update — 500" },
                  { time: "+3.5s", type: "ERR", color: "text-red-400", icon: "✕", event: "error", detail: "TypeError: Cannot read 'status'" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 py-1">
                    <span className="text-text-muted w-12 flex-shrink-0">{item.time}</span>
                    <span className={`${item.color} font-bold w-8 flex-shrink-0`}>
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={`${item.color} font-semibold`}>{item.event} </span>
                      <span className="text-text-muted">{item.detail}</span>
                    </div>
                  </div>
                ))}

                <div className="border-t border-border mt-3 pt-3">
                  <div className="text-text-muted text-[11px] mb-2">
                    ── Auto-Generated Report ─────────────────
                  </div>
                  <div className="text-green-400 text-[11px] mb-1">
                    ✓ 6 events captured
                  </div>
                  <div className="text-green-400 text-[11px] mb-1">
                    ✓ 1 error detected — TypeError
                  </div>
                  <div className="text-green-400 text-[11px] mb-3">
                    ✓ Reproduction steps ready
                  </div>
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
                    <div className="text-primary text-[11px] font-semibold mb-1">
                      Bug Title (auto-generated):
                    </div>
                    <div className="text-text-primary text-[11px]">
                      🐛 Vendor Update Fails — TypeError
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-text-muted animate-bounce">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </section>
  );
}
