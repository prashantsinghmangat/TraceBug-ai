import SectionHeading from "@/components/SectionHeading";
import Shortcut from "@/components/Keycap";

// The product in three steps, set as a ruled row rather than three cards.
const STEPS = [
  {
    label: "Capture",
    desc: (
      <>
        Press <Shortcut /> when a bug happens. Replay, console, network and a screenshot are
        already recorded.
      </>
    ),
  },
  {
    label: "Share",
    desc: "You get one self-contained report. Send it anywhere. No account, no upload, nothing to set up on the other end.",
  },
  {
    label: "Fix",
    desc: "A developer or an AI agent opens it offline, sees the evidence first and knows where to look.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="py-section">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          align="left"
          eyebrow="How it works"
          title="From bug to fix in three steps"
          subtitle="No forms, no back-and-forth, no “cannot reproduce”. The bug is captured once and handed off."
          className="mb-12"
        />

        <ol className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
          {STEPS.map(({ label, desc }, i) => (
            <li key={label} className="bg-background p-6 lg:p-8">
              <span className="font-mono text-[13px] text-text-subtle">0{i + 1}</span>
              <h3 className="mt-6 text-[18px] font-medium text-text-primary">{label}</h3>
              <p className="mt-2 text-[15px] leading-[1.6] text-text-muted">{desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
