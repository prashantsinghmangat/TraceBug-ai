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
    "TraceBug records user sessions and generates developer-ready bug reports with steps, screenshots, console errors, and network logs. Zero backend, browser only, free.",
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
        url: "/og-image.svg",
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
    images: ["/og-image.svg"],
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
      <body className="bg-background text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
