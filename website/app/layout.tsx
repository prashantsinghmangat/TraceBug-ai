import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { SDK_VERSION } from "@/lib/version";
import ConsoleEgg from "@/components/ConsoleEgg";
import SpotlightEffect from "@/components/SpotlightEffect";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tracebug.dev"),
  title: "TraceBug — Capture a browser bug, let AI fix it",
  description:
    "Capture a browser bug into one offline .html file your AI coding agent reads over MCP and fixes — Claude Code, Cursor, Windsurf. Session replay, console errors, network, and a generated failing test. Free, local-first, zero backend.",
  applicationName: "TraceBug",
  keywords: [
    "ai bug fix",
    "fix bugs with AI",
    "AI debugging",
    "AI agent debugging",
    "MCP bug reporting",
    "MCP debugging",
    "best MCP for debugging",
    "Claude Code bug reports",
    "Cursor bug reports",
    "instant bug report",
    "one-click bug report",
    "bug reporting",
    "session recording",
    "reproduction steps",
    "frontend bug reporting tool",
    "Sentry alternative",
    "Jam alternative",
    "Chrome extension bug reporter",
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
    title: "TraceBug — Capture a browser bug, let AI fix it",
    description:
      "One offline .html file — replay, console, network, repro timeline — your AI coding agent reads over MCP and fixes. Local-first, zero backend, free.",
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
    title: "TraceBug — Capture a browser bug, let AI fix it",
    description:
      "One offline .html file your AI agent reads over MCP and fixes — Claude Code, Cursor, Windsurf. Local-first, free.",
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
              description: "Local-first tool that captures a browser bug into one offline .html file an AI coding agent reads over MCP (Claude Code, Cursor, Windsurf) to reproduce and fix — session replay, console errors, network logs, repro timeline, and a generated failing test.",
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
