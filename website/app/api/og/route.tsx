import { ImageResponse } from 'next/og'

import { INK, MARK_SVG, MASCOT_SVG, src } from '@/lib/og-brand'

export const runtime = 'edge'

// Social card (1200×630) in the site's current look: flat ink-on-paper, one
// indigo accent, the hero headline, and the character (Page holding up Trace).

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#FBFBFC',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 760 }}>
          {/* logo lockup */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 56 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img width={56} height={56} src={src(MARK_SVG)} alt="" />
            <span style={{ fontSize: 34, fontWeight: 500, color: INK }}>TraceBug</span>
          </div>

          <span style={{ fontSize: 60, fontWeight: 500, color: INK, letterSpacing: -2, lineHeight: 1.05 }}>
            Your AI can read your code.
          </span>
          <span style={{ fontSize: 60, fontWeight: 500, color: '#677082', letterSpacing: -2, lineHeight: 1.05 }}>
            Can it see your bug?
          </span>

          <span style={{ marginTop: 32, fontSize: 28, lineHeight: 1.4, color: '#4B5565', display: 'flex' }}>
            Capture a browser bug into one offline report Claude Code, Cursor or Windsurf can debug.
          </span>

          <span style={{ marginTop: 40, fontSize: 22, color: '#677082', display: 'flex' }}>
            Free · Open source · Chrome and Firefox · tracebug.dev
          </span>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img width={300} height={300} src={src(MASCOT_SVG)} alt="" />
      </div>
    ),
    { width: 1200, height: 630 },
  )
}
