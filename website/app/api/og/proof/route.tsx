import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// Same brand mark as /api/og, on the dark card.
const MARK_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 96 96'>" +
  "<defs><linearGradient id='c' x1='0' y1='0' x2='96' y2='96' gradientUnits='userSpaceOnUse'>" +
  "<stop offset='0' stop-color='#818CF8'/><stop offset='1' stop-color='#4F46E5'/></linearGradient></defs>" +
  "<rect x='2' y='2' width='92' height='92' rx='26' fill='#16161D'/>" +
  "<path d='M30 33 L47 48 L30 63' fill='none' stroke='#EAECF3' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>" +
  "<rect x='52' y='41' width='14' height='14' rx='4' fill='url(#c)'/></svg>";
const MARK_SRC = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;

// Social card for /proof — dark and terminal-styled because that's what the
// page IS: a real transcript. Every community post links here, so this card
// is the first impression of the whole funnel.
export async function GET() {
  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px 88px',
          background: '#0B0B10',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* indigo glow */}
        <div style={{ position: 'absolute', top: -180, right: -140, width: 560, height: 560, borderRadius: 9999, background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent 70%)', display: 'flex' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, #818CF8, #6366F1, #4F46E5)', display: 'flex' }} />

        {/* lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 34 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={64} height={64} src={MARK_SRC} alt="TraceBug" style={{ borderRadius: 18 }} />
          <span style={{ fontSize: 32, fontWeight: 700, color: '#EAECF3', letterSpacing: -0.5 }}>TraceBug</span>
          <div style={{ marginLeft: 12, padding: '8px 18px', borderRadius: 100, border: '1px solid #26262E', background: '#16161D', color: '#A5B4FC', fontSize: 19, display: 'flex' }}>
            Real transcript — unedited
          </div>
        </div>

        {/* headline */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 36 }}>
          <span style={{ fontSize: 62, fontWeight: 700, letterSpacing: -1.5, lineHeight: 1.08, display: 'flex', gap: 16 }}>
            <span style={{ color: '#EAECF3', display: 'flex' }}>Watch Claude debug</span>
            <span style={{ background: 'linear-gradient(120deg, #A5B4FC, #6366F1)', backgroundClip: 'text', color: 'transparent', display: 'flex' }}>
              a real bug
            </span>
          </span>
          <span style={{ marginTop: 14, fontSize: 26, color: '#8B90A0', display: 'flex' }}>
            Five MCP tool calls from crash to root cause. 100% local — nothing uploaded.
          </span>
        </div>

        {/* terminal excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 18, border: '1px solid #26262E', background: '#16161D', padding: '26px 34px', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#3A3A44', display: 'flex' }} />
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#3A3A44', display: 'flex' }} />
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#3A3A44', display: 'flex' }} />
          </div>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#A5B4FC', display: 'flex' }}>
            › get_console_errors()
          </span>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#F87171', display: 'flex' }}>
            TypeError: Cannot read properties of undefined — try.html:140
          </span>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#34D399', display: 'flex' }}>
            › Root cause: coupons[&quot;SAVE20&quot;] missing — .discount read on undefined
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
