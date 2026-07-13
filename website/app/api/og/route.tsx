import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// The "Prompt" brand mark (chevron + cursor block) as a data-URI SVG — the most
// reliable way to embed a custom mark inside Satori/next-og.
const MARK_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='76' height='76' viewBox='0 0 96 96'>" +
  "<defs><linearGradient id='c' x1='0' y1='0' x2='96' y2='96' gradientUnits='userSpaceOnUse'>" +
  "<stop offset='0' stop-color='#818CF8'/><stop offset='1' stop-color='#4F46E5'/></linearGradient></defs>" +
  "<rect x='2' y='2' width='92' height='92' rx='26' fill='#0B0B10'/>" +
  "<path d='M30 33 L47 48 L30 63' fill='none' stroke='#EAECF3' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>" +
  "<rect x='52' y='41' width='14' height='14' rx='4' fill='url(#c)'/></svg>";
const MARK_SRC = `data:image/svg+xml;base64,${btoa(MARK_SVG)}`;

// Light, premium social card matching the redesigned site.
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '88px',
          background: '#FFFFFF',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* soft aurora washes */}
        <div style={{ position: 'absolute', top: -160, right: -120, width: 520, height: 520, borderRadius: 9999, background: 'radial-gradient(circle, rgba(99,102,241,0.28), transparent 70%)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -200, left: -120, width: 520, height: 520, borderRadius: 9999, background: 'radial-gradient(circle, rgba(34,211,238,0.22), transparent 70%)', display: 'flex' }} />
        {/* top gradient hairline */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: 'linear-gradient(90deg, #818CF8, #6366F1, #4F46E5)', display: 'flex' }} />

        {/* logo lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 40 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={76} height={76} src={MARK_SRC} alt="TraceBug" style={{ borderRadius: 22 }} />
          <span style={{ fontSize: 38, fontWeight: 700, color: '#0C0F17', letterSpacing: -1 }}>TraceBug</span>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 72, fontWeight: 700, color: '#0C0F17', letterSpacing: -2, lineHeight: 1.05 }}>
            Bug reports your dev
          </span>
          <span style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05, display: 'flex' }}>
            <span style={{ color: '#0C0F17' }}>can&nbsp;</span>
            <span style={{ background: 'linear-gradient(120deg, #818CF8, #4F46E5)', backgroundClip: 'text', color: 'transparent', display: 'flex' }}>
              actually open
            </span>
          </span>
        </div>

        <span style={{ marginTop: 28, fontSize: 28, color: '#505869', display: 'flex' }}>
          One click → one offline .html file. Replay, console, network, screenshots.
        </span>

        {/* Tags */}
        <div style={{ display: 'flex', gap: 14, marginTop: 44 }}>
          {['Local-first', 'Offline .html', 'Free', 'Open source'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '10px 22px',
                borderRadius: 100,
                border: '1px solid #EAECF1',
                background: '#F8F9FB',
                color: '#505869',
                fontSize: 20,
                display: 'flex',
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
