/** @type {import('next').NextConfig} */
const nextConfig = {
  // Nothing on the site uses next/image, so the Image Optimization API
  // (/_next/image) is pure attack surface: Next 14.x carries unpatched RCEs in
  // it (GHSA-2xp9-vwfh-vxw4, GHSA-2464-fhr4-w9xw — fixed only in >=15.5.28).
  // unoptimized turns the optimizer off entirely.
  images: {
    unoptimized: true,
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
          // SAMEORIGIN (not DENY) so a same-origin iframe can embed a page -
          // /share/[token] renders an exported report that way. The old
          // /demo.html this comment named was retired in 1.11 (unreferenced,
          // and still claiming v1.6.0 and "No API keys").
          // Still blocks external clickjacking.
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
  async redirects() {
    return [
      {
        // /demo.html was retired in 1.11 (unreferenced, and still showing the
        // old logo, v1.6.0 and a "No API keys" claim that the BYO-key AI
        // debugger made false). It is a permanent move, not a temporary one,
        // and /try.html is the live equivalent: a page with real bugs to
        // capture. 308 so anything that linked to it keeps working.
        //
        // This belongs HERE and not in netlify.toml. The site is not a static
        // export (`next build`, `publish = ".next"`, @netlify/plugin-nextjs),
        // so the Next runtime serves requests — and as netlify.toml's own
        // comment notes, it runs BEFORE Netlify's redirect layer, which is why
        // the primary-domain 301 had to be forced there. A netlify.toml rule
        // for this path would be the less reliable of the two.
        // Verified against `next dev`: /demo.html -> 308 -> /try.html.
        source: '/demo.html',
        destination: '/try.html',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
