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
          heading="Want the next features first?"
          sub="Design Tokens and Visual Comparison are coming. Early access and new releases, nothing else. TraceBug keeps working fully either way."
        />
      </div>
    </section>
  );
}
