/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // SAMEORIGIN (not DENY) so the interactive demo iframe on /
          // can embed /demo.html. Still blocks external clickjacking.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // SDK iframe bridge must be embeddable on customer sites.
        // Override the global X-Frame-Options here and use CSP frame-ancestors
        // (which supersedes X-Frame-Options in modern browsers) to allow all.
        source: '/sdk-bridge',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
      {
        // Public share viewer should be embeddable in Jira, Linear, Notion,
        // and other tools where a dev would paste a TraceBug link. The
        // viewer itself sandboxes the report iframe with `allow-scripts`
        // only (no allow-same-origin) so even if the parent page is hostile
        // it cannot exfiltrate auth tokens from the embedded report.
        source: '/share/:token',
        headers: [
          { key: 'X-Frame-Options', value: 'ALLOWALL' },
          { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
