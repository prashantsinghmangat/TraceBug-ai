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
          <svg width="32" height="32" viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
            <defs>
              <linearGradient id="nb-bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#1A1530"/>
                <stop offset="100%" stopColor="#0B0B0F"/>
              </linearGradient>
              <linearGradient id="nb-primary" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#9B7DFF"/>
                <stop offset="50%" stopColor="#7B61FF"/>
                <stop offset="100%" stopColor="#00E5FF"/>
              </linearGradient>
              <linearGradient id="nb-scan" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#00E5FF" stopOpacity="0"/>
                <stop offset="30%" stopColor="#00E5FF" stopOpacity="0.9"/>
                <stop offset="70%" stopColor="#7B61FF" stopOpacity="0.9"/>
                <stop offset="100%" stopColor="#7B61FF" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <rect x="4" y="4" width="88" height="88" rx="22" fill="url(#nb-bg)"/>
            <rect x="4" y="4" width="88" height="88" rx="22" fill="none" stroke="url(#nb-primary)" strokeWidth="1.2" opacity="0.35"/>
            <path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="url(#nb-primary)" opacity="0.12"/>
            <path d="M48 20 L66 30 L66 52 L48 62 L30 52 L30 30 Z" fill="none" stroke="url(#nb-primary)" strokeWidth="1.6"/>
            <rect x="22" y="40" width="52" height="2.5" rx="1.25" fill="url(#nb-scan)" opacity="0.9"/>
            <line x1="34" y1="29" x2="21" y2="16" stroke="#9B7DFF" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="21" cy="16" r="3" fill="#9B7DFF"/>
            <circle cx="21" cy="16" r="1.2" fill="white"/>
            <line x1="62" y1="29" x2="75" y2="16" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="75" cy="16" r="3" fill="#00E5FF"/>
            <circle cx="75" cy="16" r="1.2" fill="white"/>
            <line x1="30" y1="36" x2="17" y2="32" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <line x1="30" y1="43" x2="15" y2="43" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <line x1="30" y1="50" x2="17" y2="54" stroke="#7B61FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <line x1="66" y1="36" x2="79" y2="32" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <line x1="66" y1="43" x2="81" y2="43" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <line x1="66" y1="50" x2="79" y2="54" stroke="#00E5FF" strokeWidth="1.5" strokeLinecap="round" opacity="0.75"/>
            <circle cx="48" cy="41" r="4.5" fill="url(#nb-primary)"/>
            <circle cx="48" cy="41" r="1.9" fill="white"/>
            <circle cx="41" cy="34" r="2.2" fill="#00E5FF" opacity="0.9"/>
            <circle cx="41" cy="34" r="0.9" fill="white"/>
            <circle cx="55" cy="34" r="2.2" fill="#9B7DFF" opacity="0.9"/>
            <circle cx="55" cy="34" r="0.9" fill="white"/>
          </svg>
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
