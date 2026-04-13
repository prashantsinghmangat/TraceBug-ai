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
              Your debugging assistant &bull; Zero setup &bull; Free
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-text-primary leading-tight mb-6">
              Stop opening DevTools{" "}
              <span className="gradient-text">for every bug</span>
            </h1>

            {/* Subheadline */}
            <p className="text-text-muted text-lg sm:text-xl leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0">
              Capture a bug →{" "}
              <span className="text-text-primary font-medium">
                instantly know the likely cause
              </span>{" "}
              → create a GitHub issue in one click.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <a
                href="#install"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all duration-200 shadow-glow-primary hover:shadow-glow-primary text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Get Started Free
              </a>
              <a
                href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 text-text-primary border border-border hover:border-primary/50 hover:bg-surface font-semibold rounded-xl transition-all duration-200 text-sm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round"/>
                  <path d="M8 12l4 4 4-4M12 8v8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Install Chrome Extension
              </a>
            </div>

            {/* Trust line */}
            <div className="mt-8 flex flex-wrap items-center gap-4 justify-center lg:justify-start text-sm text-text-muted">
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Works with your existing workflow
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                No setup, no config
              </div>
              <div className="flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Privacy-first
              </div>
            </div>
          </div>

          {/* Right: Debugging Assistant preview */}
          <div className="relative">
            <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-3xl" />
            <div className="relative code-block rounded-2xl overflow-hidden border border-border shadow-2xl">
              {/* Header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-border">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                <span className="ml-3 text-xs text-text-muted font-mono">
                  TraceBug — Bug captured in 2 clicks
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
                  </span>
                  <span className="text-xs text-green-400">Ready</span>
                </div>
              </div>

              {/* Root cause banner — the WOW moment */}
              <div className="px-4 pt-4">
                <div className="bg-red-500/10 border-l-4 border-red-400 rounded-md px-4 py-3">
                  <div className="flex items-center gap-2 text-[11px] text-red-300 font-semibold mb-1">
                    <span className="text-base leading-none">🔍</span>
                    <span>Possible Cause</span>
                    <span className="text-red-400/70 font-normal">(high confidence)</span>
                  </div>
                  <div className="text-[13px] text-text-primary leading-snug font-mono">
                    API <span className="text-yellow-300">POST /orders</span> failed with{" "}
                    <span className="text-red-400 font-semibold">500</span> after clicking{" "}
                    <span className="text-blue-300">&apos;Place Order&apos;</span>
                  </div>
                </div>
              </div>

              {/* TL;DR + actions */}
              <div className="p-4 space-y-3 font-mono text-xs">
                <div className="bg-primary/5 border-l-2 border-primary/50 rounded pl-3 py-1.5">
                  <div className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-1">
                    TL;DR
                  </div>
                  <div className="text-text-primary text-[11px] leading-relaxed">
                    TypeError thrown on /checkout — Cannot read &apos;status&apos; of undefined
                  </div>
                </div>

                <div className="pt-1">
                  <div className="text-text-muted text-[10px] uppercase tracking-wider mb-2">
                    Recent actions
                  </div>
                  {[
                    { label: "Clicked 'Cart' link", icon: "●", color: "text-blue-400" },
                    { label: "Navigated to /checkout", icon: "→", color: "text-cyan-400" },
                    { label: "Clicked 'Place Order' button", icon: "●", color: "text-blue-400" },
                    { label: "POST /orders → 500", icon: "⟳", color: "text-red-400" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className={`${step.color} w-3 flex-shrink-0`}>{step.icon}</span>
                      <span className="text-text-muted text-[11px]">{step.label}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-white rounded-md text-[11px] font-semibold hover:bg-primary/90 transition-colors">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                    Open GitHub Issue
                  </button>
                  <button className="px-3 py-2 border border-border text-text-primary rounded-md text-[11px] font-semibold hover:bg-surface transition-colors">
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* Shortcut hint */}
            <div className="mt-4 flex items-center justify-center gap-2 text-xs text-text-muted">
              <span>Try it:</span>
              <kbd className="px-2 py-1 bg-surface border border-border rounded text-[10px] font-mono text-text-primary">Ctrl</kbd>
              <span>+</span>
              <kbd className="px-2 py-1 bg-surface border border-border rounded text-[10px] font-mono text-text-primary">Shift</kbd>
              <span>+</span>
              <kbd className="px-2 py-1 bg-surface border border-border rounded text-[10px] font-mono text-text-primary">B</kbd>
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
