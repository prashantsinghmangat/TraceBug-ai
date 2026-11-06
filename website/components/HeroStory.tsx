"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import PageMascot from "@/components/PageMascot";

// The hero's story (~10s), ending on a clean "Fixed" frame, then after a 1s
// pause it plays again:
//   a checkout page works → three bugs crawl in and bite the title, the order
//   total and "Place order" → a 500 appears → Alt B → Page walks in → the
//   capture (viewfinder snaps, flash, the screenshot flies into Page) → Page
//   catches the bugs (one in hand, two into the report) → Claude Code reads
//   the report over MCP (right panel) → the page heals.
// Pure CSS keyframes (`.hs-*` in globals.css); each pass remounts the stage.
// The next pass only starts while the stage is on screen and the tab is
// visible. Reduced motion: the finished frame, no loop. It is an
// illustration, and says so.

const STORY_MS = 10000; // keep in step with the 10s animations in globals.css
const PAUSE_MS = 1000;

// Trace on its 12×10 grid (same drawing as PageMascot), as the loose bug.
function Bug() {
  return (
    <g shapeRendering="crispEdges">
      <rect x="30" y="0" width="10" height="10" fill="#6366F1" />
      <rect x="80" y="0" width="10" height="10" fill="#6366F1" />
      <rect x="40" y="10" width="10" height="10" fill="#11131A" />
      <rect x="70" y="10" width="10" height="10" fill="#11131A" />
      <rect x="40" y="20" width="40" height="10" fill="#6366F1" />
      <rect x="30" y="30" width="60" height="50" fill="#6366F1" />
      <rect x="40" y="40" width="10" height="20" fill="#11131A" />
      <rect x="70" y="40" width="10" height="20" fill="#11131A" />
      <rect x="10" y="40" width="20" height="10" fill="#11131A" />
      <rect x="90" y="40" width="20" height="10" fill="#11131A" />
      <rect x="10" y="60" width="20" height="10" fill="#11131A" />
      <rect x="90" y="60" width="20" height="10" fill="#11131A" />
      <rect x="50" y="80" width="20" height="10" fill="#6366F1" />
    </g>
  );
}

const AGENT_LINES: { cls: string; cmd?: string; out: string; tone?: "err" | "ok" | "add" | "del" }[] = [
  { cls: "hs-l1", cmd: "get_bug_report", out: "checkout-500.html" },
  { cls: "hs-l2", cmd: "get_console_errors", out: "TypeError at src/checkout.ts:42", tone: "err" },
  { cls: "hs-l3", cmd: "get_network_activity", out: "POST /api/orders → 500, empty body", tone: "err" },
  { cls: "hs-l4", out: "Root cause: status read before res.ok", tone: "ok" },
  { cls: "hs-l5", out: "- const status = res.body.status", tone: "del" },
  { cls: "hs-l6", out: "+ if (!res.ok) throw new OrderError(res)", tone: "add" },
];

const TONE: Record<string, string> = {
  err: "text-[#F2A1A4]",
  ok: "text-[#EEF0F5]",
  add: "text-[#8EDBB5]",
  del: "text-[#F2A1A4]",
};

