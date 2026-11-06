import { LINKS } from "@/lib/site";
import { TerminalSquare } from "lucide-react";
import { Logo } from "@/components/ui/logos";
import Shortcut from "@/components/Keycap";
import PageMascot from "@/components/PageMascot";


// Same button shape as the hero's action row.
const BTN =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-5 text-[15px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]";
const PRIMARY = "bg-text-primary text-background hover:bg-text-primary/85";
const SECONDARY = "border border-border-strong bg-background text-text-primary hover:bg-surface";

// Closing call to action: the character celebrating the fix beside the promise,
// then every way in — Chrome, Firefox, MCP for AI agents, the npm SDK.
// Carries the #install anchor (footer, pricing link here).
export default function FinalCTA() {
  return (
    <section id="install" className="border-t border-border py-section">
      <div className="mx-auto flex max-w-6xl items-center gap-12 px-4 sm:px-6 lg:px-8">
        <PageMascot size={200} pose="fixed" className="hidden shrink-0 md:block" />
        <div className="min-w-0">
          <h2 className="max-w-3xl text-h2 font-medium text-text-primary">
            The next bug is one <Shortcut className="text-[0.62em] align-middle" /> away from fixed
          </h2>
          <p className="mt-4 max-w-xl text-lead text-text-muted">
            Free, no account. Works with any front-end framework. Your data stays on your machine.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center">
            <a href={LINKS.chrome} target="_blank" rel="noopener noreferrer" className={`${BTN} ${PRIMARY}`}>
              <Logo name="chrome" size={18} />
              Add to Chrome, free
            </a>
            <a href={LINKS.firefox} target="_blank" rel="noopener noreferrer" className={`${BTN} ${SECONDARY}`}>
              <Logo name="firefox" size={18} />
              Add to Firefox
            </a>
            <a href="#mcp" className={`${BTN} ${SECONDARY}`}>
              <TerminalSquare size={16} strokeWidth={1.5} />
              MCP setup
            </a>
            <a href="/docs" className={`${BTN} ${SECONDARY} font-mono text-[14px] font-normal`}>
              npm i tracebug-sdk
            </a>
          </div>
          <p className="mt-5 text-[13px] text-text-subtle">
            Edge, Brave and Opera install from the Chrome Web Store.
          </p>
        </div>
      </div>
    </section>
  );
}
