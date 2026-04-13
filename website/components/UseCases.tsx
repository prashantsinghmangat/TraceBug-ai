export default function UseCases() {
  const personas = [
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
      ),
      title: "Frontend developers",
      desc: "Fixing UI bugs without opening DevTools every time.",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      ),
      title: "Indie hackers",
      desc: "Building a SaaS. Every minute counts — debug in seconds, ship faster.",
      color: "text-yellow-400",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/20",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: "Small product teams",
      desc: "Reporting bugs instantly — no back-and-forth between dev and PM.",
      color: "text-primary",
      bg: "bg-primary/10",
      border: "border-primary/20",
    },
    {
      icon: (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
      title: "QA engineers",
      desc: "Speeding up reports. Zero typing — auto-filled with everything a dev needs.",
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
    },
  ];

  return (
    <section className="py-24 bg-surface relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Use Cases
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            Built for developers who{" "}
            <span className="gradient-text">ship fast</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Every workflow benefits. No learning curve. No dashboards to maintain.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {personas.map((p) => (
            <div
              key={p.title}
              className={`p-6 ${p.bg} border ${p.border} rounded-2xl hover:scale-[1.02] transition-all duration-200 cursor-default group`}
            >
              <div className={`${p.color} mb-4 group-hover:scale-110 transition-transform duration-200`}>
                {p.icon}
              </div>
              <div className={`text-base font-bold ${p.color} mb-2`}>
                {p.title}
              </div>
              <div className="text-text-muted text-sm leading-relaxed">
                {p.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
