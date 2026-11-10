"use client";

// Faded "traced paths" behind the hero text: four dashed routes at the edges,
// each with Trace (the pixel bug) walking it slowly. The bug leaving a trail is
// the product's name, drawn.
//
// Decorative only: aria-hidden, no pointer events. A radial mask keeps the
// middle clear so the headline and buttons stay easy to read. The server and
// first client render are static (bugs parked on their paths); motion starts
// after mount only when the visitor hasn't asked for reduced motion.

import { useEffect, useState } from "react";

const MASK = "[mask-image:radial-gradient(ellipse_58%_52%_at_50%_40%,rgba(0,0,0,0.1)_30%,black_75%)]";

// Each route, its walk time, and where the bug sits when it isn't moving
// (a point that lies on the curve).
const ROUTES = [
  { d: "M -20 150 C 120 80, 220 220, 380 140 S 560 70, 700 170", dur: 38, rest: [380, 140] },
  { d: "M 1480 120 C 1320 210, 1200 60, 1060 150 S 900 240, 760 180", dur: 44, rest: [1060, 150] },
  // the lower two stay between the logo row and the story card
  { d: "M -20 640 C 140 595, 260 690, 400 628", dur: 32, rest: [400, 628] },
  { d: "M 1480 650 C 1320 600, 1200 695, 1040 632", dur: 36, rest: [1040, 632] },
] as const;

// Trace, drawn at the origin and centred. Body in the accent; legs follow the
// text colour so they read on dark and light.
function Trace() {
  const c = "rgb(var(--cta))";
  return (
    <g transform="translate(-20,-15) scale(0.34)" shapeRendering="crispEdges">
      <rect x="30" y="0" width="10" height="10" fill={c} />
      <rect x="80" y="0" width="10" height="10" fill={c} />
      <rect x="40" y="20" width="40" height="10" fill={c} />
      <rect x="30" y="30" width="60" height="50" fill={c} />
      <rect x="10" y="40" width="20" height="10" fill="currentColor" />
      <rect x="90" y="40" width="20" height="10" fill="currentColor" />
      <rect x="10" y="60" width="20" height="10" fill="currentColor" />
      <rect x="90" y="60" width="20" height="10" fill="currentColor" />
    </g>
  );
}

export default function HeroBackdrop() {
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setMoving(!mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden text-text-subtle sm:h-[720px] ${MASK}`}
      aria-hidden="true"
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1440 700" preserveAspectRatio="xMidYMid slice" fill="none">
        {ROUTES.map((r, i) => (
          <g key={i}>
            <path
              id={`hb-route-${i}`}
              d={r.d}
              stroke="currentColor"
              strokeOpacity="0.28"
              strokeWidth="1.5"
              strokeDasharray="2 8"
              strokeLinecap="round"
            />
            <g opacity="0.6">
              {moving ? (
                <g>
                  <animateMotion dur={`${r.dur}s`} begin={`${i * -9}s`} repeatCount="indefinite" rotate="auto">
                    <mpath href={`#hb-route-${i}`} />
                  </animateMotion>
                  <Trace />
                </g>
              ) : (
                <g transform={`translate(${r.rest[0]},${r.rest[1]})`}>
                  <Trace />
                </g>
              )}
            </g>
          </g>
        ))}
      </svg>
    </div>
  );
}
