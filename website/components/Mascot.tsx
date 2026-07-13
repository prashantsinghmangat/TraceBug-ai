// "Trace" — the TraceBug mascot. A minimal geometric bug in the brand indigo,
// friendly but restrained (no cartoon gradient soup): slate-navy head, indigo
// wing shell, blinking eyes and gently waving antennae. All motion is
// CSS-keyframe based and disabled under prefers-reduced-motion (globals.css).
export default function Mascot({
  size = 120,
  className = "",
  animated = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
}) {
  const eyeCls = animated ? "mascot-eye" : "";
  const antennaCls = animated ? "mascot-antenna" : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Trace, the TraceBug mascot"
    >
      <defs>
        <linearGradient id="mascot-shell" x1="36" y1="44" x2="84" y2="102" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="60" cy="112" rx="24" ry="4" fill="currentColor" opacity="0.08" />

      {/* antennae — waving as a pair, pivoting from the head */}
      <g className={antennaCls} style={{ transformBox: "fill-box", transformOrigin: "50% 100%" }}>
        <path d="M50 24 Q45 12 36 9" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />
        <path d="M70 24 Q75 12 84 9" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />
        <circle cx="36" cy="9" r="4" fill="#818CF8" />
        <circle cx="84" cy="9" r="4" fill="#818CF8" />
      </g>

      {/* legs — three per side (indigo so they read on light AND dark cards) */}
      <g stroke="#4F46E5" strokeWidth="5" strokeLinecap="round">
        <path d="M36 62 H27" />
        <path d="M35 76 H25" />
        <path d="M36 90 H27" />
        <path d="M84 62 H93" />
        <path d="M85 76 H95" />
        <path d="M84 90 H93" />
      </g>

      {/* wing shell */}
      <rect x="34" y="42" width="52" height="64" rx="26" fill="url(#mascot-shell)" />
      {/* wing seam + spots — the "replay cursor" motif from the logo */}
      <path d="M60 46 V102" stroke="white" strokeOpacity="0.32" strokeWidth="2.5" />
      <rect x="42" y="60" width="9" height="9" rx="2.5" fill="white" fillOpacity="0.28" />
      <rect x="69" y="74" width="9" height="9" rx="2.5" fill="white" fillOpacity="0.28" />

      {/* head — indigo ring keeps it visible against dark-mode surfaces */}
      <circle cx="60" cy="32" r="17" fill="#16163E" stroke="#818CF8" strokeOpacity="0.45" strokeWidth="1.5" />
      {/* eyes — blink via scaleY keyframe */}
      <g fill="#FAFAFA">
        <rect className={eyeCls} x="51" y="27" width="5" height="9" rx="2.5" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        <rect className={eyeCls} x="64" y="27" width="5" height="9" rx="2.5" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      </g>
      {/* smile */}
      <path d="M55 41 Q60 44.5 65 41" stroke="#FAFAFA" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
