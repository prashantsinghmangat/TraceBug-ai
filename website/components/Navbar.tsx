"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "/docs", label: "Docs" },
    { href: "#install", label: "Install" },
    { href: "https://github.com/prashantsinghmangat/tracebug-ai", label: "GitHub", external: true },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-16 transition-all duration-200 ${
        isScrolled
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center group-hover:bg-primary/30 transition-colors">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              className="text-primary"
            >
              <path
                d="M12 2C8.5 2 6 4.5 6 8v1H4.5C3.7 9 3 9.7 3 10.5v1C3 12.3 3.7 13 4.5 13H6v2H4.5C3.7 15 3 15.7 3 16.5v1C3 18.3 3.7 19 4.5 19H6c.3 1.7 1.3 3 2.8 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 2C15.5 2 18 4.5 18 8v1h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.7 1.5-1.5 1.5H18v2h1.5c.8 0 1.5.7 1.5 1.5v1c0 .8-.7 1.5-1.5 1.5H18c-.3 1.7-1.3 3-2.8 3.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <ellipse
                cx="12"
                cy="14"
                rx="5"
                ry="7"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <circle cx="10" cy="12" r="1" fill="currentColor" />
              <circle cx="14" cy="12" r="1" fill="currentColor" />
              <path
                d="M10 16h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span className="text-text-primary font-bold text-lg tracking-tight group-hover:text-accent transition-colors">
            TraceBug
          </span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noopener noreferrer" : undefined}
              className="text-text-muted hover:text-text-primary text-sm font-medium transition-colors duration-150 flex items-center gap-1"
            >
              {link.label}
              {link.external && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="opacity-50">
                  <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                </svg>
              )}
            </a>
          ))}
        </div>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <a
            href="https://github.com/prashantsinghmangat/tracebug-ai"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-sm text-text-muted hover:text-text-primary border border-border hover:border-primary/50 rounded-lg transition-all duration-200 font-medium"
          >
            View on GitHub
          </a>
          <a
            href="#install"
            className="px-4 py-2 text-sm text-white bg-primary hover:bg-primary/90 rounded-lg transition-all duration-200 font-medium shadow-glow-sm hover:shadow-glow-primary"
          >
            Install Extension
          </a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden bg-background/98 backdrop-blur-md border-b border-border">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="block px-3 py-2.5 text-text-muted hover:text-text-primary hover:bg-surface rounded-lg text-sm font-medium transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 pb-1 border-t border-border mt-3 flex flex-col gap-2">
              <a
                href="#install"
                className="block w-full px-4 py-2.5 text-sm text-center text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Install Extension
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
