"use client";

import InstallButtons, { InstallButton } from "@/components/InstallButtons";
import { LINKS } from "@/lib/site";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { GitHubIcon } from "@/components/ui/brand-icons";
import { LogoMark } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";


// Five links: what it does, the AI hand-off, how to use it, cost, writing.
// Demo is one click from the hero; Feedback and Changelog live in the footer.
const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/#mcp", label: "AI agents" },
  { href: "/docs", label: "Docs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];

// Quiet navigation: logo, the links, one button. A hairline appears once the
// page scrolls; nothing else changes.
export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div
        className={`h-16 border-b transition-[background-color,border-color] duration-200 ${
          isScrolled || isMobileMenuOpen
            ? "glass border-border"
            : "bg-background/0 border-transparent"
        }`}
      >
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 transition-opacity hover:opacity-80 active:opacity-60" aria-label="TraceBug home">
            <LogoMark size={28} />
            <span className="text-[16px] font-medium text-text-primary">TraceBug</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="whitespace-nowrap rounded-md px-3 py-2 text-[14px] text-text-muted transition-colors hover:text-text-primary"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <a
              href={LINKS.repo}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub repository"
              title="GitHub"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
            >
              <GitHubIcon size={16} />
            </a>
            <ThemeToggle />
            <InstallButton className="ml-1" />
          </div>

          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-text-primary"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? <X size={18} strokeWidth={1.5} /> : <Menu size={18} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden glass border-b border-border">
          <div className="mx-auto max-w-6xl space-y-1 px-4 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="block rounded-lg px-3 py-2 text-[15px] text-text-muted transition-colors hover:bg-surface hover:text-text-primary"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 grid gap-2 border-t border-border pt-4">
              <InstallButtons itemClassName="w-full" />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
