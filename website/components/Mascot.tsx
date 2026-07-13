// "Trace" — the TraceBug mascot, pixel-sprite edition. An 8-bit bug on a
// 22×22 grid in the brand indigo: retro dev-culture wink (the invaders you
// actually catch), and crisp at every size because it IS pixels. Eyes blink
// and the antenna tips blip; both disabled under prefers-reduced-motion
// (globals.css). crispEdges keeps the rects razor-sharp when scaled.
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
  const blipCls = animated ? "mascot-blip" : "";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label="Trace, the TraceBug mascot"
    >
      {/* antenna stalks + blinking tips */}
      <g fill="#4F46E5">
        <rect x="8" y="4" width="2" height="2" />
        <rect x="12" y="4" width="2" height="2" />
      </g>
      <g fill="#818CF8" className={blipCls}>
        <rect x="6" y="2" width="2" height="2" />
        <rect x="14" y="2" width="2" height="2" />
      </g>

      {/* head cap + body + tail segment */}
      <g fill="#6366F1">
        <rect x="8" y="6" width="6" height="2" />
        <rect x="6" y="8" width="10" height="6" />
        <rect x="8" y="14" width="6" height="2" />
      </g>
      {/* left-edge highlight — fake pixel lighting */}
      <rect x="6" y="8" width="2" height="6" fill="#818CF8" />

      {/* eyes — blink via scaleY keyframe */}
      <g fill="#16163E">
        <rect className={eyeCls} x="9" y="9" width="1.6" height="3" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
        <rect className={eyeCls} x="12" y="9" width="1.6" height="3" style={{ transformBox: "fill-box", transformOrigin: "center" }} />
      </g>

      {/* legs */}
      <g fill="#4F46E5">
        <rect x="2" y="9" width="3" height="2" />
        <rect x="17" y="9" width="3" height="2" />
        <rect x="3" y="13" width="3" height="2" />
        <rect x="16" y="13" width="3" height="2" />
      </g>

      {/* glow tail pixel */}
      <rect className={blipCls} x="10" y="17" width="2" height="2" fill="#818CF8" />
    </svg>
  );
}
