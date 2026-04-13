import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tracebug.netlify.app"),
  title: "TraceBug — Automatic Bug Reporting for Developers",
  description:
    "TraceBug — Stop opening DevTools for every bug. Capture bugs, see root causes, create GitHub issues in seconds. Zero backend, browser only, free. Try the interactive demo.",
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
    title: "TraceBug — Automatic Bug Reporting for Developers",
    description:
      "TraceBug records user sessions and generates developer-ready bug reports with steps, screenshots, console errors, and network logs.",
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
    title: "TraceBug — Automatic Bug Reporting for Developers",
    description:
      "TraceBug records user sessions and generates developer-ready bug reports automatically.",
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
    <html lang="en" className={inter.variable}>
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
