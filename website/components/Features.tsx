import {
  IconBugReport, IconReplay, IconConsole, IconScreenshot,
  IconVoice, IconGitHub, IconJira,
} from "./Icons";

export default function Features() {
  const features = [
    {
      icon: <IconBugReport size={24} />,
      title: "Automatic Bug Reports",
      description:
        "TraceBug converts user sessions into developer-ready bug reports with zero manual effort. Auto-generated titles, flow summaries, reproduction steps, and environment data — all structured and ready to paste into Jira or GitHub.",
      tag: "Core Feature",
      tagColor: "text-primary bg-primary/10 border-primary/20",
    },
    {
      icon: <IconReplay size={24} />,
      title: "Session Recording",
      description:
        "Every user action is silently captured — clicks with full element context, form inputs (passwords auto-redacted), navigation, selects, and form submissions. Sessions are capped at 200 events and stored in localStorage.",
      tag: "Recording",
      tagColor: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    },
    {
      icon: <IconConsole size={24} />,
      title: "Console & Network Monitoring",
      description:
        "Automatically intercepts console.error(), unhandled promise rejections, and all fetch/XHR requests. Failed API calls are flagged with status codes. Framework noise (Next.js, Vite, Webpack HMR) is filtered out automatically.",
      tag: "Monitoring",
      tagColor: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    },
    {
      icon: <IconScreenshot size={24} />,
      title: "Screenshot Capture",
      description:
        "Capture full-page screenshots using html2canvas with smart auto-naming based on event context. Annotate with rectangles, arrows, and text overlays using the built-in editor. Color picker, undo support, and session gallery included.",
      tag: "QA Tools",
      tagColor: "text-green-400 bg-green-500/10 border-green-500/20",
    },
    {
      icon: <IconVoice size={24} />,
      title: "Voice Bug Description",
      description:
        "QA testers describe bugs by speaking — no typing required. Uses the Web Speech API (completely free, no paid services). Auto-capitalizes, adds punctuation, converts spoken \"period\" and \"comma\". Works in Chrome, Edge, Brave, Opera.",
      tag: "Voice",
      tagColor: "text-pink-400 bg-pink-500/10 border-pink-500/20",
    },
    {
      icon: (
        <div className="flex gap-1">
          <IconGitHub size={20} />
          <IconJira size={20} />
        </div>
      ),
      title: "GitHub & Jira Integration",
      description:
        "One-click export to GitHub Issues or Jira tickets. TraceBug generates properly formatted markdown (GitHub) and Jira markup with steps, errors, network log, environment, and screenshots. Copy to clipboard instantly — zero account setup needed.",
      tag: "Export",
      tagColor: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      title: "User Identification & Bug Flagging",
      description:
        "Attribute bugs to specific users with TraceBug.setUser({ id, email, name }). Flag sessions as bugs with markAsBug() and get Slack-friendly 2-sentence summaries with getCompactReport(). All persisted in localStorage.",
      tag: "Workflow",
      tagColor: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
        </svg>
      ),
      title: "Clickable Annotation Badges",
      description:
        "Numbered badges on annotated elements are clickable — opens a popover showing intent, severity, and comment. The annotation list panel shows screenshots alongside annotations with inline previews and per-item download.",
      tag: "UX",
      tagColor: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    },
    {
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
      ),
      title: "Plugin & Hook System",
      description:
        "Extend TraceBug without forking. Plugins can filter events, enrich reports, and transform exports. Subscribe to lifecycle hooks (session:start, error:captured, screenshot:taken) for Slack/Discord webhooks, analytics, or custom integrations.",
      tag: "Extensibility",
      tagColor: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
    },
  ];

  return (
    <section id="features" className="py-24 bg-background relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-30" />
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Features
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-text-primary mb-4">
            Built to make debugging{" "}
            <span className="gradient-text">effortless</span>
          </h2>
          <p className="text-text-muted text-lg max-w-2xl mx-auto">
            Four pillars that eliminate the manual work between &ldquo;I found a bug&rdquo; and
            &ldquo;here&apos;s a fully-filled GitHub issue.&rdquo;
          </p>
        </div>

        {/* Core 4 pillars — the differentiators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
          {[
            {
              emoji: "\u26A1",
              title: "Instant Capture",
              desc: "Report a bug in 2 clicks with the Ctrl+Shift+B shortcut. No menus, no forms.",
              color: "text-yellow-400",
              bg: "bg-yellow-500/5",
              border: "border-yellow-500/30",
            },
            {
              emoji: "\uD83E\uDDE0",
              title: "Smart Debugging",
              desc: "Auto-detects errors, failed APIs, and the exact user action that preceded the bug.",
              color: "text-primary",
              bg: "bg-primary/5",
              border: "border-primary/30",
            },
            {
              emoji: "\uD83D\uDCCA",
              title: "Full Context",
              desc: "Console logs, network failures with response snippets, and session steps — all captured.",
              color: "text-cyan-400",
              bg: "bg-cyan-500/5",
              border: "border-cyan-500/30",
            },
            {
              emoji: "\uD83D\uDD17",
              title: "One-Click GitHub Issues",
              desc: "Open a fully-filled issue instantly — no copy-paste, no formatting.",
              color: "text-green-400",
              bg: "bg-green-500/5",
              border: "border-green-500/30",
            },
          ].map((pillar) => (
            <div
              key={pillar.title}
              className={`p-5 ${pillar.bg} border ${pillar.border} rounded-2xl hover:scale-[1.02] transition-all duration-200`}
            >
              <div className="text-3xl mb-3 leading-none">{pillar.emoji}</div>
              <div className={`text-base font-bold ${pillar.color} mb-2`}>
                {pillar.title}
              </div>
              <div className="text-text-muted text-sm leading-relaxed">
                {pillar.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-3 text-text-muted text-sm">
            <span className="h-px w-12 bg-border"></span>
            <span className="uppercase tracking-wider text-xs">Plus everything else</span>
            <span className="h-px w-12 bg-border"></span>
          </div>
        </div>

        {/* Feature grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group p-6 bg-surface border border-border rounded-2xl hover:border-primary/40 hover:shadow-glow-sm transition-all duration-200 cursor-default"
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 transition-colors duration-200">
                {feature.icon}
              </div>

              {/* Tag */}
              <div className="mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${feature.tagColor}`}>
                  {feature.tag}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-text-primary font-bold text-lg mb-3 group-hover:text-accent transition-colors duration-200">
                {feature.title}
              </h3>

              {/* Description */}
              <p className="text-text-muted text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom callout */}
        <div className="mt-16 p-8 bg-surface border border-border rounded-2xl text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-radial from-primary/5 via-transparent to-transparent" />
          <div className="relative">
            <h3 className="text-text-primary font-bold text-xl mb-3">
              Works with Any Frontend Framework
            </h3>
            <div className="flex flex-wrap justify-center gap-3 mb-6">
              {["React", "Next.js", "Vue", "Nuxt", "Angular", "Svelte", "Remix", "Astro", "Vite", "Plain HTML"].map((fw) => (
                <span key={fw} className="px-3 py-1.5 bg-background border border-border rounded-lg text-text-muted text-sm font-medium hover:border-primary/40 hover:text-text-primary transition-colors">
                  {fw}
                </span>
              ))}
            </div>
            <p className="text-text-muted text-sm max-w-xl mx-auto">
              2 lines of code. Zero runtime dependencies. Dual CJS/ESM output for universal compatibility.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
