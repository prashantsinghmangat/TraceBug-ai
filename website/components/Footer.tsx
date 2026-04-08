import Link from "next/link";

export default function Footer() {
  const currentYear = 2026;

  const columns = [
    {
      title: "Product",
      links: [
        { label: "Features", href: "#features" },
        { label: "How It Works", href: "#how-it-works" },
        { label: "Installation", href: "#install" },
        { label: "Bug Report Preview", href: "#" },
        { label: "Comparison", href: "#" },
      ],
    },
    {
      title: "Resources",
      links: [
        { label: "Documentation", href: "/docs" },
        { label: "GitHub Repository", href: "https://github.com/prashantsinghmangat/tracebug-ai", external: true },
        { label: "npm Package", href: "https://www.npmjs.com/package/tracebug-sdk", external: true },
        { label: "Chrome Extension", href: "#install" },
        { label: "Example App", href: "https://github.com/prashantsinghmangat/tracebug-ai/tree/main/example-app", external: true },
      ],
    },
    {
      title: "Community",
      links: [
        { label: "GitHub Issues", href: "https://github.com/prashantsinghmangat/tracebug-ai/issues", external: true },
        { label: "GitHub Discussions", href: "https://github.com/prashantsinghmangat/tracebug-ai/discussions", external: true },
        { label: "Report a Bug", href: "https://github.com/prashantsinghmangat/tracebug-ai/issues/new", external: true },
        { label: "Contribute", href: "https://github.com/prashantsinghmangat/tracebug-ai/blob/main/CONTRIBUTING.md", external: true },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "MIT License", href: "https://github.com/prashantsinghmangat/tracebug-ai/blob/main/LICENSE", external: true },
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Open Source", href: "https://github.com/prashantsinghmangat/tracebug-ai", external: true },
      ],
    },
  ];

  return (
    <footer className="bg-[#080810] border-t border-border relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-20" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Top section */}
        <div className="py-16 grid grid-cols-1 lg:grid-cols-5 gap-12">
          {/* Brand column */}
          <div className="lg:col-span-2">
            {/* Logo */}
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center">
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
              <span className="text-text-primary font-bold text-lg tracking-tight">
                TraceBug
              </span>
            </div>

            {/* Tagline */}
            <p className="text-text-muted text-sm leading-relaxed mb-6 max-w-xs">
              Built for developers and QA teams who want faster debugging.
              Zero backend, browser only, completely free.
            </p>

            {/* Quick stats */}
            <div className="flex flex-wrap gap-4 mb-6">
              {[
                { label: "Zero backend", icon: "🏠" },
                { label: "Free forever", icon: "✨" },
                { label: "Open source", icon: "🔓" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="flex items-center gap-1.5 text-xs text-text-muted"
                >
                  <span>{stat.icon}</span>
                  <span>{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Social links */}
            <div className="flex items-center gap-3">
              <a
                href="https://github.com/prashantsinghmangat/tracebug-ai"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-text-muted hover:text-text-primary hover:border-primary/40 transition-all duration-200"
                aria-label="GitHub"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </a>
              <a
                href="https://www.npmjs.com/package/tracebug-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-text-muted hover:text-red-400 hover:border-red-400/40 transition-all duration-200"
                aria-label="npm"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M0 0v24h24V0H0zm19.2 19.2H4.8V4.8h14.4v14.4zm-9.6-2.4h2.4V9.6H9.6v7.2zm2.4-4.8h2.4v4.8h2.4V7.2H9.6v2.4h2.4v2.4z"/>
                </svg>
              </a>
            </div>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-8">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-text-primary font-semibold text-sm mb-4 uppercase tracking-wider">
                  {col.title}
                </h3>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-muted hover:text-text-primary text-sm transition-colors duration-150 flex items-center gap-1 group"
                        >
                          {link.label}
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 10 10"
                            fill="none"
                            className="opacity-0 group-hover:opacity-50 transition-opacity"
                          >
                            <path d="M1 9L9 1M9 1H4M9 1V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </a>
                      ) : (
                        <a
                          href={link.href}
                          className="text-text-muted hover:text-text-primary text-sm transition-colors duration-150"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-text-muted text-sm">
            &copy; {currentYear} TraceBug. Open source under the{" "}
            <a
              href="https://github.com/prashantsinghmangat/tracebug-ai/blob/main/LICENSE"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 transition-colors"
            >
              MIT License
            </a>
            .
          </div>
          <div className="flex items-center gap-4 text-text-muted text-sm">
            <span>Made with</span>
            <span className="text-red-400">♥</span>
            <span>for developers tired of &ldquo;cannot reproduce&rdquo;</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
