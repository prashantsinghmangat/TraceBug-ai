// TraceBug's character: Page (the exported .html report) holding up Trace
// (the pixel bug it caught). Flat, two brand colours plus ink — no gradients.
//
// - variant="full": arms, legs and evidence lines. For illustrations (hero,
//   404, feedback, proof). Strokes are tuned for ~96px and up.
// - variant="mark": the compact logo cut — no legs or left arm, heavier
//   strokes so it holds up at 16–32px.
//   (The logo and favicons are the prompt icon now: components/Logo.tsx.)
//
// The white page fill keeps the silhouette readable on dark backgrounds,
// where the ink outline disappears.

const INK = "#11131A";
const CORAL = "#FF5C6C"; // Trace, the pixel bug (theme accent, coral)
const RED = "#E5484D";
const GREY = "#D0D4DC";
const GREEN = "#16A34A";

// Arm paths and where Trace sits, per pose (160×160 viewBox).
const POSES = {
  hello: { armL: "M49 72 L32 86", armR: "M111 68 L124 54", trace: "translate(110,24) scale(0.3)" },
  investigate: { armL: "M49 72 L32 86", armR: "M111 72 L138 70", trace: "translate(62,4) scale(0.3)" },
  fixed: { armL: "M49 60 L32 40", armR: "M111 60 L126 38", trace: "translate(112,8) scale(0.3)" },
} as const;

// Trace on a 10px grid (12×10 cells), drawn at the origin.
function Trace({ transform }: { transform: string }) {
  return (
    <g transform={transform} shapeRendering="crispEdges">
      <rect x="30" y="0" width="10" height="10" fill={CORAL} />
      <rect x="80" y="0" width="10" height="10" fill={CORAL} />
      <rect x="40" y="10" width="10" height="10" fill={INK} />
      <rect x="70" y="10" width="10" height="10" fill={INK} />
      <rect x="40" y="20" width="40" height="10" fill={CORAL} />
      <rect x="30" y="30" width="60" height="50" fill={CORAL} />
      <rect x="40" y="40" width="10" height="20" fill={INK} />
      <rect x="70" y="40" width="10" height="20" fill={INK} />
      <rect x="10" y="40" width="20" height="10" fill={INK} />
      <rect x="90" y="40" width="20" height="10" fill={INK} />
      <rect x="10" y="60" width="20" height="10" fill={INK} />
      <rect x="90" y="60" width="20" height="10" fill={INK} />
      <rect x="50" y="80" width="20" height="10" fill={CORAL} />
    </g>
  );
}

export default function PageMascot({
  size = 160,
  variant = "full",
  className = "",
  title,
  motion = "none",
  pose = "hello",
}: {
  size?: number;
  variant?: "full" | "mark";
  className?: string;
  /** Full variant only. "wave": Trace held up and wiggling. "walk": legs and
   *  arms swing in a stride. Motion is off under prefers-reduced-motion. */
  motion?: "none" | "wave" | "walk";
  /** Full variant only. "hello": holds Trace up (default, the hero).
   *  "investigate": Trace on its head, pointing right at the evidence.
   *  "fixed": both arms up, the red line has turned green. */
  pose?: "hello" | "investigate" | "fixed";
  /** Accessible name. Omit for decorative use (aria-hidden). */
  title?: string;
}) {
  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const);

  if (variant === "mark") {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`flex-shrink-0 ${className}`}
        {...a11y}
      >
        {/* raised arm */}
        <path d="M72 64 L94 46" stroke={INK} strokeWidth="8" strokeLinecap="round" />
        {/* page */}
        <path d="M8 22 H50 L72 44 V114 H8 Z" fill="#FFFFFF" stroke={INK} strokeWidth="8" strokeLinejoin="round" />
        <path d="M50 22 V44 H72" stroke={INK} strokeWidth="8" strokeLinejoin="round" />
        <circle cx="28" cy="60" r="6" fill={INK} />
        <circle cx="52" cy="60" r="6" fill={INK} />
        <rect x="22" y="80" width="36" height="9" rx="4.5" fill={RED} />
        <rect x="22" y="95" width="24" height="9" rx="4.5" fill={CORAL} />
        {/* Trace, held up */}
        <Trace transform="translate(70,2) scale(0.42)" />
      </svg>
    );
  }

  const m = motion === "none" ? "" : `pm-${motion}`;
  const P = POSES[pose];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`pm ${m} ${className}`}
      {...a11y}
    >
      {/* legs + feet, each pivoting at its hip */}
      <g className="pm-leg-l" stroke={INK} strokeLinecap="round">
        <path d="M64 112 L62 138" strokeWidth="4" />
        <line x1="54" y1="140" x2="64" y2="140" strokeWidth="6" />
      </g>
      <g className="pm-leg-r" stroke={INK} strokeLinecap="round">
        <path d="M96 112 L98 138" strokeWidth="4" />
        <line x1="96" y1="140" x2="106" y2="140" strokeWidth="6" />
      </g>
      <g className="pm-bob">
        {/* left arm, pivoting at the shoulder */}
        <path className="pm-arm-l" d={P.armL} stroke={INK} strokeWidth="4" strokeLinecap="round" />
        {/* page */}
        <g transform="translate(47,30)">
          <path d="M2 2 H46 L64 20 V82 H2 Z" fill="#FFFFFF" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M46 2 V20 H64" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          {pose === "fixed" ? (
            <g stroke={INK} strokeWidth="3" strokeLinecap="round">
              <path d="M18 35 Q22 30 26 35" />
              <path d="M38 35 Q42 30 46 35" />
            </g>
          ) : (
            <>
              <circle cx="22" cy="34" r="3.5" fill={INK} />
              <circle cx="42" cy="34" r="3.5" fill={INK} />
            </>
          )}
          <rect x="14" y="48" width="30" height="5" rx="2.5" fill={pose === "fixed" ? GREEN : RED} />
          <rect x="14" y="58" width="36" height="5" rx="2.5" fill={GREY} />
          <rect x="14" y="68" width="24" height="5" rx="2.5" fill={CORAL} />
        </g>
        {/* right arm holding Trace up; arm and bug move together */}
        <g className="pm-hold">
          <path d={P.armR} stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <g className="pm-trace">
            <Trace transform={P.trace} />
          </g>
        </g>
      </g>
    </svg>
  );
}