export default function HeroStory() {
  const [run, setRun] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useRef(true);

  // Track whether the stage is on screen.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => { inView.current = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Loop: after each pass plus the pause, start again (if anyone can see it).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (inView.current && !document.hidden) setRun((n) => n + 1);
      else timer = setTimeout(next, 500); // hold the final frame until it is visible again
    };
    timer = setTimeout(next, STORY_MS + PAUSE_MS);
    return () => clearTimeout(timer);
  }, [run]);

  return (
    <div className="relative" ref={stageRef}>
      <div
        key={run}
        className="hs grid overflow-hidden rounded-2xl border border-border bg-background shadow-float lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]"
      >
        {/* the browser, where the bug happens */}
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex h-11 items-center gap-3 border-b border-border bg-surface px-4">
            <div className="flex gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            </div>
            <span className="truncate font-mono text-[12px] text-text-subtle">shop.example.com/checkout</span>
          </div>

          <svg
            viewBox="0 0 640 380"
            className="block h-auto w-full bg-white"
            role="img"
            aria-label="Three bugs crawl onto a checkout page and bite the title, the order total and the Place order button, causing a 500 error. After Alt B, Page walks in, a screenshot is captured, Page catches the bugs, Claude Code reads the report, and the page is fixed."
          >
            {/* the page */}
            <text x="40" y="60" fontSize="24" fontWeight="500" fill="#11131A">Checkout</text>
            <rect x="40" y="84" width="330" height="150" rx="12" fill="#F4F5F8" />
            <g fontSize="15" fill="#4B5565">
              <text x="62" y="120">Mechanical keyboard</text>
              <text x="348" y="120" textAnchor="end" fill="#11131A">$129.00</text>
              <text x="62" y="154">Coupon</text>
              <text x="348" y="154" textAnchor="end" fontFamily="ui-monospace, monospace" fontSize="14">SPRING25</text>
              <line x1="62" y1="174" x2="348" y2="174" stroke="#E2E4EA" />
              <text x="62" y="208" fill="#11131A" fontWeight="500">Total</text>
              <text x="348" y="208" textAnchor="end" fill="#11131A" fontWeight="500">$103.20</text>
            </g>
            <rect x="40" y="262" width="200" height="52" rx="10" fill="#11131A" />
            <text x="140" y="294" textAnchor="middle" fontSize="16" fontWeight="500" fill="#FFFFFF">Place order</text>

            {/* bite marks, one set per bug: title, order card, button */}
            <g className="hs-bite3" fill="#FFFFFF">
              <circle cx="156" cy="42" r="9" />
              <circle cx="161" cy="60" r="8" />
            </g>
            <g className="hs-bite2" fill="#FFFFFF">
              <circle cx="371" cy="196" r="12" />
              <circle cx="372" cy="222" r="11" />
            </g>
            <g className="hs-bite" fill="#FFFFFF">
              <circle cx="238" cy="272" r="12" />
              <circle cx="241" cy="298" r="12" />
              <circle cx="222" cy="316" r="10" />
            </g>

            {/* the 500 */}
            <g className="hs-err">
              <rect x="392" y="40" width="216" height="44" rx="8" fill="#FDECEC" stroke="#E5484D" />
              <text x="500" y="67" textAnchor="middle" fontSize="14" fontFamily="ui-monospace, monospace" fill="#C62F35">
                POST /api/orders 500
              </text>
            </g>

            {/* Alt B */}
            <g className="hs-key" fontFamily="ui-monospace, monospace" fontSize="14" fill="#11131A">
              <rect x="470" y="140" width="46" height="30" rx="6" fill="#FFFFFF" stroke="#D0D4DC" strokeWidth="1.5" />
              <text x="493" y="160" textAnchor="middle">Alt</text>
              <rect x="522" y="140" width="30" height="30" rx="6" fill="#FFFFFF" stroke="#D0D4DC" strokeWidth="1.5" />
              <text x="537" y="160" textAnchor="middle">B</text>
            </g>

            {/* Page walks in; its own held Trace appears once it has caught the bug */}
            <g transform="translate(440,196)">
              <g className="hs-page">
                <PageMascot size={160} />
              </g>
            </g>

            {/* the three loose bugs */}
            <g className="hs-bug hs-bug1"><g transform="scale(0.4)"><Bug /></g></g>
            <g className="hs-bug hs-bug2"><g transform="scale(0.4)"><Bug /></g></g>
            <g className="hs-bug hs-bug3"><g transform="scale(0.4)"><Bug /></g></g>

            {/* the capture: a viewfinder snaps around the page, a flash, and the
                screenshot flies into Page (the report) */}
            <g className="hs-frame" fill="none" stroke="#6366F1" strokeWidth="5" strokeLinecap="round">
              <path d="M10 40 V10 H40" />
              <path d="M600 10 H630 V40" />
              <path d="M10 340 V370 H40" />
              <path d="M600 370 H630 V340" />
            </g>
            <rect className="hs-flash" x="0" y="0" width="640" height="380" fill="#FFFFFF" />
            <g className="hs-shot">
              <rect x="0" y="0" width="200" height="120" rx="8" fill="#FFFFFF" stroke="#11131A" strokeWidth="2" />
              <rect x="12" y="12" width="60" height="8" rx="2" fill="#11131A" />
              <rect x="12" y="28" width="104" height="48" rx="4" fill="#F4F5F8" />
              <rect x="12" y="86" width="62" height="18" rx="4" fill="#11131A" />
              <circle cx="74" cy="90" r="5" fill="#FFFFFF" />
              <rect x="126" y="12" width="62" height="14" rx="3" fill="#FDECEC" stroke="#E5484D" />
            </g>

            {/* fixed */}
            <g className="hs-ok">
              <circle cx="268" cy="288" r="14" fill="#16A34A" />
              <path d="M261 288 L266 293 L275 283" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <text x="292" y="294" fontSize="16" fontWeight="500" fill="#16A34A">Fixed</text>
            </g>
          </svg>
        </div>

        {/* the agent, reading the report */}
        <div className="flex min-w-0 flex-col bg-[#0E1017] font-mono text-[12px] leading-6 sm:text-[13px]">
          <div className="flex h-11 items-center justify-between border-b border-white/[0.08] px-5">
            <span className="text-[#EEF0F5]">Claude Code</span>
            <span className="text-[#7A8296]">via MCP</span>
          </div>
          <div className="relative flex-1 space-y-3 px-5 py-4">
            <div className="hs-wait absolute left-5 top-4 text-[#7A8296]">Waiting for a bug report…</div>
            {AGENT_LINES.map((l, i) => (
              <div key={i} className={`hs-line ${l.cls}`}>
                {l.cmd && (
                  <div className="text-[#A3A9B8]">
                    <span className="text-[#8184F8]">›</span> {l.cmd}
                  </div>
                )}
                <div className={l.tone ? TONE[l.tone] : "text-[#A3A9B8]"}>
                  {l.tone === "ok" && <span className="text-[#4CC38A]">✓ </span>}
                  {l.out}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-4">
        <p className="font-mono text-[12px] text-text-subtle">Illustration of a capture and an agent reading it over MCP</p>
        <button
          type="button"
          onClick={() => setRun((r) => r + 1)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
        >
          <RotateCcw size={14} strokeWidth={1.5} />
          Replay
        </button>
      </div>
    </div>
  );
}
