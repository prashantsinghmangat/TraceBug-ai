import EmailCapture from "@/components/EmailCapture";

// Carries the #updates anchor: the fallback link when a signup from the
// extension popup or the SDK's 5th-ticket card can't reach the API
// (popup.js initEmailAsk, src/ui/milestone-ask.ts). Same promise as those cards.
export default function UpdatesSignup() {
  return (
    <section id="updates" className="border-t border-border py-section">
      <div className="mx-auto max-w-xl px-4 sm:px-6 lg:px-8">
        <EmailCapture
          source="home"
          heading="Want a say in what TraceBug does next?"
          sub="One email a month: what shipped, and sometimes one question about what slows you down. Reply and it shapes the next release. TraceBug keeps working fully either way."
        />
      </div>
    </section>
  );
}
