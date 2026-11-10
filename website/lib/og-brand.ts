// Brand art for the share images (app/api/og/**). SVGs are embedded as data
// URIs, the reliable way to draw custom marks inside Satori/next-og.
// Geometry mirrors components/PageMascot.tsx — keep them in step.

export const INK = '#11131A'
export const CORAL = '#FF5C6C'
// Limbs and Trace's ink pixels on the dark (midnight) card, where ink vanishes.
export const LIMB = '#A8AEBE'

const TRACE = (t: string, ink: string = INK) =>
  `<g transform='${t}' shape-rendering='crispEdges'>` +
  `<rect x='30' y='0' width='10' height='10' fill='${CORAL}'/><rect x='80' y='0' width='10' height='10' fill='${CORAL}'/>` +
  `<rect x='40' y='10' width='10' height='10' fill='${ink}'/><rect x='70' y='10' width='10' height='10' fill='${ink}'/>` +
  `<rect x='40' y='20' width='40' height='10' fill='${CORAL}'/><rect x='30' y='30' width='60' height='50' fill='${CORAL}'/>` +
  `<rect x='40' y='40' width='10' height='20' fill='${ink}'/><rect x='70' y='40' width='10' height='20' fill='${ink}'/>` +
  `<rect x='10' y='40' width='20' height='10' fill='${ink}'/><rect x='90' y='40' width='20' height='10' fill='${ink}'/>` +
  `<rect x='10' y='60' width='20' height='10' fill='${ink}'/><rect x='90' y='60' width='20' height='10' fill='${ink}'/>` +
  `<rect x='50' y='80' width='20' height='10' fill='${CORAL}'/></g>`

// Logo mark: the coral prompt icon (components/Logo.tsx).
export const MARK_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96' fill='none'>` +
  `<rect x='3' y='3' width='90' height='90' rx='22' fill='#0B0D14' stroke='#252A38' stroke-width='1.5'/>` +
  `<path d='M30 33 L47 48 L30 63' stroke='#EEF0F5' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>` +
  `<rect x='52' y='41' width='14' height='14' rx='4' fill='${CORAL}'/>` +
  `</svg>`

// Full character, hello pose (PageMascot variant="full"), limbs lightened for the dark card.
export const MASCOT_SVG =
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160' fill='none'>` +
  `<g stroke='${LIMB}' stroke-width='4' stroke-linecap='round'><path d='M64 112 L62 138'/><path d='M96 112 L98 138'/><path d='M49 72 L32 86'/><path d='M111 68 L124 54'/></g>` +
  `<g stroke='${LIMB}' stroke-width='6' stroke-linecap='round'><line x1='54' y1='140' x2='64' y2='140'/><line x1='96' y1='140' x2='106' y2='140'/></g>` +
  `<path d='M49 32 H93 L111 50 V112 H49 Z' fill='#FFFFFF' stroke='${INK}' stroke-width='4' stroke-linejoin='round'/>` +
  `<path d='M93 32 V50 H111' stroke='${INK}' stroke-width='4' stroke-linejoin='round'/>` +
  `<circle cx='69' cy='64' r='3.5' fill='${INK}'/><circle cx='89' cy='64' r='3.5' fill='${INK}'/>` +
  `<rect x='61' y='78' width='30' height='5' rx='2.5' fill='#E5484D'/><rect x='61' y='88' width='36' height='5' rx='2.5' fill='#D0D4DC'/><rect x='61' y='98' width='24' height='5' rx='2.5' fill='${CORAL}'/>` +
  TRACE('translate(110,24) scale(0.3)', LIMB) +
  `</svg>`

export const src = (svg: string) => `data:image/svg+xml;base64,${btoa(svg)}`
