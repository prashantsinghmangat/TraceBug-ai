export default function RootCauseHighlight() {
  const examples = [
    {
      confidence: "high",
      label: "High confidence",
      hint: "API POST /orders failed with 500 after clicking 'Place Order'",
      signal: "Network failure + click context",
      bg: "bg-red-500/5",
      border: "border-red-400",
      pill: "bg-red-500/10 text-red-300 border-red-500/30",
      dot: "bg-red-400",
    },
    {
      confidence: "medium",
      label: "Medium confidence",
      hint: "TypeError suggests undefined/null data — the response or upstream value was likely missing",
      signal: "Runtime error, no network failure",
      bg: "bg-orange-500/5",
      border: "border-orange-400",
      pill: "bg-orange-500/10 text-orange-300 border-orange-500/30",
      dot: "bg-orange-400",
    },
    {
      confidence: "low",
      label: "Low confidence",
      hint: "Click on 'Submit' did not trigger any observable effect",
      signal: "Only a click, no downstream signal",
      bg: "bg-slate-500/5",
      border: "border-slate-400",
      pill: "bg-slate-500/10 text-slate-300 border-slate-500/30",
      dot: "bg-slate-400",
    },
  ];

  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <span className="text-base leading-none">🔍</span>
            The Differentiator
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-text-primary mb-4">
            Know the cause{" "}
            <span className="gradient-text">instantly</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            No digging through logs. No guessing. TraceBug&apos;s root-cause
            engine reads the signals and tells you what likely went wrong —
            every time you capture a bug.
          </p>
        </div>

        {/* Big hero example — high confidence */}
        <div className="mb-12">
          <div className="relative bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl">
            {/* Header bar */}
            <div className="flex items-center gap-2 px-5 py-3 bg-background/50 border-b border-border">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
              <span className="ml-3 text-xs text-text-muted font-mono">
                GitHub Issue — auto-generated
              </span>
            </div>

            {/* Issue preview */}
            <div className="p-6 sm:p-8 space-y-4">
              <div className="text-text-primary text-lg font-bold">
                Checkout: &ldquo;Place Order&rdquo; Fails — 500 Server Error
              </div>

              {/* Root cause banner — the hero */}
              <div className="bg-red-500/10 border-l-4 border-red-400 rounded-md px-5 py-4">
                <div className="flex items-center gap-2 text-xs text-red-300 font-semibold mb-1.5">
                  <span className="text-lg leading-none">🔍</span>
                  <span>Possible Cause</span>
                  <span className="text-red-400/70 font-normal">(high confidence)</span>
                </div>
                <div className="text-text-primary text-sm sm:text-base font-mono leading-relaxed">
                  API <span className="text-yellow-300">POST /orders</span> failed with{" "}
                  <span className="text-red-400 font-semibold">500</span> after clicking{" "}
                  <span className="text-blue-300">&lsquo;Place Order&rsquo;</span>
                </div>
              </div>

              {/* Supporting context */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="bg-background/50 border border-border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Endpoint</div>
                  <div className="text-text-primary text-xs font-mono">POST /api/orders</div>
                </div>
                <div className="bg-background/50 border border-border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">User clicked</div>
                  <div className="text-text-primary text-xs">&lsquo;Place Order&rsquo; button</div>
                </div>
                <div className="bg-background/50 border border-border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">Page</div>
                  <div className="text-text-primary text-xs font-mono">/checkout</div>
                </div>
              </div>

              <div className="pt-2 text-text-muted text-xs leading-relaxed">
                Every bug report opens with this line. Developers know exactly where to look — no
                DevTools, no back-and-forth.
              </div>
            </div>
          </div>
        </div>

        {/* Three confidence tiers */}
        <div className="mb-10">
          <div className="text-center mb-6">
            <h3 className="text-text-primary font-bold text-xl mb-2">Three confidence tiers</h3>
            <p className="text-text-muted text-sm">
              Deterministic rules. No AI APIs. Just signals.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {examples.map((ex) => (
              <div
                key={ex.confidence}
                className={`${ex.bg} border-l-4 ${ex.border} border-t border-r border-b border-border rounded-xl p-5`}
              >
                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${ex.pill} mb-3`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${ex.dot}`}></span>
                  {ex.label}
                </div>
                <div className="text-text-primary text-sm font-mono leading-relaxed mb-3">
                  🔍 {ex.hint}
                </div>
                <div className="text-text-muted text-xs pt-3 border-t border-border/50">
                  <span className="text-text-muted/70">Signal:</span> {ex.signal}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Closing punchline */}
        <div className="text-center">
          <p className="text-text-primary text-lg font-semibold mb-2">
            No digging through logs. No guessing.
          </p>
          <p className="gradient-text text-2xl font-extrabold">
            Just clarity.
          </p>
        </div>
      </div>
    </section>
  );
}
