export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" strokeLinecap="round"/>
          <path d="M8 12l2 2 6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      title: "Install Chrome Extension",
      description:
        "Load the TraceBug extension in Chrome via Developer Mode, or install the SDK into your app with 2 lines of code.",
      detail: "chrome://extensions → Load unpacked",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
      glowColor: "shadow-[0_0_20px_rgba(0,212,255,0.2)]",
    },
    {
      number: "02",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
      ),
      title: "Start TraceBug Session",
      description:
        "Click the 🐛 floating button or the extension popup to enable recording. A green dot confirms TraceBug is active.",
      detail: "Click bug button → Enable recording",
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/30",
      glowColor: "shadow-[0_0_20px_rgba(34,197,94,0.2)]",
    },
    {
      number: "03",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M15 15l-5-5M15 9H9v6" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      ),
      title: "Reproduce the Bug",
      description:
        "Navigate through the app as you normally would. Click buttons, fill forms, trigger the error. TraceBug captures everything silently in the background.",
      detail: "Just use the app normally",
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      glowColor: "shadow-[0_0_20px_rgba(234,179,8,0.2)]",
    },
    {
      number: "04",
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <path d="M12 18v-6M9 15l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      title: "Generate Bug Report Instantly",
      description:
        "Open the dashboard, select the session, and click GitHub Issue or Jira Ticket. A complete, developer-ready report is copied to your clipboard in under 10 seconds.",
      detail: "One click → complete report",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/30",
      glowColor: "shadow-[0_0_20px_rgba(108,92,231,0.2)]",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-surface relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            How It Works
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            From Bug to Report in{" "}
            <span className="gradient-text">Under 60 Seconds</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Four simple steps. No training required. Works for developers and
            non-technical QA testers alike.
          </p>
        </div>

        {/* Desktop timeline */}
        <div className="hidden lg:grid grid-cols-4 gap-6 relative">
          {/* Connecting line */}
          <div className="absolute top-14 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-cyan-500/30 via-yellow-500/30 to-primary/30 z-0" />

          {steps.map((step, index) => (
            <div key={step.number} className="relative z-10 flex flex-col items-center text-center">
              {/* Number + Icon circle */}
              <div
                className={`w-28 h-28 rounded-2xl ${step.bg} border ${step.border} ${step.glowColor} flex flex-col items-center justify-center mb-6 transition-all duration-200 hover:scale-105 group cursor-default`}
              >
                <div className={`${step.color} mb-1`}>{step.icon}</div>
                <span className={`text-xs font-bold ${step.color} opacity-60`}>
                  {step.number}
                </span>
              </div>

              {/* Content */}
              <h3 className="text-text-primary font-bold text-base mb-2">
                {step.title}
              </h3>
              <p className="text-text-muted text-sm leading-relaxed mb-3">
                {step.description}
              </p>
              <div className={`inline-flex items-center gap-1 px-2 py-1 rounded ${step.bg} border ${step.border} text-xs ${step.color} font-mono`}>
                {step.detail}
              </div>

              {/* Arrow between steps (except last) */}
              {index < steps.length - 1 && (
                <div className="hidden" />
              )}
            </div>
          ))}
        </div>

        {/* Mobile steps */}
        <div className="lg:hidden space-y-4">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              <div className={`p-5 ${step.bg} border ${step.border} rounded-2xl`}>
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl ${step.bg} border ${step.border} flex flex-col items-center justify-center flex-shrink-0`}>
                    <div className={`${step.color}`}>{step.icon}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold ${step.color} opacity-60`}>
                        STEP {step.number}
                      </span>
                    </div>
                    <h3 className="text-text-primary font-bold text-base mb-2">
                      {step.title}
                    </h3>
                    <p className="text-text-muted text-sm leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className="flex justify-center py-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-text-muted">
                    <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Bottom message */}
        <div className="mt-16 text-center p-6 bg-background border border-border rounded-2xl">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="text-text-primary font-bold text-lg mb-2">
            Zero Meetings. Zero Back-and-Forth.
          </h3>
          <p className="text-text-muted text-sm max-w-lg mx-auto">
            Tester finds bug → clicks one button → pastes into Jira. Developer
            has everything. The entire process takes less than 60 seconds.
          </p>
        </div>
      </div>
    </section>
  );
}
