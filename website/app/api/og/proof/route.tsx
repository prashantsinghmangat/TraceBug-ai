import { ImageResponse } from 'next/og'

import { MARK_SVG, src } from '@/lib/og-brand'

export const runtime = 'edge'

// Social card for /proof, dark and terminal-styled because that's what the
// page is: a real transcript. Flat, no glow (matches the site). Every community post links here, so this card
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
          background: '#0B0D14',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >

        {/* lockup */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 34 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img width={56} height={56} src={src(MARK_SVG)} alt="" style={{ background: '#FFFFFF', borderRadius: 14, padding: 4 }} />
          <span style={{ fontSize: 32, fontWeight: 500, color: '#EEF0F5' }}>TraceBug</span>
          <div style={{ marginLeft: 16, fontFamily: mono, color: '#7A8296', fontSize: 20, display: 'flex' }}>
            Real transcript, unedited
          </div>
        </div>

        {/* headline */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 36 }}>
          <span style={{ fontSize: 60, fontWeight: 500, letterSpacing: -1.5, lineHeight: 1.08, display: 'flex', gap: 16 }}>
            <span style={{ color: '#EEF0F5', display: 'flex' }}>Watch Claude debug</span>
            <span style={{ color: '#A3A9B8', display: 'flex' }}>a real bug</span>
          </span>
          <span style={{ marginTop: 14, fontSize: 26, color: '#A3A9B8', display: 'flex' }}>
            Five MCP tool calls from crash to root cause. Local, nothing uploaded.
          </span>
        </div>

        {/* terminal excerpt */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 18, border: '1px solid #202430', background: '#11141C', padding: '26px 34px', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#2C3140', display: 'flex' }} />
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#2C3140', display: 'flex' }} />
            <div style={{ width: 12, height: 12, borderRadius: 9999, background: '#2C3140', display: 'flex' }} />
          </div>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#A3A9B8', display: 'flex' }}>
            › get_console_errors()
          </span>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#F2A1A4', display: 'flex' }}>
            TypeError: Cannot read properties of undefined — try.html:140
          </span>
          <span style={{ fontFamily: mono, fontSize: 22, color: '#8EDBB5', display: 'flex' }}>
            › Root cause: coupons[&quot;SAVE20&quot;] missing — .discount read on undefined
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
