import { Suspense } from "react";
import type { Metadata } from "next";
import ByeForm from "./ByeForm";

export const metadata: Metadata = {
  title: "TraceBug is uninstalled",
  description: "Sorry it didn't work out. One optional question helps us fix what went wrong.",
  // Nobody should arrive here from search. It is only ever opened by the
  // browser, once, at the moment the extension is removed.
  robots: { index: false, follow: false },
};

/**
 * The page chrome.runtime.setUninstallURL points at (background.js).
 *
 * Deliberately bare: no Navbar, no Footer, no newsletter, no pricing. Someone
 * who has just uninstalled is not a lead to re-market to, and a page that
 * tries reads as a reason not to come back. One card, one optional question,
 * a Skip that is as prominent as Send.
 *
 * The only thing the URL carries is `?v=<version>` — no id, no install date.
 * The fine print says so, because a privacy claim nobody can see is not one.
 */
export default function ByePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-[560px]">
        <Suspense fallback={null}>
          <ByeForm />
        </Suspense>
      </div>
    </main>
  );
}
