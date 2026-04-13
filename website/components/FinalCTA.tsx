export default function FinalCTA() {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] rounded-full bg-primary/10 blur-[120px] pointer-events-none" />

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
          </span>
          Free &middot; No account required
        </div>

        {/* Headline */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-text-primary leading-tight mb-6">
          Fix bugs faster{" "}
          <span className="gradient-text">starting today</span>
        </h2>

        {/* Subtext */}
        <p className="text-text-muted text-lg sm:text-xl max-w-xl mx-auto mb-10 leading-relaxed">
          Install in seconds. No setup required. Works with every frontend framework.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          <a
            href="https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl transition-all duration-200 shadow-glow-primary hover:shadow-glow-primary text-base min-w-[220px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Install Extension
          </a>
          <a
            href="#install"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 text-text-primary border border-border hover:border-primary/50 hover:bg-surface font-bold rounded-xl transition-all duration-200 text-base min-w-[220px]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="5 12 19 12" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="12 5 19 12 12 19" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Get Started
          </a>
        </div>

        {/* Trust bullets */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-text-muted">
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            No API keys
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            No server
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Data stays in your browser
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Open source
          </div>
        </div>
      </div>
    </section>
  );
}
