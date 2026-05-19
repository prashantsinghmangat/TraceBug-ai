import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tracebug.netlify.app"),
  title: "TraceBug — Bug reports your dev can actually open",
  description:
    "Local-first bug reports. One click → one .html file with the full replay, console errors, network requests, and screenshots. Your dev opens it offline. No account. No SaaS lock-in. Cloud sharing optional.",
  keywords: [
    "bug reporting",
    "QA testing",
    "session recording",
    "developer tools",
    "bug tracking",
    "reproduction steps",
    "console errors",
    "network logs",
  ],
  authors: [{ name: "TraceBug" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.svg",
  },
  openGraph: {
    title: "TraceBug — Bug reports your dev can actually open",
    description:
      "Local-first bug reports. One .html file with replay, console errors, network requests, screenshots. No account, no SaaS lock-in.",
    type: "website",
    url: "https://tracebug.netlify.app",
    siteName: "TraceBug",
    images: [
      {
        url: "/api/og",
        width: 1200,
        height: 630,
        alt: "TraceBug — Automatic Bug Reporting",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "TraceBug — Bug reports your dev can actually open",
    description:
      "Local-first bug reports. One .html file your dev opens offline. No SaaS lock-in.",
    images: ["/api/og"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#7B61FF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "TraceBug",
              description: "Zero-backend, browser-only QA tool that records user sessions and generates developer-ready bug reports.",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any (browser-based)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "Prashant Singh Mangat", url: "https://github.com/prashantsinghmangat" },
              url: "https://tracebug.netlify.app",
              downloadUrl: "https://www.npmjs.com/package/tracebug-sdk",
              softwareVersion: "1.3.0",
              license: "https://opensource.org/licenses/MIT",
            }),
          }}
        />
      </head>
      <body className="bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
