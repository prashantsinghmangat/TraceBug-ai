import type { Metadata, Viewport } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { SDK_VERSION } from "@/lib/version";
import ConsoleEgg from "@/components/ConsoleEgg";
import MascotWalker from "@/components/MascotWalker";
import "./globals.css";

// Theme fonts (Midnight coral). Self-hosted by next/font at build time, so the
// page itself makes no request to Google. To change fonts, swap these two and
// keep the variable names (globals.css reads them as --font-sans / --font-mono).
const sans = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-space-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://tracebug.dev"),
  title: "TraceBug — Capture a browser bug, let AI fix it",
  description:
    "Capture a browser bug into one offline .html file your AI coding agent reads over MCP and fixes — Claude Code, Cursor, Windsurf. Session replay, console errors, network, and a generated failing test. Free, local-first, zero backend.",
  applicationName: "TraceBug",
  // Note: Google ignores meta keywords (since 2009). Kept aligned with the
  // positioning for minor Bing use and self-documentation — the real ranking
  // signals are the per-page <title>, H1, content, and backlinks.
  keywords: [
    "AI debugging",
    "AI agent debugging",
    "AI debugging tool",
    "AI-ready bug report",
    "AI bug report",
    "MCP debugging",
    "MCP server for debugging",
    "MCP bug reporting",
    "Claude Code bug reports",
    "Cursor bug reports",
    "bug report for AI coding agents",
    "browser bug capture",
    "instant bug report",
    "one-click bug report",
    "automatic bug report generator",
    "frontend bug reporting tool",
    "Chrome extension bug reporter",
    "session replay debugging",
    "open source bug reporting tool",
    "local bug reporting tool",
    "Sentry alternative",
    "Jam alternative",
    "TraceBug",
    "Trace Bug",
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
        alt: "TraceBug: capture the bug, let AI fix it.",
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
    { media: "(prefers-color-scheme: light)", color: "#0B0D14" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0D14" },
  ],
};

// Applied before paint so the theme never flashes. Dark is the default (the
// <html> tag ships with it); only an explicit "light" choice removes it.
const themeInit = `(function(){try{if(localStorage.getItem('tracebug-theme')==='light'){document.documentElement.classList.remove('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} dark`} suppressHydrationWarning>
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
        <MascotWalker />
      </body>
    </html>
  );
}
