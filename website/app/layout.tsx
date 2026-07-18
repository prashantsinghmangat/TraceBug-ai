import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SDK_VERSION } from "@/lib/version";
import ConsoleEgg from "@/components/ConsoleEgg";
import SpotlightEffect from "@/components/SpotlightEffect";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tracebug.dev"),
  title: "TraceBug — Bug reports your dev can actually open",
  description:
    "Local-first bug reports. One click → one .html file with the full replay, console errors, network requests, and screenshots. Your dev opens it offline. No account. No SaaS lock-in. Cloud sharing optional.",
  applicationName: "TraceBug",
  keywords: [
    "bug reporting",
    "QA testing",
    "session recording",
    "developer tools",
    "bug tracking",
    "reproduction steps",
    "console errors",
    "network logs",
    "frontend bug reporting tool",
    "Sentry alternative",
    "LogRocket alternative",
    "Chrome extension bug reporter",
    "root cause analysis",
  ],
  authors: [{ name: "Prashant Singh Mangat", url: "https://github.com/prashantsinghmangat" }],
  creator: "Prashant Singh Mangat",
  category: "technology",
  alternates: { canonical: "/" },
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
    url: "https://tracebug.dev",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0B10" },
  ],
};

// Applied before paint so the chosen theme never flashes. An explicit choice
// (localStorage) always wins; with no stored choice we follow the OS
// preference — our dev audience skews dark, don't fight their system theme.
const themeInit = `(function(){try{var t=localStorage.getItem('tracebug-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "TraceBug",
              description: "Local-first QA bug-reporting tool that records user sessions in the browser and generates developer-ready bug reports with root-cause hints, console errors, network logs, and screenshots.",
              applicationCategory: "DeveloperApplication",
              operatingSystem: "Any (browser-based)",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              author: { "@type": "Person", name: "Prashant Singh Mangat", url: "https://github.com/prashantsinghmangat" },
              url: "https://tracebug.dev",
              downloadUrl: "https://www.npmjs.com/package/tracebug-sdk",
              softwareVersion: SDK_VERSION,
              license: "https://opensource.org/licenses/MIT",
            }),
          }}
        />
      </head>
      <body className="bg-background text-text-primary antialiased">
        {children}
        <ConsoleEgg />
        <SpotlightEffect />
      </body>
    </html>
  );
}
