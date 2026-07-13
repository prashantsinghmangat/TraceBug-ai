import SectionHeading from "@/components/SectionHeading";
import {
  Zap, Video, ScanLine, Camera, Mic, GitBranch, Users, Puzzle, ShieldCheck, ArrowRight,
} from "lucide-react";

// Bento covering the full feature surface. Each cell has a distinct job — no
// restated value props (that's the "feels AI" tell). Two hero cells span wide.
const FEATURES = [
  {
    Icon: Zap, title: "Instant capture", span: "lg:col-span-2",
    desc: "Report a bug in 2 clicks with Ctrl+Shift+B. No menus, no forms — the modal opens pre-filled with title, summary, and a root-cause hint.",
    chip: "Core",
  },
  {
    Icon: Video, title: "Sentry Mode — rolling video buffer",
    desc: "Hit Record once, file as many tickets as you want from one screen-share. Timestamped comments, auto-capture on error.",
    chip: "Recording",
  },
  {
    Icon: ScanLine, title: "Auto-Scanner",
    desc: "Six in-browser detectors: a11y (axe-core), broken images, mixed content, JS errors, failed APIs, slow APIs — each with Locate + File ticket.",
    chip: "QA",
  },
  {
    Icon: Camera, title: "Screenshots & annotation",
    desc: "Full-page or drag-region capture via html2canvas. Annotate with rectangles, arrows, and text. Clickable numbered badges.",
    chip: "Visual",
  },
  {
    Icon: Mic, title: "Voice bug descriptions",
    desc: "Describe the bug out loud — Web Speech API transcribes it, no typing, no API keys. Auto-saved to the report.",
    chip: "Voice",
  },
  {
    Icon: GitBranch, title: "One-click GitHub & Jira", span: "lg:col-span-2",
    desc: "Export a fully-formatted GitHub Issue or Jira ticket — steps, console errors, network log, environment, and screenshots. Screenshots and the .webm auto-download as you paste.",
    chip: "Export",
  },
  {
    Icon: Users, title: "User ID & bug flagging",
    desc: "Attribute bugs with setUser(), flag sessions with markAsBug(), get a Slack-ready 2-sentence summary with getCompactReport().",
    chip: "Workflow",
  },
  {
    Icon: Puzzle, title: "Plugins & hooks",
    desc: "Extend without forking — filter events, enrich reports, fire webhooks. Subscribe to session:start, error:captured, screenshot:taken.",
    chip: "Extensible",
  },
  {
    Icon: ShieldCheck, title: "Local-first & private",
    desc: "Sensitive fields auto-redacted. Data stays in localStorage — zero backend, no tracking, nothing leaves your machine.",
    chip: "Privacy",
  },
];

export default function Features() {
  return (
    <section id="features" className="py-20 lg:py-28 bg-surface/50 border-y border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Capture is just the start"
          subtitle="Everything between “I found a bug” and “here's a fully-filled GitHub issue” — automated."
          className="mb-14"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ Icon, title, desc, chip, span }) => (
            <div
              key={title}
              className={`spotlight group card-rise rounded-2xl border border-border bg-background p-6 hover:border-primary/30 hover:shadow-card-hover ${span ?? ""}`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                  <Icon size={20} />
                </div>
                <span className="text-[10.5px] font-medium uppercase tracking-wider text-text-subtle bg-surface-2 rounded-full px-2.5 py-1">
                  {chip}
                </span>
              </div>
              <h3 className="text-[16px] font-semibold text-text-primary mb-1.5">{title}</h3>
              <p className="text-[13.5px] text-text-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-center">
          <a
            href="/docs"
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-primary hover:gap-2.5 transition-all"
          >
            See the full API reference <ArrowRight size={15} />
          </a>
        </div>
      </div>
    </section>
  );
}
