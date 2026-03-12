export default function Solution() {
  const captures = [
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M15 15l-5-5M15 9H9v6" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      ),
      label: "User Clicks",
      desc: "Tag, text, id, aria-label, role, data-testid — every click recorded with full element context",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <path d="M7 10h10M7 14h6" strokeLinecap="round"/>
        </svg>
      ),
      label: "Form Inputs",
      desc: "Field name, type, value (passwords auto-redacted), placeholder — all captured securely",
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 12h18M12 3l9 9-9 9" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      label: "Navigation",
      desc: "Every route change tracked — from path, to path, timestamp, duration on page",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 9v4M12 17h.01" strokeLinecap="round"/>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
      ),
      label: "Console Errors",
      desc: "Full error messages, stack traces, source files, line numbers — everything a dev needs",
      color: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10"/>
          <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" strokeLinecap="round"/>
        </svg>
      ),
      label: "Network Calls",
      desc: "Fetch + XHR, URL, method, status code, duration — failed API calls flagged automatically",
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4" strokeLinecap="round"/>
        </svg>
      ),
      label: "Screenshots",
      desc: "html2canvas-powered snapshots with smart auto-naming, annotation, and drawing tools",
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2" y="3" width="20" height="14" rx="2"/>
          <path d="M8 21h8M12 17v4M2 7h20M8 3v4M16 3v4" strokeLinecap="round"/>
        </svg>
      ),
      label: "Environment Data",
      desc: "Browser, OS version, viewport size, device type, connection type — auto-captured",
      color: "text-orange-400",
      bg: "bg-orange-500/10",
      border: "border-orange-500/20",
    },
    {
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
          <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" strokeLinecap="round"/>
        </svg>
      ),
      label: "Voice Descriptions",
      desc: "Web Speech API — testers describe bugs by voice, transcript saved in the report",
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "border-pink-500/20",
    },
  ];

  return (
    <section className="py-24 bg-surface relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            The Solution
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            TraceBug Gives Developers{" "}
            <span className="gradient-text">Everything They Need</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Every time a tester finds a bug, TraceBug has already captured all
            the context needed to reproduce and fix it. Zero extra effort.
          </p>
        </div>

        {/* Before/After comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
          <div className="p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="text-red-400 font-semibold text-sm">Before TraceBug</span>
            </div>
            <div className="space-y-2 text-sm text-text-muted">
              <p className="italic border-l-2 border-red-500/30 pl-3 py-1">&ldquo;The page is broken&rdquo;</p>
              <p className="italic border-l-2 border-red-500/30 pl-3 py-1">&ldquo;I don&apos;t remember what I clicked&rdquo;</p>
              <p className="italic border-l-2 border-red-500/30 pl-3 py-1">&ldquo;There was some red error text&rdquo;</p>
              <p className="italic border-l-2 border-red-500/30 pl-3 py-1">&ldquo;It&apos;s Chrome... or maybe Firefox?&rdquo;</p>
            </div>
            <div className="mt-4 text-red-400 text-xs font-semibold">
              → 3+ days of back-and-forth
            </div>
          </div>

          <div className="p-6 bg-green-500/5 border border-green-500/20 rounded-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-400">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
              <span className="text-green-400 font-semibold text-sm">After TraceBug</span>
            </div>
            <div className="space-y-2 text-sm text-text-muted">
              <p className="border-l-2 border-green-500/30 pl-3 py-1">✓ Exact steps: Click Edit → Select Inactive → Click Update</p>
              <p className="border-l-2 border-green-500/30 pl-3 py-1">✓ TypeError: Cannot read &apos;status&apos; at line 42</p>
              <p className="border-l-2 border-green-500/30 pl-3 py-1">✓ POST /api/vendor/update → 500 Internal Server Error</p>
              <p className="border-l-2 border-green-500/30 pl-3 py-1">✓ Chrome 121, Windows 11, 1920×1080</p>
            </div>
            <div className="mt-4 text-green-400 text-xs font-semibold">
              → Developer fixes in minutes, not days
            </div>
          </div>
        </div>

        {/* Capture grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {captures.map((item) => (
            <div
              key={item.label}
              className={`p-4 ${item.bg} border ${item.border} rounded-xl hover:scale-[1.02] transition-all duration-200 cursor-default group`}
            >
              <div className={`${item.color} mb-3 group-hover:scale-110 transition-transform duration-200`}>
                {item.icon}
              </div>
              <div className={`text-sm font-semibold ${item.color} mb-1`}>
                {item.label}
              </div>
              <div className="text-text-muted text-xs leading-relaxed">
                {item.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
