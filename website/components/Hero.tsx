import InstallButtons from "@/components/InstallButtons";
import { ArrowRight, TerminalSquare } from "lucide-react";
import { Logo, type LogoName } from "@/components/ui/logos";
import HeroStory from "@/components/HeroStory";
import ProductHuntBadge from "@/components/ProductHuntBadge";
import HeroBackdrop from "@/components/HeroBackdrop";


// One button shape for the whole action row; only the fill changes.
const BTN =
  "inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-5 text-[15px] font-medium transition-[background-color,transform] duration-150 active:scale-[0.98]";
const SECONDARY = "border border-border-strong bg-background text-text-primary hover:bg-surface";

const BROWSERS: [LogoName, string][] = [
  ["chrome", "Chrome"],
  ["firefox", "Firefox"],
  ["edge", "Edge"],
  ["brave", "Brave"],
];
const AGENTS: [LogoName, string][] = [
  ["claude", "Claude Code"],
  ["cursor", "Cursor"],
  ["windsurf", "Windsurf"],
  ["vscode", "VS Code"],
];

function LogoGroup({ label, items }: { label: string; items: [LogoName, string][] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <span className="text-text-subtle">{label}</span>
      {items.map(([name, text]) => (
        <span key={name} className="inline-flex items-center gap-1.5 text-text-primary">
          <Logo name={name} size={16} />
          {text}
        </span>
      ))}
    </div>
  );
}

// Trace, the pixel bug, for the headline chip. Body in the accent; the ink
// cells follow the text colour.
function TraceIcon() {
  const c = "rgb(var(--cta))";
  return (
    <svg viewBox="0 0 120 90" className="block h-[0.45em] w-[0.6em]" shapeRendering="crispEdges">
      <g fill={c}>
        <rect x="30" y="0" width="10" height="10" />
        <rect x="80" y="0" width="10" height="10" />
        <rect x="40" y="20" width="40" height="10" />
        <rect x="30" y="30" width="60" height="50" />
        <rect x="50" y="80" width="20" height="10" />
      </g>
      <g fill="currentColor">
        <rect x="40" y="10" width="10" height="10" />
        <rect x="70" y="10" width="10" height="10" />
        <rect x="40" y="40" width="10" height="20" />
        <rect x="70" y="40" width="10" height="20" />
        <rect x="10" y="40" width="20" height="10" />
        <rect x="90" y="40" width="20" height="10" />
        <rect x="10" y="60" width="20" height="10" />
        <rect x="90" y="60" width="20" height="10" />
      </g>
    </svg>
  );
}

// Hero, one centered column so the eye has a single path: the question → one
// line of answer → one row of actions (install in Chrome or Firefox | MCP
// setup, Product Hunt) → the trust line. Below it the story plays once: a bug
// eats the checkout page, Page catches it, Claude fixes it (HeroStory).
// Phones get a shorter hero so the story starts on the first screen: only
// Chrome, Firefox, the trust line and the demo link. MCP setup is in the nav
// ("AI agents") and the MCP section; Product Hunt is in the footer.
export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-24 pb-section sm:pt-28 lg:pt-32">
      <HeroBackdrop />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <h1
            className="rise text-display font-medium text-text-primary"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            Capture the{" "}
            <span className="bug-chip">
              <span className="bug-chip-tile" aria-hidden="true">
                <TraceIcon />
              </span>
              bug
            </span>
            .
            <br />
            <span className="text-text-subtle">Let AI fix it.</span>
          </h1>

          <p
            className="rise mt-5 max-w-2xl text-lead text-text-muted sm:mt-6"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            Your AI can read your code. Can it see your bug? Click Capture Bug, reproduce it, and
            TraceBug saves the clicks, console errors and failed requests in one offline report Claude
            Code, Cursor or Windsurf can debug.
          </p>

          <div
            className="rise mt-7 grid w-full grid-cols-2 gap-3 sm:mt-9 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            <InstallButtons itemClassName="col-span-2" />

            {/* desktop only: on phones these push the story off the first screen */}
            <div className="hidden sm:contents">
              <span className="mx-1 hidden h-8 w-px bg-border-strong lg:block" aria-hidden="true" />

              <a href="#mcp" className={`${BTN} ${SECONDARY}`}>
                <TerminalSquare size={16} strokeWidth={1.5} />
                MCP setup
              </a>

              <ProductHuntBadge />
            </div>
          </div>

          <div
            className="rise mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-text-subtle"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <span>No account</span>
            <span aria-hidden="true">·</span>
            <span>Works offline</span>
            <span aria-hidden="true">·</span>
            <span>Zero telemetry</span>
            <span aria-hidden="true">·</span>
            <span>Open source, MIT</span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <a href="#demo" className="group inline-flex basis-full items-center justify-center gap-1 font-medium text-text-primary sm:basis-auto">
              Watch the 57-second demo
              <ArrowRight size={14} strokeWidth={1.5} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </a>
          </div>

          {/* works-with strip: the browsers it installs in, the agents it hands off to */}
          <div
            className="rise mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:mt-10 text-[13px] text-text-muted"
            style={{ "--i": 5 } as React.CSSProperties}
          >
            <LogoGroup label="Works in" items={BROWSERS} />
            <span className="hidden h-5 w-px bg-border-strong md:block" aria-hidden="true" />
            <div className="hidden sm:block">
              <LogoGroup label="Hands off to" items={AGENTS} />
            </div>
          </div>
        </div>

        <div className="rise mt-10 sm:mt-16 lg:mt-20" style={{ "--i": 5 } as React.CSSProperties}>
          <HeroStory />
        </div>
      </div>
    </section>
  );
}
