"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChromeIcon, GitHubIcon } from "@/components/ui/brand-icons";
import { LogoMark } from "@/components/Logo";
import Mascot from "@/components/Mascot";
import ThemeToggle from "@/components/ThemeToggle";
import { SDK_VERSION_TAG } from "@/lib/version";

const CHROME_URL =
  "https://chromewebstore.google.com/detail/fdemmibikigigkfjngclmdheeajhdgaj";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // `highlight` renders the link as a Trace-fronted pill so "report an issue"
  // is findable at a glance from any page — it's a bug-reporting product;
  // reporting OUR bugs should never take hunting.
  const navLinks = [
    { href: "/#demo", label: "Demo" },
    { href: "/#mcp", label: "AI Agents" },
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/docs", label: "Docs" },
    { href: "/feedback", label: "Feedback", highlight: true },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "h-14 glass border-b border-border shadow-soft"
          : "h-16 bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="TraceBug home">
          <LogoMark size={30} className="transition-transform duration-300 group-hover:scale-105" />
          <span className="font-semibold text-[15.5px] tracking-[-0.02em] text-text-primary">
            TraceBug
          </span>
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-surface border border-border text-[10px] font-mono uppercase tracking-wider text-text-subtle">
            {SDK_VERSION_TAG}
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((link) =>
            link.highlight ? (
              <Link
                key={link.label}
                href={link.href}
                className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.07] px-3 py-1.5 text-[13px] font-semibold text-primary transition-colors duration-150 hover:bg-primary/[0.14] hover:border-primary/50"
              >
                <Mascot size={15} animated={false} />
                {link.label}
              </Link>
            ) : (
              <Link
                key={link.label}
                href={link.href}
                className="px-3 py-2 text-[13.5px] font-medium text-text-muted hover:text-text-primary rounded-lg hover:bg-surface transition-colors duration-150"
              >
                {link.label}
              </Link>
            )
          )}
        </div>

        <div className="hidden md:flex items-center gap-1.5">
          <a
            href="https://github.com/prashantsinghmangat/tracebug-ai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub repository"
            title="GitHub"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          >
            <GitHubIcon size={16} />
          </a>
          <ThemeToggle />
          {/* PHASE2-CLOUD: "Sign in" → /auth link returns when cloud sharing ships */}
          <a
            href={CHROME_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13.5px] text-white bg-primary hover:brightness-110 rounded-lg transition-all duration-150 font-medium shadow-glow-sm hover:shadow-glow-primary"
          >
            <ChromeIcon size={14} />
            Install free
          </a>
        </div>

        <div className="flex md:hidden items-center gap-1.5">
          <ThemeToggle />
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden glass border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  link.highlight
                    ? "flex items-center gap-2 text-primary bg-primary/[0.07] border border-primary/30"
                    : "block text-text-muted hover:text-text-primary hover:bg-surface"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.highlight && <Mascot size={15} animated={false} />}
                {link.label}
              </Link>
            ))}
            <div className="pt-3 pb-1 border-t border-border mt-3 flex flex-col gap-2">
              {/* PHASE2-CLOUD: mobile "Sign in" link returns when cloud sharing ships */}
              <a
                href={CHROME_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 w-full px-4 py-2.5 text-sm text-center text-white bg-primary hover:brightness-110 rounded-lg transition-colors font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <ChromeIcon size={14} />
                Install free
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
