import Link from "next/link";
import { GitHubIcon, NpmIcon } from "@/components/ui/brand-icons";
import { LogoMark } from "@/components/Logo";

const REPO = "https://github.com/prashantsinghmangat/tracebug-ai";
const NPM = "https://www.npmjs.com/package/tracebug-sdk";

const COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Demo", href: "/#demo" },
      { label: "Installation", href: "/#install" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "GitHub", href: REPO, external: true },
      { label: "npm package", href: NPM, external: true },
      { label: "Chrome extension", href: "/#install" },
      { label: "Sentry alternative", href: "/compare/sentry-alternative" },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Issues", href: `${REPO}/issues`, external: true },
      { label: "Discussions", href: `${REPO}/discussions`, external: true },
      { label: "Report a bug", href: `${REPO}/issues/new`, external: true },
      { label: "Contribute", href: `${REPO}/blob/main/CONTRIBUTING.md`, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "MIT License", href: `${REPO}/blob/main/LICENSE`, external: true },
      { label: "Open source", href: REPO, external: true },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-10">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <LogoMark size={32} idPrefix="footer" />
              <span className="font-semibold text-[16px] tracking-[-0.02em] text-text-primary">TraceBug</span>
            </Link>
            <p className="text-[13.5px] text-text-muted leading-relaxed max-w-xs mb-5">
              Bug reports your dev can actually open. Local-first, zero backend, completely free —
              built for developers and QA teams who want faster debugging.
            </p>
            <div className="flex flex-wrap gap-2">
              {["Zero backend", "Free forever", "Open source"].map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11.5px] text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-primary to-accent" />
                  {s}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-5">
              <a href={REPO} target="_blank" rel="noopener noreferrer" aria-label="GitHub"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-background transition-colors">
                <GitHubIcon size={16} />
              </a>
              <a href={NPM} target="_blank" rel="noopener noreferrer" aria-label="npm"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-background transition-colors">
                <NpmIcon size={16} />
              </a>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-text-subtle mb-4">{col.title}</h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a href={link.href} target="_blank" rel="noopener noreferrer"
                        className="text-[13.5px] text-text-muted hover:text-primary transition-colors">
                        {link.label}
                      </a>
                    ) : (
                      <Link href={link.href} className="text-[13.5px] text-text-muted hover:text-primary transition-colors">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-7 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[13px] text-text-subtle">© 2026 TraceBug. Open source under the MIT License.</p>
          <p className="text-[13px] text-text-subtle">Made with ♥ for developers tired of “cannot reproduce”</p>
        </div>
      </div>
    </footer>
  );
}
