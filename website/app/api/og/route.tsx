import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0B0B0F 0%, #12121f 50%, #0B0B0F 100%)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {/* Gradient accent line at top */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #6C5CE7, #7B61FF, #00D4FF)',
          }}
        />

        {/* Bug icon */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '80px',
            height: '80px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(123, 97, 255, 0.2), rgba(0, 212, 255, 0.1))',
            border: '2px solid rgba(123, 97, 255, 0.3)',
            fontSize: '40px',
            marginBottom: '24px',
          }}
        >
          <span>🐛</span>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: '64px',
            fontWeight: 800,
            color: '#ffffff',
            marginBottom: '12px',
            display: 'flex',
          }}
        >
          TraceBug
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: '28px',
            fontWeight: 500,
            color: '#a0a0b8',
            marginBottom: '40px',
            display: 'flex',
          }}
        >
          Debug Bugs in Seconds, Not Hours
        </div>

        {/* Tags */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {['Zero Backend', 'Browser Only', 'Free', 'Open Source'].map(
            (tag) => (
              <div
                key={tag}
                style={{
                  padding: '8px 20px',
                  borderRadius: '100px',
                  border: '1px solid rgba(123, 97, 255, 0.3)',
                  color: '#c0c0d8',
                  fontSize: '18px',
                  display: 'flex',
                }}
              >
                {tag}
              </div>
            )
          )}
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '4px',
            background: 'linear-gradient(90deg, #00D4FF, #7B61FF, #6C5CE7)',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
